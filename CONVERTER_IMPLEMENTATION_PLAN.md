# CFXMerge Converter - Complete Implementation Plan

## Overview
Build a robust, queue-based GTA5-Mods to FiveM converter with persistent storage, auto-download/extract, and real-time progress tracking.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React/TypeScript)              │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  Queue Tab    │  │ Downloads Tab│  │  Settings Section  │   │
│  │  - Pending    │  │ - Completed  │  │  - FiveM Folder    │   │
│  │  - Active     │  │ - Expired    │  │  - Rate Limits     │   │
│  │  - Failed     │  │ - 24h Timers │  │  - Auto Extract    │   │
│  └───────────────┘  └──────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Wails Bindings
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Go)                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ConverterService (converter.go)                          │   │
│  │  - SubmitJob(urls []string)                              │   │
│  │  - PollJobStatus(jobId string)                           │   │
│  │  - DownloadResult(resultUrl, destPath string)            │   │
│  │  - ExtractToResources(zipPath, resourcesPath string)     │   │
│  │  - GetQueueStatus()                                      │   │
│  │  - CancelJob(jobId string)                               │   │
│  │  - RetryJob(jobId string)                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ConversionDatabase (database.go)                         │   │
│  │  - SQLite storage in app data folder                     │   │
│  │  - Tables: jobs, batches, results                        │   │
│  │  - 7-day auto-cleanup                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ JobPoller (poller.go)                                    │   │
│  │  - 10-second polling intervals                           │   │
│  │  - Event emission for progress updates                   │   │
│  │  - Handles multiple concurrent jobs                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   CFX.software API                               │
│  POST /api/v1/convert      - Submit job                         │
│  GET  /api/v1/job/status   - Poll status                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema (SQLite)

### Table: `jobs`
```sql
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,                    -- Unique job ID
    job_id TEXT NOT NULL,                   -- API jobId (job_abc123)
    conversion_id TEXT,                     -- API conversionId
    status TEXT NOT NULL,                   -- pending|processing|completed|failed|cancelled|expired
    progress INTEGER DEFAULT 0,             -- 0-100
    status_message TEXT,                    -- Current status message
    tier TEXT,                              -- User's tier at submission
    remaining_requests INTEGER,             -- Requests remaining after this job
    created_at INTEGER NOT NULL,            -- Unix timestamp
    started_at INTEGER,                     -- When processing began
    completed_at INTEGER,                   -- When job finished
    expires_at INTEGER,                     -- When results expire (completed_at + 24h)
    error_message TEXT,                     -- Error if failed
    total_urls INTEGER NOT NULL,            -- Total URLs in this job
    successful_count INTEGER DEFAULT 0,     -- Successfully converted
    failed_count INTEGER DEFAULT 0          -- Failed conversions
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created ON jobs(created_at);
CREATE INDEX idx_jobs_expires ON jobs(expires_at);
```

### Table: `batches`
```sql
CREATE TABLE batches (
    id TEXT PRIMARY KEY,                    -- Unique batch ID
    job_id TEXT NOT NULL,                   -- Parent job ID
    urls TEXT NOT NULL,                     -- JSON array of URLs in this batch
    batch_index INTEGER NOT NULL,           -- Which batch (0, 1, 2...)
    status TEXT NOT NULL,                   -- pending|processing|completed|failed
    created_at INTEGER NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_batches_job ON batches(job_id);
CREATE INDEX idx_batches_status ON batches(status);
```

### Table: `results`
```sql
CREATE TABLE results (
    id TEXT PRIMARY KEY,                    -- Unique result ID
    job_id TEXT NOT NULL,                   -- Parent job ID
    original_url TEXT NOT NULL,             -- Original GTA5-Mods URL
    status TEXT NOT NULL,                   -- success|failed
    download_url TEXT,                      -- Direct download link (if success)
    resource_name TEXT,                     -- Name of resource
    file_size INTEGER,                      -- Size in bytes
    expires_at INTEGER,                     -- When download expires
    error_message TEXT,                     -- Error if failed
    downloaded BOOLEAN DEFAULT 0,           -- Whether user downloaded it
    extracted BOOLEAN DEFAULT 0,            -- Whether extracted to resources
    local_path TEXT,                        -- Path where file was saved
    created_at INTEGER NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_results_job ON results(job_id);
CREATE INDEX idx_results_status ON results(status);
CREATE INDEX idx_results_expires ON results(expires_at);
```

