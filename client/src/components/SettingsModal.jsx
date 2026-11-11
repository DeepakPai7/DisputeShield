import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { getSettings, updateSettings } from '../services/api.js';
import { X, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function SettingsModal() {
  const { isSettingsOpen, setIsSettingsOpen, addToast } = useApp();
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [tinyThreshold, setTinyThreshold] = useState('5');
  const [businessName, setBusinessName] = useState('My Store');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSettingsOpen) return;
    setLoading(true);
    getSettings()
      .then(res => {
        setAutoSubmit(res.auto_submit_enabled === 'true');
        setTinyThreshold(res.tiny_dispute_threshold_usd || '5');
        setBusinessName(res.seller_business_name || 'My Store');
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load settings:', err);
        setLoading(false);
      });
  }, [isSettingsOpen]);

  if (!isSettingsOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        auto_submit_enabled: String(autoSubmit),
        tiny_dispute_threshold_usd: String(tinyThreshold),
        seller_business_name: businessName
      });
      addToast('Settings Saved', 'Your preferences have been updated.', 'info');
      setIsSettingsOpen(false);
    } catch (err) {
      addToast('Save Failed', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 relative">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Settings</h3>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400 py-4">Loading preferences...</p>
        ) : (
          <div className="space-y-5 text-sm">
            {/* Setting 1: Auto-send replies */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">
                  Let the AI send replies automatically
                </span>
                <input
                  type="checkbox"
                  checked={autoSubmit}
                  onChange={(e) => setAutoSubmit(e.target.checked)}
                  className="w-5 h-5 rounded text-[#003087] focus:ring-[#003087] cursor-pointer"
                />
              </div>
              <p className="text-xs text-slate-500">
                OFF by default. We recommend reviewing replies yourself before sending to PayPal.
              </p>
            </div>

            {/* Setting 2: Tiny amount cutoff */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="font-semibold text-slate-800 block">
                Don't bother fighting disputes under:
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={tinyThreshold}
                  onChange={(e) => setTinyThreshold(e.target.value)}
                  className="w-24 px-3 py-1.5 border border-slate-300 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#003087]"
                />
                <span className="text-xs text-slate-500">USD</span>
              </div>
              <p className="text-xs text-slate-500">
                For very small claims, fighting takes more of your time than the item is worth.
              </p>
            </div>

            {/* Setting 3: Business name */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="font-semibold text-slate-800 block">
                Business name for letters:
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Acme Studio"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#003087]"
              />
              <p className="text-xs text-slate-500">
                This appears in your signature on letters sent to PayPal.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-[#003087] hover:bg-[#002466] text-white text-xs font-bold rounded-xl transition shadow-xs"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

