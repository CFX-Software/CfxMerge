import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './components/Sidebar';
import { MergerView } from './views/MergerView';
import { VehicleConverterView } from './views/VehicleConverterView';
import { SettingsView } from './views/SettingsView';
import { AuthView } from './views/AuthView';
import { UpdateDiscordPresence, IsAuthenticated } from '../wailsjs/go/main/App';
import './style.css';

type Tab = 'merger' | 'converter' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('merger');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check authentication on mount
  useEffect(() => {
    IsAuthenticated()
      .then((authenticated) => {
        setIsAuthenticated(authenticated);
      })
      .catch(() => {
        setIsAuthenticated(false);
      })
      .finally(() => {
        setCheckingAuth(false);
      });
  }, []);

  // Update Discord Rich Presence when tab changes
  useEffect(() => {
    if (isAuthenticated) {
      UpdateDiscordPresence(activeTab).catch(() => {
        // Silently fail if Discord is not running
      });
    }
  }, [activeTab, isAuthenticated]);

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
  };

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

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <div className="flex h-screen w-screen bg-[#1a1a1a] items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#333] border-t-[#f48024] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[13px] text-[#888]">Loading...</p>
        </div>
      </div>
    );
  }

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-screen bg-background overflow-hidden font-sans selection:bg-white selection:text-black">
        <AuthView onAuthSuccess={handleAuthSuccess} />
      </div>
    );
  }

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
