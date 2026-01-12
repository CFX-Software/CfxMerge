package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	apiMergePresignURL = "https://api.cfx.software/api/v1/merge/presign"
	apiMergeSubmitURL  = "https://api.cfx.software/api/v1/merge"
	apiMergeJobURL     = "https://api.cfx.software/api/v1/jobs"
	maxFilesPerJob     = 10000
	maxFileSize        = 2 * 1024 * 1024 * 1024  // 2GB
	maxTotalSize       = 3 * 1024 * 1024 * 1024  // 3GB
	mergePollInterval  = 3 * time.Second
)

// Supported merge file extensions (NO .ydd)
var supportedMergeExtensions = []string{".ymap", ".ytyp", ".ybn", ".ydr", ".ymt"}

// MergeFileRequest represents a file to be merged
type MergeFileRequest struct {
	FileName string `json:"fileName"`
	FileSize int64  `json:"fileSize"`
}

// PresignRequest represents the request for presigned URLs
type PresignRequest struct {
	Files []MergeFileRequest `json:"files"`
}

// PresignedFile represents a presigned upload URL
type PresignedFile struct {
	FileName  string `json:"fileName"`
	UploadURL string `json:"uploadUrl"`
	R2Key     string `json:"r2Key"`
}

// PresignResponse represents the presigned URLs response
type PresignResponse struct {
	Files     []PresignedFile `json:"files"`
	ExpiresIn int             `json:"expiresIn"`
}

// MergeFileSubmit represents a file in the merge job submission
type MergeFileSubmit struct {
	R2Key    string `json:"r2Key"`
	FileName string `json:"fileName"`
	FileSize int64  `json:"fileSize"`
}

// MergeOptions represents merge job options
type MergeOptions struct {
	ResourceName string `json:"resourceName"`
	AutoFixYdr   bool   `json:"autoFixYdr"`
}

// MergeSubmitRequest represents the merge job submission
type MergeSubmitRequest struct {
	Files   []MergeFileSubmit `json:"files"`
	Options MergeOptions      `json:"options"`
}

// MergeSubmitResponse represents the merge job submission response
type MergeSubmitResponse struct {
	JobID   string `json:"jobId"`
	Message string `json:"message"`
}

// MergeJobResult represents a merge job result
type MergeJobResult struct {
	Status      string `json:"status"`
	ModName     string `json:"mod_name"`
	DownloadURL string `json:"download_url"`
}

// MergeJobStatus represents the merge job status
type MergeJobStatus struct {
	JobID      string           `json:"job_id"`
	Status     string           `json:"status"`
	Progress   int              `json:"progress"`
	Processed  int              `json:"processed"`
	Successful int              `json:"successful"`
	Failed     int              `json:"failed"`
	Results    []MergeJobResult `json:"results"`
}

// MergeValidation represents pre-merge validation results
type MergeValidation struct {
	Valid          bool     `json:"valid"`
	Errors         []string `json:"errors"`
	Warnings       []string `json:"warnings"`
	TotalFiles     int      `json:"totalFiles"`
	TotalSize      int64    `json:"totalSize"`
	BackupSize     int64    `json:"backupSize"`
	ResourceName   string   `json:"resourceName"`
	BackupPath     string   `json:"backupPath"`
	BackupPathAlt  string   `json:"backupPathAlt"`
	AvailableSpace int64    `json:"availableSpace"`
}

// BackupSummary represents a backup entry for restore UI.
type BackupSummary struct {
	Path            string `json:"path"`
	Name            string `json:"name"`
	BackupTimestamp string `json:"backupTimestamp"`
	ScannedFolder   string `json:"scannedFolder"`
	TotalFiles      int    `json:"totalFiles"`
	TotalSize       int64  `json:"totalSize"`
	ResourceName    string `json:"resourceName"`
}

// RestoreResult represents the result of a backup restore.
type RestoreResult struct {
	BackupPath    string   `json:"backupPath"`
	FilesRestored int      `json:"filesRestored"`
	FilesMissing  int      `json:"filesMissing"`
	Errors        []string `json:"errors"`
	Success       bool     `json:"success"`
}

// MergeAPIError represents a structured API error with recovery guidance.
type MergeAPIError struct {
	Message  string
	Recovery string
}

func (e *MergeAPIError) Error() string {
	return e.Message
}

// BackupResult represents backup creation results
type BackupResult struct {
	PrimaryPath       string   `json:"primaryPath"`
	SecondaryPath     string   `json:"secondaryPath"`
	FilesCopied       int      `json:"filesCopied"`
	BytesCopied       int64    `json:"bytesCopied"`
	Success           bool     `json:"success"`
	Errors            []string `json:"errors"`
	VerifiedPrimary   bool     `json:"verifiedPrimary"`
	VerifiedSecondary bool     `json:"verifiedSecondary"`
}

// ManifestEntry represents a file in the backup manifest
type ManifestEntry struct {
	BackupPath   string `json:"backupPath"`
	OriginalPath string `json:"originalPath"`
	Size         int64  `json:"size"`
	Hash         string `json:"hash"`
	ModTime      string `json:"modTime"`
}

// BackupManifest represents the backup manifest.json structure
type BackupManifest struct {
	BackupTimestamp string          `json:"backupTimestamp"`
	ScannedFolder   string          `json:"scannedFolder"`
	TotalFiles      int             `json:"totalFiles"`
	TotalSize       int64           `json:"totalSize"`
	ResourceName    string          `json:"resourceName"`
	Files           []ManifestEntry `json:"files"`
}

// ExtractResult represents extraction results
type ExtractResult struct {
	TempPath     string `json:"tempPath"`
	ResourceName string `json:"resourceName"`
	HasManifest  bool   `json:"hasManifest"`
	FileCount    int    `json:"fileCount"`
	Success      bool   `json:"success"`
}

