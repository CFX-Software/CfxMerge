import { Loader2, FolderArchive, Upload, GitMerge, Download, Trash2, Package, CheckCircle2 } from 'lucide-react';

interface MergeProgressModalProps {
  isOpen: boolean;
  phase: 'idle' | 'validating' | 'confirming' | 'backing-up' | 'uploading' | 'merging' | 'downloading' | 'deleting' | 'installing' | 'complete' | 'error';
  timingStart?: number | null;
  progress: {
    currentPhase: string;
    currentFile: string;
    filesProcessed: number;
    totalFiles: number;
    percentage: number;
    overallPercent?: number;
  };
  backup?: {
    primaryPath: string;
    secondaryPath: string;
    filesBackedUp: number;
  };
  merge?: {
    jobId: string;
    status: string;
  };
}

export const MergeProgressModal = ({
  isOpen,
  phase,
  timingStart,
  progress,
  backup,
  merge
}: MergeProgressModalProps) => {
  if (!isOpen) return null;

  const getPhaseInfo = () => {
    switch (phase) {
      case 'validating':
        return { icon: <Loader2 size={18} className="text-blue-400 animate-spin" />, title: 'Validating', color: 'blue' };
      case 'backing-up':
        return { icon: <FolderArchive size={18} className="text-purple-400" />, title: 'Creating Backups', color: 'purple' };
      case 'uploading':
        return { icon: <Upload size={18} className="text-cyan-400" />, title: 'Uploading', color: 'cyan' };
      case 'merging':
        return { icon: <GitMerge size={18} className="text-amber-400" />, title: 'Merging', color: 'amber' };
      case 'downloading':
        return { icon: <Download size={18} className="text-green-400" />, title: 'Downloading', color: 'green' };
      case 'deleting':
        return { icon: <Trash2 size={18} className="text-red-400" />, title: 'Deleting Originals', color: 'red' };
      case 'installing':
        return { icon: <Package size={18} className="text-emerald-400" />, title: 'Installing', color: 'emerald' };
      default:
        return { icon: <Loader2 size={18} className="text-[#f48024] animate-spin" />, title: 'Processing', color: 'orange' };
    }
  };

  const phaseInfo = getPhaseInfo();
  const phaseSteps = [
    { id: 'backing-up', icon: FolderArchive },
    { id: 'uploading', icon: Upload },
    { id: 'merging', icon: GitMerge },
    { id: 'downloading', icon: Download },
    { id: 'deleting', icon: Trash2 },
    { id: 'installing', icon: Package }
  ];

  const getCurrentStepIndex = () => phaseSteps.findIndex(step => step.id === phase);
  const currentStepIndex = getCurrentStepIndex();
  const overallPercent = progress.overallPercent ?? progress.percentage;

  const formatDuration = (seconds: number) => {
    const clamped = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(clamped / 60);
    const secs = clamped % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const elapsedSeconds = timingStart ? (Date.now() - timingStart) / 1000 : null;
  const etaSeconds = elapsedSeconds && overallPercent > 1 && overallPercent < 100
    ? (elapsedSeconds * (100 / overallPercent)) - elapsedSeconds
    : null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-[#18181b] border-2 border-[#f48024]/50 rounded-lg max-w-xl w-full shadow-2xl">
        {/* Compact Header */}
        <div className="px-5 py-3 border-b border-[#27272a]">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex-shrink-0">{phaseInfo.icon}</div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-bold text-white truncate">{phaseInfo.title}</h2>
              <p className="text-[10px] text-[#71717a]">{progress.filesProcessed} of {progress.totalFiles} files</p>
            </div>
            <div className="text-[16px] font-bold text-white">{Math.round(progress.percentage)}%</div>
          </div>

          {/* Compact Phase Steps */}
          <div className="flex items-center gap-1">
            {phaseSteps.map((step, index) => {
              const Icon = step.icon;
              const isComplete = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;

              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      isComplete
                        ? 'bg-emerald-500/30 border border-emerald-500'
                        : isCurrent
                        ? 'bg-[#f48024]/30 border border-[#f48024]'
                        : 'bg-[#27272a] border border-[#3f3f46]'
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 size={12} className="text-emerald-400" />
                    ) : (
                      <Icon size={11} className={isCurrent ? 'text-[#f48024]' : 'text-[#52525b]'} />
                    )}
                  </div>
                  {index < phaseSteps.length - 1 && (
                    <div className={`h-0.5 flex-1 ${index < currentStepIndex ? 'bg-emerald-500' : 'bg-[#27272a]'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {/* Progress Bar */}
          <div className="mb-3">
            <div className="h-1.5 bg-[#27272a] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#f48024] to-[#f48024]/80 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
          {(elapsedSeconds !== null) && (
            <div className="mb-3 text-[10px] text-[#71717a]">
              Elapsed {formatDuration(elapsedSeconds)}
              {etaSeconds !== null && ` • ETA ${formatDuration(etaSeconds)}`}
            </div>
          )}

          {/* Current File */}
          {progress.currentFile && (
            <div className="mb-3 p-2.5 bg-[#121212] border border-[#27272a] rounded">
              <div className="text-[10px] text-[#71717a] uppercase font-semibold mb-1">Current File</div>
              <div className="text-[11px] text-white font-mono truncate" title={progress.currentFile}>
                {progress.currentFile.split('\\').pop()}
              </div>
            </div>
          )}

          {/* Backup Info - Compact */}
          {backup && phase === 'backing-up' && (
            <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded">
              <div className="flex items-center gap-2 mb-1">
                <FolderArchive size={12} className="text-purple-400" />
                <div className="text-[11px] text-purple-400 font-semibold">Dual Backups</div>
              </div>
              <div className="text-[10px] text-[#a1a1aa]">{backup.filesBackedUp} files backed up</div>
            </div>
          )}

          {/* Merge Job Info - Compact */}
          {merge && phase === 'merging' && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded">
              <div className="flex items-center gap-2 mb-1">
                <GitMerge size={12} className="text-amber-400" />
                <div className="text-[11px] text-amber-400 font-semibold">Merge Job</div>
              </div>
              <div className="text-[10px] text-[#a1a1aa] font-mono">{merge.jobId}</div>
              <div className="text-[10px] text-amber-300 mt-0.5">{merge.status}</div>
            </div>
          )}

          {/* Safety Notice for Deletion */}
          {phase === 'deleting' && (
            <div className="p-2.5 bg-green-500/10 border border-green-500/20 rounded">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-green-400" />
                <div className="text-[11px] text-green-400 font-semibold">Backups Verified ✓</div>
              </div>
            </div>
          )}

          {/* Processing */}
          <div className="text-center mt-3">
            <Loader2 size={16} className="text-[#f48024] animate-spin mx-auto mb-1.5" />
            <p className="text-[11px] text-[#71717a]">Please do not close this window...</p>
          </div>
        </div>
      </div>
    </div>
  );
};
