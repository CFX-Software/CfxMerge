package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// App struct
type App struct {
	ctx context.Context
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
	ID          string     `json:"id"`
	Files       []FileInfo `json:"files"`
	Status      string     `json:"status"`
	HasWarnings bool       `json:"hasWarnings"`
	WarningCount int       `json:"warningCount"`
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

		group := DuplicateGroup{
			ID:     fmt.Sprintf("duplicate_%d", i),
			Files:  []FileInfo{file},
			Status: "Ready to merge",
		}

		processed[file.Path] = true
		baseName := strings.TrimSuffix(file.Name, filepath.Ext(file.Name))

		// Find similar files
		for j, otherFile := range files {
			if i != j && !processed[otherFile.Path] {
				otherBaseName := strings.TrimSuffix(otherFile.Name, filepath.Ext(otherFile.Name))
				if strings.Contains(strings.ToLower(baseName), strings.ToLower(otherBaseName)) ||
					strings.Contains(strings.ToLower(otherBaseName), strings.ToLower(baseName)) {
					group.Files = append(group.Files, otherFile)
					processed[otherFile.Path] = true
				}
			}
		}

		// Only add groups with duplicates
		if len(group.Files) > 1 {
			duplicates = append(duplicates, group)
		}
	}

	return duplicates
}
