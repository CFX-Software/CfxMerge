import { Map, Car, Settings as SettingsIcon, Terminal, Database } from 'lucide-react';

type Tab = 'merger' | 'converter' | 'settings';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export const Sidebar = ({ activeTab, onTabChange }: SidebarProps) => {
  const tabs = [
    { id: 'merger' as Tab, label: 'Merger', icon: Map },
    { id: 'converter' as Tab, label: 'Converter', icon: Car },
    { id: 'settings' as Tab, label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="w-64 h-full flex flex-col bg-[#121212] border-r border-[#27272a]">
      {/* Header */}
      <div className="px-6 py-10">
        <h1 className="text-[28px] font-semibold text-white leading-none tracking-tight">
          CFX <span className="text-[#f48024]">MERGE</span>
        </h1>
        <div className="text-[10px] text-[#52525b] font-medium tracking-widest uppercase mt-1">
          Merging Engine v1.4
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4">
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
      <div className="p-6">
        <div className="flex items-center gap-2 px-3 py-2 rounded border border-[#27272a] bg-[#18181b]">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-medium text-[#a1a1aa]">System Online</span>
        </div>
      </div>
    </div>
  );
};
