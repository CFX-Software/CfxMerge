import { Download, Check, X, Clock, AlertCircle, FolderOpen, Link2 } from 'lucide-react';
import { ConversionResult } from '../../types/converter';
import { DownloadConversionResult, GetFiveMResourcesPath, OpenFileLocation, SelectDownloadFolder } from '../../../wailsjs/go/main/App';
import { useState, useEffect } from 'react';
import { EventsOn } from '../../../wailsjs/runtime/runtime';

interface ResultCardProps {
  result: ConversionResult;
  onDownload: () => void;
}

export const ResultCard = ({ result, onDownload }: ResultCardProps) => {
  const [downloading, setDownloading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (result.ExpiresAt) {
      const updateTimer = () => {
        const now = Date.now();
        const timeLeft = result.ExpiresAt - now; // ExpiresAt is already in milliseconds

        if (timeLeft <= 0) {
          setTimeRemaining('Expired');
          return;
        }

        const totalSeconds = Math.floor(timeLeft / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        if (hours > 24) {
          const days = Math.floor(hours / 24);
          setTimeRemaining(`${days}d ${hours % 24}h`);
        } else if (hours > 0) {
          setTimeRemaining(`${hours}h ${minutes}m`);
        } else {
          setTimeRemaining(`${minutes}m`);
        }
      };

      updateTimer();
      const interval = setInterval(updateTimer, 60000); // Update every minute

      return () => clearInterval(interval);
    }
  }, [result.ExpiresAt]);

  useEffect(() => {
    // Listen for download completion
    const unsubDownload = EventsOn('converter:download_complete', (completedID: string) => {
      if (completedID === result.ID) {
        setDownloading(false);
        onDownload();
      }
    });

    return () => {
      unsubDownload();
    };
  }, [result.ID, onDownload]);

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      // Check if FiveM path is set
      const fivemPath = await GetFiveMResourcesPath();
      let downloadPath = fivemPath;

      // If no FiveM path, prompt user to select download location
      if (!downloadPath) {
        downloadPath = await SelectDownloadFolder();
        if (!downloadPath) {
          setDownloading(false);
          return; // User cancelled
        }
      }

      await DownloadConversionResult(result.ID, downloadPath);
      // Don't call onDownload here - wait for event
    } catch (err) {
      setDownloading(false);
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleCopyLink = async () => {
    if (result.DownloadURL) {
      try {
        await navigator.clipboard.writeText(result.DownloadURL);
        setSuccess('Link copied!');
        setTimeout(() => setSuccess(''), 2000);
      } catch (err) {
        setError('Failed to copy link');
      }
    }
  };

  const handleOpenFolder = async () => {
    if (result.LocalPath) {
      try {
        await OpenFileLocation(result.LocalPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open folder');
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return null;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const isExpired = timeRemaining === 'Expired';

  // Handle failed status
  const isFailed = result.Status === 'failed' || (result.Status !== 'completed' && result.Status !== 'success');

  if (isFailed) {
    return (
      <div className="p-3 rounded border border-red-500/20 bg-red-500/5 flex items-start gap-3">
        <X size={16} className="text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-white font-medium truncate">{result.ResourceName}</p>
          <p className="text-[11px] text-red-400 mt-1">{result.ErrorMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg border border-[#333] bg-[#1a1a1a] hover:border-[#444] transition-colors">
      <div className="flex items-start gap-3">
        <Check size={16} className="text-emerald-400 shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-white font-medium truncate">{result.ResourceName}</p>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[#666]">
            {formatFileSize(result.FileSize) && <span>{formatFileSize(result.FileSize)}</span>}
            {timeRemaining && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {timeRemaining}
              </span>
            )}
            {result.Extracted && (
              <span className="text-emerald-400 font-medium">✓ Extracted to FiveM</span>
            )}
            {result.Downloaded && !result.Extracted && (
              <span className="text-blue-400 font-medium">✓ Downloaded to Temp</span>
            )}
          </div>
          {error && (
            <div className="flex items-center gap-1 mt-1.5 text-[11px] text-red-400">
              <AlertCircle size={10} />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-1 mt-1.5 text-[11px] text-emerald-400">
              <Check size={10} />
              {success}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isExpired ? (
            <span className="text-[11px] text-red-400 font-medium">Files expired - available for 24h only</span>
          ) : (
            <>
              {/* Always show Copy Link */}
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#666]/10 hover:bg-[#666]/20 border border-[#666]/20 text-[#999] text-[11px] font-medium rounded transition-colors"
                title="Copy download link"
              >
                <Link2 size={12} />
                Copy Link
              </button>

              {/* Download/Redownload button */}
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f48024]/10 hover:bg-[#f48024]/20 border border-[#f48024]/20 text-[#f48024] text-[11px] font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={12} />
                {downloading ? 'Downloading...' : result.Downloaded ? 'Re-download' : 'Download'}
              </button>

              {/* Open Folder button (only when downloaded) */}
              {result.Downloaded && result.LocalPath && (
                <button
                  onClick={handleOpenFolder}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-[11px] font-medium rounded transition-colors"
                >
                  <FolderOpen size={12} />
                  Open Folder
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
