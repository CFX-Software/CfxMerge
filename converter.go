package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	apiConvertURL   = "https://api.cfx.software/api/v1/convert"
	apiJobStatusURL = "https://api.cfx.software/api/v1/job/status"
	batchSize       = 20 // Will be 35 later
	pollInterval    = 3 * time.Second // Poll every 3 seconds
	pollDelay       = 2 * time.Second // Wait 2 seconds before first poll
)

// ConverterService handles conversion job management
type ConverterService struct {
	mu            sync.RWMutex
	ctx           context.Context
	httpClient    *http.Client
	authService   *AuthService
	db            *ConversionDatabase
	activePollers map[string]context.CancelFunc // jobId -> cancel func
	fivemPath     string                        // Path to FiveM resources folder
}

// ConvertRequest matches API request format
type ConvertRequest struct {
	URLs []string `json:"urls"`
}

// ConvertResponse matches API response
type ConvertResponse struct {
	JobID             string `json:"jobId"`
	ConversionID      string `json:"conversionId"`
	Tier              string `json:"tier"`
	RemainingRequests int    `json:"remainingRequests"`
}

// JobStatusResponse matches API status response
type JobStatusResponse struct {
	JobID         string              `json:"jobId"`
	Status        string              `json:"status"` // pending|processing|completed|failed|cancelled|expired
	Progress      int                 `json:"progress"`
	StatusMessage string              `json:"statusMessage"`
	Results       []ConversionResult  `json:"results"`
}

// ConversionResult represents a single conversion result
type ConversionResult struct {
	OriginalURL  string `json:"url"`
	Status       string `json:"status"` // success|failed or completed
	DownloadURL  string `json:"downloadUrl"`
	ResourceName string `json:"modName"` // API returns "modName" not "name"
	FileSize     int64  `json:"size,omitempty"`
	ExpiresAt    int64  `json:"expiresAt"`
	ErrorMessage string `json:"error,omitempty"`
}

// NewConverterService creates a new converter service
func NewConverterService(ctx context.Context, authService *AuthService) *ConverterService {
	appDataDir := getAppDataDir()
	dbPath := filepath.Join(appDataDir, "conversions.db")

	db, err := NewConversionDatabase(dbPath)
	if err != nil {
		return nil
	}

	// Run cleanup on startup
	if db != nil {
		go db.CleanupExpired()
	}

	return &ConverterService{
		ctx:         ctx,
		authService: authService,
		db:          db,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		activePollers: make(map[string]context.CancelFunc),
	}
}

// SubmitConversion splits URLs into batches and creates separate jobs
func (c *ConverterService) SubmitConversion(urls []string) (string, error) {
	if len(urls) == 0 {
		return "", fmt.Errorf("no URLs provided")
	}

	// Validate all URLs first
	invalidURLs := c.validateURLs(urls)
	if len(invalidURLs) > 0 {
		return "", fmt.Errorf("invalid URLs found - only gta5-mods.com/vehicles, /weapons, /maps, and /player are supported")
	}

	// Get API key
	apiKey, err := c.authService.LoadAPIKey()
	if err != nil {
		return "", fmt.Errorf("not authenticated: %v", err)
	}

	// Split URLs into batches of 20 - each batch becomes a separate job
	batches := c.splitIntoBatches(urls, batchSize)

	// Create a separate job for each batch
	var jobIDs []string
	for _, batchURLs := range batches {
		jobID, err := c.createAndSubmitJob(apiKey, batchURLs)
		if err != nil {
			return "", fmt.Errorf("failed to submit batch: %v", err)
		}
		jobIDs = append(jobIDs, jobID)
	}

	// Emit event for each job
	for _, jobID := range jobIDs {
		runtime.EventsEmit(c.ctx, "converter:job_submitted", map[string]interface{}{
			"jobId":     jobID,
			"totalJobs": len(jobIDs),
		})
	}

	return fmt.Sprintf("%d jobs created", len(jobIDs)), nil
}

