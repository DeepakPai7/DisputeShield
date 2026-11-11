import React from 'react';
import { Key, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';

export default function SetupRequired({ missingVariables = [], onRetry }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-xl space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Setup needed</h1>
            <p className="text-xs text-slate-500">
              DisputeShield needs your PayPal Sandbox and Gemini API keys to connect.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Missing items:
          </p>
          <div className="space-y-2">
            {missingVariables.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="font-mono font-bold text-slate-800">{item.key}</span>
                </div>
                <span className="text-slate-500 text-[11px]">{item.description}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs text-slate-700">
          <h2 className="font-bold text-slate-900">Where to get them:</h2>
          <ul className="space-y-2 leading-relaxed">
            <li className="flex items-center justify-between">
              <span>• PayPal Client ID & Secret from PayPal Developer:</span>
              <a
                href="https://developer.paypal.com/dashboard/applications/sandbox"
                target="_blank"
                rel="noreferrer"
                className="text-[#003087] font-semibold underline inline-flex items-center gap-1"
              >
                PayPal Dev <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li className="flex items-center justify-between">
              <span>• Gemini API key from Google AI Studio:</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[#003087] font-semibold underline inline-flex items-center gap-1"
              >
                Google AI Studio <ExternalLink className="w-3 h-3" />
              </a>
            </li>
          </ul>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-400 font-mono">
            Paste into server/.env and restart
          </span>
          <button
            onClick={onRetry}
            className="px-5 py-2.5 bg-[#003087] hover:bg-[#002466] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Check again</span>
          </button>
        </div>
      </div>
    </div>
  );
}
