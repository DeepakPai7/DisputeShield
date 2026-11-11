import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getDisputes, getStats, getConfigStatus, getStoreOrders } from '../services/api.js';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [currentTab, setCurrentTab] = useState('disputes'); // 'disputes' | 'try-it' | 'under-the-hood' | 'review'
  const [userRole, setUserRole] = useState(() => localStorage.getItem('disputeshield_role') || 'seller'); // 'seller' | 'buyer'
  const [activeDisputeId, setActiveDisputeId] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [configStatus, setConfigStatus] = useState({
    isSetupRequired: false,
    missingVariables: [],
    paypalClientId: '',
    paypalApiBase: 'https://api-m.sandbox.paypal.com',
    environment: 'SANDBOX',
    activeGeminiModel: 'gemini-3.5-flash'
  });
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const previousDisputeIds = useRef(new Set());

  const addToast = (title, message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, title, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const fetchConfig = async () => {
    try {
      const data = await getConfigStatus();
      setConfigStatus(data);
    } catch (e) {
      console.error('Failed to load config status:', e);
    }
  };

  const fetchDisputesData = async (isInitial = false) => {
    try {
      const data = await getDisputes();
      const list = data.disputes || [];

      // Check for newly detected disputes to trigger friendly toast
      if (!isInitial && previousDisputeIds.current.size > 0) {
        for (const item of list) {
          if (!previousDisputeIds.current.has(item.id) && !previousDisputeIds.current.has(item.paypal_dispute_id)) {
            const sym = item.dispute_currency === 'INR' ? '₹' : (item.dispute_currency === 'EUR' ? '€' : '$');
            addToast(
              'New Refund Claim Received!',
              `Buyer filed a claim for ${sym}${item.dispute_amount}. The AI is looking up your proof now.`,
              'info',
              7000
            );
          }
        }
      }

      previousDisputeIds.current = new Set(list.flatMap(d => [d.id, d.paypal_dispute_id]));
      setDisputes(list);
    } catch (e) {
      console.error('Failed to fetch disputes:', e);
    }
  };

  const switchRole = (role) => {
    setUserRole(role);
    localStorage.setItem('disputeshield_role', role);
    addToast(
      role === 'buyer' ? 'Switched to Buyer Mode' : 'Switched to Seller Mode',
      role === 'buyer'
        ? 'You are now viewing orders as customer Rohan Kumar. You can view your OTP and chat with the seller.'
        : 'You are now in Seller Dashboard. You can review AI letters and manage claims.',
      'info',
      4000
    );
  };

  const fetchCustomerOrders = async () => {
    try {
      const res = await getStoreOrders();
      setCustomerOrders(res.orders || []);
    } catch (e) {
      console.error('Failed to load customer orders:', e);
    }
  };

  const fetchStatsData = async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  };

  const refreshAll = async () => {
    await Promise.all([fetchConfig(), fetchDisputesData(false), fetchStatsData(), fetchCustomerOrders()]);
  };

  const viewDispute = (id) => {
    setActiveDisputeId(id);
    setCurrentTab('review');
  };

  useEffect(() => {
    // Check first-run welcome modal
    const hasSeenWelcome = localStorage.getItem('disputeshield_welcome_seen');
    if (!hasSeenWelcome) {
      setIsWelcomeOpen(true);
    }

    const init = async () => {
      setLoading(true);
      await Promise.all([fetchConfig(), fetchDisputesData(true), fetchStatsData(), fetchCustomerOrders()]);
      setLoading(false);
    };

    init();

    const interval = setInterval(() => {
      fetchDisputesData(false);
      fetchStatsData();
      fetchCustomerOrders();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentTab,
        setCurrentTab,
        userRole,
        setUserRole,
        switchRole,
        activeDisputeId,
        setActiveDisputeId,
        disputes,
        customerOrders,
        fetchCustomerOrders,
        stats,
        configStatus,
        loading,
        toasts,
        isSettingsOpen,
        setIsSettingsOpen,
        isWelcomeOpen,
        setIsWelcomeOpen,
        addToast,
        removeToast,
        refreshAll,
        viewDispute
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
