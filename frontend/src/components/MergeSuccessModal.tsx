import { useState } from 'react';
import { CheckCircle2, Copy, FolderOpen, FolderArchive, X, Check } from 'lucide-react';
import { CopyResourceNameToClipboard, OpenFileLocation } from '../../wailsjs/go/main/App';

interface MergeSuccessModalProps {
  isOpen: boolean;
  result: {
    resourceName: string;
    resourcePath: string;
    backupPrimary: string;
    backupSecondary: string;
    filesDeleted: number;
    durationSeconds?: number;
  } | null;
  onClose: () => void;
}

export const MergeSuccessModal = ({
  isOpen,
  result,
  onClose
}: MergeSuccessModalProps) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !result) return null;

  const handleCopyResourceName = async () => {
    try {
      await CopyResourceNameToClipboard(result.resourceName);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleOpenResourceFolder = async () => {
    try {
      await OpenFileLocation(result.resourcePath);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };

  const handleOpenBackupFolder = async () => {
    try {
      await OpenFileLocation(result.backupPrimary);
    } catch (error) {
      console.error('Failed to open backup folder:', error);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return 'N/A';
    const clamped = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(clamped / 60);
    const secs = clamped % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-[#18181b] border-2 border-emerald-500/50 rounded-lg max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
        {/* Compact Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-500/30 bg-emerald-500/10">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={22} className="text-emerald-400" />
            <div>
              <h2 className="text-[15px] font-bold text-white">Merge Complete!</h2>
              <p className="text-[11px] text-emerald-300">{result.filesDeleted} files merged successfully</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#71717a] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {/* Duration */}
          <div className="mb-3">
            <div className="text-[11px] text-[#71717a] uppercase font-semibold mb-1.5">Total Time</div>
            <div className="px-3 py-2.5 bg-[#0a0a0a] border border-emerald-500/30 rounded font-mono text-[13px] text-emerald-400 font-bold">
              {formatDuration(result.durationSeconds)}
            </div>
          </div>
          {/* Resource Name - Prominent */}
          <div className="mb-3">
            <div className="text-[11px] text-[#71717a] uppercase font-semibold mb-1.5">Resource Name</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2.5 bg-[#0a0a0a] border border-emerald-500/30 rounded font-mono text-[13px] text-emerald-400 font-bold">
                {result.resourceName}
              </div>
              <button
                onClick={handleCopyResourceName}
                className="px-3 py-2.5 bg-[#f48024] hover:bg-[#f48024]/90 text-white rounded transition-colors flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    <span className="text-[12px] font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span className="text-[12px] font-semibold">Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Server.cfg Instructions - Compact */}
          <div className="mb-3 p-3 bg-[#121212] border border-[#27272a] rounded">
            <div className="text-[12px] font-semibold text-white mb-2">Next Steps</div>
            <div className="space-y-1.5 text-[11px] text-[#a1a1aa] mb-2">
              <div><span className="text-[#f48024] font-bold">1.</span> Start your FiveM server</div>
              <div><span className="text-[#f48024] font-bold">2.</span> Add to <span className="font-mono text-white">server.cfg</span>:</div>
            </div>
            <div className="px-3 py-2 bg-[#0a0a0a] border border-[#3f3f46] rounded font-mono text-[12px] text-emerald-400">
              ensure {result.resourceName}
            </div>
            <div className="mt-2 text-[10px] text-[#52525b]">
              <span className="text-[#f48024] font-bold">3.</span> Restart server to load the resource
            </div>
          </div>

          {/* Backup Locations - Compact */}
          <div className="space-y-2">
            <div className="text-[11px] text-[#71717a] uppercase font-semibold">Backup Locations</div>

            <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded">
              <div className="flex items-start gap-2">
                <FolderArchive size={14} className="text-purple-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-purple-400 font-semibold mb-0.5">Primary Backup</div>
                  <div className="text-[10px] text-[#a1a1aa] font-mono truncate" title={result.backupPrimary}>
                    {result.backupPrimary}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded">
              <div className="flex items-start gap-2">
                <FolderArchive size={14} className="text-purple-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-purple-400 font-semibold mb-0.5">Secondary Backup</div>
                  <div className="text-[10px] text-[#a1a1aa] font-mono truncate" title={result.backupSecondary}>
                    {result.backupSecondary}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-[#71717a] leading-relaxed">
              Keep backups until verified. Use manifest.json to restore if needed.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#27272a] bg-[#0a0a0a]">
          <div className="flex gap-2">
            <button
              onClick={handleOpenResourceFolder}
              className="px-3 py-2 text-[11px] font-semibold bg-[#27272a] hover:bg-[#3f3f46] text-white rounded transition-colors flex items-center gap-1.5"
            >
              <FolderOpen size={13} />
              Resource
            </button>
            <button
              onClick={handleOpenBackupFolder}
              className="px-3 py-2 text-[11px] font-semibold bg-[#27272a] hover:bg-[#3f3f46] text-white rounded transition-colors flex items-center gap-1.5"
            >
              <FolderArchive size={13} />
              Backup
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 text-[13px] font-bold bg-[#f48024] hover:bg-[#f48024]/90 text-white rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
