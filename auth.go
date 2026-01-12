package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"github.com/zalando/go-keyring"
)

const (
	apiBaseURL        = "https://api.cfx.software/api/v1"
	serviceName       = "CFXMerge"
	apiKeyAccount     = "api_key"
	cacheDuration     = 5 * time.Minute // Cache user data for 5 minutes
	credentialsFile   = "credentials.enc"
)

var (
	dllcrypt32  = syscall.NewLazyDLL("Crypt32.dll")
	dllkernel32 = syscall.NewLazyDLL("Kernel32.dll")

	procEncryptData = dllcrypt32.NewProc("CryptProtectData")
	procDecryptData = dllcrypt32.NewProc("CryptUnprotectData")
	procLocalFree   = dllkernel32.NewProc("LocalFree")
)

type dataBlob struct {
	cbData uint32
	pbData *byte
}

func newBlob(d []byte) *dataBlob {
	if len(d) == 0 {
		return &dataBlob{}
	}
	return &dataBlob{
		pbData: &d[0],
		cbData: uint32(len(d)),
	}
}

func (b *dataBlob) toByteArray() []byte {
	d := make([]byte, b.cbData)
	copy(d, (*[1 << 30]byte)(unsafe.Pointer(b.pbData))[:])
	return d
}

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
	ctx           context.Context
	mu            sync.RWMutex
	apiKey        string
	cachedData    *AuthResponse
	cacheExpiry   time.Time
	httpClient    *http.Client
}

// NewAuthService creates a new authentication service
func NewAuthService(ctx context.Context) *AuthService {
	return &AuthService{
		ctx:        ctx,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				TLSHandshakeTimeout:   5 * time.Second,
				ResponseHeaderTimeout: 5 * time.Second,
			},
		},
	}
}

// handleAuthFailure centralizes auth failure handling - auto logout and notify UI
func (a *AuthService) handleAuthFailure(reason string) {
	// Delete API key from keyring
	a.DeleteAPIKey()

	// Clear in-memory cache
	a.mu.Lock()
	a.apiKey = ""
	a.cachedData = nil
	a.mu.Unlock()

	// Emit event to force UI logout
	runtime.EventsEmit(a.ctx, "auth:failed", reason)
}

// encryptData encrypts data using Windows DPAPI
func encryptData(data []byte) ([]byte, error) {
	var outBlob dataBlob
	r, _, err := procEncryptData.Call(
		uintptr(unsafe.Pointer(newBlob(data))),
		0,
		0,
		0,
		0,
		0,
		uintptr(unsafe.Pointer(&outBlob)),
	)
	if r == 0 {
		return nil, fmt.Errorf("encryption failed: %v", err)
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(outBlob.pbData)))
	return outBlob.toByteArray(), nil
}

// decryptData decrypts data using Windows DPAPI
func decryptData(data []byte) ([]byte, error) {
	var outBlob dataBlob
	r, _, err := procDecryptData.Call(
		uintptr(unsafe.Pointer(newBlob(data))),
		0,
		0,
		0,
		0,
		0,
		uintptr(unsafe.Pointer(&outBlob)),
	)
	if r == 0 {
		return nil, fmt.Errorf("decryption failed: %v", err)
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(outBlob.pbData)))
	return outBlob.toByteArray(), nil
}

// getCredentialsFilePath returns the path to the encrypted credentials file
func (a *AuthService) getCredentialsFilePath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("failed to get config dir: %w", err)
	}

	appConfigDir := filepath.Join(configDir, serviceName)
	if err := os.MkdirAll(appConfigDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create config dir: %w", err)
	}

	return filepath.Join(appConfigDir, credentialsFile), nil
}

