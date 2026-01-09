import { GitMerge, RefreshCw, Settings as SettingsIcon, Terminal, Database } from 'lucide-react';

type Tab = 'merger' | 'converter' | 'settings';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export const Sidebar = ({ activeTab, onTabChange }: SidebarProps) => {
  const tabs = [
    { id: 'merger' as Tab, label: 'Merger', icon: GitMerge },
    { id: 'converter' as Tab, label: 'Converter', icon: RefreshCw },
    { id: 'settings' as Tab, label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="w-64 h-full flex flex-col bg-[#121212] border-r border-[#27272a]">
      {/* Header */}
      <div className="px-6 py-6 border-b border-[#27272a]">
        <div className="flex items-center gap-3">
          <img
            src="https://cdn.buymeacoffee.com/uploads/profile_pictures/2025/12/pXd1A10zSjYmIY9a.png@300w_0e.webp"
            alt="CFX Logo"
            className="w-12 h-12 rounded-lg shadow-lg"
          />
          <h1 className="text-[22px] font-bold text-white leading-none tracking-tight">
            CFX <span className="text-[#f48024]">MERGE</span>
          </h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 pt-6">
        <div className="mb-8">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#52525b] mb-3 px-2">Applications</div>
          <div className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                    ${isActive
                      ? 'bg-[#f48024] text-white'
                      : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-white'
                    }
                  `}
                >
                  <Icon size={18} strokeWidth={2} />
                  <span className="text-[14px] font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#52525b] mb-3 px-2">Internal Tools</div>
          <div className="space-y-1">
            <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#18181b] transition-colors">
              <Terminal size={16} strokeWidth={2} />
              <span className="text-[13px] font-medium">Console Logs</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#18181b] transition-colors">
              <Database size={16} strokeWidth={2} />
              <span className="text-[13px] font-medium">Resource DB</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-6 border-t border-[#27272a] bg-[#0a0a0a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[12px] font-medium text-[#a1a1aa]">Online</span>
          </div>
          <span className="text-[11px] font-semibold text-[#71717a] tracking-wider">v1.0</span>
        </div>
      </div>
    </div>
  );
};
