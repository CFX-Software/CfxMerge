package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx        context.Context
	scanner    *Scanner
	discordRPC *DiscordRPC
	authService *AuthService
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize Auth Service
	a.authService = NewAuthService()

	// Try to load saved API key
	apiKey, err := a.authService.LoadAPIKey()
	if err == nil && apiKey != "" {
		// Validate in background
		go func() {
			_, _ = a.authService.ValidateAPIKey()
		}()
	}

	// Initialize Discord Rich Presence
	a.discordRPC = NewDiscordRPC()
}

// shutdown is called when the app is shutting down
func (a *App) shutdown(ctx context.Context) {
	if a.discordRPC != nil {
		a.discordRPC.Shutdown()
	}
}

// FileInfo represents information about a file
type FileInfo struct {
	Path        string `json:"path"`
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	ModTime     string `json:"modTime"`
	IsEncrypted bool   `json:"isEncrypted"`
}

// DuplicateGroup represents a group of duplicate files
type DuplicateGroup struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Status       string     `json:"status"`
	Files        []FileInfo `json:"files"`
	Paths        []string   `json:"paths"` // Deprecated: use Files instead
	Expanded     bool       `json:"expanded"`
	Selected     bool       `json:"selected"`
	HasWarnings  bool       `json:"hasWarnings,omitempty"`
	WarningCount int        `json:"warningCount,omitempty"`
}

// ScanDirectory scans a directory for files
func (a *App) ScanDirectory(dirPath string) ([]FileInfo, error) {
	var files []FileInfo

	err := filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() {
			files = append(files, FileInfo{
				Path:    path,
				Name:    info.Name(),
				Size:    info.Size(),
				ModTime: info.ModTime().Format("2006-01-02 15:04:05"),
			})
		}

		return nil
	})

	return files, err
}

// FindDuplicates finds duplicate files based on name similarity
func (a *App) FindDuplicates(files []FileInfo) []DuplicateGroup {
	duplicates := []DuplicateGroup{}
	processed := make(map[string]bool)

	for i, file := range files {
		if processed[file.Path] {
			continue
		}

		paths := []string{file.Path}
		processed[file.Path] = true
		baseName := strings.TrimSuffix(file.Name, filepath.Ext(file.Name))

		// Find similar files
		for j, otherFile := range files {
			if i != j && !processed[otherFile.Path] {
				otherBaseName := strings.TrimSuffix(otherFile.Name, filepath.Ext(otherFile.Name))
				if strings.Contains(strings.ToLower(baseName), strings.ToLower(otherBaseName)) ||
					strings.Contains(strings.ToLower(otherBaseName), strings.ToLower(baseName)) {
					paths = append(paths, otherFile.Path)
					processed[otherFile.Path] = true
				}
			}
		}

		// Only add groups with duplicates
		if len(paths) > 1 {
			group := DuplicateGroup{
				ID:       fmt.Sprintf("duplicate_%d", i),
				Name:     file.Name,
				Status:   "ready",
				Paths:    paths,
				Expanded: false,
				Selected: true,
			}
			duplicates = append(duplicates, group)
		}
	}

	return duplicates
}

// StartScan initiates an asynchronous scan with real-time progress updates
func (a *App) StartScan(dirPath string) error {
	// Cancel any existing scan
	if a.scanner != nil {
		a.scanner.Cancel()
	}

	// Create new scanner with 30 workers
	a.scanner = NewScanner(a.ctx, 30)

	// Run scan in background
	go func() {
		results, err := a.scanner.ScanWithProgress(dirPath)
		if err != nil {
			runtime.EventsEmit(a.ctx, "scan:error", err.Error())
			return
		}
		runtime.EventsEmit(a.ctx, "scan:complete", results)
	}()

	return nil
}

// CancelScan cancels the currently running scan
func (a *App) CancelScan() error {
	if a.scanner != nil {
		a.scanner.Cancel()
		a.scanner = nil
	}
	return nil
}

// SelectFolder opens a directory picker dialog
func (a *App) SelectFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select FiveM Resource Folder",
	})
}

// UpdateDiscordPresence updates Discord Rich Presence based on current view
func (a *App) UpdateDiscordPresence(view string) error {
	if a.discordRPC == nil {
		return nil
	}

	switch view {
	case "merger":
		return a.discordRPC.UpdateMergerView()
	case "converter":
		return a.discordRPC.UpdateConverterView()
	case "settings":
		return a.discordRPC.UpdateSettingsView()
	default:
		return a.discordRPC.UpdateMergerView()
	}
}

// SaveAPIKey saves and validates the API key
func (a *App) SaveAPIKey(apiKey string) error {
	if a.authService == nil {
		return fmt.Errorf("auth service not initialized")
	}

	// Save to secure storage
	if err := a.authService.SaveAPIKey(apiKey); err != nil {
		return err
	}

	// Validate with server
	_, err := a.authService.ValidateAPIKey()
	return err
}

// GetAuthStatus returns the current authentication status
func (a *App) GetAuthStatus() (*AuthResponse, error) {
	if a.authService == nil {
		return nil, fmt.Errorf("auth service not initialized")
	}

	// Try cache first
	if cached := a.authService.GetCachedUser(); cached != nil {
		return cached, nil
	}

	// Load API key
	apiKey, err := a.authService.LoadAPIKey()
	if err != nil {
		return nil, err
	}

	if apiKey == "" {
		return nil, fmt.Errorf("not authenticated")
	}

	// Validate
	return a.authService.ValidateAPIKey()
}

// IsAuthenticated checks if user is authenticated
func (a *App) IsAuthenticated() bool {
	if a.authService == nil {
		return false
	}
	return a.authService.IsAuthenticated()
}

// Logout removes the saved API key
func (a *App) Logout() error {
	if a.authService == nil {
		return fmt.Errorf("auth service not initialized")
	}
	return a.authService.DeleteAPIKey()
}
