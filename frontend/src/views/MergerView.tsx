import { useState } from 'react';
import { Search, FolderOpen, ChevronDown, ChevronUp, Sliders, X } from 'lucide-react';

interface DuplicateFile {
  id: string;
  name: string;
  status: 'ready' | 'warning' | 'error';
  paths: string[];
  expanded: boolean;
  selected: boolean;
}

export const MergerView = () => {
  const [hasFolder, setHasFolder] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateFile[]>([
    { id: '1', name: 'cs4_03_0.ybn', status: 'ready', paths: ['[prep]\\[Sandy]\\cfx_prompt_sandy_mapdata_apts\\stream\\cs4_03_0.ybn', '[prep]\\cfx_prompt_sandy_mapdata_horny\\stream\\cs4_03_0.ybn'], expanded: false, selected: true },
    { id: '2', name: 'cs4_09_decal001.ydr', status: 'ready', paths: ['[prep]\\[Sandy]\\cfx_prompt_sandy_mapdata_apts\\stream\\cs4_09_decal001.ydr'], expanded: false, selected: true },
    { id: '3', name: 'cs4_06_glue.ydr', status: 'ready', paths: ['[prep]\\[Sandy]\\cfx_prompt_sandy_mapdata_apts\\stream\\cs4_06_glue.ydr', '[prep]\\cfx_prompt_sandy_mapdata_horny\\stream\\cs4_06_glue.ydr'], expanded: true, selected: false },
    { id: '4', name: 'cs4_09_grass_0.ymap', status: 'warning', paths: ['[prep]\\[Sandy]\\cfx_prompt_sandy_mapdata_apts\\stream\\cs4_09_grass_0.ymap'], expanded: false, selected: false },
    { id: '5', name: 'dt1_occl_04.ymap', status: 'ready', paths: ['[prep]\\[Sandy]\\cfx_prompt_sandy_mapdata_apts\\stream\\dt1_occl_04.ymap'], expanded: false, selected: true },
    { id: '6', name: 'dt1_23_ov2.ydr', status: 'ready', paths: ['[prep]\\[Sandy]\\cfx_prompt_sandy_mapdata_apts\\stream\\dt1_23_ov2.ydr'], expanded: false, selected: true },
    { id: '7', name: 'hi0lr_sc1_10_0.ybn', status: 'ready', paths: ['[prep]\\[Sandy]\\cfx_prompt_sandy_mapdata_apts\\stream\\hi0lr_sc1_10_0.ybn'], expanded: false, selected: true },
  ]);

  const readyCount = duplicates.filter(d => d.status === 'ready').length;
  const warningCount = duplicates.filter(d => d.status === 'warning').length;
  const errorCount = duplicates.filter(d => d.status === 'error').length;
  const selectedCount = duplicates.filter(d => d.selected).length;

  const toggleExpand = (id: string) => {
    setDuplicates(prev => prev.map(d => d.id === id ? { ...d, expanded: !d.expanded } : d));
  };

  const toggleSelect = (id: string) => {
    setDuplicates(prev => prev.map(d => d.id === id ? { ...d, selected: !d.selected } : d));
  };

  const selectAll = () => {
    setDuplicates(prev => prev.map(d => ({ ...d, selected: true })));
  };

  // Initial state: Folder selection
  if (!hasFolder) {
    return (
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#1a1a1a] text-[#fafafa]">
        <div className="flex-1 flex items-start justify-center pt-32 px-12">
          <div className="max-w-2xl w-full">
            <h1 className="text-[28px] font-semibold text-white mb-2">Select the folder</h1>
            <p className="text-[14px] text-[#888] mb-8">Select your FiveM resource folder</p>

            <div
              className="p-8 rounded-lg border-2 border-dashed border-[#333] bg-[#222] hover:border-[#f48024] transition-colors cursor-pointer mb-6"
              onClick={() => setHasFolder(true)}
            >
              <div className="text-center">
                <FolderOpen size={32} className="text-[#666] mx-auto mb-3" />
                <p className="text-[13px] text-[#aaa]">Click to select folder</p>
              </div>
            </div>

            <button
              onClick={() => setHasFolder(true)}
              className="w-full px-6 py-3 bg-[#333] hover:bg-[#444] text-white text-[13px] font-medium rounded transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main merger view
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#1a1a1a] text-[#fafafa]">
      {/* Top Toolbar */}
      <div className="border-b border-[#2a2a2a] bg-[#1f1f1f]">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
              <input
                type="text"
                placeholder="Search"
                className="w-full bg-[#222] border border-[#333] rounded px-9 py-2 text-[13px] text-white placeholder:text-[#666] focus:border-[#f48024] outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-4 py-2 bg-[#252525] hover:bg-[#2a2a2a] border border-[#333] text-white text-[12px] font-medium rounded transition-colors flex items-center gap-2">
              <Sliders size={14} />
              Filters (3)
            </button>
            <button
              onClick={selectAll}
              className="px-4 py-2 bg-[#252525] hover:bg-[#2a2a2a] border border-[#333] text-white text-[12px] font-medium rounded transition-colors"
            >
              Select all resources ({duplicates.length})
            </button>
            <button className="p-2 bg-[#252525] hover:bg-[#2a2a2a] border border-[#333] text-[#aaa] rounded transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-[#2a2a2a]">
            <h2 className="text-[18px] font-semibold text-white">Detected duplicates</h2>
          </div>

          {/* Duplicate List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {duplicates.map(dup => (
              <div key={dup.id} className="rounded-lg border border-[#333] bg-[#222] overflow-hidden hover:border-[#444] transition-colors">
                <div className="p-4 flex items-center gap-4">
                  <span className="text-[13px] font-mono text-white flex-1">{dup.name}</span>

                  <div className="flex items-center gap-3">
                    {dup.status === 'ready' && (
                      <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-[11px] font-medium rounded">
                        Ready to merge
                      </span>
                    )}
                    {dup.status === 'warning' && (
                      <>
                        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-[11px] font-medium rounded">
                          Available to merge
                        </span>
                        <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-[11px] font-medium rounded">
                          Has warnings
                        </span>
                      </>
                    )}

                    <button
                      onClick={() => toggleExpand(dup.id)}
                      className="p-1.5 hover:bg-[#333] rounded transition-colors"
                    >
                      {dup.expanded ? <ChevronUp size={16} className="text-[#aaa]" /> : <ChevronDown size={16} className="text-[#aaa]" />}
                    </button>

                    <input
                      type="checkbox"
                      checked={dup.selected}
                      onChange={() => toggleSelect(dup.id)}
                      className="w-4 h-4 rounded bg-[#333] border-[#333] text-[#f48024] focus:ring-[#f48024] focus:ring-offset-0 cursor-pointer"
                    />
                  </div>
                </div>

                {dup.expanded && (
                  <div className="px-4 pb-4 pt-2 space-y-2 border-t border-[#333]">
                    {dup.paths.map((path, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[12px] font-mono text-[#888] pl-4">
                        <FolderOpen size={14} className="text-[#666]" />
                        <span>{path}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom Action Bar */}
          <div className="border-t border-[#2a2a2a] bg-[#1f1f1f] p-4">
            <div className="flex items-center justify-between">
              <button className="px-6 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[13px] font-bold rounded transition-colors">
                Merge duplicates
                <div className="text-[11px] opacity-70 font-normal">Merge will cost 2413 credits</div>
              </button>

              <div className="flex items-center gap-4">
                <span className="text-[12px] text-[#888]">Merger engine: <span className="text-white">Auto</span></span>
                <button className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white text-[12px] font-medium rounded transition-colors">
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Stats */}
        <div className="w-72 border-l border-[#2a2a2a] bg-[#1f1f1f] p-6 space-y-3">
          <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[12px] font-medium text-emerald-400">Ready to merge ({readyCount})</span>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[12px] font-medium text-red-400">Errors ({errorCount})</span>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[12px] font-medium text-amber-400">Warnings ({warningCount})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
