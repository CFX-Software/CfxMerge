// Import Wails-generated types
import { main } from '../../wailsjs/go/models';

// Type aliases for convenience
export type ConversionJob = main.Job;
export type ConversionResult = main.Result;
export type JobStatus = string; // Will be 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired'

export interface ConverterState {
  activeTab: 'queue' | 'downloads';
  jobs: ConversionJob[];
  results: Map<string, ConversionResult[]>; // jobID -> results
  fivemPath: string;
  isSubmitting: boolean;
  error: string | null;
}

export interface JobProgressEvent {
  jobId: string;
  status: JobStatus;
  progress: number;
  statusMessage: string;
}

export interface JobSubmittedEvent {
  jobId: string;
  totalBatches: number;
  totalURLs: number;
}

export interface NotificationEvent {
  title: string;
  message: string;
}
