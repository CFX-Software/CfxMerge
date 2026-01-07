package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
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
	// Open with modernc.org/sqlite driver (pure Go, no CGO)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
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
		err := rows.Scan(&job.ID, &job.JobID, &job.ConversionID, &job.Status, &job.Progress,
			&job.StatusMessage, &job.Tier, &job.RemainingRequests, &job.CreatedAt,
			&job.StartedAt, &job.CompletedAt, &job.ExpiresAt, &job.ErrorMessage,
			&job.TotalURLs, &job.SuccessfulCount, &job.FailedCount)
		if err != nil {
			continue
		}
		jobs = append(jobs, job)
	}
	return jobs, nil
}

// SaveBatch saves a batch
func (d *ConversionDatabase) SaveBatch(batch *Batch) error {
	urlsJSON, _ := json.Marshal(batch.URLs)
	_, err := d.db.Exec(`
		INSERT OR REPLACE INTO batches VALUES (?, ?, ?, ?, ?, ?)
	`, batch.ID, batch.JobID, string(urlsJSON), batch.BatchIndex, batch.Status, batch.CreatedAt)
	return err
}

// GetBatchesByJobID retrieves all batches for a job
func (d *ConversionDatabase) GetBatchesByJobID(jobID string) ([]*Batch, error) {
	rows, err := d.db.Query(`SELECT * FROM batches WHERE job_id = ? ORDER BY batch_index ASC`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var batches []*Batch
	for rows.Next() {
		batch := &Batch{}
		var urlsJSON string
		err := rows.Scan(&batch.ID, &batch.JobID, &urlsJSON, &batch.BatchIndex, &batch.Status, &batch.CreatedAt)
		if err != nil {
			continue
		}
		json.Unmarshal([]byte(urlsJSON), &batch.URLs)
		batches = append(batches, batch)
	}
	return batches, nil
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

// GetResultsByJobID retrieves all results for a job
func (d *ConversionDatabase) GetResultsByJobID(jobID string) ([]*Result, error) {
	rows, err := d.db.Query(`SELECT * FROM results WHERE job_id = ? ORDER BY created_at DESC`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*Result
	for rows.Next() {
		result := &Result{}
		err := rows.Scan(&result.ID, &result.JobID, &result.OriginalURL, &result.Status,
			&result.DownloadURL, &result.ResourceName, &result.FileSize, &result.ExpiresAt,
			&result.ErrorMessage, &result.Downloaded, &result.Extracted, &result.LocalPath,
			&result.CreatedAt)
		if err != nil {
			continue
		}
		results = append(results, result)
	}
	return results, nil
}

// CleanupExpired removes jobs older than 7 days
func (d *ConversionDatabase) CleanupExpired() error {
	sevenDaysAgo := time.Now().Unix() - (7 * 24 * 60 * 60)
	_, err := d.db.Exec(`DELETE FROM jobs WHERE created_at < ?`, sevenDaysAgo)
	return err
}

// GetPendingJobs retrieves all pending/processing jobs
func (d *ConversionDatabase) GetPendingJobs() ([]*Job, error) {
	rows, err := d.db.Query(`SELECT * FROM jobs WHERE status IN ('pending', 'processing') ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []*Job
	for rows.Next() {
		job := &Job{}
		err := rows.Scan(&job.ID, &job.JobID, &job.ConversionID, &job.Status, &job.Progress,
			&job.StatusMessage, &job.Tier, &job.RemainingRequests, &job.CreatedAt,
			&job.StartedAt, &job.CompletedAt, &job.ExpiresAt, &job.ErrorMessage,
			&job.TotalURLs, &job.SuccessfulCount, &job.FailedCount)
		if err != nil {
			continue
		}
		jobs = append(jobs, job)
	}
	return jobs, nil
}

// DeleteJob deletes a job and all its batches and results
func (d *ConversionDatabase) DeleteJob(jobID string) error {
	_, err := d.db.Exec(`DELETE FROM jobs WHERE id = ?`, jobID)
	return err
}

// ClearAllJobs deletes all jobs
func (d *ConversionDatabase) ClearAllJobs() error {
	_, err := d.db.Exec(`DELETE FROM jobs`)
	return err
}

// Close closes the database connection
func (d *ConversionDatabase) Close() error {
	return d.db.Close()
}
