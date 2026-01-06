export interface FileInfo {
  path: string;
  name: string;
  size: number;
  modTime: string;
}

export interface DuplicateGroup {
  id: string;
  name: string;
  status: string;
  paths: string[];
  expanded: boolean;
  selected: boolean;
  hasWarnings?: boolean;
  warningCount?: number;
}

export interface FileError {
  path: string;
  type: 'permission' | 'corrupt' | 'naming' | 'encrypted';
  message: string;
}

export interface ScanProgress {
  filesScanned: number;
  totalFiles: number;
  percentage: number;
  filesPerSecond: number;
  eta: number;
  currentFile: string;
}

export interface ScanStats {
  totalFiles: number;
  duplicateGroups: number;
  errorCount: number;
  warningCount: number;
}

export interface ScanResults {
  files: FileInfo[];
  duplicates: DuplicateGroup[];
  errors: FileError[];
  stats: ScanStats;
}
