import { useState } from 'react';
import { ConverterHeader } from '../components/converter/ConverterHeader';
import { QueueTab } from '../components/converter/QueueTab';
import { DownloadsTab } from '../components/converter/DownloadsTab';

type TabType = 'queue' | 'downloads';

export const ConverterView = () => {
  const [activeTab, setActiveTab] = useState<TabType>('queue');

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#1a1a1a] text-[#fafafa]">
      {/* Header */}
      <ConverterHeader />

      {/* Tabs */}
      <div className="border-b border-[#2a2a2a] px-8">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === 'queue'
                ? 'border-[#f48024] text-white'
                : 'border-transparent text-[#666] hover:text-[#888]'
            }`}
          >
            Queue
          </button>
          <button
            onClick={() => setActiveTab('downloads')}
            className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === 'downloads'
                ? 'border-[#f48024] text-white'
                : 'border-transparent text-[#666] hover:text-[#888]'
            }`}
          >
            Downloads
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'queue' ? <QueueTab /> : <DownloadsTab />}
    </div>
  );
};
