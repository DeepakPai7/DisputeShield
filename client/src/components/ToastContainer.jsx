import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = useApp();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        let Icon = Info;
        let colorClasses = 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/90 dark:text-blue-100 dark:border-blue-800';
        let iconColor = 'text-blue-500';

        if (toast.type === 'success') {
          Icon = CheckCircle;
          colorClasses = 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/90 dark:text-emerald-100 dark:border-emerald-800';
          iconColor = 'text-emerald-500';
        } else if (toast.type === 'warning') {
          Icon = AlertTriangle;
          colorClasses = 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/90 dark:text-amber-100 dark:border-amber-700';
          iconColor = 'text-amber-500';
        } else if (toast.type === 'error') {
          Icon = AlertCircle;
          colorClasses = 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/90 dark:text-rose-100 dark:border-rose-800';
          iconColor = 'text-rose-500';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl border shadow-lg backdrop-blur-sm transition-all duration-300 transform translate-y-0 ${colorClasses}`}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-0.5">
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <div className="ml-3 w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.message && <p className="mt-1 text-xs opacity-90 leading-relaxed">{toast.message}</p>}
              </div>
              <div className="ml-4 flex-shrink-0 flex">
                <button
                  onClick={() => removeToast(toast.id)}
                  className="rounded-md inline-flex text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