---

## Go Backend Implementation

### File: `converter.go`

```go
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
    apiConvertURL   = "https://adamant-deer-971.convex.site/api/v1/convert"
    apiJobStatusURL = "https://adamant-deer-971.convex.site/api/v1/job/status"
    batchSize       = 20  // Will be 35 later
    pollInterval    = 10 * time.Second
    pollDelay       = 5 * time.Second  // Wait before first poll
)

// ConverterService handles conversion job management
type ConverterService struct {
    mu              sync.RWMutex
    ctx             context.Context
    httpClient      *http.Client
    authService     *AuthService
    db              *ConversionDatabase
    activePollers   map[string]context.CancelFunc  // jobId -> cancel func
    fivemPath       string  // Path to FiveM resources folder
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
    Status        string              `json:"status"`  // pending|processing|completed|failed|cancelled|expired
    Progress      int                 `json:"progress"`
    StatusMessage string              `json:"statusMessage"`
    Results       []ConversionResult  `json:"results"`
}

// ConversionResult represents a single conversion result
type ConversionResult struct {
    OriginalURL   string `json:"url"`
    Status        string `json:"status"`  // success|failed
    DownloadURL   string `json:"downloadUrl"`
    ResourceName  string `json:"name"`
    FileSize      int64  `json:"size"`
    ExpiresAt     int64  `json:"expiresAt"`
    ErrorMessage  string `json:"error"`
}

// NewConverterService creates a new converter service
func NewConverterService(ctx context.Context, authService *AuthService) *ConverterService {
    dbPath := filepath.Join(getAppDataDir(), "conversions.db")
    db, err := NewConversionDatabase(dbPath)
    if err != nil {
        runtime.LogError(ctx, "Failed to initialize conversion database: "+err.Error())
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

// SubmitConversion splits URLs into batches and submits them
func (c *ConverterService) SubmitConversion(urls []string) (string, error) {
    if len(urls) == 0 {
        return "", fmt.Errorf("no URLs provided")
    }

    // Get API key
    apiKey, err := c.authService.LoadAPIKey()
    if err != nil {
        return "", fmt.Errorf("not authenticated")
    }

    // Split URLs into batches of 20
    batches := c.splitIntoBatches(urls, batchSize)
    totalBatches := len(batches)

    // Create parent job record
    jobID := generateID("job")
    job := &Job{
        ID:          jobID,
        Status:      "pending",
        CreatedAt:   time.Now().Unix(),
        TotalURLs:   len(urls),
    }

    // Submit first batch to API
    firstBatch := batches[0]
    apiResp, err := c.submitBatchToAPI(apiKey, firstBatch)
    if err != nil {
        return "", err
    }

    // Update job with API response
    job.JobID = apiResp.JobID
    job.ConversionID = apiResp.ConversionID
    job.Tier = apiResp.Tier
    job.RemainingRequests = apiResp.RemainingRequests

    // Save job to database
    if err := c.db.SaveJob(job); err != nil {
        return "", err
    }

    // Save all batches to database
    for i, batchURLs := range batches {
        batch := &Batch{
            ID:         generateID("batch"),
            JobID:      jobID,
            URLs:       batchURLs,
            BatchIndex: i,
            Status:     "pending",
            CreatedAt:  time.Now().Unix(),
        }
        if i == 0 {
            batch.Status = "processing"  // First batch is already submitted
        }
        if err := c.db.SaveBatch(batch); err != nil {
            return "", err
        }
    }

    // Start polling for this job
    c.startPolling(jobID, apiResp.JobID, apiKey)

    // Emit event
    runtime.EventsEmit(c.ctx, "converter:job_submitted", map[string]interface{}{
        "jobId":        jobID,
        "totalBatches": totalBatches,
        "totalURLs":    len(urls),
    })

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
            job.ExpiresAt = job.CompletedAt + (24 * 60 * 60)  // 24 hours
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

            if result.Status == "success" {
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
func (c *ConverterService) DownloadResult(resultID string, autoExtract bool) error {
    result, err := c.db.GetResult(resultID)
    if err != nil {
        return err
    }

    if result.DownloadURL == "" {
        return fmt.Errorf("no download URL available")
    }

    // Download to temp location
    tempDir := os.TempDir()
    fileName := result.ResourceName + ".zip"
    tempPath := filepath.Join(tempDir, fileName)

    if err := c.downloadFile(result.DownloadURL, tempPath); err != nil {
        return err
    }

    result.Downloaded = true
    result.LocalPath = tempPath

    if autoExtract && c.fivemPath != "" {
        // Extract to resources/cfx-merge/[resource-name]/
        extractPath := filepath.Join(c.fivemPath, "cfx-merge", result.ResourceName)
        if err := c.extractZip(tempPath, extractPath); err != nil {
            return err
        }

        result.Extracted = true

        // Delete zip after extraction
        os.Remove(tempPath)
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

    for _, f := range r.File {
        fpath := filepath.Join(destPath, f.Name)

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

// SetFiveMPath sets the FiveM resources folder
func (c *ConverterService) SetFiveMPath(path string) error {
    c.mu.Lock()
    c.fivemPath = path
    c.mu.Unlock()

    // Save to settings/config file
    return nil
}

// GetFiveMPath returns the FiveM resources folder
func (c *ConverterService) GetFiveMPath() string {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.fivemPath
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
```

