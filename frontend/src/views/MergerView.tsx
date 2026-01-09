import { useState, useReducer, useEffect, useCallback } from 'react';
import { Search, FolderOpen, ChevronDown, ChevronUp, Sliders, X } from 'lucide-react';
import { ScanProgress } from '../components/ScanProgress';
import { SelectFolder, StartScan, CancelScan } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import {
  ScanProgress as ScanProgressType,
  ScanResults,
  DuplicateGroup,
} from '../types/scanner';

// Scan state management
type ScanState = {
  status: 'idle' | 'scanning' | 'complete' | 'error';
  progress: ScanProgressType | null;
  results: ScanResults | null;
  error: string | null;
};

type ScanAction =
  | { type: 'START_SCAN' }
  | { type: 'UPDATE_PROGRESS'; payload: ScanProgressType }
  | { type: 'SCAN_COMPLETE'; payload: ScanResults }
  | { type: 'SCAN_ERROR'; payload: string }
  | { type: 'RESET' };

const scanReducer = (state: ScanState, action: ScanAction): ScanState => {
  switch (action.type) {
    case 'START_SCAN':
      return { ...state, status: 'scanning', progress: null, error: null };
    case 'UPDATE_PROGRESS':
      return { ...state, progress: action.payload };
    case 'SCAN_COMPLETE':
      return { ...state, status: 'complete', results: action.payload, progress: null };
    case 'SCAN_ERROR':
      return { ...state, status: 'error', error: action.payload, progress: null };
    case 'RESET':
      return { status: 'idle', progress: null, results: null, error: null };
    default:
      return state;
  }
};

