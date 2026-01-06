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
	ctx     context.Context
	scanner *Scanner
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// FileInfo represents information about a file
type FileInfo struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	ModTime  string `json:"modTime"`
}

// DuplicateGroup represents a group of duplicate files
type DuplicateGroup struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Status   string   `json:"status"`
	Paths    []string `json:"paths"`
	Expanded bool     `json:"expanded"`
	Selected bool     `json:"selected"`
	HasWarnings bool  `json:"hasWarnings,omitempty"`
	WarningCount int  `json:"warningCount,omitempty"`
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
