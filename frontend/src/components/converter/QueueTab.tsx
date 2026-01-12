import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ConversionJob } from '../../types/converter';
import { GetAllConversionJobs } from '../../../wailsjs/go/main/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import { JobCard } from './JobCard';
import { URLInput } from './URLInput';
import completedSound from '../../assets/completed.wav';

export const QueueTab = () => {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobs();

    // Listen for progress updates
    const unsubProgress = EventsOn('converter:progress', () => {
      loadJobs();
    });

    // Listen for job submissions
    const unsubSubmit = EventsOn('converter:job_submitted', () => {
      loadJobs();
    });

    // Listen for job cancellations
    const unsubCancel = EventsOn('converter:job_cancelled', () => {
      loadJobs();
    });

    // Listen for completion sound
    const unsubSound = EventsOn('converter:play_sound', () => {
      const audio = new Audio(completedSound);
      audio.play().catch(() => {
        // Silently fail if audio doesn't exist
      });
    });

    // Listen for notifications
    const unsubNotification = EventsOn('converter:show_notification', (data: any) => {
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(data.title, { body: data.message });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              new Notification(data.title, { body: data.message });
            }
          });
        }
      }
    });

    return () => {
      unsubProgress();
      unsubSubmit();
      unsubCancel();
      unsubSound();
      unsubNotification();
    };
  }, []);

  const loadJobs = async () => {
    try {
      const allJobs = await GetAllConversionJobs();
      // Filter to only show active jobs (pending, processing)
      const activeJobs = allJobs.filter(
        (j: ConversionJob) => j.Status === 'pending' || j.Status === 'processing'
      );
      setJobs(activeJobs);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      {/* URL Input */}
      <URLInput onSubmitSuccess={loadJobs} />

      {/* Active Jobs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-semibold text-white">
            Active Jobs ({jobs.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="text-[#666] animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center rounded-lg border border-dashed border-[#333]">
            <p className="text-[14px] text-[#666]">No active jobs</p>
            <p className="text-[12px] text-[#555] mt-2">
              Paste some URLs above to start converting
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard key={job.ID} job={job} onUpdate={loadJobs} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