// DeletionResult represents file deletion results
type DeletionResult struct {
	FilesDeleted   int      `json:"filesDeleted"`
	FilesRemaining int      `json:"filesRemaining"`
	Errors         []string `json:"errors"`
	Success        bool     `json:"success"`
}

// MergeContext holds the context for a merge operation
type MergeContext struct {
	Files           []string
	ResourceName    string
	BackupPrimary   string
	BackupSecondary string
	ManifestPath    string
	Timestamp       string
	ScannedFolder   string
}

// MergeService handles file merging operations
type MergeService struct {
	ctx           context.Context
	httpClient    *http.Client
	authSvc       *AuthService
	mu            sync.RWMutex
	activeJobs    map[string]*MergeJobStatus
	mergeContexts map[string]*MergeContext
}

// NewMergeService creates a new merge service
func NewMergeService(ctx context.Context, authSvc *AuthService) *MergeService {
	return &MergeService{
		ctx:           ctx,
		authSvc:       authSvc,
		activeJobs:    make(map[string]*MergeJobStatus),
		mergeContexts: make(map[string]*MergeContext),
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
			Transport: &http.Transport{
				TLSHandshakeTimeout:   10 * time.Second,
				ResponseHeaderTimeout: 30 * time.Second,
			},
		},
	}
}

// IsSupportedMergeFile checks if a file extension is supported for merging
func IsSupportedMergeFile(filePath string) bool {
	ext := strings.ToLower(filepath.Ext(filePath))
	for _, supported := range supportedMergeExtensions {
		if ext == supported {
			return true
		}
	}
	return false
}

// ValidateMergeFiles validates files before merging
func (m *MergeService) ValidateMergeFiles(files []string) error {
	if len(files) == 0 {
		return fmt.Errorf("no files selected")
	}

	if len(files) > maxFilesPerJob {
		return fmt.Errorf("too many files: maximum %d files per job", maxFilesPerJob)
	}

	var totalSize int64
	for _, filePath := range files {
		// Check if file exists
		info, err := os.Stat(filePath)
		if err != nil {
			return fmt.Errorf("cannot access file %s: %w", filepath.Base(filePath), err)
		}

		// Check if supported extension
		if !IsSupportedMergeFile(filePath) {
			return fmt.Errorf("unsupported file type: %s (supported: .ymap, .ytyp, .ybn, .ydr, .ymt)", filepath.Ext(filePath))
		}

		// Check file size
		if info.Size() > maxFileSize {
			return fmt.Errorf("file too large: %s exceeds 2GB limit", filepath.Base(filePath))
		}

		totalSize += info.Size()
	}

	// Check total size
	if totalSize > maxTotalSize {
		return fmt.Errorf("total size exceeds 3GB limit")
	}

	return nil
}

// MergeFiles merges the selected files
func (m *MergeService) MergeFiles(files []string, resourceName string, autoFixYdr bool) (string, error) {
	// Validate files
	if err := m.ValidateMergeFiles(files); err != nil {
		return "", err
	}

	// Get API key
	apiKey, err := m.authSvc.LoadAPIKey()
	if err != nil {
		return "", fmt.Errorf("authentication required: %w", err)
	}

	// Emit start event
	runtime.EventsEmit(m.ctx, "merge:started", len(files))

	// Step 1: Request presigned URLs
	runtime.EventsEmit(m.ctx, "merge:status", "Requesting upload URLs...")
	presignedFiles, err := m.requestPresignedURLs(apiKey, files)
	if err != nil {
		m.emitMergeErrorFromErr("uploading", err, "Check your connection and API key, then try again.")
		return "", err
	}

	// Step 2: Upload files to R2
	runtime.EventsEmit(m.ctx, "merge:status", "Uploading files...")
	if err := m.uploadFiles(files, presignedFiles); err != nil {
		m.emitMergeErrorFromErr("uploading", err, "Retry the merge. If it keeps failing, confirm your files are accessible.")
		return "", err
	}

	// Step 3: Submit merge job
	runtime.EventsEmit(m.ctx, "merge:status", "Submitting merge job...")
	jobID, err := m.submitMergeJob(apiKey, files, presignedFiles, resourceName, autoFixYdr)
	if err != nil {
		m.emitMergeErrorFromErr("merging", err, "The merge job could not be created. Please try again.")
		return "", err
	}

	// Step 4: Poll job status
	runtime.EventsEmit(m.ctx, "merge:job-created", jobID)
	go m.pollMergeJobStatus(apiKey, jobID)

	return jobID, nil
}

// requestPresignedURLs requests presigned upload URLs
func (m *MergeService) requestPresignedURLs(apiKey string, files []string) ([]PresignedFile, error) {
	// Build request
	fileReqs := make([]MergeFileRequest, 0, len(files))
	for _, filePath := range files {
		info, err := os.Stat(filePath)
		if err != nil {
			return nil, err
		}

		fileReqs = append(fileReqs, MergeFileRequest{
			FileName: filepath.Base(filePath),
			FileSize: info.Size(),
		})
	}

	reqBody := PresignRequest{Files: fileReqs}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", apiMergePresignURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "CFXMerge/1.0")

	// Send request
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		runtime.EventsEmit(m.ctx, "auth:failed", "Authentication failed - please login again")
		return nil, fmt.Errorf("authentication failed")
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		bodyText := strings.TrimSpace(string(body))
		if resp.StatusCode == 429 {
			return nil, &MergeAPIError{
				Message:  fmt.Sprintf("rate limited: %s", bodyText),
				Recovery: rateLimitRecovery(resp),
			}
		}
		return nil, fmt.Errorf("presign failed (%d): %s", resp.StatusCode, bodyText)
	}

	// Parse response
	var presignResp PresignResponse
	if err := json.NewDecoder(resp.Body).Decode(&presignResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return presignResp.Files, nil
}

