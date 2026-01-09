import { useState, useEffect } from 'react';
import { Crown, Infinity, Shield, Zap, Download, LogOut, RefreshCw, FolderSync } from 'lucide-react';
import { GetAuthStatus, Logout, GetSettings, SetHardwareAcceleration, SetLaunchOnStartup } from '../../wailsjs/go/main/App';
import { main } from '../../wailsjs/go/models';

export const SettingsView = () => {
  const [authData, setAuthData] = useState<main.AuthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [hardwareAcceleration, setHardwareAcceleration] = useState(true);
  const [launchOnStartup, setLaunchOnStartup] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

  useEffect(() => {
    loadAuthStatus();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await GetSettings();
      setHardwareAcceleration(settings.hardwareAcceleration);
      setLaunchOnStartup(settings.launchOnStartup);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Cooldown timer
  useEffect(() => {
    if (!lastRefresh) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastRefresh;
      const remaining = COOLDOWN_MS - elapsed;

      if (remaining <= 0) {
        setCooldownRemaining(0);
        clearInterval(interval);
      } else {
        setCooldownRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastRefresh]);

  const loadAuthStatus = async () => {
    try {
      const data = await GetAuthStatus();
      setAuthData(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load auth status:', err);
      setError(err?.message || 'Failed to load user data');
      setAuthData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (cooldownRemaining > 0) return;

    setRefreshing(true);
    try {
      const data = await GetAuthStatus();
      setAuthData(data);
      setLastRefresh(Date.now());
    } catch (err) {
      console.error('Failed to refresh auth status:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const formatCooldown = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const canRefresh = cooldownRemaining === 0 && !refreshing;

  const handleLogout = async () => {
    try {
      await Logout();
      window.location.reload();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleHardwareAccelerationToggle = async () => {
    const newValue = !hardwareAcceleration;
    try {
      await SetHardwareAcceleration(newValue);
      setHardwareAcceleration(newValue);
    } catch (err) {
      console.error('Failed to set hardware acceleration:', err);
    }
  };

  const handleLaunchOnStartupToggle = async () => {
    const newValue = !launchOnStartup;
    try {
      await SetLaunchOnStartup(newValue);
      setLaunchOnStartup(newValue);
    } catch (err) {
      console.error('Failed to set launch on startup:', err);
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

          {/* User Profile Card */}
          {loading ? (
            <div className="p-6 rounded-lg border border-[#333] bg-[#222] flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-[#333] border-t-[#f48024] rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 rounded-lg border border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <Shield size={24} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-white mb-1">Authentication Failed</h3>
                  <p className="text-[12px] text-red-400">{error}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={loadAuthStatus}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#f48024]/10 hover:bg-[#f48024]/20 border border-[#f48024]/20 text-[#f48024] text-[12px] font-medium rounded transition-colors"
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[12px] font-medium rounded transition-colors"
                >
                  <LogOut size={14} />
                  Logout & Re-login
                </button>
              </div>
            </div>
          ) : authData ? (
            <div className={`p-6 rounded-lg border border-[#f48024]/20 bg-gradient-to-br from-[#f48024]/5 to-transparent transition-all duration-500 ${refreshing ? 'scale-[0.99] opacity-90' : 'scale-100 opacity-100'}`}>
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  {authData.user.image ? (
                    <img
                      src={authData.user.image}
                      alt={authData.user.name}
                      className={`w-16 h-16 rounded-lg border border-[#f48024]/20 transition-all duration-500 ${refreshing ? 'animate-pulse' : ''}`}
                    />
                  ) : (
                    <div className={`w-16 h-16 rounded-lg bg-[#f48024]/10 border border-[#f48024]/20 flex items-center justify-center transition-all duration-500 ${refreshing ? 'animate-pulse' : ''}`}>
                      <Crown size={28} className="text-[#f48024]" />
                    </div>
                  )}
                  <div>
                    <h2 className={`text-[20px] font-semibold text-white mb-1 transition-all duration-300 ${refreshing ? 'opacity-70' : 'opacity-100'}`}>{authData.user.name}</h2>
                    <div className="flex items-center gap-2">
                      <Shield size={14} className={authData.stats.isPremium ? 'text-emerald-500' : 'text-[#666]'} />
                      <span className={`text-[12px] font-medium transition-all duration-300 ${refreshing ? 'opacity-70' : 'opacity-100'} ${authData.stats.isPremium ? 'text-emerald-400' : 'text-[#888]'}`}>
                        {authData.stats.accountTier.charAt(0).toUpperCase() + authData.stats.accountTier.slice(1)} Account
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={!canRefresh}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border text-[11px] font-medium rounded transition-all duration-300 ${
                      canRefresh
                        ? 'bg-[#f48024]/10 hover:bg-[#f48024]/20 border-[#f48024]/20 text-[#f48024] hover:scale-105'
                        : 'bg-[#333]/50 border-[#444] text-[#666] cursor-not-allowed'
                    }`}
                    title={cooldownRemaining > 0 ? `Available in ${formatCooldown(cooldownRemaining)}` : 'Refresh user data'}
                  >
                    <RefreshCw size={12} className={refreshing ? 'animate-spin' : cooldownRemaining > 0 ? 'opacity-50' : ''} />
                    {refreshing ? 'Refreshing...' : cooldownRemaining > 0 ? formatCooldown(cooldownRemaining) : 'Refresh'}
                  </button>
                  <button
                    onClick={() => setShowLogoutModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[11px] font-medium rounded transition-all duration-300 hover:scale-105"
                  >
                    <LogOut size={12} />
                    Logout
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className={`p-4 rounded bg-[#222] border border-[#333] transition-all duration-500 ${refreshing ? 'animate-pulse' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Infinity size={16} className="text-[#f48024]" />
                    <span className="text-[11px] text-[#666] uppercase tracking-wider">Credits</span>
                  </div>
                  <p className="text-[18px] font-semibold text-white transition-all duration-300">{authData.stats.credits}</p>
                </div>
                <div className={`p-4 rounded bg-[#222] border border-[#333] transition-all duration-500 ${refreshing ? 'animate-pulse' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={16} className="text-emerald-500" />
                    <span className="text-[11px] text-[#666] uppercase tracking-wider">Conversions</span>
                  </div>
                  <p className="text-[18px] font-semibold text-white transition-all duration-300">{authData.stats.conversions.toLocaleString()}</p>
                </div>
                <div className={`p-4 rounded bg-[#222] border border-[#333] transition-all duration-500 ${refreshing ? 'animate-pulse' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Download size={16} className="text-blue-500" />
                    <span className="text-[11px] text-[#666] uppercase tracking-wider">Downloads</span>
                  </div>
                  <p className="text-[18px] font-semibold text-white transition-all duration-300">{authData.stats.downloads.toLocaleString()}</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Merger Settings */}
          <div className="p-6 rounded-lg border border-[#333] bg-[#222]">
            <div className="flex items-center gap-3 mb-4">
              <FolderSync size={20} className="text-[#f48024]" />
              <h2 className="text-[16px] font-semibold text-white">Merger Settings</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between opacity-60">
                <div>
                  <p className="text-[13px] text-white font-medium">Auto-resolve conflicts</p>
                  <p className="text-[11px] text-[#666]">Automatically merge compatible duplicates</p>
                </div>
                <label className="relative inline-flex items-center cursor-not-allowed">
                  <input type="checkbox" className="sr-only peer" checked disabled />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024]"></div>
                </label>
              </div>
              <div className="flex items-center justify-between opacity-60">
                <div>
                  <p className="text-[13px] text-white font-medium">Create backups</p>
                  <p className="text-[11px] text-[#666]">Backup files before merging</p>
                </div>
                <label className="relative inline-flex items-center cursor-not-allowed">
                  <input type="checkbox" className="sr-only peer" checked disabled />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024]"></div>
                </label>
              </div>
              <div className="flex items-center justify-between opacity-60">
                <div>
                  <p className="text-[13px] text-white font-medium">Show file previews</p>
                  <p className="text-[11px] text-[#666]">Display file contents before merging</p>
                </div>
                <label className="relative inline-flex items-center cursor-not-allowed">
                  <input type="checkbox" className="sr-only peer" disabled />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024]"></div>
                </label>
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
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={hardwareAcceleration}
                    onChange={handleHardwareAccelerationToggle}
                    disabled={settingsLoading}
                  />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024] peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-white font-medium">Launch on startup</p>
                  <p className="text-[11px] text-[#666]">Start CFX Merge when Windows starts</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={launchOnStartup}
                    onChange={handleLaunchOnStartupToggle}
                    disabled={settingsLoading}
                  />
                  <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f48024] peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                </label>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#222] border border-[#333] rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-[18px] font-semibold text-white mb-2">Confirm Logout</h3>
            <p className="text-[13px] text-[#888] mb-6">
              Are you sure you want to log out? You'll need to enter your API key again to use the app.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 px-4 py-2 bg-[#333] hover:bg-[#444] text-white text-[13px] font-medium rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/20 text-red-400 text-[13px] font-semibold rounded transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