export const MergerView = () => {
  const [scanState, dispatch] = useReducer(scanReducer, {
    status: 'idle',
    progress: null,
    results: null,
    error: null,
  });

  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [showFXAP, setShowFXAP] = useState<boolean>(true);
  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Set up event listeners for scan progress
  useEffect(() => {
    const unsubProgress = EventsOn("scan:progress", (progress: ScanProgressType) => {
      dispatch({ type: 'UPDATE_PROGRESS', payload: progress });
    });

    const unsubComplete = EventsOn("scan:complete", (results: ScanResults) => {
      dispatch({ type: 'SCAN_COMPLETE', payload: results });
    });

    const unsubError = EventsOn("scan:error", (error: string) => {
      dispatch({ type: 'SCAN_ERROR', payload: error });
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, []);

  // Update duplicates when scan completes
  useEffect(() => {
    if (scanState.status === 'complete' && scanState.results) {
      setDuplicates(scanState.results.duplicates);
    }
  }, [scanState.status, scanState.results]);

  // Folder selection handler
  const handleSelectFolder = useCallback(async () => {
    try {
      const folderPath = await SelectFolder();
      if (folderPath) {
        dispatch({ type: 'START_SCAN' });
        await StartScan(folderPath);
      }
    } catch (err: any) {
      dispatch({ type: 'SCAN_ERROR', payload: err.message || 'Failed to select folder' });
    }
  }, []);

  // Cancel scan handler
  const handleCancelScan = useCallback(async () => {
    try {
      await CancelScan();
      dispatch({ type: 'RESET' });
    } catch (err: any) {
      console.error('Failed to cancel scan:', err);
    }
  }, []);

  // Reset to idle state
  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Toggle duplicate expansion
  const toggleExpand = (id: string) => {
    setDuplicates(prev => prev.map(d => d.id === id ? { ...d, expanded: !d.expanded } : d));
  };

  // Toggle individual file selection
  const toggleFileSelect = (filePath: string, isEncrypted: boolean) => {
    if (isEncrypted) return; // Don't allow selecting encrypted files

    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  };

  // Toggle duplicate group selection
  const toggleSelect = (groupId: string) => {
    const group = duplicates.find(d => d.id === groupId);
    if (!group) return;

    // Toggle all non-encrypted files in the group
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      const nonEncryptedFiles = group.files.filter(f => !f.isEncrypted);
      const allSelected = nonEncryptedFiles.every(f => newSet.has(f.path));

      nonEncryptedFiles.forEach(f => {
        if (allSelected) {
          newSet.delete(f.path);
        } else {
          newSet.add(f.path);
        }
      });

      return newSet;
    });
  };

  // Select all files (only non-FXAP)
  const selectAll = () => {
    const allNonEncrypted = duplicates.flatMap(d =>
      d.files.filter(f => !f.isEncrypted).map(f => f.path)
    );
    setSelectedFiles(new Set(allNonEncrypted));
  };

  // Deselect all files
  const deselectAll = () => {
    setSelectedFiles(new Set());
  };

  // Filter duplicates based on FXAP toggle, search query, and exclude identical files
  const filteredDuplicates = duplicates
    .filter(d => {
      // Always hide identical files
      if (d.status === 'identical') return false;

      // Filter by FXAP toggle
      if (!showFXAP && d.status === 'error') return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = d.name.toLowerCase().includes(query);
        const pathMatch = d.files.some(f => f.path.toLowerCase().includes(query));
        return nameMatch || pathMatch;
      }

      return true;
    });

  // Calculate stats
  const allScannedFiles = scanState.results?.files || [];
  const allErrors = scanState.results?.errors || [];

  // Count all files in duplicate groups
  const totalFiles = duplicates.flatMap(d => d.files).length;

  // Count FXAP encrypted files
  const encryptedCount = scanState.results?.files.filter(f => f.isEncrypted).length || 0; // ALL FXAP in scan
  const encryptedInDuplicates = duplicates.flatMap(d => d.files).filter(f => f.isEncrypted).length;

  // Count identical file groups
  const identicalGroupCount = duplicates.filter(d => d.status === 'identical').length;
  const identicalFilesCount = duplicates
    .filter(d => d.status === 'identical')
    .flatMap(d => d.files).length;

  // Count error types from scanner
  const permissionErrors = allErrors.filter(e => e.type === 'permission').length;
  const corruptErrors = allErrors.filter(e => e.type === 'corrupt').length;
  const namingErrors = allErrors.filter(e => e.type === 'naming').length;
  const encryptedErrors = allErrors.filter(e => e.type === 'encrypted').length;

  // Calculate files ready to merge (non-encrypted, non-identical)
  const readyFiles = duplicates
    .filter(d => d.status === 'ready')
    .flatMap(d => d.files.filter(f => !f.isEncrypted));
  const readyCount = readyFiles.length;

  // Calculate size ONLY for files ready to merge
  const mergeableSize = readyFiles.reduce((sum, file) => sum + file.size, 0);

  // Total warnings (encrypted in duplicates + identical files)
  const warningCount = encryptedInDuplicates + identicalFilesCount;

  // Total errors from scanner
  const errorCount = encryptedErrors + permissionErrors + corruptErrors + namingErrors;

  const selectedCount = selectedFiles.size;

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Idle state: Folder selection
  if (scanState.status === 'idle') {
    return (
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#1a1a1a] text-[#fafafa]">
        <div className="flex-1 flex items-start justify-center pt-32 px-12">
          <div className="max-w-2xl w-full">
            <h1 className="text-[28px] font-semibold text-white mb-2">Select the folder</h1>
            <p className="text-[14px] text-[#888] mb-8">Select your FiveM resource folder to scan for duplicates</p>

            <div
              className="p-8 rounded-lg border-2 border-dashed border-[#333] bg-[#222] hover:border-[#f48024] transition-colors cursor-pointer mb-6"
              onClick={handleSelectFolder}
            >
              <div className="text-center">
                <FolderOpen size={32} className="text-[#666] mx-auto mb-3" />
                <p className="text-[13px] text-[#aaa]">Click to select folder</p>
              </div>
            </div>

            <button
              onClick={handleSelectFolder}
              className="w-full px-6 py-3 bg-[#f48024] hover:bg-[#f48024]/90 text-white text-[13px] font-semibold rounded transition-colors"
            >
              Select Folder
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Scanning state
  if (scanState.status === 'scanning') {
    return (
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#1a1a1a] text-[#fafafa]">
        <div className="flex-1 flex items-center justify-center px-12">
          {scanState.progress && (
            <ScanProgress progress={scanState.progress} onCancel={handleCancelScan} />
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (scanState.status === 'error') {
    return (
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#1a1a1a] text-[#fafafa]">
        <div className="flex-1 flex items-center justify-center px-12">
          <div className="max-w-md text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/20 flex items-center justify-center mx-auto">
              <X size={32} className="text-red-400" />
            </div>
            <h2 className="text-[20px] font-semibold text-white">Scan Failed</h2>
            <p className="text-[13px] text-[#888]">{scanState.error}</p>
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-[#f48024] hover:bg-[#f48024]/90 text-white text-[13px] font-semibold rounded transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Complete state: Show results
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#1a1a1a] text-[#fafafa]">
      {/* Top Toolbar */}
      <div className="border-b border-[#2a2a2a] bg-[#1f1f1f]">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
              <input
                type="text"
                placeholder="Search duplicates by name or path..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#222] border border-[#333] rounded px-9 py-2 text-[13px] text-white placeholder:text-[#666] focus:border-[#f48024] outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="px-4 py-2 bg-[#252525] hover:bg-[#2a2a2a] border border-[#333] text-white text-[12px] font-medium rounded transition-colors flex items-center gap-2"
              >
                <Sliders size={14} />
                Filters ({filteredDuplicates.length})
              </button>
              {showFilterDropdown && (
                <div className="absolute top-full mt-1 right-0 bg-[#222] border border-[#333] rounded shadow-lg py-2 min-w-[220px] z-10">
                  <label className="flex items-center gap-2 px-4 py-2 hover:bg-[#2a2a2a] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showFXAP}
                      onChange={(e) => setShowFXAP(e.target.checked)}
                      className="w-4 h-4 rounded bg-[#333] border-[#333] text-[#f48024] focus:ring-[#f48024] focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-[12px] text-white">Show FXAP Encrypted</span>
                  </label>
                </div>
              )}
            </div>
            <button
              onClick={selectedCount > 0 ? deselectAll : selectAll}
              className="px-4 py-2 bg-[#252525] hover:bg-[#2a2a2a] border border-[#333] text-white text-[12px] font-medium rounded transition-colors"
            >
              {selectedCount > 0 ? 'Deselect all' : `Select all (${readyCount})`}
            </button>
            <button
              onClick={handleReset}
              className="p-2 bg-[#252525] hover:bg-[#2a2a2a] border border-[#333] text-[#aaa] rounded transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-[#2a2a2a]">
            <h2 className="text-[18px] font-semibold text-white">
              {searchQuery ? 'Search Results' : 'Detected duplicates'}
            </h2>
            <p className="text-[12px] text-[#888] mt-1">
              {searchQuery ? (
                <>
                  Found {filteredDuplicates.length} matching group{filteredDuplicates.length !== 1 ? 's' : ''} for "{searchQuery}"
                  {filteredDuplicates.length === 0 && (
                    <span className="text-[#f48024] ml-1">• Try a different search term</span>
                  )}
                </>
              ) : (
                <>
                  Found {filteredDuplicates.length} duplicate groups in {scanState.results?.stats.totalFiles} files
                  {!showFXAP && encryptedCount > 0 && (
                    <span className="text-[#f48024] ml-1">({encryptedCount} FXAP files hidden)</span>
                  )}
                  {identicalGroupCount > 0 && (
                    <span className="text-yellow-400 ml-1">({identicalGroupCount} identical groups blocked)</span>
                  )}
                </>
              )}
            </p>
          </div>

          {/* Duplicate List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {filteredDuplicates.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[14px] text-[#888]">
                  {searchQuery
                    ? `No results found for "${searchQuery}"`
                    : duplicates.length === 0
                      ? 'No duplicates found'
                      : 'No duplicates to show (all filtered)'
                  }
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-3 text-[12px] text-[#f48024] hover:text-[#f48024]/80 transition-colors"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              filteredDuplicates.map(dup => {
                const nonEncryptedFiles = dup.files.filter(f => !f.isEncrypted);
                const groupAllSelected = nonEncryptedFiles.length > 0 && nonEncryptedFiles.every(f => selectedFiles.has(f.path));

                return (
                  <div key={dup.id} className="rounded-lg border border-[#333] bg-[#222] overflow-hidden hover:border-[#444] transition-colors">
                    <div className="p-4 flex items-center gap-4">
                      <span className="text-[13px] font-mono text-white flex-1">{dup.name}</span>

                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-[#888]">
                          {dup.files.length} files
                          {dup.hasWarnings && (
                            <span className="text-red-400 ml-2">({dup.files.filter(f => f.isEncrypted).length} FXAP)</span>
                          )}
                        </span>

                        <button
                          onClick={() => toggleExpand(dup.id)}
                          className="p-1.5 hover:bg-[#333] rounded transition-colors"
                        >
                          {dup.expanded ? <ChevronUp size={16} className="text-[#aaa]" /> : <ChevronDown size={16} className="text-[#aaa]" />}
                        </button>

                        {nonEncryptedFiles.length > 0 && (
                          <input
                            type="checkbox"
                            checked={groupAllSelected}
                            onChange={() => toggleSelect(dup.id)}
                            className="w-4 h-4 rounded bg-[#333] border-[#333] text-[#f48024] focus:ring-[#f48024] focus:ring-offset-0 cursor-pointer"
                            title="Select all non-encrypted files in this group"
                          />
                        )}
                      </div>
                    </div>

                    {dup.expanded && (
                      <div className="px-4 pb-4 pt-2 space-y-2 border-t border-[#333]">
                        {dup.files.map((file, idx) => (
                          <div key={idx} className={`flex items-center gap-3 p-2 rounded ${file.isEncrypted ? 'bg-red-500/5 border border-red-500/20' : 'hover:bg-[#2a2a2a]'}`}>
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(file.path)}
                              onChange={() => toggleFileSelect(file.path, file.isEncrypted)}
                              disabled={file.isEncrypted}
                              className={`w-4 h-4 rounded bg-[#333] border-[#333] text-[#f48024] focus:ring-[#f48024] focus:ring-offset-0 shrink-0 ${
                                file.isEncrypted ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                              }`}
                            />
                            <FolderOpen size={14} className={`shrink-0 ${file.isEncrypted ? 'text-red-400' : 'text-[#666]'}`} />
                            <span
                              className={`text-[11px] font-mono flex-1 truncate ${file.isEncrypted ? 'text-red-300' : 'text-[#888]'}`}
                              title={file.path}
                            >
                              {file.path}
                            </span>
                            {file.isEncrypted && (
                              <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] font-bold rounded shrink-0">
                                FXAP
                              </span>
                            )}
                          </div>
                        ))}
                        {dup.hasWarnings && (
                          <div className="mt-3 p-3 rounded bg-red-500/10 border border-red-500/20">
                            <p className="text-[11px] text-red-400 font-semibold mb-1">
                              FXAP Encrypted Files Cannot Be Merged
                            </p>
                            <p className="text-[10px] text-red-300/80 leading-relaxed">
                              We're unable to process the merge on FXAP encrypted files. Ask the mod developer for an unencrypted version to continue.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="border-t border-[#2a2a2a] bg-[#1f1f1f] p-4">
            <div className="flex items-center justify-between">
              <button className="px-6 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[13px] font-bold rounded transition-colors">
                Merge duplicates
                <div className="text-[11px] opacity-70 font-normal">
                  {selectedCount} files selected
                </div>
              </button>

              <div className="flex items-center gap-4">
                <div className="text-[12px] text-[#888]">
                  <span>Merger engine: <span className="text-white">Auto</span></span>
                  <span className="mx-2">•</span>
                  <span className="text-emerald-400">{formatFileSize(mergeableSize)}</span>
                  <span className="text-[#666] ml-1">ready</span>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white text-[12px] font-medium rounded transition-colors"
                >
                  Change Folder
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Stats */}
        <div className="w-80 border-l border-[#2a2a2a] bg-[#1f1f1f] p-6 space-y-3 overflow-y-auto">
          {/* Ready to merge */}
          <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[13px] font-semibold text-emerald-400">Ready to merge</span>
            </div>
            <div className="space-y-1 ml-4">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-emerald-300/80">Files ready</span>
                <span className="text-[11px] font-medium text-emerald-400">{readyCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-emerald-300/80">Total size</span>
                <span className="text-[11px] font-medium text-emerald-400">{formatFileSize(mergeableSize)}</span>
              </div>
            </div>
          </div>

          {/* Errors */}
          {errorCount > 0 && (
            <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[13px] font-semibold text-red-400">Errors ({errorCount})</span>
              </div>
              <div className="space-y-1.5 ml-4">
                {encryptedErrors > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-red-300/70">FXAP Encrypted</span>
                    <span className="text-[10px] font-medium text-red-400">{encryptedErrors}</span>
                  </div>
                )}
                {permissionErrors > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-red-300/70">Access Denied</span>
                    <span className="text-[10px] font-medium text-red-400">{permissionErrors}</span>
                  </div>
                )}
                {corruptErrors > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-red-300/70">Corrupt Files</span>
                    <span className="text-[10px] font-medium text-red-400">{corruptErrors}</span>
                  </div>
                )}
                {namingErrors > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-red-300/70">Naming Conflicts</span>
                    <span className="text-[10px] font-medium text-red-400">{namingErrors}</span>
                  </div>
                )}
              </div>
              <p className="text-[9px] text-red-300/50 mt-2 ml-4 italic">Cannot be processed or merged</p>
            </div>
          )}

          {/* Warnings */}
          {warningCount > 0 && (
            <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[13px] font-semibold text-amber-400">Warnings ({warningCount})</span>
              </div>
              <div className="space-y-1.5 ml-4">
                {encryptedInDuplicates > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-amber-300/70">FXAP in Duplicates</span>
                    <span className="text-[10px] font-medium text-amber-400">{encryptedInDuplicates}</span>
                  </div>
                )}
                {identicalFilesCount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-amber-300/70">Identical Files (Blocked)</span>
                    <span className="text-[10px] font-medium text-amber-400">{identicalFilesCount}</span>
                  </div>
                )}
              </div>
              <p className="text-[9px] text-amber-300/50 mt-2 ml-4 italic">Skip these to avoid wasting resources</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