// uploadFiles uploads files to R2 using presigned URLs
func (m *MergeService) uploadFiles(files []string, presignedFiles []PresignedFile) error {
	if len(presignedFiles) != len(files) {
		return fmt.Errorf("presign count mismatch: requested %d files, received %d URLs", len(files), len(presignedFiles))
	}

	for i, filePath := range files {
		fileName := filepath.Base(filePath)
		uploadURL := presignedFiles[i].UploadURL
		if uploadURL == "" {
			return fmt.Errorf("no upload URL for file %s (index %d)", fileName, i)
		}

		// Emit progress
		progress := int((float64(i) / float64(len(files))) * 100)
		runtime.EventsEmit(m.ctx, "merge:upload-progress", map[string]interface{}{
			"progress": progress,
			"current":  i + 1,
			"total":    len(files),
			"file":     fileName,
		})

		// Read file
		fileData, err := os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to read file %s: %w", fileName, err)
		}

		// Upload to R2
		req, err := http.NewRequest("PUT", uploadURL, bytes.NewReader(fileData))
		if err != nil {
			return fmt.Errorf("failed to create upload request: %w", err)
		}

		req.Header.Set("Content-Type", "application/octet-stream")

		resp, err := m.httpClient.Do(req)
		if err != nil {
			return fmt.Errorf("upload failed for %s: %w", fileName, err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != 200 {
			bodyText := strings.TrimSpace(string(body))
			if bodyText != "" {
				return fmt.Errorf("upload failed for %s: status %d: %s", fileName, resp.StatusCode, bodyText)
			}
			return fmt.Errorf("upload failed for %s: status %d", fileName, resp.StatusCode)
		}
	}

	runtime.EventsEmit(m.ctx, "merge:upload-progress", map[string]interface{}{
		"progress": 100,
		"current":  len(files),
		"total":    len(files),
		"file":     "All files uploaded",
	})
	return nil
}

// submitMergeJob submits the merge job
func (m *MergeService) submitMergeJob(apiKey string, files []string, presignedFiles []PresignedFile, resourceName string, autoFixYdr bool) (string, error) {
	// Build file submissions
	fileSubmits := make([]MergeFileSubmit, 0, len(files))
	if len(presignedFiles) != len(files) {
		return "", fmt.Errorf("presign count mismatch: requested %d files, received %d URLs", len(files), len(presignedFiles))
	}

	for i, filePath := range files {
		fileName := filepath.Base(filePath)
		info, err := os.Stat(filePath)
		if err != nil {
			return "", fmt.Errorf("cannot access file %s: %w", fileName, err)
		}
		r2Key := presignedFiles[i].R2Key
		if r2Key == "" {
			return "", fmt.Errorf("missing r2Key for file %s (index %d)", fileName, i)
		}

		fileSubmits = append(fileSubmits, MergeFileSubmit{
			R2Key:    r2Key,
			FileName: fileName,
			FileSize: info.Size(),
		})
	}

	// Build request
	reqBody := MergeSubmitRequest{
		Files: fileSubmits,
		Options: MergeOptions{
			ResourceName: resourceName,
			AutoFixYdr:   autoFixYdr,
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", apiMergeSubmitURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "CFXMerge/1.0")

	// Send request
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		runtime.EventsEmit(m.ctx, "auth:failed", "Authentication failed - please login again")
		return "", fmt.Errorf("authentication failed")
	}

	if resp.StatusCode != 200 && resp.StatusCode != 202 {
		body, _ := io.ReadAll(resp.Body)
		bodyText := strings.TrimSpace(string(body))
		if resp.StatusCode == 429 {
			return "", &MergeAPIError{
				Message:  fmt.Sprintf("rate limited: %s", bodyText),
				Recovery: rateLimitRecovery(resp),
			}
		}
		return "", fmt.Errorf("merge submit failed (%d): %s", resp.StatusCode, bodyText)
	}

	// Parse response
	var submitResp MergeSubmitResponse
	if err := json.NewDecoder(resp.Body).Decode(&submitResp); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	return submitResp.JobID, nil
}

// pollMergeJobStatus polls the job status until completion
func (m *MergeService) pollMergeJobStatus(apiKey string, jobID string) {
	for {
		time.Sleep(mergePollInterval)

		status, err := m.getMergeJobStatus(apiKey, jobID)
		if err != nil {
			m.emitMergeErrorFromErr("merging", err, "Merge job status could not be checked. Please retry.")
			return
		}

		// Store status
		m.mu.Lock()
		m.activeJobs[jobID] = status
		m.mu.Unlock()

		// Emit status update
		runtime.EventsEmit(m.ctx, "merge:progress", status)

		// Check if completed
		if status.Status == "completed" || status.Status == "failed" {
			if status.Status == "completed" && len(status.Results) > 0 {
				runtime.EventsEmit(m.ctx, "merge:completed", status.Results[0])

				// Get merge context
				m.mu.Lock()
				ctx, exists := m.mergeContexts[jobID]
				m.mu.Unlock()

				if exists && ctx != nil {
					// Continue workflow: download, delete, install
					downloadURL := status.Results[0].DownloadURL
					backupPaths := []string{ctx.BackupPrimary, ctx.BackupSecondary}

					err := m.CompleteMergeWorkflow(downloadURL, ctx.ResourceName, ctx.ScannedFolder, ctx.Files, backupPaths)
					if err != nil {
						// Error already emitted in CompleteMergeWorkflow
						return
					}

					// Clean up context
					m.mu.Lock()
					delete(m.mergeContexts, jobID)
					m.mu.Unlock()
				}
			} else if status.Status == "failed" {
				m.emitMergeError("merging", "Merge job failed", "The API reported a failed job. Try again or check your input files.")
			}
			return
		}
	}
}

// getMergeJobStatus gets the current job status
func (m *MergeService) getMergeJobStatus(apiKey string, jobID string) (*MergeJobStatus, error) {
	url := fmt.Sprintf("%s/%s", apiMergeJobURL, jobID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("User-Agent", "CFXMerge/1.0")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		runtime.EventsEmit(m.ctx, "auth:failed", "Authentication failed - please login again")
		return nil, fmt.Errorf("authentication failed")
	}

	if resp.StatusCode != 200 && resp.StatusCode != 202 {
		body, _ := io.ReadAll(resp.Body)
		bodyText := strings.TrimSpace(string(body))
		if resp.StatusCode == 429 {
			return nil, &MergeAPIError{
				Message:  fmt.Sprintf("rate limited: %s", bodyText),
				Recovery: rateLimitRecovery(resp),
			}
		}
		return nil, fmt.Errorf("status check failed (%d): %s", resp.StatusCode, bodyText)
	}

	var status MergeJobStatus
	body, _ := io.ReadAll(resp.Body)
	if len(body) == 0 {
		return &MergeJobStatus{
			JobID:    jobID,
			Status:   "pending",
			Progress: 0,
		}, nil
	}
	if err := json.Unmarshal(body, &status); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &status, nil
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// copyFile copies a single file with verification
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open source: %w", err)
	}
	defer sourceFile.Close()

	// Get source file info for size verification
	sourceInfo, err := sourceFile.Stat()
	if err != nil {
		return fmt.Errorf("failed to stat source: %w", err)
	}

	// Create destination file
	destFile, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("failed to create destination: %w", err)
	}
	defer destFile.Close()

	// Copy file contents
	bytesWritten, err := io.Copy(destFile, sourceFile)
	if err != nil {
		return fmt.Errorf("failed to copy: %w", err)
	}

	// Verify copied bytes match source size
	if bytesWritten != sourceInfo.Size() {
		return fmt.Errorf("copy verification failed: %d != %d", bytesWritten, sourceInfo.Size())
	}

	// Force flush to disk
	if err := destFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync: %w", err)
	}

	return nil
}

