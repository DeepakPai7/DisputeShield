import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { getStoreOrders, verifyDeliveryOtp, getChatMessages, sendChatMessage, createSandboxDispute } from '../services/api.js';
import { Package, ShieldCheck, CheckCircle2, KeyRound, MessageSquare, Send, AlertTriangle, ArrowRight, RefreshCw, UserCheck } from 'lucide-react';

export default function BuyerPortal() {
  const { customerOrders, fetchCustomerOrders, addToast, setCurrentTab } = useApp();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isFilingDispute, setIsFilingDispute] = useState(false);

  // Default to first order if available
  useEffect(() => {
    if (customerOrders.length > 0 && !selectedOrder) {
      setSelectedOrder(customerOrders[0]);
    }
  }, [customerOrders]);

  // Load chat messages when selected order changes
  useEffect(() => {
    if (selectedOrder) {
      loadChat();
      setOtpInput(selectedOrder.delivery_otp || '');
    }
  }, [selectedOrder]);

  const loadChat = async () => {
    if (!selectedOrder) return;
    try {
      const res = await getChatMessages(selectedOrder.id);
      setMessages(res.messages || []);
    } catch (e) {
      console.error('Failed to load chat:', e);
    }
  };

  const handleVerifyOtp = async () => {
    if (!selectedOrder || !otpInput.trim()) return;
    setIsVerifyingOtp(true);
    try {
      const res = await verifyDeliveryOtp(selectedOrder.id, otpInput.trim());
      addToast('Handshake Verified!', res.message, 'success');
      await fetchCustomerOrders();
      // Refresh selected order state
      const updatedOrders = await getStoreOrders();
      const updated = updatedOrders.orders?.find(o => o.id === selectedOrder.id);
      if (updated) setSelectedOrder(updated);
      loadChat();
    } catch (err) {
      addToast('Verification Failed', err.response?.data?.error || err.message, 'warning');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSendMessage = async (customText = null) => {
    const textToSend = customText || newMessage;
    if (!selectedOrder || !textToSend.trim()) return;
    setIsSendingChat(true);
    try {
      await sendChatMessage(selectedOrder.id, {
        sender_role: 'buyer',
        sender_name: selectedOrder.customer_name || 'Rohan Kumar',
        message_text: textToSend.trim(),
        channel: 'Live Web Chat'
      });
      setNewMessage('');
      loadChat();
      addToast('Message Sent', 'Your message has been delivered to the store.', 'info', 2500);
    } catch (err) {
      addToast('Chat Error', err.response?.data?.error || err.message, 'warning');
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleSimulateDispute = async () => {
    if (!selectedOrder) return;
    setIsFilingDispute(true);
    try {
      await createSandboxDispute({
        order_id: selectedOrder.id,
        reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
        note: 'Customer filed dispute: Package shows delivered, but customer claims they never received it.'
      });
      addToast('Dispute Opened on PayPal', 'Dispute created! Switch back to Seller Mode to see how DisputeShield defends you.', 'info', 6000);
      setCurrentTab('disputes');
    } catch (err) {
      addToast('Error', err.response?.data?.error || err.message, 'warning');
    } finally {
      setIsFilingDispute(false);
    }
  };

  const parseItems = (jsonStr) => {
    try {
      return JSON.parse(jsonStr) || [];
    } catch (e) {
      return [];
    }
  };

  return (
    <div className="py-8 max-w-5xl mx-auto px-4 sm:px-6">
      {/* Buyer Welcome Banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-lg mb-1">
            <UserCheck className="w-5 h-5" />
            <span>Buyer Portal: Rohan Kumar</span>
          </div>
          <p className="text-sm text-emerald-700">
            You are logged in as the customer. View your orders, check your secret delivery OTP code, and chat in real-time with the seller.
          </p>
        </div>
        <button
          onClick={fetchCustomerOrders}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Orders
        </button>
      </div>

      {customerOrders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">No orders placed yet</h3>
          <p className="text-sm text-slate-600 mb-6 max-w-md mx-auto">
            You haven't bought anything from the practice store yet. Make a quick sandbox purchase to see your order and delivery OTP.
          </p>
          <button
            onClick={() => setCurrentTab('try-it')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#003087] text-white text-sm font-semibold hover:bg-blue-800 transition-colors shadow-xs"
          >
            Go to Practice Store
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Orders list & Delivery OTP */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-[#003087]" />
                Your Purchases
              </h2>

              <div className="space-y-3">
                {customerOrders.map((ord) => {
                  const items = parseItems(ord.items_json);
                  const isSelected = selectedOrder?.id === ord.id;
                  const itemTitle = items[0]?.name || 'Practice Store Item';
                  const sym = ord.currency === 'INR' ? '₹' : (ord.currency === 'EUR' ? '€' : '$');

                  return (
                    <div
                      key={ord.id}
                      onClick={() => setSelectedOrder(ord)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#003087] bg-blue-50/50 shadow-xs ring-1 ring-[#003087]'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900 text-sm">{itemTitle}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Order #{ord.id} • {new Date(ord.order_date).toLocaleDateString()}
                          </div>
                          {ord.tracking_number && (
                            <div className="text-xs font-mono text-slate-600 mt-1">
                              Tracking: {ord.tracking_number} ({ord.carrier || 'Courier'})
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-slate-900">{sym}{Number(ord.total_amount).toFixed(2)}</div>
                          <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full mt-1 ${
                            ord.otp_verified
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {ord.otp_verified ? 'Delivered (OTP Verified)' : 'Out for Delivery'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* OTP Handshake Delivery Box */}
            {selectedOrder && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-[#003087]" />
                    Delivery Verification Handshake (OTP)
                  </h3>
                  {selectedOrder.otp_verified ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Verified
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                      Handshake Pending
                    </span>
                  )}
                </div>

                {selectedOrder.otp_verified ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-900">
                    <div className="flex items-center gap-2 font-bold text-sm mb-1">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      Delivery Handshake Confirmed!
                    </div>
                    <p className="text-xs text-emerald-700 mb-3">
                      The delivery person entered your secret code upon handing you the package. Both you and the seller received this tamper-proof verification certificate:
                    </p>
                    <div className="bg-white border border-emerald-300 rounded-lg p-3 text-center">
                      <span className="text-xs text-slate-500 block uppercase tracking-wider font-semibold">Unique Handshake Proof ID</span>
                      <span className="text-base font-mono font-bold text-[#003087] select-all">
                        {selectedOrder.unique_delivery_id || 'OTP-DELV-VERIFIED'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-center">
                      <span className="text-xs text-slate-600 block uppercase font-semibold tracking-wider mb-1">
                        Your Secret Delivery Passcode (Give to Courier)
                      </span>
                      <div className="text-3xl font-mono font-extrabold tracking-widest text-[#003087] py-1 select-all">
                        {selectedOrder.delivery_otp || '849201'}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        When the courier arrives, tell them this code. It proves you personally received the package.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleVerifyOtp}
                        disabled={isVerifyingOtp}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
                      >
                        {isVerifyingOtp ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Verifying Handshake...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Simulate Courier Handshake (Verify OTP)
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Simulate Dispute on PayPal Button */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Want to test DisputeShield AI?</span>
                  <button
                    onClick={handleSimulateDispute}
                    disabled={isFilingDispute}
                    className="text-rose-600 font-semibold hover:text-rose-700 underline"
                  >
                    Simulate "Item Not Received" Dispute on PayPal
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Real Two-Way Chat */}
          <div className="lg:col-span-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col h-[580px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-[#003087]" />
                  Chat with Store Support
                </h3>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Online" />
              </div>

              {/* Chat Messages Log */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-sm">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    No messages yet. Send a message to chat with the store!
                  </div>
                ) : (
                  messages.map((m) => {
                    const isBuyer = m.sender_role === 'buyer' || m.sender === 'Customer' || m.sender === selectedOrder?.customer_name;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isBuyer ? 'items-end' : 'items-start'}`}
                      >
                        <span className="text-[10px] text-slate-400 mb-0.5 px-1 font-medium">
                          {isBuyer ? 'You (Buyer)' : 'Store Support'} • {new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                            isBuyer
                              ? 'bg-[#003087] text-white rounded-tr-xs'
                              : 'bg-slate-100 text-slate-800 rounded-tl-xs border border-slate-200'
                          }`}
                        >
                          {m.message_text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Quick suggestion chips */}
              <div className="pt-3 pb-2 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">Quick message templates:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => handleSendMessage("Hi, yes got the jacket today! Fits great, thanks a lot!")}
                    className="px-2.5 py-1 text-xs rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    "Got the jacket today, thanks!"
                  </button>
                  <button
                    onClick={() => handleSendMessage("I gave the delivery person the OTP code.")}
                    className="px-2.5 py-1 text-xs rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    "Gave OTP code to delivery"
                  </button>
                </div>
              </div>

              {/* Chat Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2 pt-2"
              >
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message to the seller..."
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden focus:ring-2 focus:ring-[#003087] focus:border-[#003087]"
                />
                <button
                  type="submit"
                  disabled={isSendingChat || !newMessage.trim()}
                  className="p-2 rounded-xl bg-[#003087] text-white hover:bg-blue-800 disabled:opacity-40 transition-colors"
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

