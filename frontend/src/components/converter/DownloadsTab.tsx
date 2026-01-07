import { useState, useEffect } from 'react';
import { Loader2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { ConversionJob, ConversionResult } from '../../types/converter';
import { GetAllConversionJobs, GetJobResults, DeleteConversionJob } from '../../../wailsjs/go/main/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import { ResultCard } from './ResultCard';

interface JobWithResults {
  job: ConversionJob;
  results: ConversionResult[];
  expanded: boolean;
}

export const DownloadsTab = () => {
  const [jobsWithResults, setJobsWithResults] = useState<JobWithResults[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompletedJobs();

    // Listen for download complete
    const unsubDownload = EventsOn('converter:download_complete', () => {
      loadCompletedJobs();
    });

    // Listen for progress updates (in case a job completes)
    const unsubProgress = EventsOn('converter:progress', () => {
      loadCompletedJobs();
    });

    return () => {
      unsubDownload();
      unsubProgress();
    };
  }, []);

  const loadCompletedJobs = async () => {
    try {
      const allJobs = await GetAllConversionJobs();
      // Filter to only completed/failed jobs
      const completedJobs = allJobs.filter(
        (j: ConversionJob) => j.Status === 'completed' || j.Status === 'failed'
      );

      // Load results for each job
      const jobsWithRes: JobWithResults[] = [];
      for (const job of completedJobs) {
        try {
          const results = await GetJobResults(job.ID);
          jobsWithRes.push({
            job,
            results: results || [],
            expanded: true
          });
        } catch (err) {
          console.error(`Failed to load results for job ${job.ID}:`, err);
        }
      }

      setJobsWithResults(jobsWithRes);
    } catch (err) {
      console.error('Failed to load completed jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (jobId: string) => {
    setJobsWithResults(prev =>
      prev.map(item =>
        item.job.ID === jobId ? { ...item, expanded: !item.expanded } : item
      )
    );
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Delete this conversion job and all its results?')) return;

    try {
      await DeleteConversionJob(jobId);
      loadCompletedJobs();
    } catch (err) {
      console.error('Failed to delete job:', err);
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
    <div className="flex-1 overflow-y-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[16px] font-semibold text-white">
          Downloads ({jobsWithResults.length})
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="text-[#666] animate-spin" />
        </div>
      ) : jobsWithResults.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-[#333]">
          <p className="text-[14px] text-[#666]">No completed conversions</p>
          <p className="text-[12px] text-[#555] mt-2">
            Completed jobs will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobsWithResults.map(({ job, results, expanded }) => (
            <div key={job.ID} className="rounded-lg border border-[#333] bg-[#222]">
              {/* Job Header */}
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#252525] transition-colors"
                onClick={() => toggleExpand(job.ID)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h4 className="text-[14px] font-semibold text-white">
                      {job.Status === 'completed' ? '✓ Completed' : '✗ Failed'}
                    </h4>
                    <span className="text-[11px] text-[#666]">{formatTime(job.CompletedAt)}</span>
                  </div>
                  <p className="text-[12px] text-[#888] mt-1">
                    {job.SuccessfulCount}/{job.TotalURLs} successful
                    {job.FailedCount > 0 && ` • ${job.FailedCount} failed`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteJob(job.ID);
                    }}
                    className="p-1.5 hover:bg-[#333] rounded transition-colors"
                    title="Delete job"
                  >
                    <Trash2 size={14} className="text-[#888]" />
                  </button>
                  {expanded ? (
                    <ChevronUp size={16} className="text-[#666]" />
                  ) : (
                    <ChevronDown size={16} className="text-[#666]" />
                  )}
                </div>
              </div>

              {/* Results List */}
              {expanded && results.length > 0 && (
                <div className="p-4 pt-0 space-y-2">
                  {results.map((result) => (
                    <ResultCard
                      key={result.ID}
                      result={result}
                      onDownload={loadCompletedJobs}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