// createAndSubmitJob creates a single job and submits it to the API
func (c *ConverterService) createAndSubmitJob(apiKey string, urls []string) (string, error) {
	// Create job record
	jobID := generateID("job")
	job := &Job{
		ID:        jobID,
		Status:    "pending",
		CreatedAt: time.Now().Unix(),
		TotalURLs: len(urls),
	}

	// Submit to API
	apiResp, err := c.submitBatchToAPI(apiKey, urls)
	if err != nil {
		return "", fmt.Errorf("API submission failed: %v", err)
	}

	// Update job with API response
	job.JobID = apiResp.JobID
	job.ConversionID = apiResp.ConversionID
	job.Tier = apiResp.Tier
	job.RemainingRequests = apiResp.RemainingRequests
	job.Status = "processing"

	// Save job to database
	if err := c.db.SaveJob(job); err != nil {
		return "", err
	}

	// Save single batch for this job
	batch := &Batch{
		ID:         generateID("batch"),
		JobID:      jobID,
		URLs:       urls,
		BatchIndex: 0,
		Status:     "processing",
		CreatedAt:  time.Now().Unix(),
	}
	if err := c.db.SaveBatch(batch); err != nil {
		return "", err
	}

	// Start polling for this job
	c.startPolling(jobID, apiResp.JobID, apiKey)

	return jobID, nil
}

// submitBatchToAPI sends a batch to the API
func (c *ConverterService) submitBatchToAPI(apiKey string, urls []string) (*ConvertResponse, error) {
	reqBody := ConvertRequest{URLs: urls}
	jsonData, _ := json.Marshal(reqBody)

	req, err := http.NewRequest("POST", apiConvertURL, strings.NewReader(string(jsonData)))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "CFXMerge/1.2")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		// Emit auth failed event to force logout
		runtime.EventsEmit(c.ctx, "auth:failed", "Authentication failed - please login again")
		return nil, fmt.Errorf("authentication failed - please login again")
	}

	if resp.StatusCode == 429 {
		return nil, fmt.Errorf("rate limit exceeded")
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, string(body))
	}

	var apiResp ConvertResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, err
	}

	return &apiResp, nil
}

// startPolling starts polling a job's status
func (c *ConverterService) startPolling(jobID, apiJobID, apiKey string) {
	ctx, cancel := context.WithCancel(c.ctx)

	c.mu.Lock()
	c.activePollers[jobID] = cancel
	c.mu.Unlock()

	go func() {
		// Wait 5 seconds before first poll
		time.Sleep(pollDelay)

		ticker := time.NewTicker(pollInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := c.pollJobStatus(jobID, apiJobID, apiKey); err != nil {
					runtime.LogError(c.ctx, "Poll error: "+err.Error())
				}
			}
		}
	}()
}

// pollJobStatus polls the API for job status
func (c *ConverterService) pollJobStatus(jobID, apiJobID, apiKey string) error {
	url := fmt.Sprintf("%s?jobId=%s", apiJobStatusURL, apiJobID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("User-Agent", "CFXMerge/1.2")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		// Emit auth failed event to force logout
		runtime.EventsEmit(c.ctx, "auth:failed", "Authentication failed - please login again")
		return fmt.Errorf("authentication failed - please login again")
	}

	if resp.StatusCode != 200 {
		return fmt.Errorf("status check failed: %d", resp.StatusCode)
	}

	var status JobStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return err
	}

	// Update job in database
	job, err := c.db.GetJob(jobID)
	if err != nil {
		return err
	}

	job.Status = status.Status
	job.Progress = status.Progress
	job.StatusMessage = status.StatusMessage

	if status.Status == "processing" && job.StartedAt == 0 {
		job.StartedAt = time.Now().Unix()
	}

	if status.Status == "completed" || status.Status == "failed" {
		job.CompletedAt = time.Now().Unix()
		if status.Status == "completed" {
			job.ExpiresAt = job.CompletedAt + (24 * 60 * 60) // 24 hours
		}

		// Mark batch as completed
		batches, _ := c.db.GetBatchesByJobID(jobID)
		for _, b := range batches {
			if b.Status == "processing" {
				b.Status = "completed"
				c.db.SaveBatch(b)
				break
			}
		}

		// Save results
		successCount := 0
		failedCount := 0
		for _, result := range status.Results {
			r := &Result{
				ID:           generateID("result"),
				JobID:        jobID,
				OriginalURL:  result.OriginalURL,
				Status:       result.Status,
				DownloadURL:  result.DownloadURL,
				ResourceName: result.ResourceName,
				FileSize:     result.FileSize,
				ExpiresAt:    result.ExpiresAt,
				ErrorMessage: result.ErrorMessage,
				CreatedAt:    time.Now().Unix(),
			}
			if err := c.db.SaveResult(r); err != nil {
				return err
			}

			// API returns "completed" for success, "failed" for failures
			if result.Status == "completed" || result.Status == "success" {
				successCount++
			} else {
				failedCount++
			}
		}

		job.SuccessfulCount = successCount
		job.FailedCount = failedCount

		// Stop polling
		c.stopPolling(jobID)

		// Show notification
		c.showCompletionNotification(job)

		// Play sound
		runtime.EventsEmit(c.ctx, "converter:play_sound", nil)
	}

	if err := c.db.SaveJob(job); err != nil {
		return err
	}

	// Emit progress update
	runtime.EventsEmit(c.ctx, "converter:progress", map[string]interface{}{
		"jobId":         jobID,
		"status":        job.Status,
		"progress":      job.Progress,
		"statusMessage": job.StatusMessage,
	})

	// Update Discord RPC
	c.updateDiscordRPC(job)

	return nil
}

