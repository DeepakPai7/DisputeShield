import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import { ShieldCheck, Settings as SettingsIcon } from 'lucide-react';

export default function Header() {
  const { currentTab, setCurrentTab, configStatus, setIsSettingsOpen, userRole, switchRole } = useApp();

  const isHealthy = !configStatus?.isSetupRequired;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Name */}
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            onClick={() => setCurrentTab('disputes')}
          >
            <div className="w-9 h-9 rounded-xl bg-[#003087] flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-[#003087]">
                DisputeShield
              </span>
            </div>
          </div>

          {/* 3 Nav Items */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setCurrentTab('disputes')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                currentTab === 'disputes' || currentTab === 'review'
                  ? 'bg-blue-50 text-[#003087]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Disputes
            </button>

            <button
              onClick={() => setCurrentTab('try-it')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                currentTab === 'try-it'
                  ? 'bg-blue-50 text-[#003087]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Try it
            </button>

            <button
              onClick={() => setCurrentTab('under-the-hood')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                currentTab === 'under-the-hood'
                  ? 'bg-blue-50 text-[#003087]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Under the hood
            </button>
          </nav>

          {/* Right Status Dot & Settings Gear */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Role Switcher Pill */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                onClick={() => switchRole('seller')}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                  userRole === 'seller'
                    ? 'bg-white text-[#003087] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Store Owner view: see disputes, AI letters, and proof"
              >
                <span>💼 Seller</span>
              </button>
              <button
                onClick={() => switchRole('buyer')}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                  userRole === 'buyer'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Customer view: see order, OTP delivery code, and chat with seller"
              >
                <span>🛍️ Buyer</span>
              </button>
            </div>

            {/* Status Dot */}
            <button
              onClick={() => setCurrentTab('under-the-hood')}
              title="Click to view connection details"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isHealthy ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'
                }`}
              />
              <span className="hidden sm:inline text-slate-700">
                {isHealthy ? 'Connected to PayPal and Gemini' : 'Problem: click to see'}
              </span>
            </button>

            {/* Settings Gear Icon */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
              className="p-2 text-slate-500 hover:text-[#003087] rounded-xl hover:bg-slate-50 transition-colors"
              aria-label="Settings"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
