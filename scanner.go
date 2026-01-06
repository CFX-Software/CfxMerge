package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Scanner handles concurrent file scanning with progress tracking
type Scanner struct {
	ctx              context.Context
	workerCount      int
	validExtensions  []string
	progressInterval time.Duration
	cancel           context.CancelFunc
}

// ScanProgress represents real-time scan progress
type ScanProgress struct {
	FilesScanned   int     `json:"filesScanned"`
	TotalFiles     int     `json:"totalFiles"`
	Percentage     float64 `json:"percentage"`
	FilesPerSecond float64 `json:"filesPerSecond"`
	ETA            int     `json:"eta"` // seconds
	CurrentFile    string  `json:"currentFile"`
}

// FileError represents a file-related error during scanning
type FileError struct {
	Path    string `json:"path"`
	Type    string `json:"type"` // "permission", "corrupt", "naming"
	Message string `json:"message"`
}

// ScanStats provides summary statistics
type ScanStats struct {
	TotalFiles       int `json:"totalFiles"`
	DuplicateGroups  int `json:"duplicateGroups"`
	ErrorCount       int `json:"errorCount"`
	WarningCount     int `json:"warningCount"`
}

// ScanResults contains all scan results
type ScanResults struct {
	Files      []FileInfo       `json:"files"`
	Duplicates []DuplicateGroup `json:"duplicates"`
	Errors     []FileError      `json:"errors"`
	Stats      ScanStats        `json:"stats"`
}

// IsFXAPEncrypted checks if a file is encrypted with FiveM's FXAP encryption
func IsFXAPEncrypted(filePath string) (bool, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer f.Close()

	// Read first 4 bytes to check for FXAP magic
	header := make([]byte, 4)
	if _, err := io.ReadFull(f, header); err != nil {
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			return false, nil // File too small to be FXAP
		}
		return false, err
	}

	// FXAP encrypted files start with "sRDI" (0x73524449) magic bytes
	fxapMagic := []byte{0x73, 0x52, 0x44, 0x49} // "sRDI"
	return bytes.Equal(header, fxapMagic), nil
}

// IsRSC7 checks if file is a normal RSC7 format (not encrypted)
func IsRSC7(filePath string) (bool, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer f.Close()

	header := make([]byte, 4)
	if _, err := io.ReadFull(f, header); err != nil {
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			return false, nil
		}
		return false, err
	}

	// Normal GTA5 resources start with "RSC7" (0x52534337)
	rsc7Magic := []byte{0x52, 0x53, 0x43, 0x37} // "RSC7"
	return bytes.Equal(header, rsc7Magic), nil
}

// NewScanner creates a new scanner instance
func NewScanner(ctx context.Context, workerCount int) *Scanner {
	scanCtx, cancel := context.WithCancel(ctx)
	return &Scanner{
		ctx:              scanCtx,
		workerCount:      workerCount,
		progressInterval: 100 * time.Millisecond,
		cancel:           cancel,
		validExtensions: []string{
			".ymap", ".ytyp", ".ybn", ".ydr", ".yft", ".ytd", ".ydd",
		},
	}
}

// Cancel stops an ongoing scan
func (s *Scanner) Cancel() {
	if s.cancel != nil {
		s.cancel()
	}
}

// isValidExtension checks if a file has a valid FiveM resource extension
func (s *Scanner) isValidExtension(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	for _, validExt := range s.validExtensions {
		if ext == validExt {
			return true
		}
	}
	return false
}

// countFiles performs a fast pre-scan to count total files
func (s *Scanner) countFiles(dirPath string) (int, error) {
	count := 0
	err := filepath.WalkDir(dirPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // Skip errors during counting
		}
		if !d.IsDir() && s.isValidExtension(path) {
			count++
		}
		return nil
	})
	return count, err
}