// copyFileWithStructure copies a file preserving its relative path structure
func copyFileWithStructure(src, scannedFolder, backupRoot string) (string, error) {
	// Calculate relative path from scanned folder
	relPath, err := filepath.Rel(scannedFolder, src)
	if err != nil {
		return "", fmt.Errorf("failed to calculate relative path: %w", err)
	}

	// Build destination path
	dst := filepath.Join(backupRoot, relPath)

	// Create directory structure
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return "", fmt.Errorf("failed to create directory: %w", err)
	}

	// Copy the file
	if err := copyFile(src, dst); err != nil {
		return "", err
	}

	return relPath, nil
}

// copyDir recursively copies a directory
func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Calculate relative path
		relPath, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}

		destPath := filepath.Join(dst, relPath)

		if info.IsDir() {
			return os.MkdirAll(destPath, info.Mode())
		}

		return copyFile(path, destPath)
	})
}

// createManifest creates a manifest.json file for backup restoration
func createManifest(files []string, scannedFolder, backupPath, timestamp, resourceName string) error {
	manifest := BackupManifest{
		BackupTimestamp: time.Now().Format(time.RFC3339),
		ScannedFolder:   scannedFolder,
		TotalFiles:      len(files),
		TotalSize:       0,
		ResourceName:    resourceName,
		Files:           make([]ManifestEntry, 0, len(files)),
	}

	// Build manifest entries
	for _, filePath := range files {
		info, err := os.Stat(filePath)
		if err != nil {
			continue
		}

		relPath, err := filepath.Rel(scannedFolder, filePath)
		if err != nil {
			continue
		}

		manifest.TotalSize += info.Size()
		manifest.Files = append(manifest.Files, ManifestEntry{
			BackupPath:   relPath,
			OriginalPath: filePath,
			Size:         info.Size(),
			Hash:         "", // Hash can be added later if needed
			ModTime:      info.ModTime().Format(time.RFC3339),
		})
	}

	// Write manifest.json
	manifestPath := filepath.Join(backupPath, "manifest.json")
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal manifest: %w", err)
	}

	if err := os.WriteFile(manifestPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write manifest: %w", err)
	}

	// Create README.txt
	readmePath := filepath.Join(backupPath, "README.txt")
	readme := fmt.Sprintf(`CFXMerge Backup - Created: %s
==============================================

This backup contains files deleted during a merge operation.

RESTORATION INSTRUCTIONS:
1. Open manifest.json to see original file paths
2. Copy files from this backup back to their original locations
3. File structure in this backup matches relative paths from: %s

WARNING: Do not delete this backup until you've verified the merged resource works correctly!

Files backed up: %d
Total size: %.2f MB
Resource created: %s
`,
		time.Now().Format("2006-01-02 15:04:05"),
		scannedFolder,
		manifest.TotalFiles,
		float64(manifest.TotalSize)/(1024*1024),
		resourceName,
	)

	if err := os.WriteFile(readmePath, []byte(readme), 0644); err != nil {
		return fmt.Errorf("failed to write README: %w", err)
	}

	return nil
}

// verifyBackup verifies backup integrity by checking file count and total size
func verifyBackup(originalFiles []string, backupPath string, expectedSize int64) error {
	// Count files in backup
	var backupCount int
	var backupSize int64

	err := filepath.Walk(backupPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && info.Name() != "manifest.json" && info.Name() != "README.txt" {
			backupCount++
			backupSize += info.Size()
		}
		return nil
	})

	if err != nil {
		return fmt.Errorf("failed to walk backup directory: %w", err)
	}

	// Check file count
	if backupCount != len(originalFiles) {
		return fmt.Errorf("file count mismatch: expected %d, got %d", len(originalFiles), backupCount)
	}

	// Check total size
	if backupSize != expectedSize {
		return fmt.Errorf("size mismatch: expected %d bytes, got %d bytes", expectedSize, backupSize)
	}

	return nil
}

// getDiskSpace gets available disk space for a given path (Windows)
func getDiskSpace(path string) (int64, error) {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeSpaceEx := kernel32.NewProc("GetDiskFreeSpaceExW")

	var freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes int64

	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, err
	}

	r1, _, err := getDiskFreeSpaceEx.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)

	if r1 == 0 {
		return 0, err
	}

	return freeBytesAvailable, nil
}