// saveToEncryptedFile saves API key to encrypted file
func (a *AuthService) saveToEncryptedFile(apiKey string) error {
	filePath, err := a.getCredentialsFilePath()
	if err != nil {
		return err
	}

	// Encrypt the API key using DPAPI
	encrypted, err := encryptData([]byte(apiKey))
	if err != nil {
		return fmt.Errorf("failed to encrypt API key: %w", err)
	}

	// Encode to base64 for safe storage
	encoded := base64.StdEncoding.EncodeToString(encrypted)

	// Write to file
	if err := os.WriteFile(filePath, []byte(encoded), 0600); err != nil {
		return fmt.Errorf("failed to write credentials file: %w", err)
	}

	return nil
}

// loadFromEncryptedFile loads API key from encrypted file
func (a *AuthService) loadFromEncryptedFile() (string, error) {
	filePath, err := a.getCredentialsFilePath()
	if err != nil {
		return "", err
	}

	// Read file
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil // File doesn't exist yet
		}
		return "", fmt.Errorf("failed to read credentials file: %w", err)
	}

	// Decode from base64
	encrypted, err := base64.StdEncoding.DecodeString(string(data))
	if err != nil {
		return "", fmt.Errorf("failed to decode credentials: %w", err)
	}

	// Decrypt using DPAPI
	decrypted, err := decryptData(encrypted)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt API key: %w", err)
	}

	return string(decrypted), nil
}

// deleteEncryptedFile deletes the encrypted credentials file
func (a *AuthService) deleteEncryptedFile() error {
	filePath, err := a.getCredentialsFilePath()
	if err != nil {
		return err
	}

	err = os.Remove(filePath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete credentials file: %w", err)
	}

	return nil
}

// SaveAPIKey securely stores the API key in both encrypted file and OS keyring
func (a *AuthService) SaveAPIKey(apiKey string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Validate API key format
	if len(apiKey) < 10 || apiKey[:5] != "cfxm-" {
		return fmt.Errorf("invalid API key format")
	}

	// Primary: Save to encrypted file
	if err := a.saveToEncryptedFile(apiKey); err != nil {
		return fmt.Errorf("failed to save API key to encrypted file: %w", err)
	}

	// Backup: Save to OS keyring (Windows Credential Manager)
	// Don't fail if this errors - file storage is primary
	_ = keyring.Set(serviceName, apiKeyAccount, apiKey)

	a.apiKey = apiKey
	// Clear cache when API key changes
	a.cachedData = nil
	a.cacheExpiry = time.Time{}

	return nil
}

// LoadAPIKey retrieves the API key from encrypted file (primary) or OS keyring (backup)
func (a *AuthService) LoadAPIKey() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Check if already loaded in memory
	if a.apiKey != "" {
		return a.apiKey, nil
	}

	// Primary: Try to load from encrypted file
	apiKey, err := a.loadFromEncryptedFile()
	if err == nil && apiKey != "" {
		a.apiKey = apiKey
		return apiKey, nil
	}

	// Backup: Try to load from OS keyring (for migration from old version)
	apiKey, err = keyring.Get(serviceName, apiKeyAccount)
	if err != nil {
		if err == keyring.ErrNotFound {
			return "", nil // No API key stored
		}
		return "", fmt.Errorf("failed to load API key: %w", err)
	}

	// Migrate to encrypted file if we found it in keyring
	if apiKey != "" {
		_ = a.saveToEncryptedFile(apiKey)
	}

	a.apiKey = apiKey
	return apiKey, nil
}

// DeleteAPIKey removes the API key from both encrypted file and keyring
func (a *AuthService) DeleteAPIKey() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Delete from encrypted file
	if err := a.deleteEncryptedFile(); err != nil {
		// Continue even if file deletion fails
	}

	// Delete from OS keyring
	err := keyring.Delete(serviceName, apiKeyAccount)
	if err != nil && err != keyring.ErrNotFound {
		return fmt.Errorf("failed to delete API key from keyring: %w", err)
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
		// Centralized auth failure handling - auto logout
		a.handleAuthFailure("API key is invalid or expired")
		return nil, fmt.Errorf("authentication failed - please login again")
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
