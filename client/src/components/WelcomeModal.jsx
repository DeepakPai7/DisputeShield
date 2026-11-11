import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import { ShieldCheck, HelpCircle, FileCheck, Send, X, ArrowRight } from 'lucide-react';

export default function WelcomeModal() {
  const { isWelcomeOpen, setIsWelcomeOpen, setCurrentTab } = useApp();

  if (!isWelcomeOpen) return null;

  const handleStartDemo = () => {
    localStorage.setItem('disputeshield_welcome_seen', 'true');
    setIsWelcomeOpen(false);
    setCurrentTab('try-it');
  };

  const handleSkip = () => {
    localStorage.setItem('disputeshield_welcome_seen', 'true');
    setIsWelcomeOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 relative">
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Pitch */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-[#003087] text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Welcome to DisputeShield</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
            Win unfair PayPal claims without the headache.
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            DisputeShield helps small sellers win unfair PayPal refund claims. AI gathers your proof, tells you whether to fight or refund, writes the reply, and sends it to PayPal.
          </p>
        </div>

        {/* The Story in 3 Steps */}
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#003087] flex items-center justify-center shrink-0 font-bold text-sm">
              1
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">A buyer asks PayPal for a refund</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                A customer claims they never got their item or didn't make the purchase.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 font-bold text-sm">
              2
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">DisputeShield finds your proof</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                We check your tracking records and chats, and the AI recommends: fight or refund.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 font-bold text-sm">
              3
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">You click one button</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review the AI-written letter and send it straight to PayPal in one click.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            onClick={handleSkip}
            className="w-full sm:w-auto px-4 py-2.5 text-slate-500 hover:text-slate-800 text-sm font-semibold transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleStartDemo}
            className="w-full sm:w-auto px-6 py-2.5 bg-[#003087] hover:bg-[#002466] text-white text-sm font-bold rounded-xl transition shadow-sm flex items-center justify-center gap-2"
          >
            <span>Show me how it works</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