// downloadFile downloads a file from a URL
func (m *MergeService) downloadFile(url, destPath string) error {
	resp, err := m.httpClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("download failed: %d", resp.StatusCode)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

// extractZip extracts a ZIP file with ZipSlip protection
func (m *MergeService) extractZip(zipPath, destPath string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	os.MkdirAll(destPath, 0755)

	for _, f := range r.File {
		fpath := filepath.Join(destPath, f.Name)

		// Security check for ZipSlip vulnerability
		if !strings.HasPrefix(fpath, filepath.Clean(destPath)+string(os.PathSeparator)) {
			return fmt.Errorf("illegal file path: %s", fpath)
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, f.Mode())
			continue
		}

		if err := os.MkdirAll(filepath.Dir(fpath), 0755); err != nil {
			return err
		}

		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}

		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()

		if err != nil {
			return err
		}
	}

	return nil
}

// ============================================================================
// MAIN WORKFLOW FUNCTIONS
// ============================================================================

// ValidateMergeRequest validates files before merging
func (m *MergeService) ValidateMergeRequest(files []string, scannedFolder string) (*MergeValidation, error) {
	validation := &MergeValidation{
		Valid:      true,
		Errors:     []string{},
		Warnings:   []string{},
		TotalFiles: len(files),
		TotalSize:  0,
	}

	// Resource name is fixed by API requirement
	timestamp := time.Now().Format("2006-01-02_150405")
	validation.ResourceName = "cfx-merge"

	// Check file count
	if len(files) == 0 {
		validation.Valid = false
		validation.Errors = append(validation.Errors, "No files selected")
		return validation, nil
	}

	if len(files) > maxFilesPerJob {
		validation.Valid = false
		validation.Errors = append(validation.Errors, fmt.Sprintf("Too many files: maximum %d files per job", maxFilesPerJob))
		return validation, nil
	}

	// Validate each file
	for _, filePath := range files {
		// Check if file exists and is readable
		info, err := os.Stat(filePath)
		if err != nil {
			validation.Valid = false
			validation.Errors = append(validation.Errors, fmt.Sprintf("Cannot access file %s: %v", filepath.Base(filePath), err))
			continue
		}

		// Check if supported extension
		if !IsSupportedMergeFile(filePath) {
			validation.Valid = false
			validation.Errors = append(validation.Errors, fmt.Sprintf("Unsupported file type: %s (supported: .ymap, .ytyp, .ybn, .ydr, .ymt)", filepath.Ext(filePath)))
			continue
		}

		// Check file size
		if info.Size() > maxFileSize {
			validation.Valid = false
			validation.Errors = append(validation.Errors, fmt.Sprintf("File too large: %s exceeds 2GB limit", filepath.Base(filePath)))
			continue
		}

		validation.TotalSize += info.Size()
	}

	// Check total size
	if validation.TotalSize > maxTotalSize {
		validation.Valid = false
		validation.Errors = append(validation.Errors, "Total size exceeds 3GB limit")
	}

	// Calculate backup requirements (2x for dual backups)
	validation.BackupSize = validation.TotalSize * 2

	// Calculate backup paths
	primaryRoot, secondaryRoot := m.getBackupRoots(scannedFolder)
	validation.BackupPath = filepath.Join(primaryRoot, "backup_"+timestamp)
	validation.BackupPathAlt = filepath.Join(secondaryRoot, "backup_"+timestamp+"_secondary")

	// Check available disk space
	availableSpace, err := getDiskSpace(primaryRoot)
	if err != nil {
		validation.Warnings = append(validation.Warnings, "Could not check disk space")
	} else {
		validation.AvailableSpace = availableSpace
		if availableSpace < validation.BackupSize {
			validation.Valid = false
			validation.Errors = append(validation.Errors, fmt.Sprintf("Insufficient disk space: need %.2f GB for backups, have %.2f GB available",
				float64(validation.BackupSize)/(1024*1024*1024),
				float64(availableSpace)/(1024*1024*1024)))
		}
	}
	secondarySpace, err := getDiskSpace(secondaryRoot)
	if err != nil {
		validation.Warnings = append(validation.Warnings, "Could not check disk space for secondary backup")
	} else if secondarySpace < validation.BackupSize {
		validation.Valid = false
		validation.Errors = append(validation.Errors, fmt.Sprintf("Insufficient disk space for secondary backup: need %.2f GB, have %.2f GB available",
			float64(validation.BackupSize)/(1024*1024*1024),
			float64(secondarySpace)/(1024*1024*1024)))
	}

	return validation, nil
}