// stopPolling stops polling for a job
func (c *ConverterService) stopPolling(jobID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if cancel, exists := c.activePollers[jobID]; exists {
		cancel()
		delete(c.activePollers, jobID)
	}
}

// CancelJob cancels an active job
func (c *ConverterService) CancelJob(jobID string) error {
	job, err := c.db.GetJob(jobID)
	if err != nil {
		return err
	}

	job.Status = "cancelled"
	job.CompletedAt = time.Now().Unix()

	if err := c.db.SaveJob(job); err != nil {
		return err
	}

	c.stopPolling(jobID)

	runtime.EventsEmit(c.ctx, "converter:job_cancelled", jobID)

	return nil
}

// DownloadResult downloads a conversion result
func (c *ConverterService) DownloadResult(resultID string, downloadPath string) error {
	result, err := c.db.GetResult(resultID)
	if err != nil {
		return err
	}

	if result.DownloadURL == "" {
		return fmt.Errorf("no download URL available")
	}

	// Check if file expired (ExpiresAt is in milliseconds from API)
	if result.ExpiresAt > 0 {
		nowMs := time.Now().UnixMilli()
		if nowMs > result.ExpiresAt {
			return fmt.Errorf("download link expired - files are only available for 24 hours")
		}
	}

	if downloadPath == "" {
		return fmt.Errorf("download path required")
	}

	fileName := result.ResourceName + ".zip"
	zipPath := filepath.Join(downloadPath, fileName)

	// Download the file
	if err := c.downloadFile(result.DownloadURL, zipPath); err != nil {
		return err
	}

	result.Downloaded = true
	result.LocalPath = zipPath

	// Check if this is the FiveM resources folder
	c.mu.RLock()
	isFiveMPath := c.fivemPath != "" && downloadPath == c.fivemPath
	c.mu.RUnlock()

	if isFiveMPath {
		// Extract to resources/cfx-merge/[resource-name]/
		extractPath := filepath.Join(downloadPath, "cfx-merge", result.ResourceName)
		if err := c.extractZip(zipPath, extractPath); err != nil {
			return err
		}

		result.Extracted = true
		result.LocalPath = extractPath

		// Delete zip after extraction
		os.Remove(zipPath)
	} else {
		// Custom download path - extract to [resource-name]/ subfolder
		extractPath := filepath.Join(downloadPath, result.ResourceName)
		if err := c.extractZip(zipPath, extractPath); err != nil {
			return err
		}

		result.Extracted = true
		result.LocalPath = extractPath

		// Delete zip after extraction
		os.Remove(zipPath)
	}

	if err := c.db.SaveResult(result); err != nil {
		return err
	}

	runtime.EventsEmit(c.ctx, "converter:download_complete", resultID)

	return nil
}

