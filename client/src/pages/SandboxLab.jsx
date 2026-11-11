import React, { useState, useEffect, useRef } from 'react';
import { 
  searchShop, createShopOrder, captureShopOrder, quickShopCheckout,
  pollPayPalDisputes, createSandboxDispute, getAiPick
} from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import { 
  ShoppingBag, Search, Sparkles, CheckCircle2, ArrowRight, ExternalLink, 
  RefreshCw, Zap, X, ShieldAlert, Package, AlertCircle
} from 'lucide-react';

const SUGGESTION_CHIPS = ['winter jacket', 'wireless earbuds', 'sticker pack', 'running shoes'];

export default function SandboxLab() {
  const { configStatus, addToast, refreshAll, disputes, viewDispute, switchRole } = useApp();

  // Search & Products state
  const [searchQuery, setSearchQuery] = useState('winter jacket');
  const [activeQuery, setActiveQuery] = useState('winter jacket');
  const [products, setProducts] = useState([]);
  const [practiceProducts, setPracticeProducts] = useState([]);
  const [isChannel3Configured, setIsChannel3Configured] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(true);
  const [searchError, setSearchError] = useState(null);
  const [aiPick, setAiPick] = useState(null);
  const [loadingAiPick, setLoadingAiPick] = useState(false);

  // Checkout modal & purchase state
  const [checkoutProduct, setCheckoutProduct] = useState(null);
  const [purchasedOrder, setPurchasedOrder] = useState(null);
  const [checkingOutQuick, setCheckingOutQuick] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [sdkError, setSdkError] = useState(null);

  // Disputes & testing steps
  const [polling, setPolling] = useState(false);
  const [creatingDispute, setCreatingDispute] = useState(false);

  // Perform search against Channel3 API
  const performSearch = async (queryText) => {
    const q = (queryText || '').trim();
    if (!q) return;

    setLoadingSearch(true);
    setSearchError(null);
    setAiPick(null);
    setActiveQuery(q);

    try {
      const res = await searchShop(q, 8);
      setIsChannel3Configured(Boolean(res.configured));
      setPracticeProducts(res.practiceProducts || []);
      
      const items = res.products || [];
      setProducts(items);

      // Trigger optional AI pick in background if we have products
      if (items.length > 0) {
        setLoadingAiPick(true);
        getAiPick(q, items)
          .then(aiRes => {
            if (aiRes?.pick?.best_product_id) {
              setAiPick(aiRes.pick);
            }
          })
          .catch(() => {})
          .finally(() => setLoadingAiPick(false));
      }
    } catch (err) {
      console.error('Search error:', err);
      setSearchError(err.response?.data?.error || err.message || 'Search failed');
    } finally {
      setLoadingSearch(false);
    }
  };

  // Initial load
  useEffect(() => {
    performSearch('winter jacket');
  }, []);

  // Dynamically load PayPal JS SDK
  useEffect(() => {
    if (!configStatus?.paypalClientId) return;

    if (window.paypal && window.paypal.Buttons) {
      setSdkLoaded(true);
      return;
    }

    const existingScript = document.getElementById('paypal-sdk-script');
    if (existingScript) {
      setSdkLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.id = 'paypal-sdk-script';
    script.src = `https://www.paypal.com/sdk/js?client-id=${configStatus.paypalClientId}&currency=USD&intent=capture&disable-funding=paylater,venmo,card`;
    script.async = true;

    script.onload = () => setSdkLoaded(true);
    script.onerror = () => setSdkError('Could not load PayPal checkout buttons.');

    document.body.appendChild(script);
  }, [configStatus?.paypalClientId]);

  // Fast 1-Click Sandbox Test Checkout Handler
  const handleQuickCheckout = async () => {
    if (!checkoutProduct) return;
    setCheckingOutQuick(true);
    try {
      const result = await quickShopCheckout(checkoutProduct.id);
      setPurchasedOrder(result);
      setCheckoutProduct(null);
      addToast('Test Purchase Completed!', `Saved listing snapshot for "${checkoutProduct.title}". Open a claim in Step 2!`, 'success', 8000);
      refreshAll();
    } catch (err) {
      addToast('Checkout Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setCheckingOutQuick(false);
    }
  };

  // Render PayPal Smart Buttons when checkout modal opens
  useEffect(() => {
    if (!checkoutProduct || !sdkLoaded || !window.paypal || !window.paypal.Buttons) return;

    const container = document.getElementById('paypal-checkout-container');
    if (!container) return;
    container.innerHTML = '';

    try {
      window.paypal.Buttons({
        fundingSource: window.paypal.FUNDING.PAYPAL,
        style: {
          layout: 'vertical',
          color: 'gold',
          shape: 'rect',
          label: 'paypal'
        },
        createOrder: async () => {
          try {
            const data = await createShopOrder(checkoutProduct.id);
            return data.orderId;
          } catch (err) {
            addToast('Order Error', err.response?.data?.error || err.message || 'Could not start PayPal payment', 'error');
            throw err;
          }
        },
        onApprove: async (data) => {
          try {
            const result = await captureShopOrder(data.orderId, checkoutProduct.id);
            setPurchasedOrder(result);
            setCheckoutProduct(null);
            addToast('Test Purchase Completed!', `Saved listing snapshot for "${checkoutProduct.title}". Open a claim in Step 2!`, 'success', 8000);
            refreshAll();
          } catch (err) {
            addToast('Capture Error', err.response?.data?.error || err.message, 'error');
          }
        },
        onError: (err) => {
          console.error('PayPal button error:', err);
          addToast('PayPal Sandbox Note', 'To test checkout, log into PayPal with a Sandbox buyer account from your PayPal Developer dashboard.', 'info', 7000);
        }
      }).render('#paypal-checkout-container');
    } catch (e) {
      console.error('Error rendering buttons:', e);
    }
  }, [checkoutProduct, sdkLoaded]);

  // Step 2 & 3 Handlers
  const handleCreateDisputeForMe = async () => {
    setCreatingDispute(true);
    try {
      const res = await createSandboxDispute({
        productKey: purchasedOrder?.product?.scenarioKey || 'jacket',
        reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED'
      });
      addToast('Dispute Opened!', 'The test dispute is ready for review with your product snapshot.', 'success');
      await refreshAll();
      if (res.disputeRecord?.id) {
        viewDispute(res.disputeRecord.id);
      }
    } catch (err) {
      addToast('Could not open automatically', 'Please open it manually on sandbox.paypal.com.', 'warning');
    } finally {
      setCreatingDispute(false);
    }
  };

  const handleCheckDisputes = async () => {
    setPolling(true);
    try {
      await pollPayPalDisputes();
      await refreshAll();
      addToast('Checked PayPal', 'Updated disputes from PayPal.', 'info');
    } catch (err) {
      addToast('Check Failed', err.message, 'error');
    } finally {
      setPolling(false);
    }
  };

  const hasPurchased = Boolean(purchasedOrder);
  const latestDispute = disputes[0];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Header Opening Sentence */}
      <div className="space-y-2 text-center sm:text-left">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center justify-center sm:justify-start gap-2.5">
          <span>Try it</span>
          <span className="text-xs font-bold text-[#003087] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full uppercase tracking-wider">
            Practice Store
          </span>
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-3xl">
          Search real products from Channel3, pay with fake money in PayPal Sandbox, and see how DisputeShield locks in your listing snapshot as dispute proof.
        </p>
      </div>

      {/* 3-Step Guided Checklist */}
      <div className="space-y-6">

        {/* ================= STEP 1: Buy something ================= */}
        <div className={`p-6 sm:p-7 rounded-3xl border transition-all ${
          hasPurchased ? 'bg-emerald-50/40 border-emerald-300' : 'bg-white border-slate-200 shadow-xs'
        } space-y-6`}>
          
          {/* Step 1 Title */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                hasPurchased ? 'bg-emerald-600 text-white shadow-xs' : 'bg-blue-100 text-[#003087]'
              }`}>
                {hasPurchased ? '✓' : '1'}
              </span>
              <span>Step 1: Buy something</span>
            </h2>
            {hasPurchased && (
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-full">
                Purchased & Snapshot Saved
              </span>
            )}
          </div>

          {/* Setup Card if Channel3 key is not configured */}
          {!isChannel3Configured && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold">Add your Channel3 key to browse real products</h4>
                <p className="text-xs text-amber-800 leading-relaxed">
                  You can get a free key at <a href="https://trychannel3.com" target="_blank" rel="noreferrer" className="underline font-bold">trychannel3.com</a> and add it to <code className="bg-amber-100 px-1 py-0.5 rounded">server/.env</code>. Showing practice products below in the meantime.
                </p>
              </div>
            </div>
          )}

          {/* Search Box & Suggestion Chips (when Channel3 is enabled) */}
          {isChannel3Configured && (
            <div className="space-y-3">
              <form 
                onSubmit={(e) => { e.preventDefault(); performSearch(searchQuery); }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for a product, e.g. winter jacket"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#003087] focus:bg-white transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingSearch}
                  className="px-5 py-2.5 bg-[#003087] hover:bg-[#002466] text-white text-sm font-bold rounded-xl transition shadow-xs shrink-0 flex items-center gap-1.5"
                >
                  {loadingSearch ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Search</span>
                </button>
              </form>

              {/* 4 Suggestion Chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400 font-semibold">Try:</span>
                {SUGGESTION_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => { setSearchQuery(chip); performSearch(chip); }}
                    className={`px-3 py-1 rounded-lg border font-medium transition ${
                      activeQuery.toLowerCase() === chip.toLowerCase()
                        ? 'bg-blue-50 border-blue-300 text-[#003087] font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Friendly Tip Line */}
              <p className="text-xs text-slate-500 italic flex items-center gap-1.5 pt-1">
                <span>💡</span>
                <span>Tip: try a very cheap item (under $5) to see the AI recommend a refund instead of a fight.</span>
              </p>
            </div>
          )}

          {/* Product Cards Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
              <span>{isChannel3Configured ? `Products for "${activeQuery}"` : 'Practice Products'}</span>
              {loadingSearch && <span className="text-[#003087] flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Searching Channel3...</span>}
            </div>

            {loadingSearch ? (
              /* Skeletons */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(n => (
                  <div key={n} className="border border-slate-100 rounded-2xl p-4 bg-slate-50 animate-pulse space-y-3">
                    <div className="w-full h-32 bg-slate-200 rounded-xl" />
                    <div className="h-4 bg-slate-200 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 rounded w-1/2" />
                    <div className="h-8 bg-slate-200 rounded-lg w-full mt-2" />
                  </div>
                ))}
              </div>
            ) : searchError ? (
              <div className="p-6 text-center border border-rose-200 bg-rose-50/50 rounded-2xl space-y-3">
                <p className="text-sm font-bold text-rose-800">{searchError}</p>
                <button
                  onClick={() => performSearch(activeQuery)}
                  className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl"
                >
                  Retry Search
                </button>
              </div>
            ) : products.length > 0 ? (
              /* Channel3 Real Products */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {products.map(p => {
                  const isAiPick = aiPick?.best_product_id === p.id;

                  return (
                    <div
                      key={p.id}
                      className={`relative bg-white rounded-2xl border transition-all flex flex-col justify-between overflow-hidden shadow-2xs hover:shadow-md ${
                        isAiPick ? 'border-[#003087] ring-1 ring-[#003087]' : 'border-slate-200'
                      }`}
                    >
                      {/* AI Pick Badge */}
                      {isAiPick && (
                        <div className="absolute top-2 left-2 z-10 bg-[#003087] text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          <span>AI Pick</span>
                        </div>
                      )}

                      {/* Photo */}
                      <div className="w-full h-36 bg-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-100">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.title}
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <Package className="w-8 h-8 text-slate-300" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-2.5">
                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
                            <span className="truncate">{p.brand}</span>
                            <span className="text-[11px] text-slate-400">{p.domain}</span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2" title={p.title}>
                            {p.title}
                          </h3>
                        </div>

                        {/* Price & Action */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-base font-black text-slate-900 font-mono">
                            ${Number(p.price).toFixed(2)}
                          </span>

                          <button
                            onClick={() => setCheckoutProduct(p)}
                            className="px-3.5 py-1.5 bg-[#003087] hover:bg-[#002466] text-white text-xs font-bold rounded-xl transition shadow-2xs"
                          >
                            Buy with PayPal
                          </button>
                        </div>
                      </div>

                      {/* AI Reason banner if this is the AI pick */}
                      {isAiPick && aiPick?.reason && (
                        <div className="bg-blue-50 px-3 py-1.5 border-t border-blue-100 text-[10px] font-semibold text-[#003087]">
                          {aiPick.reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Fallback to Practice Products */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {practiceProducts.map(p => (
                  <div key={p.id} className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-xs font-bold text-[#003087] font-mono block mb-1">
                        ${p.price}.00 USD
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">{p.name}</h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
                    </div>
                    <button
                      onClick={() => setCheckoutProduct({
                        id: p.id,
                        title: p.name,
                        brand: 'Practice Product',
                        price: p.price,
                        currency: p.currency,
                        description: p.description,
                        scenarioKey: p.scenarioKey
                      })}
                      className="w-full py-2 bg-[#003087] hover:bg-[#002466] text-white text-xs font-bold rounded-xl transition"
                    >
                      Buy with PayPal
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Purchase Success Card (Shown after checkout completes) */}
          {hasPurchased && purchasedOrder && (
            <div className="p-5 rounded-2xl bg-white border-2 border-emerald-400 shadow-sm space-y-3.5 animate-fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Purchase Completed (PayPal Sandbox)</span>
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Order #{purchasedOrder.orderId}
                </span>
              </div>

              <div className="flex items-center gap-4">
                {purchasedOrder.product?.image_url ? (
                  <img
                    src={purchasedOrder.product.image_url}
                    alt={purchasedOrder.product.title}
                    className="w-16 h-16 object-cover rounded-xl border border-slate-200 bg-slate-50 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-blue-50 text-[#003087] flex items-center justify-center font-bold shrink-0">
                    <Package className="w-8 h-8 text-[#003087]" />
                  </div>
                )}
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">
                    {purchasedOrder.product?.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Paid: ${Number(purchasedOrder.product?.price || 0).toFixed(2)} USD • Capture ID: {purchasedOrder.captureId}
                  </p>
                  <p className="text-xs text-emerald-700 font-semibold pt-1">
                    ✓ Channel3 listing snapshot recorded with timestamp & retailer metadata.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">
                  Next Step: Open a dispute as the test customer (Step 2 below).
                </span>
                <button
                  onClick={handleCreateDisputeForMe}
                  disabled={creatingDispute}
                  className="px-3.5 py-1.5 bg-[#003087] hover:bg-[#002466] text-white font-bold rounded-lg transition flex items-center gap-1"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>{creatingDispute ? 'Opening claim...' : 'Open dispute automatically'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick link to Buyer Portal */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <span className="text-slate-600 leading-relaxed">
              Want to see what your customer sees? Switch to Buyer Mode to check out their confidential delivery OTP code and live store chat.
            </span>
            <button
              onClick={() => switchRole('buyer')}
              className="px-4 py-2 bg-[#003087] hover:bg-[#002466] text-white rounded-xl font-bold shrink-0 transition-colors shadow-2xs"
            >
              Open Buyer Portal →
            </button>
          </div>
        </div>

        {/* ================= STEP 2: Open a dispute as the customer ================= */}
        <div className="p-6 sm:p-7 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-blue-100 text-[#003087] flex items-center justify-center text-xs font-bold">
              2
            </span>
            <span>Step 2: Open a dispute as the customer</span>
          </h2>

          <p className="text-sm text-slate-600">
            Log in as the buyer on PayPal Sandbox and report an issue with your purchase:
          </p>

          <ol className="text-sm text-slate-700 space-y-2 list-decimal list-inside pl-1 leading-relaxed">
            <li>
              Open the{' '}
              <a
                href="https://www.sandbox.paypal.com/disputes"
                target="_blank"
                rel="noreferrer"
                className="text-[#003087] font-semibold underline inline-flex items-center gap-1"
              >
                PayPal Sandbox Resolution Center <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </li>
            <li>Log in with your test buyer credentials.</li>
            <li>Find your payment and click <strong>"Report a problem"</strong>.</li>
            <li>Select <em>"I didn't receive an item"</em> and click submit.</li>
          </ol>

          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs text-slate-500">Or use one-click test shortcut:</span>
            <button
              onClick={handleCreateDisputeForMe}
              disabled={creatingDispute}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-[#003087]" />
              <span>{creatingDispute ? 'Opening test claim...' : 'Create the dispute for me'}</span>
            </button>
          </div>
        </div>

        {/* ================= STEP 3: Come back and check ================= */}
        <div className="p-6 sm:p-7 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-blue-100 text-[#003087] flex items-center justify-center text-xs font-bold">
              3
            </span>
            <span>Step 3: Come back and check</span>
          </h2>

          <p className="text-sm text-slate-600">
            Once you submit the claim on PayPal, click below to have DisputeShield pull the dispute and evaluate the Channel3 product snapshot and delivery proofs.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleCheckDisputes}
              disabled={polling}
              className="px-6 py-3 bg-[#003087] hover:bg-[#002466] text-white text-sm font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${polling ? 'animate-spin' : ''}`} />
              <span>{polling ? 'Checking PayPal...' : 'Check PayPal for new disputes'}</span>
            </button>

            {latestDispute && (
              <button
                onClick={() => viewDispute(latestDispute.id)}
                className="px-5 py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-sm font-bold rounded-xl transition flex items-center gap-1.5"
              >
                <span>Found it! Open the dispute</span>
                <ArrowRight className="w-4 h-4 text-emerald-700" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================= CHECKOUT MODAL ================= */}
      {checkoutProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl relative border border-slate-100">
            {/* Close Button */}
            <button
              onClick={() => setCheckoutProduct(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900">
              Demo Checkout
            </h3>

            {/* Product Summary */}
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
              {checkoutProduct.image_url ? (
                <img
                  src={checkoutProduct.image_url}
                  alt={checkoutProduct.title}
                  className="w-20 h-20 object-cover rounded-xl border border-slate-200 bg-white shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-blue-50 text-[#003087] flex items-center justify-center shrink-0">
                  <Package className="w-10 h-10 text-[#003087]" />
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#003087]">
                  {checkoutProduct.brand || 'Product'}
                </span>
                <h4 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                  {checkoutProduct.title}
                </h4>
                <div className="text-base font-black text-slate-900 font-mono pt-1">
                  ${Number(checkoutProduct.price).toFixed(2)} USD
                </div>
              </div>
            </div>

            {/* Description */}
            {checkoutProduct.description && (
              <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                {checkoutProduct.description}
              </p>
            )}

            {/* External Retailer Link */}
            {checkoutProduct.offer_url && (
              <div className="text-xs text-slate-500">
                <span>Catalog source: </span>
                <a
                  href={checkoutProduct.offer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#003087] font-semibold underline inline-flex items-center gap-1 hover:text-blue-800"
                >
                  View at retailer ({checkoutProduct.domain || 'Merchant'}) <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Mandatory Demo Label */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Demo checkout. Test money only. Nothing real is bought or shipped.</span>
            </div>

            {/* Quick 1-Click Sandbox Test Checkout Button */}
            <button
              type="button"
              onClick={handleQuickCheckout}
              disabled={checkingOutQuick}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {checkingOutQuick ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Sandbox Order...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>⚡ Fast Test Purchase (Sandbox 1-Click)</span>
                </>
              )}
            </button>

            <div className="relative flex items-center justify-center my-1">
              <div className="border-t border-slate-200 w-full"></div>
              <span className="bg-white px-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">
                or pay via official paypal window
              </span>
              <div className="border-t border-slate-200 w-full"></div>
            </div>

            {/* PayPal Smart Buttons Container */}
            <div>
              {sdkError ? (
                <p className="text-xs text-rose-600 text-center py-2">{sdkError}</p>
              ) : !sdkLoaded ? (
                <div className="p-4 text-center text-xs text-slate-400">Loading PayPal buttons...</div>
              ) : (
                <div id="paypal-checkout-container"></div>
              )}
            </div>

            <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5 leading-relaxed">
              <strong>💡 PayPal Window Note:</strong> If the PayPal popup shows <em>"Things don't appear to be working at the moment"</em>, open this page in an <strong>Incognito / Private browser window</strong> to prevent live PayPal account cookie conflicts, or click the green <strong>1-Click</strong> button above!
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