// CreateDualBackups creates primary and secondary backups
func (m *MergeService) CreateDualBackups(files []string, scannedFolder string, timestamp string, resourceName string) (*BackupResult, error) {
	result := &BackupResult{
		FilesCopied: 0,
		BytesCopied: 0,
		Success:     false,
		Errors:      []string{},
	}

	// Calculate backup paths
	primaryRoot, secondaryRoot := m.getBackupRoots(scannedFolder)
	primaryBackup := filepath.Join(primaryRoot, "backup_"+timestamp)
	secondaryBackup := filepath.Join(secondaryRoot, "backup_"+timestamp+"_secondary")

	result.PrimaryPath = primaryBackup
	result.SecondaryPath = secondaryBackup

	// Create backup directories
	if err := os.MkdirAll(primaryBackup, 0755); err != nil {
		return result, fmt.Errorf("failed to create primary backup directory: %w", err)
	}

	if err := os.MkdirAll(secondaryBackup, 0755); err != nil {
		return result, fmt.Errorf("failed to create secondary backup directory: %w", err)
	}

	// Emit start event
	runtime.EventsEmit(m.ctx, "merge:backup-started", map[string]interface{}{
		"primaryPath":   primaryBackup,
		"secondaryPath": secondaryBackup,
		"totalFiles":    len(files),
	})

	// Copy files to both backups
	for i, filePath := range files {
		fileName := filepath.Base(filePath)

		// Emit progress for primary backup
		progress := int((float64(i) / float64(len(files))) * 50) // 0-50% for primary
		runtime.EventsEmit(m.ctx, "merge:backup-progress", map[string]interface{}{
			"current":  i + 1,
			"total":    len(files),
			"progress": progress,
			"file":     fileName,
			"phase":    "primary",
		})

		// Copy to primary backup
		_, err := copyFileWithStructure(filePath, scannedFolder, primaryBackup)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("Primary backup failed for %s: %v", fileName, err))
			return result, fmt.Errorf("primary backup failed for %s: %w", fileName, err)
		}

		// Emit progress for secondary backup
		progress = 50 + int((float64(i)/float64(len(files)))*50) // 50-100% for secondary
		runtime.EventsEmit(m.ctx, "merge:backup-progress", map[string]interface{}{
			"current":  i + 1,
			"total":    len(files),
			"progress": progress,
			"file":     fileName,
			"phase":    "secondary",
		})

		// Copy to secondary backup
		_, err = copyFileWithStructure(filePath, scannedFolder, secondaryBackup)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("Secondary backup failed for %s: %v", fileName, err))
			return result, fmt.Errorf("secondary backup failed for %s: %w", fileName, err)
		}

		result.FilesCopied++
		info, _ := os.Stat(filePath)
		result.BytesCopied += info.Size()
	}

	// Create manifests for both backups
	if err := createManifest(files, scannedFolder, primaryBackup, timestamp, resourceName); err != nil {
		return result, fmt.Errorf("failed to create primary manifest: %w", err)
	}

	if err := createManifest(files, scannedFolder, secondaryBackup, timestamp, resourceName); err != nil {
		return result, fmt.Errorf("failed to create secondary manifest: %w", err)
	}

	// Verify both backups
	if err := verifyBackup(files, primaryBackup, result.BytesCopied); err != nil {
		return result, fmt.Errorf("primary backup verification failed: %w", err)
	}
	result.VerifiedPrimary = true

	if err := verifyBackup(files, secondaryBackup, result.BytesCopied); err != nil {
		return result, fmt.Errorf("secondary backup verification failed: %w", err)
	}
	result.VerifiedSecondary = true

	result.Success = true

	// Emit completion
	runtime.EventsEmit(m.ctx, "merge:backup-complete", map[string]interface{}{
		"filesCopied":   result.FilesCopied,
		"bytesCopied":   result.BytesCopied,
		"primaryPath":   primaryBackup,
		"secondaryPath": secondaryBackup,
	})

	return result, nil
}

// DownloadAndExtractMergedResource downloads and extracts the merged resource
func (m *MergeService) DownloadAndExtractMergedResource(downloadURL, resourceName string) (*ExtractResult, error) {
	result := &ExtractResult{
		ResourceName: resourceName,
		Success:      false,
	}

	// Create temp directory
	tempDir, err := os.MkdirTemp("", "cfxmerge_*")
	if err != nil {
		return result, fmt.Errorf("failed to create temp directory: %w", err)
	}

	zipPath := filepath.Join(tempDir, resourceName+".zip")
	extractPath := filepath.Join(tempDir, resourceName)
	result.TempPath = extractPath

	// Download
	runtime.EventsEmit(m.ctx, "merge:download-started", resourceName)

	if err := m.downloadFile(downloadURL, zipPath); err != nil {
		os.RemoveAll(tempDir)
		return result, fmt.Errorf("download failed: %w", err)
	}

	runtime.EventsEmit(m.ctx, "merge:download-complete", resourceName)

	// Extract
	runtime.EventsEmit(m.ctx, "merge:extract-started", resourceName)

	if err := m.extractZip(zipPath, extractPath); err != nil {
		os.RemoveAll(tempDir)
		return result, fmt.Errorf("extraction failed: %w", err)
	}

	runtime.EventsEmit(m.ctx, "merge:extract-complete", resourceName)

	// Verify fxmanifest.lua exists (allow nested resource folder)
	manifestPath := filepath.Join(extractPath, "fxmanifest.lua")
	resourceRoot := extractPath
	if _, err := os.Stat(manifestPath); err == nil {
		result.HasManifest = true
	} else {
		var found string
		_ = filepath.Walk(extractPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if info.IsDir() {
				return nil
			}
			if strings.EqualFold(info.Name(), "fxmanifest.lua") {
				found = filepath.Dir(path)
				return filepath.SkipDir
			}
			return nil
		})
		if found != "" {
			resourceRoot = found
			result.HasManifest = true
		}
	}

	if !result.HasManifest {
		os.RemoveAll(tempDir)
		return result, fmt.Errorf("invalid resource: fxmanifest.lua not found")
	}

	result.TempPath = resourceRoot

	// Count files
	filepath.Walk(resourceRoot, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			result.FileCount++
		}
		return nil
	})

	result.Success = true
	return result, nil
}

// DeleteOriginalFiles deletes the original files after successful merge
func (m *MergeService) DeleteOriginalFiles(files []string, backupPaths []string) (*DeletionResult, error) {
	result := &DeletionResult{
		FilesDeleted:   0,
		FilesRemaining: len(files),
		Errors:         []string{},
		Success:        false,
	}

	// Safety check: Verify backups still exist
	for _, backupPath := range backupPaths {
		if _, err := os.Stat(backupPath); os.IsNotExist(err) {
			return result, fmt.Errorf("ABORT: Backup not found at %s", backupPath)
		}
	}

	// Emit start event
	runtime.EventsEmit(m.ctx, "merge:deletion-started", len(files))

	// Delete files one by one
	for i, filePath := range files {
		// Emit progress
		progress := int((float64(i) / float64(len(files))) * 100)
		runtime.EventsEmit(m.ctx, "merge:deletion-progress", map[string]interface{}{
			"current":  i + 1,
			"total":    len(files),
			"progress": progress,
			"file":     filepath.Base(filePath),
		})

		// Attempt deletion
		if err := os.Remove(filePath); err != nil {
			errorMsg := fmt.Sprintf("Failed to delete %s: %v", filePath, err)
			result.Errors = append(result.Errors, errorMsg)
			runtime.EventsEmit(m.ctx, "merge:deletion-error", errorMsg)
			// Stop on first error
			return result, fmt.Errorf("deletion stopped at file %d/%d: %w", i+1, len(files), err)
		}

		result.FilesDeleted++
		result.FilesRemaining--
	}

	result.Success = true
	runtime.EventsEmit(m.ctx, "merge:deletion-complete", result.FilesDeleted)

	return result, nil
}

