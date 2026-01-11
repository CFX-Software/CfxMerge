import { AlertTriangle, FolderArchive, CheckCircle2, XCircle, X } from 'lucide-react';
import { OpenFileLocation } from '../../wailsjs/go/main/App';

interface MergeErrorModalProps {
  isOpen: boolean;
  error: {
    phase: string;
    message: string;
    backupsExist: boolean;
    filesDeleted: number;
    recoveryInstructions: string;
    backupPrimary?: string;
    backupSecondary?: string;
  } | null;
  onClose: () => void;
}

export const MergeErrorModal = ({
  isOpen,
  error,
  onClose
}: MergeErrorModalProps) => {
  if (!isOpen || !error) return null;

  const handleOpenBackupFolder = async () => {
    if (error.backupPrimary) {
      try {
        await OpenFileLocation(error.backupPrimary);
      } catch (err) {
        console.error('Failed to open backup folder:', err);
      }
    }
  };

  const getPhaseDisplay = (phase: string) => {
    const phaseMap: { [key: string]: string } = {
      'start': 'Start',
      'error': 'Start',
      'validating': 'Validation',
      'backing-up': 'Backup Creation',
      'uploading': 'File Upload',
      'merging': 'Resource Merging',
      'downloading': 'Download',
      'deleting': 'File Deletion',
      'installing': 'Installation'
    };
    return phaseMap[phase] || phase;
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-[#18181b] border-2 border-red-500/50 rounded-lg max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
        {/* Compact Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-400" />
            <div>
              <h2 className="text-[15px] font-bold text-white">Merge Failed</h2>
              <p className="text-[11px] text-red-300">Error during {getPhaseDisplay(error.phase)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#71717a] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {/* Error Message */}
          <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded">
            <div className="flex items-start gap-2">
              <XCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-[12px] font-bold text-red-400 mb-1">Error Details</div>
                <div className="text-[11px] text-[#a1a1aa] leading-relaxed">{error.message}</div>
              </div>
            </div>
          </div>

          {/* Data Safety Status - Compact */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className={`p-3 rounded border ${
              error.backupsExist
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center gap-2">
                {error.backupsExist ? (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                ) : (
                  <XCircle size={14} className="text-red-400" />
                )}
                <div>
                  <div className="text-[10px] uppercase font-semibold text-[#71717a]">Backup</div>
                  <div className={`text-[12px] font-bold ${
                    error.backupsExist ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {error.backupsExist ? 'Created ✓' : 'None'}
                  </div>
                </div>
              </div>
            </div>

            <div className={`p-3 rounded border ${
              error.filesDeleted === 0
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}>
              <div className="flex items-center gap-2">
                {error.filesDeleted === 0 ? (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                ) : (
                  <AlertTriangle size={14} className="text-amber-400" />
                )}
                <div>
                  <div className="text-[10px] uppercase font-semibold text-[#71717a]">Deleted</div>
                  <div className={`text-[12px] font-bold ${
                    error.filesDeleted === 0 ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {error.filesDeleted === 0 ? 'None ✓' : `${error.filesDeleted}`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recovery Instructions */}
          <div className="mb-3 p-3 bg-[#121212] border border-[#27272a] rounded">
            <div className="text-[12px] font-semibold text-white mb-2">What Happened</div>
            <div className="text-[11px] text-[#a1a1aa] leading-relaxed whitespace-pre-line">
              {error.recoveryInstructions}
            </div>
          </div>

          {/* Backup Locations - Compact */}
          {error.backupsExist && error.backupPrimary && error.backupSecondary && (
            <div className="space-y-2 mb-3">
              <div className="text-[10px] font-semibold text-[#71717a] uppercase">Backup Locations</div>

              <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded">
                <div className="flex items-start gap-2">
                  <FolderArchive size={14} className="text-purple-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-purple-400 font-semibold mb-0.5">Primary</div>
                    <div className="text-[10px] text-[#a1a1aa] font-mono truncate" title={error.backupPrimary}>
                      {error.backupPrimary}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded">
                <div className="flex items-start gap-2">
                  <FolderArchive size={14} className="text-purple-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-purple-400 font-semibold mb-0.5">Secondary</div>
                    <div className="text-[10px] text-[#a1a1aa] font-mono truncate" title={error.backupSecondary}>
                      {error.backupSecondary}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-[11px] text-emerald-400 font-bold mb-1">Your Data is Safe</div>
                    <div className="text-[10px] text-[#a1a1aa] leading-relaxed">
                      Use manifest.json in backup folder to restore files if needed.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No Backups Warning */}
          {!error.backupsExist && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-[11px] text-amber-400 font-bold mb-1">No Changes Made</div>
                  <div className="text-[10px] text-[#a1a1aa] leading-relaxed">
                    Error occurred before backups. Your original files remain unchanged.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#27272a] bg-[#0a0a0a]">
          {error.backupsExist && error.backupPrimary && (
            <button
              onClick={handleOpenBackupFolder}
              className="px-4 py-2 text-[12px] font-semibold bg-[#27272a] hover:bg-[#3f3f46] text-white rounded transition-colors flex items-center gap-2"
            >
              <FolderArchive size={14} />
              View Backup
            </button>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2 text-[13px] font-bold bg-[#f48024] hover:bg-[#f48024]/90 text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