// ScanWithProgress performs concurrent file scanning with real-time progress updates
func (s *Scanner) ScanWithProgress(dirPath string) (*ScanResults, error) {
	// Phase 1: Count total files
	totalFiles, err := s.countFiles(dirPath)
	if err != nil {
		return nil, fmt.Errorf("failed to count files: %w", err)
	}

	if totalFiles == 0 {
		return &ScanResults{
			Files:      []FileInfo{},
			Duplicates: []DuplicateGroup{},
			Errors:     []FileError{},
			Stats: ScanStats{
				TotalFiles:      0,
				DuplicateGroups: 0,
				ErrorCount:      0,
				WarningCount:    0,
			},
		}, nil
	}

	// Phase 2: Set up worker pool
	jobs := make(chan string, 1000)
	results := make(chan FileInfo, 1000)
	errors := make(chan FileError, 100)

	var filesScanned int64
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < s.workerCount; i++ {
		wg.Add(1)
		go s.worker(&wg, jobs, results, errors, &filesScanned)
	}

	// Phase 3: Start progress ticker
	progressTicker := time.NewTicker(s.progressInterval)
	defer progressTicker.Stop()

	var lastFilesScanned int64
	var filesPerSecond float64
	var lastCurrentFile string

	go func() {
		for {
			select {
			case <-progressTicker.C:
				scanned := atomic.LoadInt64(&filesScanned)

				// Calculate files per second using exponential moving average
				currentRate := float64(scanned-lastFilesScanned) / s.progressInterval.Seconds()
				filesPerSecond = (filesPerSecond * 0.7) + (currentRate * 0.3)
				lastFilesScanned = scanned

				// Calculate ETA
				remaining := totalFiles - int(scanned)
				var eta int
				if filesPerSecond > 0 {
					eta = int(float64(remaining) / filesPerSecond)
				}

				percentage := (float64(scanned) / float64(totalFiles)) * 100
				if percentage > 100 {
					percentage = 100
				}

				progress := ScanProgress{
					FilesScanned:   int(scanned),
					TotalFiles:     totalFiles,
					Percentage:     percentage,
					FilesPerSecond: filesPerSecond,
					ETA:            eta,
					CurrentFile:    lastCurrentFile,
				}

				runtime.EventsEmit(s.ctx, "scan:progress", progress)

			case <-s.ctx.Done():
				return
			}
		}
	}()

	// Phase 4: Feed jobs (directory traversal)
	go func() {
		defer close(jobs)
		filepath.WalkDir(dirPath, func(path string, d fs.DirEntry, err error) error {
			// Check for cancellation
			select {
			case <-s.ctx.Done():
				return fmt.Errorf("scan cancelled")
			default:
			}

			if err != nil {
				// Handle permission errors
				if os.IsPermission(err) {
					errors <- FileError{
						Path:    path,
						Type:    "permission",
						Message: "Access denied",
					}
				}
				return nil // Continue scanning
			}

			if !d.IsDir() && s.isValidExtension(path) {
				lastCurrentFile = filepath.Base(path)
				jobs <- path
			}
			return nil
		})
	}()

	// Phase 5: Collect results
	allFiles := make([]FileInfo, 0, totalFiles)
	allErrors := make([]FileError, 0)

	var resultWg sync.WaitGroup
	resultWg.Add(2)

	// Collect file results
	go func() {
		defer resultWg.Done()
		for file := range results {
			allFiles = append(allFiles, file)
		}
	}()

	// Collect errors
	go func() {
		defer resultWg.Done()
		for err := range errors {
			allErrors = append(allErrors, err)
		}
	}()

	// Wait for all workers to complete
	wg.Wait()
	close(results)
	close(errors)

	// Wait for result collection to complete
	resultWg.Wait()

	// Phase 6: Detect duplicates and naming conflicts
	duplicates := s.groupDuplicates(allFiles)
	namingErrors := s.detectNamingConflicts(allFiles)
	allErrors = append(allErrors, namingErrors...)

	// Phase 7: Calculate stats
	warningCount := 0
	for _, dup := range duplicates {
		if dup.HasWarnings {
			warningCount++
		}
	}

	stats := ScanStats{
		TotalFiles:      len(allFiles),
		DuplicateGroups: len(duplicates),
		ErrorCount:      len(allErrors),
		WarningCount:    warningCount,
	}

	return &ScanResults{
		Files:      allFiles,
		Duplicates: duplicates,
		Errors:     allErrors,
		Stats:      stats,
	}, nil
}