// InstallMergedResource installs the merged resource to the scanned folder
func (m *MergeService) InstallMergedResource(tempPath, resourceName, scannedFolder string) error {
	finalPath := filepath.Join(scannedFolder, resourceName)

	// Remove existing resource to allow overwrite
	if _, err := os.Stat(finalPath); err == nil {
		if err := os.RemoveAll(finalPath); err != nil {
			return fmt.Errorf("failed to remove existing resource at %s: %w", finalPath, err)
		}
	}

	// Emit start event
	runtime.EventsEmit(m.ctx, "merge:install-started", resourceName)

	// Copy directory recursively
	if err := copyDir(tempPath, finalPath); err != nil {
		return fmt.Errorf("installation failed: %w", err)
	}

	// Verify installation
	manifestPath := filepath.Join(finalPath, "fxmanifest.lua")
	if _, err := os.Stat(manifestPath); err != nil {
		os.RemoveAll(finalPath) // Rollback
		return fmt.Errorf("installation verification failed: %w", err)
	}

	// Clean up temp directory
	os.RemoveAll(filepath.Dir(tempPath))

	// Emit completion
	runtime.EventsEmit(m.ctx, "merge:install-complete", finalPath)

	return nil
}

// StartMergeWorkflow orchestrates the complete merge workflow
func (m *MergeService) StartMergeWorkflow(files []string, scannedFolder string) error {
	// Generate timestamp once for entire workflow
	timestamp := time.Now().Format("2006-01-02_150405")
	resourceName := "cfx-merge"

	ctx := &MergeContext{
		Files:         files,
		ResourceName:  resourceName,
		Timestamp:     timestamp,
		ScannedFolder: scannedFolder,
	}

	// Phase 1: Validation (already done in frontend, but double-check)
	validation, err := m.ValidateMergeRequest(files, scannedFolder)
	if err != nil {
		return err
	}
	if !validation.Valid {
		return fmt.Errorf("validation failed: %v", validation.Errors)
	}

	mergeFiles, err := m.buildMergeFileList(files, scannedFolder)
	if err != nil {
		m.emitMergeErrorFromErr("validating", err, "Failed to prepare merge inputs. Please try again.")
		return err
	}
	if err := m.ValidateMergeFiles(mergeFiles); err != nil {
		m.emitMergeError("validating", err.Error(), "The merge input set is invalid. Adjust your selection and try again.")
		return err
	}

	// Phase 2: Create backups with retry
	const maxBackupRetries = 1
	var backupResult *BackupResult

	for attempt := 0; attempt <= maxBackupRetries; attempt++ {
		if attempt > 0 {
			runtime.EventsEmit(m.ctx, "merge:backup-retry", attempt)
			time.Sleep(2 * time.Second)
		}

		backupResult, err = m.CreateDualBackups(files, scannedFolder, timestamp, resourceName)
		if err == nil && backupResult.Success {
			break
		}

		if attempt == maxBackupRetries {
			m.emitMergeError("backing-up", fmt.Sprintf("Backup failed after retry: %v", err), "Ensure you have enough free space and try again.")
			return fmt.Errorf("backup creation failed after %d attempts: %w", maxBackupRetries+1, err)
		}
	}

	ctx.BackupPrimary = backupResult.PrimaryPath
	ctx.BackupSecondary = backupResult.SecondaryPath

	// Phase 3: Upload & merge (existing logic)
	jobID, err := m.MergeFiles(mergeFiles, resourceName, true)
	if err != nil {
		return err
	}

	// Store context for later use when merge completes
	m.mu.Lock()
	m.mergeContexts[jobID] = ctx
	m.mu.Unlock()

	// Wait for merge completion (handled by pollMergeJobStatus)
	// When complete, pollMergeJobStatus will call CompleteMergeWorkflow

	return nil
}

// CompleteMergeWorkflow completes the merge after API processing
func (m *MergeService) CompleteMergeWorkflow(downloadURL, resourceName, scannedFolder string, files []string, backupPaths []string) error {
	// Phase 4: Download & extract
	extractResult, err := m.DownloadAndExtractMergedResource(downloadURL, resourceName)
	if err != nil {
		m.emitMergeError("downloading", fmt.Sprintf("Download/extract failed: %v", err), "The merge completed but the download failed. Try again.")
		return err
	}

	// Phase 5: Install merged resource
	if err := m.InstallMergedResource(extractResult.TempPath, resourceName, scannedFolder); err != nil {
		m.emitMergeError("installing", fmt.Sprintf("Installation failed: %v. Files deleted but backups safe.", err), "Restore from backups if needed, then retry installation.")
		return err
	}

	// Phase 6: Delete original files after successful install
	deletionResult, err := m.DeleteOriginalFiles(files, backupPaths)
	if err != nil {
		m.emitMergeError("deleting", fmt.Sprintf("Deletion failed: %v. Deleted %d of %d files. Backups preserved.", err, deletionResult.FilesDeleted, len(files)), "Restore from backups if needed, then retry the merge.")
		return err
	}

	// Phase 7: Success - emit install complete
	resourcePath := filepath.Join(scannedFolder, resourceName)
	runtime.EventsEmit(m.ctx, "merge:install-complete", resourcePath)

	return nil
}

