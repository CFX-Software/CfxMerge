import { useState } from 'react';
import { Link, Upload, Check, Download, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

type InputMode = 'url' | 'file';

interface DownloadItem {
  id: string;
  name: string;
  size: string;
  date: string;
}

interface DownloadBatch {
  id: string;
  label: string;
  count: number;
  downloads: DownloadItem[];
  expanded: boolean;
}

export const VehicleConverterView = () => {
  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [urlInput, setUrlInput] = useState('');
  const [batches, setBatches] = useState<DownloadBatch[]>([
    {
      id: '1',
      label: 'Today',
      count: 5,
      expanded: true,
      downloads: [
        { id: '1', name: 'lamborghini_aventador_fivem.zip', size: '24.5 MB', date: '2 min ago' },
        { id: '2', name: 'police_pack_converted.zip', size: '156 MB', date: '1 hour ago' },
        { id: '3', name: 'custom_weapons_pack.zip', size: '45 MB', date: '3 hours ago' },
        { id: '4', name: 'city_hospital_map.zip', size: '89 MB', date: '5 hours ago' },
        { id: '5', name: 'realistic_sounds_mod.zip', size: '12 MB', date: '7 hours ago' },
      ],
    },
    {
      id: '2',
      label: 'Yesterday',
      count: 8,
      expanded: false,
      downloads: [
        { id: '6', name: 'ferrari_f8_tributo.zip', size: '31 MB', date: 'Yesterday' },
        { id: '7', name: 'swat_pack_full.zip', size: '203 MB', date: 'Yesterday' },
        { id: '8', name: 'beach_house_mlo.zip', size: '78 MB', date: 'Yesterday' },
      ],
    },
    {
      id: '3',
      label: 'This Week',
      count: 15,
      expanded: false,
      downloads: [],
    },
  ]);

  const supportedTypes = [
    'Vehicles',
    'Weapons',
    'Maps',
    'Peds',
    'Scripts',
    'DLC',
  ];

  const toggleBatch = (batchId: string) => {
    setBatches(prev => prev.map(batch =>
      batch.id === batchId ? { ...batch, expanded: !batch.expanded } : batch
    ));
  };

  const totalDownloads = batches.reduce((sum, batch) => sum + batch.count, 0);

  return (
    <div className="flex-1 flex h-screen overflow-hidden bg-[#1a1a1a] text-[#fafafa]">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-[#2a2a2a] px-8 py-6">
          <h1 className="text-[24px] font-semibold text-white mb-1">GTA5 Converter</h1>
          <p className="text-[13px] text-[#888]">Convert GTA5-Mods resources to FiveM format</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Input Section */}
          <div className="border-b border-[#2a2a2a]">
            {/* Input Tabs */}
            <div className="px-8 pt-6">
              <div className="flex items-center gap-4 mb-6">
                <button
                  onClick={() => setInputMode('url')}
                  className={`pb-2 px-1 text-[12px] font-medium border-b-2 transition-colors ${
                    inputMode === 'url'
                      ? 'border-[#f48024] text-white'
                      : 'border-transparent text-[#666] hover:text-white'
                  }`}
                >
                  <Link size={13} className="inline mr-1.5" />
                  URL Input
                </button>
                <button
                  onClick={() => setInputMode('file')}
                  className={`pb-2 px-1 text-[12px] font-medium border-b-2 transition-colors ${
                    inputMode === 'file'
                      ? 'border-[#f48024] text-white'
                      : 'border-transparent text-[#666] hover:text-white'
                  }`}
                >
                  <Upload size={13} className="inline mr-1.5" />
                  File Upload
                </button>
              </div>
            </div>

            {/* Input Area */}
            <div className="px-8 pb-8">
              <div className="max-w-3xl">
                {inputMode === 'url' ? (
                  <div className="space-y-3">
                    <label className="text-[12px] font-medium text-[#aaa] block">
                      Paste GTA5-Mods URLs (one per line)
                    </label>
                    <textarea
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://www.gta5-mods.com/vehicles/..."
                      className="w-full h-32 bg-[#222] border border-[#333] rounded p-3 text-[12px] text-white placeholder:text-[#555] focus:border-[#f48024] outline-none transition-colors resize-none font-mono"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-[12px] font-medium text-[#aaa] block mb-3">
                      Upload resource files
                    </label>
                    <div
                      className="h-32 border-2 border-dashed border-[#333] bg-[#222] rounded flex items-center justify-center hover:border-[#f48024] transition-colors cursor-pointer"
                    >
                      <div className="text-center">
                        <Upload size={28} className="text-[#555] mx-auto mb-2" />
                        <p className="text-[12px] text-[#aaa] mb-0.5">Drop files here or click to browse</p>
                        <p className="text-[10px] text-[#666]">Supports .meta, .lua, and archive files</p>
                      </div>
                    </div>
                  </div>
                )}

                <button className="w-full mt-4 px-5 py-3 bg-[#f48024] hover:bg-[#f48024]/90 text-white text-[13px] font-semibold rounded transition-colors">
                  Convert to FiveM
                </button>
              </div>
            </div>
          </div>

          {/* Downloads Section */}
          <div className="px-8 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold text-white">Downloads</h2>
              <span className="text-[12px] text-[#666]">{totalDownloads} files</span>
            </div>

            <div className="max-w-3xl space-y-2">
              {batches.map((batch) => (
                <div key={batch.id} className="border border-[#333] rounded bg-[#222] overflow-hidden">
                  {/* Batch Header */}
                  <button
                    onClick={() => toggleBatch(batch.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-[#252525] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {batch.expanded ? (
                        <ChevronDown size={16} className="text-[#888]" />
                      ) : (
                        <ChevronUp size={16} className="text-[#888]" />
                      )}
                      <span className="text-[14px] font-semibold text-white">{batch.label}</span>
                      <span className="text-[11px] text-[#666]">({batch.count})</span>
                    </div>
                  </button>

                  {/* Batch Downloads */}
                  {batch.expanded && batch.downloads.length > 0 && (
                    <div className="border-t border-[#333]">
                      <div className="max-h-[400px] overflow-y-auto">
                        {batch.downloads.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-4 border-b border-[#2a2a2a] last:border-b-0 hover:bg-[#252525] transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] text-white font-medium truncate">{item.name}</p>
                              <p className="text-[11px] text-[#666] mt-0.5">{item.size} • {item.date}</p>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <button className="p-2 rounded hover:bg-[#333] transition-colors">
                                <Download size={16} className="text-[#f48024]" />
                              </button>
                              <button className="p-2 rounded hover:bg-[#333] transition-colors">
                                <Trash2 size={16} className="text-[#666] hover:text-red-400" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-72 border-l border-[#2a2a2a] bg-[#1f1f1f] flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {/* Supported Types */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#666] mb-4">
              Supported Types
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {supportedTypes.map((type) => (
                <div
                  key={type}
                  className="flex items-center gap-2 px-3 py-2 rounded bg-[#252525] border border-[#2a2a2a]"
                >
                  <Check size={12} className="text-emerald-500" />
                  <span className="text-[11px] text-[#ccc]">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Footer Info */}
        <div className="p-6 border-t border-[#2a2a2a]">
          <p className="text-[11px] text-[#666] leading-relaxed">
            Automatically converts resource structure, metadata, and scripts to FiveM format
          </p>
        </div>
      </div>
    </div>
  );
};