// downloadFile downloads a file from URL
func (c *ConverterService) downloadFile(url, destPath string) error {
	resp, err := c.httpClient.Get(url)
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

// extractZip extracts a zip file to destination
func (c *ConverterService) extractZip(zipPath, destPath string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	os.MkdirAll(destPath, 0755)

	// Detect common root folder to strip
	var rootFolder string
	if len(r.File) > 0 {
		// Check if all files share a common root folder
		firstPath := r.File[0].Name
		if idx := strings.Index(firstPath, "/"); idx != -1 {
			potentialRoot := firstPath[:idx+1]
			allHaveRoot := true
			for _, f := range r.File {
				if !strings.HasPrefix(f.Name, potentialRoot) {
					allHaveRoot = false
					break
				}
			}
			if allHaveRoot {
				rootFolder = potentialRoot
			}
		}
	}

	for _, f := range r.File {
		// Strip root folder if detected
		name := f.Name
		if rootFolder != "" {
			name = strings.TrimPrefix(name, rootFolder)
			if name == "" {
				continue // Skip the root folder itself
			}
		}

		fpath := filepath.Join(destPath, name)

		// Check for ZipSlip vulnerability
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

// DownloadAllResults downloads all successful results for a job
func (c *ConverterService) DownloadAllResults(jobID string, downloadPath string) error {
	if downloadPath == "" {
		return fmt.Errorf("download path required")
	}

	results, err := c.db.GetResultsByJobID(jobID)
	if err != nil {
		return err
	}

	// Filter to successful, non-downloaded, non-expired results
	var toDownload []*Result
	nowMs := time.Now().UnixMilli()
	for _, result := range results {
		// Skip if failed
		if result.Status != "completed" && result.Status != "success" {
			continue
		}
		// Skip if already downloaded
		if result.Downloaded {
			continue
		}
		// Skip if expired
		if result.ExpiresAt > 0 && nowMs > result.ExpiresAt {
			continue
		}
		toDownload = append(toDownload, result)
	}

	if len(toDownload) == 0 {
		return fmt.Errorf("no files available to download")
	}

	// Download each result
	successCount := 0
	failCount := 0
	for _, result := range toDownload {
		err := c.DownloadResult(result.ID, downloadPath)
		if err != nil {
			failCount++
			continue
		}
		successCount++
	}

	// Emit completion event
	runtime.EventsEmit(c.ctx, "converter:download_all_complete", map[string]interface{}{
		"success": successCount,
		"failed":  failCount,
		"total":   len(toDownload),
	})

	if failCount > 0 {
		return fmt.Errorf("downloaded %d/%d files (%d failed)", successCount, len(toDownload), failCount)
	}

	return nil
}

// SetFiveMPath sets the FiveM resources folder
func (c *ConverterService) SetFiveMPath(path string) error {
	c.mu.Lock()
	c.fivemPath = path
	c.mu.Unlock()
	return nil
}

// GetFiveMPath returns the FiveM resources folder
func (c *ConverterService) GetFiveMPath() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.fivemPath
}

// GetAllJobs returns all jobs from database
func (c *ConverterService) GetAllJobs() ([]*Job, error) {
	return c.db.GetAllJobs()
}

// GetJobResults returns all results for a specific job
func (c *ConverterService) GetJobResults(jobID string) ([]*Result, error) {
	return c.db.GetResultsByJobID(jobID)
}

// GetPendingJobs returns all pending/processing jobs
func (c *ConverterService) GetPendingJobs() ([]*Job, error) {
	return c.db.GetPendingJobs()
}

// ResumePendingJobs resumes polling for pending jobs on app startup
func (c *ConverterService) ResumePendingJobs() {
	pendingJobs, err := c.db.GetPendingJobs()
	if err != nil || len(pendingJobs) == 0 {
		return
	}

	apiKey, err := c.authService.LoadAPIKey()
	if err != nil {
		return // Not authenticated, can't resume
	}

	for _, job := range pendingJobs {
		// Check if job expired (24 hours passed since creation)
		now := time.Now().Unix()
		jobAge := now - job.CreatedAt
		if jobAge > (25 * 60 * 60) { // 25 hours (24h + buffer)
			// Job is too old, likely expired
			job.Status = "failed"
			job.CompletedAt = now
			job.ErrorMessage = "Job expired - files no longer available"
			c.db.SaveJob(job)
			continue
		}

		// Check if results already exist (completed while app was closed)
		results, _ := c.db.GetResultsByJobID(job.ID)
		if len(results) > 0 {
			// Job completed while app was closed
			successCount := 0
			failedCount := 0
			for _, r := range results {
				if r.Status == "completed" || r.Status == "success" {
					successCount++
				} else {
					failedCount++
				}
			}
			job.Status = "completed"
			job.CompletedAt = now
			job.SuccessfulCount = successCount
			job.FailedCount = failedCount
			job.ExpiresAt = now + (24 * 60 * 60) // Reset 24h expiry from now
			c.db.SaveJob(job)

			// Show notification
			c.showCompletionNotification(job)
			runtime.EventsEmit(c.ctx, "converter:play_sound", nil)
			continue
		}

		// Job still active - check status with API
		if job.JobID != "" {
			// Do immediate status check
			err := c.pollJobStatus(job.ID, job.JobID, apiKey)
			if err != nil {
				// API error - might be expired or deleted
				job.Status = "failed"
				job.CompletedAt = now
				job.ErrorMessage = "Failed to resume - job may have expired"
				c.db.SaveJob(job)
				continue
			}

			// Resume polling if still processing
			job, _ = c.db.GetJob(job.ID)
			if job.Status == "processing" {
				c.startPolling(job.ID, job.JobID, apiKey)
			}
		}
	}
}

// DeleteJob deletes a job
func (c *ConverterService) DeleteJob(jobID string) error {
	c.stopPolling(jobID)
	return c.db.DeleteJob(jobID)
}

// ClearAllHistory clears all jobs
func (c *ConverterService) ClearAllHistory() error {
	// Stop all active pollers
	c.mu.Lock()
	for _, cancel := range c.activePollers {
		cancel()
	}
	c.activePollers = make(map[string]context.CancelFunc)
	c.mu.Unlock()

	return c.db.ClearAllJobs()
}

// RetryJob resubmits a failed job
func (c *ConverterService) RetryJob(jobID string) (string, error) {
	// Get all batches to extract URLs
	batches, err := c.db.GetBatchesByJobID(jobID)
	if err != nil {
		return "", err
	}

	// Collect all URLs
	var allURLs []string
	for _, batch := range batches {
		allURLs = append(allURLs, batch.URLs...)
	}

	// Submit as new job
	return c.SubmitConversion(allURLs)
}

// Helper functions
func (c *ConverterService) splitIntoBatches(urls []string, size int) [][]string {
	var batches [][]string
	for i := 0; i < len(urls); i += size {
		end := i + size
		if end > len(urls) {
			end = len(urls)
		}
		batches = append(batches, urls[i:end])
	}
	return batches
}

// validateURLs validates that all URLs are from supported gta5-mods categories
func (c *ConverterService) validateURLs(urls []string) []string {
	var invalid []string
	allowedPrefixes := []string{
		"https://www.gta5-mods.com/vehicles",
		"https://www.gta5-mods.com/weapons",
		"https://www.gta5-mods.com/maps",
		"https://www.gta5-mods.com/player",
	}

	for _, url := range urls {
		valid := false
		for _, prefix := range allowedPrefixes {
			if strings.HasPrefix(url, prefix) {
				valid = true
				break
			}
		}
		if !valid {
			invalid = append(invalid, url)
		}
	}

	return invalid
}

func (c *ConverterService) showCompletionNotification(job *Job) {
	title := "Conversion Complete"
	message := fmt.Sprintf("Converted %d/%d resources successfully",
		job.SuccessfulCount, job.TotalURLs)

	// Windows notification
	runtime.EventsEmit(c.ctx, "converter:show_notification", map[string]string{
		"title":   title,
		"message": message,
	})
}

func (c *ConverterService) updateDiscordRPC(job *Job) {
	if job.Status == "processing" {
		runtime.EventsEmit(c.ctx, "discord:update_converter", map[string]interface{}{
			"progress": job.Progress,
			"message":  job.StatusMessage,
		})
	}
}

func generateID(prefix string) string {
	return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
}

func getAppDataDir() string {
	homeDir, _ := os.UserHomeDir()
	appDataDir := filepath.Join(homeDir, ".cfxmerge")
	os.MkdirAll(appDataDir, 0755)
	return appDataDir
}