func (m *MergeService) emitMergeError(phase, message, recovery string) {
	payload := map[string]interface{}{
		"phase":                phase,
		"message":              message,
		"recoveryInstructions": recovery,
	}
	runtime.EventsEmit(m.ctx, "merge:error", payload)
}

func (m *MergeService) emitMergeErrorFromErr(phase string, err error, fallbackRecovery string) {
	if apiErr, ok := err.(*MergeAPIError); ok {
		m.emitMergeError(phase, apiErr.Message, apiErr.Recovery)
		return
	}
	m.emitMergeError(phase, err.Error(), fallbackRecovery)
}

func (m *MergeService) buildMergeFileList(selectedFiles []string, scannedFolder string) ([]string, error) {
	resourceDir := filepath.Join(scannedFolder, "cfx-merge")
	if _, err := os.Stat(resourceDir); os.IsNotExist(err) {
		return selectedFiles, nil
	}

	selectedNames := make(map[string]struct{}, len(selectedFiles))
	for _, filePath := range selectedFiles {
		base := strings.ToLower(filepath.Base(filePath))
		selectedNames[base] = struct{}{}
	}

	var existing []string
	err := filepath.Walk(resourceDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if !IsSupportedMergeFile(path) {
			return nil
		}
		base := strings.ToLower(info.Name())
		if _, exists := selectedNames[base]; exists {
			return nil
		}
		existing = append(existing, path)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to scan existing cfx-merge resource: %w", err)
	}

	if len(existing) == 0 {
		return selectedFiles, nil
	}

	mergeFiles := make([]string, 0, len(selectedFiles)+len(existing))
	mergeFiles = append(mergeFiles, selectedFiles...)
	mergeFiles = append(mergeFiles, existing...)
	return mergeFiles, nil
}

func (m *MergeService) ListSecondaryBackups() ([]BackupSummary, error) {
	baseDir, err := getSecondaryBackupRoot()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []BackupSummary{}, nil
		}
		return nil, fmt.Errorf("failed to read backups directory: %w", err)
	}

	backups := make([]BackupSummary, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		backupPath := filepath.Join(baseDir, entry.Name())
		manifestPath := filepath.Join(backupPath, "manifest.json")
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}

		var manifest BackupManifest
		if err := json.Unmarshal(data, &manifest); err != nil {
			continue
		}

		backups = append(backups, BackupSummary{
			Path:            backupPath,
			Name:            entry.Name(),
			BackupTimestamp: manifest.BackupTimestamp,
			ScannedFolder:   manifest.ScannedFolder,
			TotalFiles:      manifest.TotalFiles,
			TotalSize:       manifest.TotalSize,
			ResourceName:    manifest.ResourceName,
		})
	}

	sort.Slice(backups, func(i, j int) bool {
		return backups[i].BackupTimestamp > backups[j].BackupTimestamp
	})

	return backups, nil
}

func (m *MergeService) RestoreBackup(backupPath string) (*RestoreResult, error) {
	baseDir, err := getSecondaryBackupRoot()
	if err != nil {
		return nil, err
	}

	absBase, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve backup root: %w", err)
	}
	absPath, err := filepath.Abs(backupPath)
	if err != nil {
		return nil, fmt.Errorf("invalid backup path: %w", err)
	}
	if !strings.HasPrefix(strings.ToLower(absPath), strings.ToLower(absBase)) {
		return nil, fmt.Errorf("backup path is outside the allowed backup directory")
	}

	manifestPath := filepath.Join(absPath, "manifest.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest.json: %w", err)
	}

	var manifest BackupManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("failed to parse manifest.json: %w", err)
	}

	result := &RestoreResult{
		BackupPath:    absPath,
		FilesRestored: 0,
		FilesMissing:  0,
		Errors:        []string{},
		Success:       false,
	}

	for _, entry := range manifest.Files {
		src := filepath.Join(absPath, entry.BackupPath)
		dst := entry.OriginalPath
		if _, err := os.Stat(src); err != nil {
			result.FilesMissing++
			result.Errors = append(result.Errors, fmt.Sprintf("missing backup file: %s", entry.BackupPath))
			continue
		}

		if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("failed to create directory for %s: %v", dst, err))
			continue
		}

		if err := copyFile(src, dst); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("failed to restore %s: %v", dst, err))
			continue
		}

		result.FilesRestored++
	}

	result.Success = len(result.Errors) == 0
	if result.Success {
		if err := os.RemoveAll(absPath); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("failed to delete backup after restore: %v", err))
			result.Success = false
		}
	}
	return result, nil
}

func rateLimitRecovery(resp *http.Response) string {
	recovery := "Rate limit reached (20/hour). Try again later."
	if resp == nil {
		return recovery
	}
	retryAfter := strings.TrimSpace(resp.Header.Get("Retry-After"))
	if retryAfter == "" {
		return recovery
	}
	if seconds, err := strconv.Atoi(retryAfter); err == nil {
		minutes := int(math.Ceil(float64(seconds) / 60.0))
		if minutes < 1 {
			minutes = 1
		}
		return fmt.Sprintf("Rate limit reached (20/hour). Try again in about %d minute(s).", minutes)
	}
	return fmt.Sprintf("Rate limit reached (20/hour). Try again after %s.", retryAfter)
}

func (m *MergeService) getBackupRoots(scannedFolder string) (string, string) {
	primaryRoot := filepath.Join(filepath.Dir(scannedFolder), "resources_backup")
	secondaryRoot, err := getSecondaryBackupRoot()
	if err != nil {
		secondaryRoot = primaryRoot
	}

	return primaryRoot, secondaryRoot
}

func getSecondaryBackupRoot() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil || homeDir == "" {
		return "", fmt.Errorf("failed to resolve user home directory")
	}
	return filepath.Join(homeDir, ".cfxmerge", "backups"), nil
}
