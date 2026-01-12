import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface FileInfo {
  path: string;
  name: string;
  size: number;
}

interface MergeConfirmationDialogProps {
  isOpen: boolean;
  files: FileInfo[];
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    totalFiles: number;
    totalSize: number;
    backupSize: number;
    resourceName: string;
    backupPath: string;
    backupPathAlt?: string;
    availableSpace: number;
  } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const MergeConfirmationDialog = ({
  isOpen,
  files,
  validation,
  onConfirm,
  onCancel
}: MergeConfirmationDialogProps) => {
  const [confirmChecked, setConfirmChecked] = useState(false);

  if (!isOpen || !validation) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleConfirm = () => {
    if (!confirmChecked) return;
    setConfirmChecked(false);
    onConfirm();
  };

  const handleCancel = () => {
    setConfirmChecked(false);
    onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-[#18181b] border-2 border-red-500/50 rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
        {/* Compact Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-400" />
            <div>
              <h2 className="text-[15px] font-bold text-white">Confirm Deletion</h2>
              <p className="text-[11px] text-red-300">{validation.totalFiles} files ({formatBytes(validation.totalSize)}) will be deleted</p>
            </div>
          </div>
          <button onClick={handleCancel} className="text-[#71717a] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {/* Validation Errors */}
          {validation.errors.length > 0 && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded text-[11px] text-red-300">
              {validation.errors.map((error, i) => (
                <div key={i}>• {error}</div>
              ))}
            </div>
          )}

          {/* Critical Warning - Compact */}
          <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-red-400 mb-1">⚠️ ALL FILES WILL BE DELETED</div>
                <div className="text-[11px] text-red-300/90 leading-relaxed">
                  Backups will be created at:
                  <span className="font-mono text-[10px] block mt-0.5 truncate" title={validation.backupPath}>
                    Primary: {validation.backupPath}
                  </span>
                  {validation.backupPathAlt && (
                    <span className="font-mono text-[10px] block mt-0.5 truncate" title={validation.backupPathAlt}>
                      Secondary: {validation.backupPathAlt}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Compact File List */}
          <div className="mb-3">
            <div className="text-[11px] font-semibold text-[#a1a1aa] uppercase mb-1.5">Files to Delete</div>
            <div className="bg-[#0a0a0a] border border-[#27272a] rounded max-h-[200px] overflow-auto">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="px-3 py-2 border-b border-[#27272a] last:border-b-0 hover:bg-[#121212] transition-colors"
                >
                  <div className="text-[11px] text-white font-medium truncate" title={file.name}>{file.name}</div>
                  <div className="text-[10px] text-[#52525b] mt-0.5">{formatBytes(file.size)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Prominent Checkbox Confirmation */}
          <div className="p-4 bg-[#27272a] border-2 border-[#52525b] hover:border-[#71717a] rounded transition-all">
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative flex items-center justify-center mt-0.5">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="w-6 h-6 appearance-none border-2 border-[#71717a] rounded bg-[#18181b] checked:bg-[#f48024] checked:border-[#f48024] cursor-pointer transition-all"
                />
                {confirmChecked && (
                  <div className="absolute text-white pointer-events-none">✓</div>
                )}
              </div>
              <div className="flex-1">
                <div className="text-[13px] text-white font-bold leading-tight">
                  I understand {validation.totalFiles} files will be permanently deleted
                </div>
                <div className="text-[11px] text-[#a1a1aa] mt-1">
                  Backups will be created first. I can restore if needed.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-[#27272a] bg-[#0a0a0a]">
          <button
            onClick={handleCancel}
            className="px-5 py-2 text-[13px] font-semibold text-[#a1a1aa] hover:text-white hover:bg-[#27272a] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmChecked || !validation.valid}
            className="px-6 py-2 text-[13px] font-bold bg-[#f48024] hover:bg-[#f48024]/90 text-white rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg disabled:shadow-none"
          >
            {confirmChecked ? 'Start Merge →' : 'Check box to continue'}
          </button>
        </div>
      </div>
    </div>
  );
};
