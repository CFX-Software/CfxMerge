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

  // Toggle duplicate selection
  const toggleSelect = (id: string) => {
    setDuplicates(prev => prev.map(d => d.id === id ? { ...d, selected: !d.selected } : d));
  };

  // Select all duplicates
  const selectAll = () => {
    setDuplicates(prev => prev.map(d => ({ ...d, selected: true })));
  };

  // Calculate stats
  const readyCount = duplicates.filter(d => d.status === 'ready').length;
  const warningCount = scanState.results?.stats.warningCount || 0;
  const errorCount = scanState.results?.stats.errorCount || 0;
  const encryptedCount = scanState.results?.errors.filter(e => e.type === 'encrypted').length || 0;
  const selectedCount = duplicates.filter(d => d.selected).length;

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
            <div className="text-red-400 text-[48px]">⚠️</div>
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
                placeholder="Search"
                className="w-full bg-[#222] border border-[#333] rounded px-9 py-2 text-[13px] text-white placeholder:text-[#666] focus:border-[#f48024] outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-4 py-2 bg-[#252525] hover:bg-[#2a2a2a] border border-[#333] text-white text-[12px] font-medium rounded transition-colors flex items-center gap-2">
              <Sliders size={14} />
              Filters ({duplicates.length})
            </button>
            <button
              onClick={selectAll}
              className="px-4 py-2 bg-[#252525] hover:bg-[#2a2a2a] border border-[#333] text-white text-[12px] font-medium rounded transition-colors"
            >
              Select all resources ({duplicates.length})
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
            <h2 className="text-[18px] font-semibold text-white">Detected duplicates</h2>
            <p className="text-[12px] text-[#888] mt-1">
              Found {duplicates.length} duplicate groups in {scanState.results?.stats.totalFiles} files
            </p>
          </div>

          {/* Duplicate List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {duplicates.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[14px] text-[#888]">No duplicates found</p>
              </div>
            ) : (
              duplicates.map(dup => (
                <div key={dup.id} className="rounded-lg border border-[#333] bg-[#222] overflow-hidden hover:border-[#444] transition-colors">
                  <div className="p-4 flex items-center gap-4">
                    <span className="text-[13px] font-mono text-white flex-1">{dup.name}</span>

                    <div className="flex items-center gap-3">
                      {dup.status === 'ready' && (
                        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-[11px] font-medium rounded">
                          Ready to merge
                        </span>
                      )}

                      <button
                        onClick={() => toggleExpand(dup.id)}
                        className="p-1.5 hover:bg-[#333] rounded transition-colors"
                      >
                        {dup.expanded ? <ChevronUp size={16} className="text-[#aaa]" /> : <ChevronDown size={16} className="text-[#aaa]" />}
                      </button>

                      <input
                        type="checkbox"
                        checked={dup.selected}
                        onChange={() => toggleSelect(dup.id)}
                        className="w-4 h-4 rounded bg-[#333] border-[#333] text-[#f48024] focus:ring-[#f48024] focus:ring-offset-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  {dup.expanded && (
                    <div className="px-4 pb-4 pt-2 space-y-2 border-t border-[#333]">
                      {dup.paths.map((path, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[12px] font-mono text-[#888] pl-4">
                          <FolderOpen size={14} className="text-[#666]" />
                          <span>{path}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="border-t border-[#2a2a2a] bg-[#1f1f1f] p-4">
            <div className="flex items-center justify-between">
              <button className="px-6 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[13px] font-bold rounded transition-colors">
                Merge duplicates
                <div className="text-[11px] opacity-70 font-normal">
                  {selectedCount} groups selected
                </div>
              </button>

              <div className="flex items-center gap-4">
                <span className="text-[12px] text-[#888]">Merger engine: <span className="text-white">Auto</span></span>
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
        <div className="w-72 border-l border-[#2a2a2a] bg-[#1f1f1f] p-6 space-y-3">
          <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[12px] font-medium text-emerald-400">Ready to merge ({readyCount})</span>
            </div>
          </div>

          {encryptedCount > 0 && (
            <div className="p-4 rounded-lg border border-purple-500/20 bg-purple-500/5">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-[12px] font-medium text-purple-400">FXAP Encrypted ({encryptedCount})</span>
              </div>
              <p className="text-[10px] text-purple-300/60 mt-1">Cannot be merged (protected)</p>
            </div>
          )}

          <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[12px] font-medium text-red-400">Errors ({errorCount})</span>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[12px] font-medium text-amber-400">Warnings ({warningCount})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
