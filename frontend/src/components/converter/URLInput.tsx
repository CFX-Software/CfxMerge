import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { SubmitConversion } from '../../../wailsjs/go/main/App';

interface URLInputProps {
  onSubmitSuccess: () => void;
}

export const URLInput = ({ onSubmitSuccess }: URLInputProps) => {
  const [urlInput, setUrlInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const validateURL = (url: string): boolean => {
    const allowedPrefixes = [
      'https://www.gta5-mods.com/vehicles',
      'https://www.gta5-mods.com/weapons',
      'https://www.gta5-mods.com/maps',
      'https://www.gta5-mods.com/player',
    ];
    return allowedPrefixes.some(prefix => url.startsWith(prefix));
  };

  const handleSubmit = async () => {
    setError('');

    const urls = urlInput
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.length > 0);

    if (urls.length === 0) {
      setError('Please enter at least one URL');
      return;
    }

    // Validate URLs
    const invalidURLs = urls.filter(url => !validateURL(url));
    if (invalidURLs.length > 0) {
      setError(`Invalid URLs found. Only supported: vehicles, weapons, maps, and player from gta5-mods.com (${invalidURLs.length} invalid)`);
      return;
    }

    setIsSubmitting(true);

    try {
      await SubmitConversion(urls);
      setUrlInput('');
      onSubmitSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit conversion');
    } finally {
      setIsSubmitting(false);
    }
  };

  const urlCount = urlInput.split('\n').filter(u => u.trim().length > 0).length;

  return (
    <div className="p-6 rounded-lg border border-[#333] bg-[#222]">
      <div className="flex items-center gap-2 mb-4">
        <Link2 size={18} className="text-[#f48024]" />
        <h3 className="text-[16px] font-semibold text-white">Paste URLs</h3>
      </div>

      <p className="text-[12px] text-[#666] mb-3">
        Enter GTA5-Mods URLs (one per line). Supported: vehicles, weapons, maps, player. We'll process in batches of 20.
      </p>

      <textarea
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        placeholder="https://www.gta5-mods.com/vehicles/example-car&#10;https://www.gta5-mods.com/weapons/example-gun&#10;https://www.gta5-mods.com/maps/example-map"
        className="w-full h-32 px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded text-[13px] text-white placeholder:text-[#555] focus:border-[#f48024] focus:ring-1 focus:ring-[#f48024] outline-none resize-none font-mono"
        disabled={isSubmitting}
      />

      {error && (
        <div className="mt-3 p-3 rounded bg-red-500/10 border border-red-500/20">
          <p className="text-[12px] text-red-400">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <p className="text-[12px] text-[#666]">
          {urlCount > 0 ? `${urlCount} URL${urlCount !== 1 ? 's' : ''} ready` : 'No URLs entered'}
        </p>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || urlCount === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#f48024] hover:bg-[#f48024]/90 disabled:bg-[#333] disabled:text-[#666] disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded transition-colors"
        >
          {isSubmitting && <Loader2 size={14} className="animate-spin" />}
          {isSubmitting ? 'Submitting...' : 'Convert to FiveM'}
        </button>
      </div>
    </div>
  );
};
