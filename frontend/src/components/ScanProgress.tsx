import { ScanProgress as ScanProgressType } from '../types/scanner';
import { X } from 'lucide-react';

interface ScanProgressProps {
  progress: ScanProgressType;
  onCancel: () => void;
}

export const ScanProgress = ({ progress, onCancel }: ScanProgressProps) => {
  const formatETA = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-[20px] font-semibold text-white">
          Scanning Resources
        </h2>
        <p className="text-[13px] text-[#888]">
          Analyzing FiveM resource files for duplicates
        </p>
      </div>

      <div className="p-8 rounded-lg border border-[#333] bg-[#222] space-y-6">
        {/* Progress bar */}
        <div className="space-y-4">
          <div className="relative h-3 bg-[#333] rounded-full overflow-hidden">
            <div
              className="absolute h-full bg-[#f48024] transition-all duration-200"
              style={{ width: `${Math.min(progress.percentage, 100)}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="flex justify-between items-center text-[13px] gap-6">
            <span className="text-white font-medium">
              {progress.filesScanned.toLocaleString()} / {progress.totalFiles.toLocaleString()} files
            </span>
            <div className="text-[#888] flex items-center gap-4">
              <span>{progress.filesPerSecond.toFixed(0)} files/sec</span>
              {progress.eta > 0 && (
                <>
                  <span>•</span>
                  <span>{formatETA(progress.eta)} remaining</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Current file */}
        {progress.currentFile && (
          <div className="space-y-2">
            <div className="text-[11px] text-[#666] uppercase tracking-wider">
              Currently scanning
            </div>
            <div className="text-[13px] text-[#aaa] font-mono truncate bg-[#1a1a1a] px-3 py-2 rounded border border-[#333]">
              {progress.currentFile}
            </div>
          </div>
        )}

        {/* Cancel button */}
        <button
          onClick={onCancel}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#333] hover:bg-[#444] text-white text-[13px] font-medium rounded transition-colors"
        >
          <X size={16} />
          Cancel Scan
        </button>
      </div>
    </div>
  );
};
