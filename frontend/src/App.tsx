import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './components/Sidebar';
import { MergerView } from './views/MergerView';
import { ConverterView } from './views/ConverterView';
import { SettingsView } from './views/SettingsView';
import { ResourceDbView } from './views/ResourceDbView';
import { AuthView } from './views/AuthView';
import { UpdateDiscordPresence, IsAuthenticated, Logout } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import './style.css';

type Tab = 'merger' | 'converter' | 'settings' | 'resource-db';

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

  // Listen for authentication failures
  useEffect(() => {
    const unsubscribe = EventsOn('auth:failed', async (message: string) => {
      console.error('Authentication failed:', message);

      // Force logout
      try {
        await Logout();
      } catch (err) {
        console.error('Logout failed:', err);
      }

      // Update UI state
      setIsAuthenticated(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Periodic authentication validation (every 5 minutes)
  useEffect(() => {
    if (!isAuthenticated) return;

    const validateAuth = async () => {
      try {
        const authenticated = await IsAuthenticated();
        if (!authenticated) {
          console.warn('Periodic auth check failed - logging out');
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('Periodic auth check error:', err);
        // Don't logout on network errors, only on explicit auth failures
      }
    };

    // Run validation every 5 minutes
    const interval = setInterval(validateAuth, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isAuthenticated]);

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
    setActiveTab('settings'); // Take user to Settings page after login
  };

  const renderView = () => {
    switch (activeTab) {
      case 'merger':
        return <MergerView key="merger" />;
      case 'converter':
        return <ConverterView key="converter" />;
      case 'settings':
        return <SettingsView key="settings" />;
      case 'resource-db':
        return <ResourceDbView key="resource-db" />;
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
          className="flex-1 overflow-hidden"
        >
          {renderView()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default App;
