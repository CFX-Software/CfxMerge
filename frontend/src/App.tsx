import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './components/Sidebar';
import { MergerView } from './views/MergerView';
import { VehicleConverterView } from './views/VehicleConverterView';
import { SettingsView } from './views/SettingsView';
import { UpdateDiscordPresence } from '../wailsjs/go/main/App';
import './style.css';

type Tab = 'merger' | 'converter' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('merger');

  // Update Discord Rich Presence when tab changes
  useEffect(() => {
    UpdateDiscordPresence(activeTab).catch(() => {
      // Silently fail if Discord is not running
    });
  }, [activeTab]);

  const renderView = () => {
    switch (activeTab) {
      case 'merger':
        return <MergerView key="merger" />;
      case 'converter':
        return <VehicleConverterView key="converter" />;
      case 'settings':
        return <SettingsView key="settings" />;
      default:
        return <MergerView key="merger" />;
    }
  };

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden font-sans selection:bg-white selection:text-black">

      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 overflow-hidden"
        >
          {renderView()}
        </motion.div>
      </AnimatePresence>
    </div>

  );
}

export default App;
