import { Folder } from 'lucide-react';

export const EmptyState = () => {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
        <Folder size={48} className="text-secondary/50" strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-medium text-white mb-1">No duplicates detected</h3>
        <p className="text-sm text-secondary">
          Select a directory to scan for duplicate resources
        </p>
      </div>
    </div>
  );
};