// worker processes files concurrently
func (s *Scanner) worker(wg *sync.WaitGroup, jobs <-chan string, results chan<- FileInfo, errors chan<- FileError, filesScanned *int64) {
	defer wg.Done()

	for path := range jobs {
		// Check for cancellation
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		info, err := os.Stat(path)
		if err != nil {
			if os.IsPermission(err) {
				errors <- FileError{
					Path:    path,
					Type:    "permission",
					Message: "Access denied",
				}
			} else {
				errors <- FileError{
					Path:    path,
					Type:    "corrupt",
					Message: err.Error(),
				}
			}
			atomic.AddInt64(filesScanned, 1)
			continue
		}

		// Check for corrupt files (zero-byte files)
		if info.Size() == 0 {
			errors <- FileError{
				Path:    path,
				Type:    "corrupt",
				Message: "Zero-byte file",
			}
			atomic.AddInt64(filesScanned, 1)
			continue
		}

		// Check for FXAP encryption on resource files
		ext := strings.ToLower(filepath.Ext(path))
		if ext == ".ydr" || ext == ".yft" || ext == ".ytd" || ext == ".ydd" {
			encrypted, err := IsFXAPEncrypted(path)
			if err == nil && encrypted {
				errors <- FileError{
					Path:    path,
					Type:    "encrypted",
					Message: "FXAP encrypted (escrow/protected resource)",
				}
				atomic.AddInt64(filesScanned, 1)
				continue
			}
		}

		// Create FileInfo
		fileInfo := FileInfo{
			Path:    path,
			Name:    info.Name(),
			Size:    info.Size(),
			ModTime: info.ModTime().Format("2006-01-02 15:04:05"),
		}

		results <- fileInfo
		atomic.AddInt64(filesScanned, 1)
	}
}

// groupDuplicates groups files by name and size
func (s *Scanner) groupDuplicates(files []FileInfo) []DuplicateGroup {
	// Create composite key: "filename_size"
	type duplicateKey struct {
		name string
		size int64
	}

	fileGroups := make(map[duplicateKey][]FileInfo)

	// Group files by name and size
	for _, file := range files {
		key := duplicateKey{
			name: strings.ToLower(file.Name),
			size: file.Size,
		}
		fileGroups[key] = append(fileGroups[key], file)
	}

	// Convert to DuplicateGroup (only groups with 2+ files)
	duplicates := []DuplicateGroup{}
	for _, groupFiles := range fileGroups {
		if len(groupFiles) >= 2 {
			// Extract just the paths for display
			paths := make([]string, len(groupFiles))
			for i, f := range groupFiles {
				paths[i] = f.Path
			}

			group := DuplicateGroup{
				ID:       uuid.New().String(),
				Name:     groupFiles[0].Name,
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

// detectNamingConflicts detects case-sensitive naming conflicts
func (s *Scanner) detectNamingConflicts(files []FileInfo) []FileError {
	seen := make(map[string]string) // lowercase name -> original path
	conflicts := []FileError{}

	for _, file := range files {
		lower := strings.ToLower(file.Name)
		if existingPath, exists := seen[lower]; exists {
			// Only add conflict if paths are different (actual conflict)
			if existingPath != file.Path && filepath.Base(existingPath) != file.Name {
				conflicts = append(conflicts, FileError{
					Path:    file.Path,
					Type:    "naming",
					Message: fmt.Sprintf("Case conflict with: %s", existingPath),
				})
			}
		}
		seen[lower] = file.Path
	}

	return conflicts
}
