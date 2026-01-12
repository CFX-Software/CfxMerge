import { X, Clock, CheckCircle2, XCircle, Loader2, RotateCw } from 'lucide-react';
import { ConversionJob } from '../../types/converter';
import { CancelConversionJob, RetryConversionJob } from '../../../wailsjs/go/main/App';

interface JobCardProps {
  job: ConversionJob;
  onUpdate: () => void;
}

export const JobCard = ({ job, onUpdate }: JobCardProps) => {
  const handleCancel = async () => {
    try {
      await CancelConversionJob(job.ID);
      onUpdate();
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  const handleRetry = async () => {
    try {
      await RetryConversionJob(job.ID);
      onUpdate();
    } catch (err) {
      console.error('Retry failed:', err);
    }
  };

  const getStatusColor = () => {
    switch (job.Status) {
      case 'completed':
        return 'text-emerald-400';
      case 'failed':
        return 'text-red-400';
      case 'processing':
        return 'text-blue-400';
      case 'cancelled':
        return 'text-yellow-400';
      default:
        return 'text-[#666]';
    }
  };

  const getStatusIcon = () => {
    switch (job.Status) {
      case 'completed':
        return <CheckCircle2 size={16} className="text-emerald-400" />;
      case 'failed':
        return <XCircle size={16} className="text-red-400" />;
      case 'processing':
        return <Loader2 size={16} className="text-blue-400 animate-spin" />;
      case 'cancelled':
        return <XCircle size={16} className="text-yellow-400" />;
      default:
        return <Clock size={16} className="text-[#666]" />;
    }
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="p-4 rounded-lg border border-[#333] bg-[#222] hover:border-[#444] transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <div>
            <h4 className={`text-[14px] font-semibold ${getStatusColor()}`}>
              {job.Status.charAt(0).toUpperCase() + job.Status.slice(1)}
            </h4>
            <p className="text-[11px] text-[#666]">{formatTime(job.CreatedAt)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {job.Status === 'failed' && (
            <button
              onClick={handleRetry}
              className="p-1.5 hover:bg-[#333] rounded transition-colors"
              title="Retry job"
            >
              <RotateCw size={14} className="text-[#888]" />
            </button>
          )}
          {(job.Status === 'pending' || job.Status === 'processing') && (
            <button
              onClick={handleCancel}
              className="p-1.5 hover:bg-[#333] rounded transition-colors"
              title="Cancel job"
            >
              <X size={14} className="text-[#888]" />
            </button>
          )}
        </div>
      </div>

      {job.StatusMessage && (
        <p className="text-[12px] text-[#888] mb-3">{job.StatusMessage}</p>
      )}

      {/* Progress bar */}
      {job.Status === 'processing' && (
        <div className="mb-3">
          <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#f48024] transition-all duration-300"
              style={{ width: `${job.Progress}%` }}
            />
          </div>
          <p className="text-[11px] text-[#666] mt-1">{job.Progress}%</p>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-[11px]">
        <span className="text-[#666]">
          Total: <span className="text-white font-medium">{job.TotalURLs}</span>
        </span>
        {job.SuccessfulCount > 0 && (
          <span className="text-[#666]">
            Success: <span className="text-emerald-400 font-medium">{job.SuccessfulCount}</span>
          </span>
        )}
        {job.FailedCount > 0 && (
          <span className="text-[#666]">
            Failed: <span className="text-red-400 font-medium">{job.FailedCount}</span>
          </span>
        )}
      </div>

      {job.ErrorMessage && (
        <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20">
          <p className="text-[11px] text-red-400">{job.ErrorMessage}</p>
        </div>
      )}
    </div>
  );
};
