import { useState } from 'react';
import { ChevronDown, File, Check } from 'lucide-react';

interface DuplicateCardProps {
  name: string;
  status: 'ready' | 'warning' | 'error' | 'identical';
  warningCount?: number;
  files?: string[];
  selected?: boolean;
  onToggle?: () => void;
}

export const DuplicateCard = ({
  name,
  status,
  warningCount = 0,
  files = [],
  selected = false,
  onToggle,
}: DuplicateCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    ready: { text: 'Ready to merge', color: 'text-fivem', bg: 'bg-fivem/10', border: 'border-fivem/20' },
    warning: { text: `Has warnings (${warningCount})`, color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
    error: { text: 'Error', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
    identical: { text: 'Identical files - blocked', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  };

  const config = statusConfig[status];

  return (
    <div className="group bg-surfaceLight/30 border border-white/5 rounded-2xl p-4 transition-all duration-200 hover:border-white/10 hover:bg-surfaceLight/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Checkbox */}
          <button
            onClick={onToggle}
            className={`flex-shrink-0 w-5 h-5 rounded border transition-all duration-200 flex items-center justify-center ${
              selected
                ? 'bg-fivem border-fivem'
                : 'border-white/20 hover:border-white/40'
            }`}
          >
            {selected && <Check size={14} strokeWidth={3} className="text-black" />}
          </button>

          {/* File Icon */}
          <div className="flex-shrink-0 p-2 bg-white/5 rounded-lg border border-white/5">
            <File size={14} className="text-secondary" strokeWidth={2} />
          </div>

          {/* File Name */}
          <span className="font-mono text-[13px] text-white font-medium truncate">
            {name}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <div className={`px-3 py-1.5 rounded-full ${config.bg} ${config.border} border flex items-center gap-1.5`}>
            <div className={`w-1.5 h-1.5 rounded-full ${config.color.replace('text-', 'bg-')}`} />
            <span className={`text-[11px] font-medium ${config.color}`}>
              {config.text}
            </span>
          </div>

          {/* Expand Button */}
          {files.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-secondary hover:text-white transition-colors"
            >
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Files */}
      {expanded && files.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
          {files.map((file, index) => (
            <div key={index} className="flex items-center gap-2 text-[12px] text-secondary font-mono pl-8">
              <File size={12} className="flex-shrink-0" />
              <span className="truncate">{file}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
