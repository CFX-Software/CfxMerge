import { FolderOpen } from 'lucide-react';
import { SelectFolder, GetFiveMResourcesPath, SetFiveMResourcesPath } from '../../../wailsjs/go/main/App';
import { useState, useEffect } from 'react';

export const ConverterHeader = () => {
  const [fivemPath, setFivemPath] = useState('');

  useEffect(() => {
    loadPath();
  }, []);

  const loadPath = async () => {
    try {
      const path = await GetFiveMResourcesPath();
      setFivemPath(path || '');
    } catch (err) {
      console.error('Failed to load FiveM path:', err);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const path = await SelectFolder();
      if (path) {
        await SetFiveMResourcesPath(path);
        setFivemPath(path);
      }
    } catch (err) {
      console.error('Folder selection failed:', err);
    }
  };

  return (
    <div className="border-b border-[#2a2a2a] px-8 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[28px] font-bold text-white">GTA5 Converter</h1>
          <p className="text-[13px] text-[#888] mt-1">
            Convert GTA5-Mods resources to FiveM format
          </p>
        </div>
      </div>

      {/* FiveM Folder Selector */}
      <div className="flex items-center gap-3 mt-4 p-4 rounded-lg bg-[#222] border border-[#333]">
        <FolderOpen size={18} className="text-[#f48024]" />
        <div className="flex-1">
          <p className="text-[11px] text-[#666] uppercase tracking-wider mb-1">FiveM Resources Folder</p>
          <p className="text-[13px] text-white font-mono">
            {fivemPath || 'No folder selected'}
          </p>
        </div>
        <button
          onClick={handleSelectFolder}
          className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white text-[12px] font-medium rounded transition-colors"
        >
          Change
        </button>
      </div>
    </div>
  );
};
