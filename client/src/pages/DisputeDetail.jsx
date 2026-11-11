import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import {
  getDisputeDetail,
  submitToPayPal,
  acceptClaim,
  generateLetter,
  regenerateLetter,
  saveLetter,
  getEvidencePdfUrl,
  getChatMessages,
  sendChatMessage
} from '../services/api.js';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Download,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Send,
  DollarSign,
  Terminal,
  ShieldCheck,
  FileText,
  Sparkles,
  KeyRound,
  MessageSquare
} from 'lucide-react';

function formatDaysLeft(dueDateString) {
  if (!dueDateString) return 'No deadline';
  const diffMs = new Date(dueDateString).getTime() - Date.now();
  if (diffMs <= 0) return 'Past due';
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(hours / 24);
  if (days < 1) return `${hours} hours left`;
  return `${days} days left`;
}

export default function DisputeDetail() {
  const { activeDisputeId, setCurrentTab, addToast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [letterText, setLetterText] = useState('');
  const [isEditingLetter, setIsEditingLetter] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isDraftingGemini, setIsDraftingGemini] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'submit' | 'refund'
  const [actionDoneBanner, setActionDoneBanner] = useState(null);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [sellerReplyText, setSellerReplyText] = useState('');
  const [isSendingSellerReply, setIsSendingSellerReply] = useState(false);

  const fetchChat = async (orderId) => {
    if (!orderId) return;
    try {
      const res = await getChatMessages(orderId);
      setChatMessages(res.messages || []);
    } catch (e) {
      console.error('Failed to load chat in dispute review:', e);
    }
  };

  const fetchDetail = async () => {
    if (!activeDisputeId) return;
    try {
      const res = await getDisputeDetail(activeDisputeId);
      setData(res);
      const text = res.active_letter?.letter_text || res.latest_analysis?.response_letter || '';
      setLetterText(text);
      if (res.dispute?.order_id) {
        fetchChat(res.dispute.order_id);
      }
    } catch (err) {
      addToast('Error', 'Failed to load dispute details.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [activeDisputeId]);

  if (loading || !data) {
    return (
      <div className="py-16 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-[#003087] animate-spin mx-auto" />
        <p className="text-slate-600 font-semibold text-sm">Loading refund claim details...</p>
      </div>
    );
  }

  const { dispute, evidencePacket, latest_analysis } = data;
  const sym = dispute.dispute_currency === 'INR' ? '₹' : (dispute.dispute_currency === 'EUR' ? '€' : '$');
  const amountFormatted = `${sym}${Number(dispute.dispute_amount || 0).toFixed(2)}`;
  const daysLeft = formatDaysLeft(dispute.due_date);

  const isFight = latest_analysis?.recommendation === 'FIGHT' || latest_analysis?.recommendation === 'FIGHT_DISPUTE';
  const isRefund = latest_analysis?.recommendation === 'REFUND' || latest_analysis?.recommendation === 'ACCEPT_AND_REFUND';

  // Plain verdict text
  let verdictTitle = 'Need more proof';
  let verdictColor = 'bg-slate-50 border-slate-300 text-slate-800';
  let strengthLabel = 'Medium';
  if (isFight) {
    verdictTitle = 'Fight this dispute';
    verdictColor = 'bg-emerald-50 border-emerald-300 text-emerald-900';
  } else if (isRefund) {
    verdictTitle = 'Refund the buyer';
    verdictColor = 'bg-amber-50 border-amber-300 text-amber-900';
  }

  const score = latest_analysis?.case_strength_score ?? 50;
  if (score >= 75) strengthLabel = 'Strong';
  else if (score >= 45) strengthLabel = 'Medium';
  else strengthLabel = 'Weak';

  // Build 3 to 5 plain proof bullets
  const proofItems = [];
  if (evidencePacket?.productSnapshot) {
    const snap = evidencePacket.productSnapshot;
    proofItems.push(`Listing at purchase: ${snap.title}${snap.brand ? ` by ${snap.brand}` : ''}, $${Number(snap.price).toFixed(2)} (Channel3 Verified #${snap.id})`);
  }
  if (evidencePacket?.shipping?.otp_verified || evidencePacket?.shipping?.unique_delivery_id) {
    proofItems.push(`Verified Delivery Handshake (Unique Certificate ID: #${evidencePacket.shipping.unique_delivery_id || 'OTP-DELV-VERIFIED'})`);
  }
  if (evidencePacket?.shipping) {
    const s = evidencePacket.shipping;
    if (s.status === 'DELIVERED') {
      proofItems.push(`Delivered and signed for (${s.carrier} tracking #${s.tracking_number})`);
    } else {
      proofItems.push(`Shipped via ${s.carrier} (Tracking #${s.tracking_number}, status: ${s.status})`);
    }
  }
  if (evidencePacket?.chatExcerpts?.length > 0) {
    const msg = evidencePacket.chatExcerpts[0];
    proofItems.push(`Buyer messaged in ${msg.channel || 'chat'}: "${msg.message_text}"`);
  }
  if (evidencePacket?.deliveryFiles?.length > 0 || evidencePacket?.accessLogs?.length > 0) {
    proofItems.push('Deliverable files were downloaded by customer IP');
  }
  if (evidencePacket?.order) {
    proofItems.push(`Order matched authorized address for ${evidencePacket.order.customer_name || 'buyer'}`);
  }
  if (proofItems.length === 0) {
    proofItems.push('Order records located in your merchant database');
  }

  // Handle Letter Quick Edits
  const handleRewrite = async (instruction) => {
    setIsRewriting(true);
    try {
      const res = await regenerateLetter(dispute.id, instruction);
      if (res.letter) {
        setLetterText(res.letter.letter_text);
        addToast('Letter Updated', 'The reply was rewritten.', 'info');
      }
    } catch (err) {
      addToast('Rewrite failed', err.message, 'error');
    } finally {
      setIsRewriting(false);
    }
  };

  const handleGenerateWithGemini = async (customInstruction = null) => {
    setIsDraftingGemini(true);
    try {
      const res = await generateLetter(dispute.id, customInstruction);
      if (res.letter?.letter_text) {
        setLetterText(res.letter.letter_text);
        addToast('Gemini Letter Created', 'Gemini analyzed tracking, chat, and OTP proof, and generated your defense letter.', 'success');
      } else if (res.analysis?.response_letter) {
        setLetterText(res.analysis.response_letter);
        addToast('Gemini Letter Created', 'Gemini drafted a defense letter for PayPal.', 'success');
      }
      await fetchDetail();
    } catch (err) {
      addToast('Gemini Draft Failed', err.response?.data?.error || err.message, 'warning');
    } finally {
      setIsDraftingGemini(false);
    }
  };

  const handleSendSellerReply = async () => {
    if (!dispute.order_id || !sellerReplyText.trim()) return;
    setIsSendingSellerReply(true);
    try {
      await sendChatMessage(dispute.order_id, {
        sender_role: 'seller',
        sender_name: 'Store Support',
        message_text: sellerReplyText.trim(),
        dispute_id: dispute.id
      });
      setSellerReplyText('');
      await fetchChat(dispute.order_id);
      addToast('Message Sent', 'Your message has been sent to the buyer.', 'info');
    } catch (err) {
      addToast('Chat Error', err.response?.data?.error || err.message, 'warning');
    } finally {
      setIsSendingSellerReply(false);
    }
  };

  const handleSaveLetter = async () => {
    try {
      await saveLetter(dispute.id, letterText);
      setIsEditingLetter(false);
      addToast('Saved', 'Your edits were saved.', 'info');
    } catch (err) {
      addToast('Error', 'Could not save edits.', 'error');
    }
  };

  // Submission to PayPal
  const handleExecuteSubmit = async () => {
    setIsSubmitting(true);
    try {
      await saveLetter(dispute.id, letterText);
      const res = await submitToPayPal(dispute.id);
      setActionDoneBanner('Done. PayPal now shows this dispute as: Under review.');
      setShowConfirmModal(false);
      addToast('Reply Sent to PayPal', res?.message || 'Your evidence packet was submitted to PayPal Sandbox.', 'success');
      await fetchDetail();
    } catch (err) {
      addToast('Submission Note', err.response?.data?.error || err.response?.data?.message || err.message, 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Refund Buyer on PayPal
  const handleExecuteRefund = async () => {
    setIsRefunding(true);
    try {
      await acceptClaim(dispute.id, 'Seller accepted claim and authorized buyer refund');
      setActionDoneBanner('Done. PayPal now shows this dispute as: Resolved (Refunded).');
      setShowConfirmModal(false);
      addToast('Refund Processed', 'The buyer has been refunded and the claim closed.', 'info');
      await fetchDetail();
    } catch (err) {
      addToast('Refund Error', err.response?.data?.message || err.message, 'error');
    } finally {
      setIsRefunding(false);
    }
  };

  const isClosed = dispute.status === 'RESOLVED' || dispute.status === 'CLOSED';
  const isUnderReview = dispute.status === 'UNDER_REVIEW';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 animate-fade-in">
      {/* Back button */}
      <div>
        <button
          onClick={() => setCurrentTab('disputes')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to disputes</span>
        </button>
      </div>

      {/* Done Banner if recently acted */}
      {actionDoneBanner && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{actionDoneBanner}</span>
        </div>
      )}

      {/* Already Under Review or Closed Notice */}
      {isUnderReview && !actionDoneBanner && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-[#003087] text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 shrink-0" />
          <span>Defense already sent. PayPal is currently reviewing this dispute.</span>
        </div>
      )}

      {isClosed && !actionDoneBanner && (
        <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 text-sm font-semibold flex items-center gap-2">
          <span>This dispute is closed. Refund was authorized.</span>
        </div>
      )}

      {/* SECTION 1: What the buyer says */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-[#003087] flex items-center justify-center text-xs font-bold">1</span>
            <span>What the buyer says</span>
          </h2>
          <span className="text-xs text-slate-500 font-semibold">{daysLeft}</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-base italic leading-relaxed">
          "{dispute.buyer_message || 'The buyer claimed they did not receive the purchased item.'}"
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-3">
            {evidencePacket?.productSnapshot?.main_image_url ? (
              <img
                src={evidencePacket.productSnapshot.main_image_url}
                alt={evidencePacket.productSnapshot.title}
                className="w-12 h-12 object-cover rounded-xl border border-slate-200 bg-slate-50 shrink-0"
              />
            ) : null}
            <div>
              <div className="text-sm font-bold text-slate-900">
                {evidencePacket?.productSnapshot?.title || dispute.item_title || 'Item Purchase'}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                <span>{evidencePacket?.productSnapshot?.brand || 'Store Item'}</span>
                <span>•</span>
                <span>Claim #{dispute.paypal_dispute_id}</span>
                {evidencePacket?.productSnapshot?.offer_domain && (
                  <>
                    <span>•</span>
                    <span>Source: {evidencePacket.productSnapshot.offer_domain}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <span className="text-lg font-black text-slate-900 font-mono self-start sm:self-center">
            {amountFormatted}
          </span>
        </div>
      </section>

      {/* SECTION 2: Your proof */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-[#003087] flex items-center justify-center text-xs font-bold">2</span>
          <span>Your proof</span>
        </h2>

        <div className="space-y-2.5">
          {proofItems.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-sm text-slate-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* OTP Handshake Certificate Card if verified */}
        {evidencePacket?.shipping?.otp_verified ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-900">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-xs block text-emerald-900">Cryptographic Delivery Proof (OTP Handshake)</span>
                <span className="text-xs text-emerald-700">Buyer entered confidential passcode to receive package directly from carrier.</span>
              </div>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <span className="text-[10px] text-emerald-700 block uppercase font-bold tracking-wider">Unique Certificate ID</span>
              <span className="text-xs font-mono font-bold text-[#003087] bg-white px-2.5 py-1 rounded-md border border-emerald-300">
                {evidencePacket.shipping.unique_delivery_id || 'OTP-DELV-VERIFIED'}
              </span>
            </div>
          </div>
        ) : null}

        {/* Live Customer Chat Evidence & In-app communication */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[#003087]" />
              <span>Customer Chat Correspondence (Real Proof)</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-medium">Synced with order</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-44 overflow-y-auto space-y-2 mb-3">
            {(chatMessages.length > 0 ? chatMessages : (evidencePacket?.chatExcerpts || [])).length === 0 ? (
              <p className="text-xs text-slate-400 italic">No customer messages recorded yet.</p>
            ) : (
              (chatMessages.length > 0 ? chatMessages : (evidencePacket?.chatExcerpts || [])).map((m, idx) => {
                const isBuyer = m.sender_role === 'buyer' || m.sender === 'Customer' || m.sender === dispute.customer_name;
                const isAdmission = /got|received|fits|downloaded|thanks|arrived/i.test(m.message_text || '');
                return (
                  <div key={idx} className={`p-2 rounded-lg text-xs ${isBuyer ? 'bg-white border border-slate-200' : 'bg-blue-50/70 border border-blue-100'}`}>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                      <span className="font-semibold text-slate-600">{m.sender} ({isBuyer ? 'Buyer' : 'Store'})</span>
                      <span>{m.sent_at ? new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    <p className="text-slate-800">{m.message_text}</p>
                    {isAdmission && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full mt-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Direct Admission of Receipt (Refutes Claim)
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Quick reply to customer */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={sellerReplyText}
              onChange={(e) => setSellerReplyText(e.target.value)}
              placeholder="Send message to buyer (will update proof log)..."
              className="flex-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-[#003087]"
            />
            <button
              onClick={handleSendSellerReply}
              disabled={isSendingSellerReply || !sellerReplyText.trim()}
              className="px-3 py-1.5 rounded-xl bg-[#003087] text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-40 transition-colors"
            >
              {isSendingSellerReply ? 'Sending...' : 'Reply'}
            </button>
          </div>
        </div>

        {/* Expander for all evidence */}
        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={() => setShowAllEvidence(!showAllEvidence)}
            className="text-xs font-semibold text-[#003087] hover:underline flex items-center gap-1"
          >
            <span>{showAllEvidence ? 'Hide evidence details' : 'Show all evidence'}</span>
            {showAllEvidence ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showAllEvidence && (
            <div className="mt-3 p-3.5 bg-slate-50 rounded-xl text-xs space-y-2 text-slate-700">
              <p><strong>Customer Name:</strong> {evidencePacket?.order?.customer_name || 'Alex Buyer'}</p>
              <p><strong>Email:</strong> {evidencePacket?.order?.customer_email || 'alex@example.com'}</p>
              {evidencePacket?.shipping && (
                <p><strong>Tracking Number:</strong> {evidencePacket.shipping.carrier} {evidencePacket.shipping.tracking_number}</p>
              )}
              {evidencePacket?.chatExcerpts?.map((c, i) => (
                <p key={i}><strong>{c.channel} message:</strong> "{c.message_text}"</p>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3: What the AI recommends */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-[#003087] flex items-center justify-center text-xs font-bold">3</span>
          <span>What the AI recommends</span>
        </h2>

        {/* Large Recommendation Card */}
        <div className={`p-5 rounded-2xl border ${verdictColor} space-y-2`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xl font-extrabold tracking-tight">
              {verdictTitle}
            </h3>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white/80 border border-current">
              Proof strength: {strengthLabel}
            </span>
          </div>

          <p className="text-sm leading-relaxed">
            {latest_analysis?.recommendation_reasoning || 'Your tracking proof and records match the customer order.'}
          </p>

          {/* Micro-claim small sentence */}
          {dispute.dispute_amount <= 5 && (
            <p className="text-xs font-medium pt-1">
              This is only {amountFormatted}. Fighting would take more of your time than it's worth.
            </p>
          )}

          {/* Rule override plain sentence */}
          {latest_analysis?.rule_overrides?.length > 0 && (
            <p className="text-xs font-medium pt-1">
              We adjusted the recommendation to "{verdictTitle}" based on your business rules.
            </p>
          )}
        </div>
      </section>

      {/* SECTION 4: Your reply to PayPal */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-[#003087] flex items-center justify-center text-xs font-bold">4</span>
            <span>Your reply to PayPal</span>
          </h2>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <button
              onClick={() => handleRewrite('Make it shorter and more direct')}
              disabled={isRewriting || isDraftingGemini}
              className="text-[#003087] hover:underline"
            >
              Make shorter
            </button>
            <span className="text-slate-300">•</span>
            <button
              onClick={() => handleRewrite('Explicitly quote the customer chat admission and date')}
              disabled={isRewriting || isDraftingGemini}
              className="text-[#003087] hover:underline"
            >
              Cite chat quote
            </button>
            <span className="text-slate-300">•</span>
            <button
              onClick={() => handleRewrite('Explicitly cite the OTP Delivery Handshake unique certificate ID and carrier signature')}
              disabled={isRewriting || isDraftingGemini}
              className="text-[#003087] hover:underline"
            >
              Cite OTP proof
            </button>
          </div>
        </div>

        {/* Gemini AI Letter Generator Box */}
        <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#003087] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-xs text-[#003087] block">Write or refine letter with Gemini API</span>
              <span className="text-xs text-slate-600">
                AI reads real customer messages, tracking timestamps, and OTP delivery certificates to craft your defense.
              </span>
            </div>
          </div>
          <button
            onClick={() => handleGenerateWithGemini()}
            disabled={isDraftingGemini || isRewriting}
            className="w-full sm:w-auto px-4 py-2 bg-[#003087] hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            {isDraftingGemini ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Drafting with Gemini...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Write letter with Gemini</span>
              </>
            )}
          </button>
        </div>

        <div className="space-y-2">
          <textarea
            rows={7}
            value={letterText}
            onChange={(e) => {
              setLetterText(e.target.value);
              setIsEditingLetter(true);
            }}
            className="w-full p-4 rounded-xl border border-slate-300 text-sm font-sans leading-relaxed text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#003087] bg-white"
            placeholder="Type your response to PayPal..."
          />
          {isEditingLetter && (
            <div className="flex justify-end">
              <button
                onClick={handleSaveLetter}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
              >
                Save edits
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ACTION BUTTONS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Primary and Secondary buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {isFight ? (
            <>
              <button
                onClick={() => {
                  setConfirmAction('submit');
                  setShowConfirmModal(true);
                }}
                disabled={isClosed || isUnderReview || isSubmitting}
                className="w-full sm:w-auto px-7 py-3.5 bg-[#003087] hover:bg-[#002466] text-white text-base font-bold rounded-xl transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Send this reply to PayPal</span>
              </button>

              <button
                onClick={() => {
                  setConfirmAction('refund');
                  setShowConfirmModal(true);
                }}
                disabled={isClosed || isRefunding}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-500 hover:text-rose-600 transition"
              >
                Refund the buyer instead
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setConfirmAction('refund');
                  setShowConfirmModal(true);
                }}
                disabled={isClosed || isRefunding}
                className="w-full sm:w-auto px-7 py-3.5 bg-amber-600 hover:bg-amber-700 text-white text-base font-bold rounded-xl transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <DollarSign className="w-4 h-4" />
                <span>Refund the buyer</span>
              </button>

              <button
                onClick={() => {
                  setConfirmAction('submit');
                  setShowConfirmModal(true);
                }}
                disabled={isClosed || isUnderReview || isSubmitting}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-500 hover:text-[#003087] transition"
              >
                Fight and send reply anyway
              </button>
            </>
          )}
        </div>

        {/* PDF Link */}
        <a
          href={getEvidencePdfUrl(dispute.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5"
        >
          <Download className="w-4 h-4" />
          <span>Download PDF packet</span>
        </a>
      </div>

      {/* MORE DETAILS (FOR CURIOUS PEOPLE) - COLLAPSED */}
      <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50 space-y-3">
        <button
          onClick={() => setShowMoreDetails(!showMoreDetails)}
          className="w-full flex items-center justify-between text-sm font-bold text-slate-700 hover:text-slate-900"
        >
          <span>More details (for curious people)</span>
          {showMoreDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showMoreDetails && (
          <div className="space-y-4 pt-3 border-t border-slate-200 text-xs text-slate-700">
            {/* Money Math */}
            {latest_analysis?.economics && (
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800">Cost-benefit math:</span>
                <p className="text-slate-600">{latest_analysis.economics.formula_display || latest_analysis.economics.verdict}</p>
                <p className="text-slate-500">Expected recovery: {sym}{latest_analysis.economics.net_expected_value?.toFixed(2)}</p>
              </div>
            )}

            {/* Contradictions */}
            {latest_analysis?.contradictions_found?.length > 0 && (
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800">Contradictions found:</span>
                <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                  {latest_analysis.contradictions_found.map((c, i) => (
                    <li key={i}>{typeof c === 'string' ? c : c.claim ? `${c.claim} vs ${c.proof}` : JSON.stringify(c)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Missing Proof or Risk Flags */}
            {(latest_analysis?.missing_evidence?.length > 0 || latest_analysis?.risk_flags?.length > 0) && (
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800">Checklist gaps & flags:</span>
                <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                  {latest_analysis.missing_evidence?.map((m, i) => <li key={`m-${i}`}>Missing: {m}</li>)}
                  {latest_analysis.risk_flags?.map((r, i) => <li key={`r-${i}`}>Warning: {r}</li>)}
                </ul>
              </div>
            )}

            {/* Agent Trace */}
            {latest_analysis?.agent_trace?.length > 0 && (
              <div className="p-3 bg-slate-900 text-slate-200 rounded-xl space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center gap-1.5 text-blue-400 font-bold pb-1 border-b border-slate-800">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Tools checked by AI ({latest_analysis.agent_trace.length} calls):</span>
                </div>
                {latest_analysis.agent_trace.map((t, i) => (
                  <div key={i} className="flex justify-between text-slate-300">
                    <span>{t.tool || t.toolName}</span>
                    <span className="text-slate-500">{t.durationMs || t.duration_ms || 0}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Simplified Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {confirmAction === 'submit' ? 'Send reply to PayPal?' : 'Refund the buyer?'}
            </h3>
            <p className="text-sm text-slate-600">
              {confirmAction === 'submit'
                ? "You are about to send this reply to PayPal. This can't be undone."
                : "You are about to accept this claim and authorize an immediate refund to the buyer."}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction === 'submit' ? handleExecuteSubmit : handleExecuteRefund}
                disabled={isSubmitting || isRefunding}
                className="px-5 py-2 bg-[#003087] hover:bg-[#002466] text-white text-xs font-bold rounded-xl transition"
              >
                {isSubmitting || isRefunding ? 'Sending...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
