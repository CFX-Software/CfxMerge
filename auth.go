package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/zalando/go-keyring"
)

const (
	apiBaseURL     = "https://adamant-deer-971.convex.site/api/v1"
	serviceName    = "CFXMerge"
	apiKeyAccount  = "api_key"
	cacheDuration  = 5 * time.Minute // Cache user data for 5 minutes
)

// User represents the authenticated user
type User struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Image     string `json:"image"`
	DiscordID string `json:"discordId"`
}

// GetDiscordID returns the Discord ID, parsing from avatar URL if needed
func (u *User) GetDiscordID() string {
	if u.DiscordID != "" {
		return u.DiscordID
	}

	// Parse from avatar URL: https://cdn.discordapp.com/avatars/627622261490319360/...
	if u.Image != "" && strings.Contains(u.Image, "cdn.discordapp.com/avatars/") {
		parts := strings.Split(u.Image, "/")
		for i, part := range parts {
			if part == "avatars" && i+1 < len(parts) {
				return parts[i+1]
			}
		}
	}

	return ""
}

// Stats represents user usage statistics
type Stats struct {
	Conversions          int    `json:"conversions"`
	CompletedConversions int    `json:"completedConversions"`
	Downloads            int    `json:"downloads"`
	Credits              string `json:"credits"`
	AccountTier          string `json:"accountTier"`
	IsPremium            bool   `json:"isPremium"`
}

// Limit represents API rate limits
type Limit struct {
	Endpoint          string `json:"endpoint"`
	RequestsPerHour   int    `json:"requestsPerHour"`
	RequestsPerDay    int    `json:"requestsPerDay"`
	MaxBatchSize      int    `json:"maxBatchSize"`
}

// APIKeyInfo represents API key metadata
type APIKeyInfo struct {
	CreatedAt    int64 `json:"createdAt"`
	LastUsedAt   int64 `json:"lastUsedAt"`
	CurrentUsage int   `json:"currentUsage"`
}

// AuthResponse represents the API response from /auth/me
type AuthResponse struct {
	User   User         `json:"user"`
	Tier   string       `json:"tier"`
	Stats  Stats        `json:"stats"`
	Limits []Limit      `json:"limits"`
	APIKey APIKeyInfo   `json:"apiKey"`
}

// AuthService handles authentication and secure API key storage
type AuthService struct {
	mu            sync.RWMutex
	apiKey        string
	cachedData    *AuthResponse
	cacheExpiry   time.Time
	httpClient    *http.Client
}

// NewAuthService creates a new authentication service
func NewAuthService() *AuthService {
	return &AuthService{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				TLSHandshakeTimeout:   5 * time.Second,
				ResponseHeaderTimeout: 5 * time.Second,
			},
		},
	}
}

// SaveAPIKey securely stores the API key in OS keyring
func (a *AuthService) SaveAPIKey(apiKey string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Validate API key format
	if len(apiKey) < 10 || apiKey[:5] != "cfxm-" {
		return fmt.Errorf("invalid API key format")
	}

	// Store in OS keyring (Windows Credential Manager)
	err := keyring.Set(serviceName, apiKeyAccount, apiKey)
	if err != nil {
		return fmt.Errorf("failed to save API key: %w", err)
	}

	a.apiKey = apiKey
	// Clear cache when API key changes
	a.cachedData = nil
	a.cacheExpiry = time.Time{}

	return nil
}

// LoadAPIKey retrieves the API key from OS keyring
func (a *AuthService) LoadAPIKey() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Check if already loaded in memory
	if a.apiKey != "" {
		return a.apiKey, nil
	}

	// Retrieve from OS keyring
	apiKey, err := keyring.Get(serviceName, apiKeyAccount)
	if err != nil {
		if err == keyring.ErrNotFound {
			return "", nil // No API key stored
		}
		return "", fmt.Errorf("failed to load API key: %w", err)
	}

	a.apiKey = apiKey
	return apiKey, nil
}

// DeleteAPIKey removes the API key from storage
func (a *AuthService) DeleteAPIKey() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	err := keyring.Delete(serviceName, apiKeyAccount)
	if err != nil && err != keyring.ErrNotFound {
		return fmt.Errorf("failed to delete API key: %w", err)
	}

	a.apiKey = ""
	a.cachedData = nil
	a.cacheExpiry = time.Time{}

	return nil
}

// ValidateAPIKey validates the API key with the server
func (a *AuthService) ValidateAPIKey() (*AuthResponse, error) {
	a.mu.RLock()
	// Check cache first
	if a.cachedData != nil && time.Now().Before(a.cacheExpiry) {
		defer a.mu.RUnlock()
		return a.cachedData, nil
	}
	apiKey := a.apiKey
	a.mu.RUnlock()

	if apiKey == "" {
		return nil, fmt.Errorf("no API key configured")
	}

	// Make API request
	req, err := http.NewRequest("GET", apiBaseURL+"/auth/me", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("User-Agent", "CFXMerge/1.2")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to validate API key: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		return nil, fmt.Errorf("invalid API key")
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var authResp AuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Update cache
	a.mu.Lock()
	a.cachedData = &authResp
	a.cacheExpiry = time.Now().Add(cacheDuration)
	a.mu.Unlock()

	return &authResp, nil
}

// GetCachedUser returns cached user data without API call
func (a *AuthService) GetCachedUser() *AuthResponse {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if a.cachedData != nil && time.Now().Before(a.cacheExpiry) {
		return a.cachedData
	}
	return nil
}

// IsAuthenticated checks if user is authenticated
func (a *AuthService) IsAuthenticated() bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.apiKey != ""
}

// ClearCache clears the cached user data
func (a *AuthService) ClearCache() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.cachedData = nil
	a.cacheExpiry = time.Time{}
}