---

### File: `database.go`

```go
package main

import (
    "database/sql"
    "encoding/json"
    "time"

    _ "github.com/mattn/go-sqlite3"
)

// ConversionDatabase handles SQLite operations
type ConversionDatabase struct {
    db *sql.DB
}

// Job represents a conversion job
type Job struct {
    ID                string
    JobID             string
    ConversionID      string
    Status            string
    Progress          int
    StatusMessage     string
    Tier              string
    RemainingRequests int
    CreatedAt         int64
    StartedAt         int64
    CompletedAt       int64
    ExpiresAt         int64
    ErrorMessage      string
    TotalURLs         int
    SuccessfulCount   int
    FailedCount       int
}

// Batch represents a batch of URLs
type Batch struct {
    ID         string
    JobID      string
    URLs       []string
    BatchIndex int
    Status     string
    CreatedAt  int64
}

// Result represents a conversion result
type Result struct {
    ID           string
    JobID        string
    OriginalURL  string
    Status       string
    DownloadURL  string
    ResourceName string
    FileSize     int64
    ExpiresAt    int64
    ErrorMessage string
    Downloaded   bool
    Extracted    bool
    LocalPath    string
    CreatedAt    int64
}

// NewConversionDatabase creates a new database
func NewConversionDatabase(dbPath string) (*ConversionDatabase, error) {
    db, err := sql.Open("sqlite3", dbPath)
    if err != nil {
        return nil, err
    }

    // Create tables
    _, err = db.Exec(`
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            conversion_id TEXT,
            status TEXT NOT NULL,
            progress INTEGER DEFAULT 0,
            status_message TEXT,
            tier TEXT,
            remaining_requests INTEGER,
            created_at INTEGER NOT NULL,
            started_at INTEGER,
            completed_at INTEGER,
            expires_at INTEGER,
            error_message TEXT,
            total_urls INTEGER NOT NULL,
            successful_count INTEGER DEFAULT 0,
            failed_count INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
        CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
        CREATE INDEX IF NOT EXISTS idx_jobs_expires ON jobs(expires_at);

        CREATE TABLE IF NOT EXISTS batches (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            urls TEXT NOT NULL,
            batch_index INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_batches_job ON batches(job_id);
        CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

        CREATE TABLE IF NOT EXISTS results (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            original_url TEXT NOT NULL,
            status TEXT NOT NULL,
            download_url TEXT,
            resource_name TEXT,
            file_size INTEGER,
            expires_at INTEGER,
            error_message TEXT,
            downloaded BOOLEAN DEFAULT 0,
            extracted BOOLEAN DEFAULT 0,
            local_path TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_results_job ON results(job_id);
        CREATE INDEX IF NOT EXISTS idx_results_status ON results(status);
        CREATE INDEX IF NOT EXISTS idx_results_expires ON results(expires_at);
    `)

    if err != nil {
        return nil, err
    }

    return &ConversionDatabase{db: db}, nil
}

// SaveJob saves or updates a job
func (d *ConversionDatabase) SaveJob(job *Job) error {
    _, err := d.db.Exec(`
        INSERT OR REPLACE INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, job.ID, job.JobID, job.ConversionID, job.Status, job.Progress, job.StatusMessage,
        job.Tier, job.RemainingRequests, job.CreatedAt, job.StartedAt, job.CompletedAt,
        job.ExpiresAt, job.ErrorMessage, job.TotalURLs, job.SuccessfulCount, job.FailedCount)
    return err
}

