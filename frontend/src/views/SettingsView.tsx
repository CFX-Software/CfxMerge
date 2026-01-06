import { useState } from 'react';
import { Key, Crown, Infinity, Shield, Zap, FolderSync, Download } from 'lucide-react';

export const SettingsView = () => {
  const [apiKey, setApiKey] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = () => {
    if (apiKey.startsWith('cfxm-')) {
      setIsVerifying(true);
      setTimeout(() => {
        setIsVerified(true);
        setIsVerifying(false);
      }, 1000);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#1a1a1a] text-[#fafafa]">
      {/* Header */}
      <div className="border-b border-[#2a2a2a] px-8 py-6">
        <h1 className="text-[24px] font-semibold text-white mb-1">Settings</h1>
        <p className="text-[13px] text-[#888]">Configure your CFX Merge application</p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* API Key Section */}
          {!isVerified ? (
            <div className="p-6 rounded-lg border border-[#333] bg-[#222]">
              <div className="flex items-center gap-3 mb-4">
                <Key size={20} className="text-[#f48024]" />
                <h2 className="text-[16px] font-semibold text-white">API Authentication</h2>
              </div>
              <p className="text-[12px] text-[#888] mb-4">
                Enter your CFX Merge API key to unlock premium features
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="cfxm-xxxx-xxxx-xxxx-xxxx"
                  className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-4 py-3 text-[13px] text-white placeholder:text-[#555] focus:border-[#f48024] outline-none transition-colors font-mono"
                />
                <button
                  onClick={handleVerify}
                  disabled={!apiKey.startsWith('cfxm-') || isVerifying}
                  className="px-6 py-3 bg-[#f48024] hover:bg-[#f48024]/90 disabled:bg-[#333] disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded transition-colors"
                >
                  {isVerifying ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </div>
          ) : (
            /* User Profile Card - Animated */
            <div className="p-6 rounded-lg border border-[#f48024]/20 bg-gradient-to-br from-[#f48024]/5 to-transparent animate-in fade-in slide-in-from-top duration-500">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-[#f48024]/10 border border-[#f48024]/20 flex items-center justify-center">
                    <Crown size={28} className="text-[#f48024]" />
                  </div>
                  <div>
                    <h2 className="text-[20px] font-semibold text-white mb-1">Vexoa</h2>
                    <div className="flex items-center gap-2">
                      <Shield size={14} className="text-emerald-500" />
                      <span className="text-[12px] text-emerald-400 font-medium">Premium Account</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsVerified(false)}
                  className="text-[11px] text-[#666] hover:text-[#aaa] transition-colors"
                >
                  Disconnect
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded bg-[#222] border border-[#333]">
                  <div className="flex items-center gap-2 mb-1">
                    <Infinity size={16} className="text-[#f48024]" />
                    <span className="text-[11px] text-[#666] uppercase tracking-wider">Credits</span>
                  </div>
                  <p className="text-[18px] font-semibold text-white">Unlimited</p>
                </div>
                <div className="p-4 rounded bg-[#222] border border-[#333]">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={16} className="text-emerald-500" />
                    <span className="text-[11px] text-[#666] uppercase tracking-wider">Conversions</span>
                  </div>
                  <p className="text-[18px] font-semibold text-white">10,952</p>
                </div>
                <div className="p-4 rounded bg-[#222] border border-[#333]">
                  <div className="flex items-center gap-2 mb-1">
                    <Download size={16} className="text-blue-500" />
                    <span className="text-[11px] text-[#666] uppercase tracking-wider">Downloads</span>
                  </div>
                  <p className="text-[18px] font-semibold text-white">2,341</p>
                </div>
              </div>
            </div>
          )}

          {/* Merger Settings */}
          <div className="p-6 rounded-lg border border-[#333] bg-[#222]">
            <div className="flex items-center gap-3 mb-4">
              <FolderSync size={20} className="text-[#f48024]" />
              <h2 className="text-[16px] font-semibold text-white">Merger Settings</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-white font-medium">Auto-resolve conflicts</p>
                  <p className="text-[11px] text-[#666]">Automatically merge compatible duplicates</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024]"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-white font-medium">Create backups</p>
                  <p className="text-[11px] text-[#666]">Backup files before merging</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024]"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-white font-medium">Show file previews</p>
                  <p className="text-[11px] text-[#666]">Display file contents before merging</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024]"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Converter Settings */}
          <div className="p-6 rounded-lg border border-[#333] bg-[#222]">
            <div className="flex items-center gap-3 mb-4">
              <Zap size={20} className="text-[#f48024]" />
              <h2 className="text-[16px] font-semibold text-white">Converter Settings</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-white font-medium">Auto-optimize resources</p>
                  <p className="text-[11px] text-[#666]">Automatically compress and optimize converted files</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024]"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-white font-medium">Keep original files</p>
                  <p className="text-[11px] text-[#666]">Preserve original files after conversion</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024]"></div>
                </label>
              </div>
              <div>
                <label className="text-[13px] text-white font-medium block mb-2">Download directory</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value="C:\Users\Vexoa\Downloads\CFX"
                    readOnly
                    className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-[12px] text-[#aaa] font-mono"
                  />
                  <button className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white text-[12px] font-medium rounded transition-colors">
                    Change
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Application Settings */}
          <div className="p-6 rounded-lg border border-[#333] bg-[#222]">
            <h2 className="text-[16px] font-semibold text-white mb-4">Application</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-white font-medium">Hardware acceleration</p>
                  <p className="text-[11px] text-[#666]">Use GPU for faster processing</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024]"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-white font-medium">Launch on startup</p>
                  <p className="text-[11px] text-[#666]">Start CFX Merge when Windows starts</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024]"></div>
                </label>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
