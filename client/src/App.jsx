import React from 'react';
import { AppProvider, useApp } from './context/AppContext.jsx';
import Header from './components/Header.jsx';
import ToastContainer from './components/ToastContainer.jsx';
import WelcomeModal from './components/WelcomeModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import SetupRequired from './components/SetupRequired.jsx';
import BuyerPortal from './components/BuyerPortal.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DisputeDetail from './pages/DisputeDetail.jsx';
import SandboxLab from './pages/SandboxLab.jsx';
import UnderTheHood from './pages/UnderTheHood.jsx';

function AppContent() {
  const { currentTab, configStatus, refreshAll, userRole } = useApp();

  // If setup required, show friendly setup instructions
  if (configStatus?.isSetupRequired) {
    return (
      <SetupRequired
        missingVariables={configStatus.missingVariables || []}
        onRetry={refreshAll}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/60 text-slate-900 font-sans antialiased text-base">
      <Header />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {userRole === 'buyer' ? (
          <BuyerPortal />
        ) : (
          <>
            {(currentTab === 'disputes' || currentTab === 'dashboard') && <Dashboard />}
            {(currentTab === 'review' || currentTab === 'detail') && <DisputeDetail />}
            {(currentTab === 'try-it' || currentTab === 'sandbox-lab') && <SandboxLab />}
            {(currentTab === 'under-the-hood' || currentTab === 'integration-status' || currentTab === 'activity') && <UnderTheHood />}
          </>
        )}
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500 bg-white">
        <p className="font-semibold text-slate-700">
          DisputeShield • PayPal AI Hackathon Demo
        </p>
        <p className="mt-1 text-slate-400">
          Built with Google Gemini and PayPal Sandbox APIs.
        </p>
      </footer>
      <WelcomeModal />
      <SettingsModal />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