// GetJob retrieves a job by ID
func (d *ConversionDatabase) GetJob(id string) (*Job, error) {
    job := &Job{}
    err := d.db.QueryRow(`SELECT * FROM jobs WHERE id = ?`, id).Scan(
        &job.ID, &job.JobID, &job.ConversionID, &job.Status, &job.Progress, &job.StatusMessage,
        &job.Tier, &job.RemainingRequests, &job.CreatedAt, &job.StartedAt, &job.CompletedAt,
        &job.ExpiresAt, &job.ErrorMessage, &job.TotalURLs, &job.SuccessfulCount, &job.FailedCount,
    )
    return job, err
}

// SaveBatch saves a batch
func (d *ConversionDatabase) SaveBatch(batch *Batch) error {
    urlsJSON, _ := json.Marshal(batch.URLs)
    _, err := d.db.Exec(`
        INSERT OR REPLACE INTO batches VALUES (?, ?, ?, ?, ?, ?)
    `, batch.ID, batch.JobID, string(urlsJSON), batch.BatchIndex, batch.Status, batch.CreatedAt)
    return err
}

// SaveResult saves a result
func (d *ConversionDatabase) SaveResult(result *Result) error {
    _, err := d.db.Exec(`
        INSERT OR REPLACE INTO results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, result.ID, result.JobID, result.OriginalURL, result.Status, result.DownloadURL,
        result.ResourceName, result.FileSize, result.ExpiresAt, result.ErrorMessage,
        result.Downloaded, result.Extracted, result.LocalPath, result.CreatedAt)
    return err
}

// GetResult retrieves a result by ID
func (d *ConversionDatabase) GetResult(id string) (*Result, error) {
    result := &Result{}
    err := d.db.QueryRow(`SELECT * FROM results WHERE id = ?`, id).Scan(
        &result.ID, &result.JobID, &result.OriginalURL, &result.Status, &result.DownloadURL,
        &result.ResourceName, &result.FileSize, &result.ExpiresAt, &result.ErrorMessage,
        &result.Downloaded, &result.Extracted, &result.LocalPath, &result.CreatedAt,
    )
    return result, err
}

// GetAllJobs retrieves all jobs
func (d *ConversionDatabase) GetAllJobs() ([]*Job, error) {
    rows, err := d.db.Query(`SELECT * FROM jobs ORDER BY created_at DESC`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var jobs []*Job
    for rows.Next() {
        job := &Job{}
        rows.Scan(&job.ID, &job.JobID, &job.ConversionID, &job.Status, &job.Progress,
            &job.StatusMessage, &job.Tier, &job.RemainingRequests, &job.CreatedAt,
            &job.StartedAt, &job.CompletedAt, &job.ExpiresAt, &job.ErrorMessage,
            &job.TotalURLs, &job.SuccessfulCount, &job.FailedCount)
        jobs = append(jobs, job)
    }
    return jobs, nil
}

// CleanupExpired removes jobs older than 7 days
func (d *ConversionDatabase) CleanupExpired() error {
    sevenDaysAgo := time.Now().Unix() - (7 * 24 * 60 * 60)
    _, err := d.db.Exec(`DELETE FROM jobs WHERE created_at < ?`, sevenDaysAgo)
    return err
}
```

---

## Frontend Implementation

### File: `frontend/src/types/converter.ts`

```typescript
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface ConversionJob {
  id: string;
  jobId: string;
  conversionId: string;
  status: JobStatus;
  progress: number;
  statusMessage: string;
  tier: string;
  remainingRequests: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  expiresAt?: number;
  errorMessage?: string;
  totalUrls: number;
  successfulCount: number;
  failedCount: number;
}

export interface ConversionResult {
  id: string;
  jobId: string;
  originalUrl: string;
  status: 'success' | 'failed';
  downloadUrl?: string;
  resourceName: string;
  fileSize?: number;
  expiresAt?: number;
  errorMessage?: string;
  downloaded: boolean;
  extracted: boolean;
  localPath?: string;
  createdAt: number;
}

export interface ConverterState {
  activeTab: 'queue' | 'downloads';
  jobs: ConversionJob[];
  results: ConversionResult[];
  fivemPath: string;
  remainingRequests: number;
  isSubmitting: boolean;
  error: string | null;
}
```

---

### File: `frontend/src/views/ConverterView.tsx` (Updated Structure)

```typescript
import { useState, useEffect, useReducer } from 'react';
import { FolderOpen, Download, Trash2, Play, X, RefreshCw, Clock } from 'lucide-react';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import {
  SubmitConversion,
  GetAllJobs,
  GetJobResults,
  CancelJob,
  DownloadResult,
  SetFiveMPath,
  GetFiveMPath,
  SelectFolder
} from '../../wailsjs/go/main/App';

export const ConverterView = () => {
  const [activeTab, setActiveTab] = useState<'queue' | 'downloads'>('queue');
  const [urlInput, setUrlInput] = useState('');
  const [fivemPath, setFivemPath] = useState('');
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [results, setResults] = useState<ConversionResult[]>([]);
  const [remainingRequests, setRemainingRequests] = useState<number>(0);

  // Load initial data
  useEffect(() => {
    loadJobs();
    loadFiveMPath();
  }, []);

  // Event listeners
  useEffect(() => {
    const unsubProgress = EventsOn('converter:progress', (data) => {
      // Update job progress in real-time
      updateJobProgress(data);
    });

    const unsubComplete = EventsOn('converter:play_sound', () => {
      // Play completion sound
      new Audio('/sounds/complete.mp3').play();
    });

    const unsubNotification = EventsOn('converter:show_notification', (data) => {
      // Show Windows notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(data.title, { body: data.message });
      }
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubNotification();
    };
  }, []);

  const handleSubmit = async () => {
    const urls = urlInput.split('\n').filter(u => u.trim());
    if (urls.length === 0) return;

    try {
      const jobId = await SubmitConversion(urls);
      setUrlInput('');
      loadJobs();
    } catch (err) {
      console.error('Submission failed:', err);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const path = await SelectFolder();
      if (path) {
        await SetFiveMPath(path);
        setFivemPath(path);
      }
    } catch (err) {
      console.error('Folder selection failed:', err);
    }
  };

  // Render queue and downloads tabs...
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#1a1a1a]">
      {/* Header with FiveM folder selector */}
      {/* Tabs: Queue | Downloads */}
      {/* Active tab content */}
    </div>
  );
};
```

---

## API Integration Details

### Job Submission Flow
1. User pastes URLs (one per line)
2. Frontend validates and splits into batches of 20
3. Submit first batch to `POST /api/v1/convert`
4. Store job in SQLite with status "pending"
5. Start polling after 5 seconds
6. Process remaining batches sequentially

### Polling Flow
1. Poll `GET /api/v1/job/status?jobId=xxx` every 10 seconds
2. Update job status and progress in database
3. Emit progress events to frontend
4. Update Discord RPC with "Converting X/Y..."
5. On completion:
   - Save all results to database
   - Show Windows notification
   - Play completion sound
   - Stop polling

### Download Flow
1. User clicks download on completed result
2. Download .zip from `result.downloadUrl` to temp folder
3. If auto-extract enabled:
   - Extract to `resources/cfx-merge/[resource-name]/`
   - Delete .zip file
   - Mark as extracted in database
4. Emit download complete event

---

## UI Components Structure

### Queue Tab
```
┌─────────────────────────────────────────────────────────────┐
│  [ FiveM Folder: C:\...\resources ] [Change]                │
│  [ Remaining Requests: 95/100 ]                             │
├─────────────────────────────────────────────────────────────┤
│  Paste GTA5-Mods URLs (one per line):                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ https://www.gta5-mods.com/vehicles/car1             │   │
│  │ https://www.gta5-mods.com/vehicles/car2             │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  [ Convert to FiveM ]                                       │
├─────────────────────────────────────────────────────────────┤
│  Active Jobs (2)                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Job #1 - Processing (45%)                          [X]│   │
│  │ Converting 9/20 resources...                         │   │
│  │ ████████████░░░░░░░░░░░░░                            │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Job #2 - Pending (0%)                              [X]│   │
│  │ Waiting in queue...                                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Downloads Tab
```
┌─────────────────────────────────────────────────────────────┐
│  Completed Jobs (15)                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Job #123 - Completed ✓                                 │   │
│  │ 18/20 successful • Expires in 22h 15m                  │   │
│  │ ┌──────────────────────────────────────────────────┐ │   │
│  │ │ ✓ lamborghini_aventador.zip (45MB) [Download]   │ │   │
│  │ │ ✓ ferrari_488.zip (38MB)           [Download]   │ │   │
│  │ │ ✗ broken_mod.zip - Error: Invalid format        │ │   │
│  │ └──────────────────────────────────────────────────┘ │   │
│  │ [ Download All ] [ Clear ]                            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Timeline Estimates

### Phase 1: Backend Foundation (2-3 days)
- `converter.go` - Service implementation
- `database.go` - SQLite setup
- API integration with proper error handling
- Job polling mechanism

### Phase 2: Download & Extract (1-2 days)
- File download logic
- Zip extraction
- FiveM folder management
- Auto-extract toggle

### Phase 3: Frontend UI (2-3 days)
- Queue tab with real-time progress
- Downloads tab with countdown timers
- Event listeners for progress updates
- Error handling and notifications

### Phase 4: Polish & Testing (1-2 days)
- Windows notifications
- Discord RPC updates
- Sound effects
- Edge case testing
- Database cleanup job

**Total: 6-10 days**

---

## Dependencies to Add

### Go
```bash
go get github.com/mattn/go-sqlite3
```

### Frontend
None - using existing dependencies

---

## Testing Checklist

- [ ] Submit single URL conversion
- [ ] Submit 100+ URLs (multiple batches)
- [ ] Progress updates in real-time
- [ ] Job cancellation
- [ ] App restart with pending jobs (show resume prompt)
- [ ] Download and auto-extract
- [ ] Expiration countdown timers
- [ ] Rate limit handling (remainingRequests = 0)
- [ ] Mixed success/failure results
- [ ] 7-day cleanup job
- [ ] Windows notifications
- [ ] Discord RPC updates
- [ ] Sound on completion

---

## Notes

1. **Batch Processing**: Only 1 batch runs at a time per job, batches are processed sequentially
2. **Storage**: SQLite in `~/.cfxmerge/conversions.db`
3. **Extract Path**: `resources/cfx-merge/[resource-name]/`
4. **Polling**: 10 seconds, starts 5 seconds after submission
5. **Cleanup**: Auto-delete jobs older than 7 days
6. **Rate Limits**: Show counter, block at 0
7. **Resume**: Show prompt on app restart if unfinished jobs exist

---

This plan provides a complete, production-ready converter system with persistent queue management, auto-download/extract, and real-time progress tracking.
