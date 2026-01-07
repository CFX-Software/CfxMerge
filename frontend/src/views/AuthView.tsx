import { useState } from 'react';
import { Key, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { SaveAPIKey } from '../../wailsjs/go/main/App';

interface AuthViewProps {
  onAuthSuccess: () => void;
}

export const AuthView = ({ onAuthSuccess }: AuthViewProps) => {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await SaveAPIKey(apiKey);
      setSuccess(true);
      setTimeout(() => {
        onAuthSuccess();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Invalid API key');
    } finally {
      setLoading(false);
    }
  };

  const openDashboard = () => {
    window.open('https://cfx.software/dashboard/api-keys', '_blank');
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-[#1a1a1a] px-12">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-[#f48024]/10 border-2 border-[#f48024]/20 flex items-center justify-center mx-auto mb-4">
            <Key size={32} className="text-[#f48024]" />
          </div>
          <h1 className="text-[24px] font-semibold text-white">Authentication Required</h1>
          <p className="text-[13px] text-[#888]">
            Enter your CFX.software API key to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#aaa] mb-2">
              API Key
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="cfxm-xxxx-xxxx-xxxx-xxxx"
              className="w-full bg-[#222] border border-[#333] rounded px-4 py-3 text-[13px] text-white placeholder:text-[#666] focus:border-[#f48024] focus:ring-1 focus:ring-[#f48024] outline-none transition-colors font-mono"
              disabled={loading}
              required
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded bg-red-500/10 border border-red-500/20">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 p-3 rounded bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-emerald-400">Successfully authenticated!</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey}
            className="w-full px-6 py-3 bg-[#f48024] hover:bg-[#f48024]/90 disabled:bg-[#333] disabled:text-[#666] disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded transition-colors"
          >
            {loading ? 'Validating...' : 'Authenticate'}
          </button>
        </form>

        <div className="pt-4 border-t border-[#333]">
          <button
            onClick={openDashboard}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#252525] hover:bg-[#2a2a2a] border border-[#333] text-white text-[12px] font-medium rounded transition-colors"
          >
            <span>Get API Key</span>
            <ExternalLink size={14} />
          </button>
          <p className="text-center text-[11px] text-[#666] mt-3">
            Don't have an account?{' '}
            <button
              onClick={() => window.open('https://cfx.software/auth/signin', '_blank')}
              className="text-[#f48024] hover:underline"
            >
              Sign up for free
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
