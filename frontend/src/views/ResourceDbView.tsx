import { useState, useEffect } from 'react';
import { ArchiveRestore, FolderOpen, RefreshCw } from 'lucide-react';
import { ListBackups, RestoreBackup, OpenFileLocation } from '../../wailsjs/go/main/App';
import { main } from '../../wailsjs/go/models';

export const ResourceDbView = () => {
  const [backups, setBackups] = useState<main.BackupSummary[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<main.BackupSummary | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult, setRestoreResult] = useState<main.RestoreResult | null>(null);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      const items = await ListBackups();
      setBackups(items);
      setBackupsError(null);
    } catch (err: any) {
      console.error('Failed to load backups:', err);
      setBackupsError(err?.message || 'Failed to load backups');
    } finally {
      setBackupsLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatTimestamp = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;
    setRestoreLoading(true);
    setRestoreResult(null);
    try {
      const result = await RestoreBackup(selectedBackup.path);
      setRestoreResult(result);
      await loadBackups();
      setSelectedBackup(null);
    } catch (err: any) {
      console.error('Restore failed:', err);
      setRestoreResult({
        backupPath: selectedBackup.path,
        filesRestored: 0,
        filesMissing: 0,
        errors: [err?.message || 'Restore failed'],
        success: false
      });
      setSelectedBackup(null);
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleOpenBackup = async (backupPath: string) => {
    try {
      await OpenFileLocation(backupPath);
    } catch (err) {
      console.error('Failed to open backup folder:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#1a1a1a] text-[#fafafa]">
      <div className="border-b border-[#2a2a2a] px-8 py-6">
        <h1 className="text-[24px] font-semibold text-white mb-1">Merge Backups</h1>
        <p className="text-[13px] text-[#888]">Restore backups from .cfxmerge\backups</p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="p-6 rounded-lg border border-[#333] bg-[#222]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ArchiveRestore size={20} className="text-[#f48024]" />
                <h2 className="text-[16px] font-semibold text-white">Backup Restore</h2>
              </div>
              <button
                onClick={loadBackups}
                disabled={backupsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#27272a] hover:bg-[#3f3f46] text-white text-[11px] font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={12} className={backupsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {backupsLoading ? (
              <div className="text-[12px] text-[#888]">Loading backups...</div>
            ) : backupsError ? (
              <div className="text-[12px] text-red-400">{backupsError}</div>
            ) : backups.length === 0 ? (
              <div className="text-[12px] text-[#888]">No backups found in .cfxmerge\backups</div>
            ) : (
              <div className="space-y-3">
                {backups.map(backup => (
                  <div key={backup.path} className="p-4 rounded border border-[#2a2a2a] bg-[#1f1f1f]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] text-white font-medium truncate" title={backup.path}>{backup.name}</div>
                        <div className="text-[11px] text-[#888] mt-1">
                          {formatTimestamp(backup.backupTimestamp)} • {backup.totalFiles} files • {formatBytes(backup.totalSize)}
                        </div>
                        <div className="text-[10px] text-[#666] mt-1 truncate" title={backup.scannedFolder}>
                          {backup.scannedFolder}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenBackup(backup.path)}
                          className="px-3 py-1.5 text-[11px] bg-[#27272a] hover:bg-[#3f3f46] text-white rounded transition-colors flex items-center gap-1.5"
                        >
                          <FolderOpen size={12} />
                          Open
                        </button>
                        <button
                          onClick={() => {
                            setSelectedBackup(backup);
                            setRestoreResult(null);
                          }}
                          className="px-3 py-1.5 text-[11px] bg-[#f48024]/20 hover:bg-[#f48024]/30 text-[#f48024] rounded transition-colors flex items-center gap-1.5"
                        >
                          <ArchiveRestore size={12} />
                          Restore
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedBackup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#222] border border-[#333] rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-[18px] font-semibold text-white mb-2">Restore Backup</h3>
            <p className="text-[12px] text-[#888] mb-4">
              This will restore files to their original locations using manifest.json.
            </p>
            <div className="text-[11px] text-[#aaa] mb-4 space-y-1">
              <div><span className="text-white">Backup:</span> {selectedBackup.name}</div>
              <div><span className="text-white">Date:</span> {formatTimestamp(selectedBackup.backupTimestamp)}</div>
              <div><span className="text-white">Files:</span> {selectedBackup.totalFiles}</div>
              <div><span className="text-white">Size:</span> {formatBytes(selectedBackup.totalSize)}</div>
            </div>

            {restoreResult && (
              <div className={`mb-4 p-3 rounded border ${restoreResult.success ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                <div className="text-[12px] font-semibold mb-1">
                  {restoreResult.success ? 'Restore complete' : 'Restore finished with errors'}
                </div>
                <div className="text-[11px]">
                  Restored {restoreResult.filesRestored} files
                  {restoreResult.filesMissing > 0 && `, ${restoreResult.filesMissing} missing`}
                </div>
                {restoreResult.errors.length > 0 && (
                  <div className="text-[10px] mt-2 max-h-24 overflow-auto">
                    {restoreResult.errors.map((err, idx) => (
                      <div key={idx}>{err}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedBackup(null)}
                disabled={restoreLoading}
                className="flex-1 px-4 py-2 bg-[#333] hover:bg-[#444] text-white text-[13px] font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Close
              </button>
              <button
                onClick={handleRestoreBackup}
                disabled={restoreLoading}
                className="flex-1 px-4 py-2 bg-[#f48024]/20 hover:bg-[#f48024]/30 border border-[#f48024]/20 text-[#f48024] text-[13px] font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {restoreLoading ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
