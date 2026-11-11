import React, { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { 
  ShieldCheck, HelpCircle, ArrowRight, Clock, AlertCircle, 
  ChevronDown, ChevronUp, CheckCircle2, User, Package, DollarSign
} from 'lucide-react';

function formatDaysLeft(dueDateString) {
  if (!dueDateString) return { text: 'No deadline', color: 'text-slate-500 bg-slate-100' };
  const diffMs = new Date(dueDateString).getTime() - Date.now();
  if (diffMs <= 0) return { text: 'Past due', color: 'text-rose-700 bg-rose-50 border-rose-200' };

  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(hours / 24);

  if (days < 1) {
    return { text: `${hours}h left`, color: 'text-rose-700 bg-rose-50 border-rose-200' };
  } else if (days < 3) {
    return { text: `${days} days left`, color: 'text-amber-700 bg-amber-50 border-amber-200' };
  }
  return { text: `${days} days left`, color: 'text-slate-700 bg-slate-100 border-slate-200' };
}

export default function Dashboard() {
  const { disputes, viewDispute, setCurrentTab } = useApp();
  const [showStory, setShowStory] = useState(true);

  // Compute summary metrics
  const activeDisputes = disputes.filter(d => d.status !== 'RESOLVED' && d.status !== 'CLOSED');
  const fightCount = activeDisputes.filter(d => d.recommendation === 'FIGHT' || d.recommendation === 'FIGHT_DISPUTE').length;
  const refundCount = activeDisputes.filter(d => d.recommendation === 'REFUND' || d.recommendation === 'ACCEPT_AND_REFUND').length;

  // Sort by deadline (soonest due date first)
  const sortedDisputes = [...disputes].sort((a, b) => {
    const timeA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const timeB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return timeA - timeB;
  });

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
      {/* 1. One-Line Pitch */}
      <div className="text-center sm:text-left space-y-2 pt-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          PayPal Refund Claims
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-3xl">
          DisputeShield helps small sellers win unfair PayPal refund claims. AI gathers your proof, tells you whether to fight or refund, writes the reply, and sends it to PayPal.
        </p>
      </div>

      {/* 2. The 3-Step Story (Collapsible) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs uppercase tracking-wider text-[#003087]">
              How it works in 3 steps
            </span>
          </div>
          <button
            onClick={() => setShowStory(!showStory)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
          >
            <span>{showStory ? 'Hide' : 'Show'}</span>
            {showStory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showStory && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1.5 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#003087] flex items-center justify-center font-bold text-xs">
                1
              </div>
              <h3 className="font-bold text-sm text-slate-900">A buyer asks for a refund</h3>
              <p className="text-xs text-slate-500 leading-normal">
                They open a claim with PayPal saying they never got the item.
              </p>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1.5 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h3 className="font-bold text-sm text-slate-900">AI finds your proof</h3>
              <p className="text-xs text-slate-500 leading-normal">
                We pull your courier tracking and chat logs, then recommend: fight or refund.
              </p>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1.5 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <h3 className="font-bold text-sm text-slate-900">You click one button</h3>
              <p className="text-xs text-slate-500 leading-normal">
                Check the written letter and send it straight to PayPal. Done.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Friendly Summary Line */}
      <div className="flex items-center justify-between pb-1">
        <p className="text-base font-semibold text-slate-800">
          {activeDisputes.length === 0 ? (
            'No refund claims need your reply right now.'
          ) : (
            <>
              <span className="text-[#003087] font-bold">{activeDisputes.length}</span> {activeDisputes.length === 1 ? 'refund claim needs' : 'refund claims need'} your reply.{' '}
              {fightCount > 0 && <span className="text-emerald-700">The AI recommends fighting {fightCount}</span>}
              {fightCount > 0 && refundCount > 0 && ' and '}
              {refundCount > 0 && <span className="text-amber-700">refunding {refundCount}</span>}.
            </>
          )}
        </p>
      </div>

      {/* 4. Disputes List (Cards, not a table) */}
      {disputes.length === 0 ? (
        /* Empty State */
        <div className="p-8 sm:p-12 text-center bg-white border border-slate-200 rounded-3xl space-y-5 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#003087] flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="text-xl font-bold text-slate-900">
              No disputes yet. Want to see how it works?
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Use our practice store to buy a test item as a customer, open a test dispute, and watch the AI defend your store.
            </p>
          </div>
          <button
            onClick={() => setCurrentTab('try-it')}
            className="px-6 py-3 bg-[#003087] hover:bg-[#002466] text-white font-bold text-sm rounded-xl transition shadow-sm inline-flex items-center gap-2"
          >
            <span>Start the 2-minute demo</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {sortedDisputes.map((d) => {
            const sym = d.dispute_currency === 'INR' ? '₹' : (d.dispute_currency === 'EUR' ? '€' : '$');
            const deadline = formatDaysLeft(d.due_date);

            const isFight = d.recommendation === 'FIGHT' || d.recommendation === 'FIGHT_DISPUTE';
            const isRefund = d.recommendation === 'REFUND' || d.recommendation === 'ACCEPT_AND_REFUND';

            let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
            let badgeText = 'Need more proof';
            if (isFight) {
              badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
              badgeText = 'Fight it';
            } else if (isRefund) {
              badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
              badgeText = 'Refund them';
            }

            const plainReason = d.recommendation_reasoning || (
              isFight
                ? 'Delivery was signed for and confirmed in your records.'
                : isRefund
                ? 'Claim amount is small or delivery was not confirmed.'
                : 'Review proof and customer communication.'
            );

            return (
              <div
                key={d.id}
                onClick={() => viewDispute(d.id)}
                className="bg-white hover:bg-slate-50/70 border border-slate-200 rounded-2xl p-5 transition-all shadow-xs hover:shadow-md cursor-pointer space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {/* Who and What with Product Thumbnail */}
                  <div className="flex items-center gap-3">
                    {d.product_snapshot?.main_image_url ? (
                      <img
                        src={d.product_snapshot.main_image_url}
                        alt={d.item_title}
                        className="w-11 h-11 object-cover rounded-xl border border-slate-200 bg-slate-50 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#003087] flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100">
                        <Package className="w-5 h-5 text-[#003087]" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-base font-bold text-slate-900 line-clamp-1">
                        {d.customer_name || 'Customer'} • {d.item_title || 'Item Purchase'}
                      </h2>
                      <span className="text-xs text-slate-400 font-mono">
                        PayPal Claim #{d.paypal_dispute_id}
                        {d.product_snapshot?.brand && ` • ${d.product_snapshot.brand}`}
                      </span>
                    </div>
                  </div>

                  {/* Amount & Time Left */}
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-black text-slate-900 font-mono">
                      {sym}{Number(d.dispute_amount || 0).toFixed(2)}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${deadline.color}`}>
                      {deadline.text}
                    </span>
                  </div>
                </div>

                {/* AI Recommendation & Reason */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider ${badgeClass}`}>
                      {badgeText}
                    </span>
                    <p className="text-xs text-slate-600 line-clamp-1">
                      {plainReason}
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      viewDispute(d.id);
                    }}
                    className="self-end sm:self-auto px-4 py-2 bg-[#003087] hover:bg-[#002466] text-white text-xs font-bold rounded-xl transition shadow-2xs flex items-center gap-1.5"
                  >
                    <span>Review</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
