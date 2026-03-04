import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
}

interface ToastContextType {
  toast: (opts: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((opts: Omit<ToastItem, 'id'>) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev.slice(-3), { ...opts, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const isSuccess = t.variant === 'success';
            const isError = t.variant === 'destructive';
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 60, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${
                  isSuccess ? 'bg-emerald-900/80 border-emerald-500/40' :
                  isError   ? 'bg-red-900/80 border-red-500/40' :
                              'bg-slate-800/90 border-white/15'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isSuccess ? <CheckCircle className="w-5 h-5 text-emerald-400" /> :
                   isError   ? <XCircle className="w-5 h-5 text-red-400" /> :
                               <Info className="w-5 h-5 text-cyan-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{t.title}</p>
                  {t.description && <p className="text-xs text-white/70 mt-0.5">{t.description}</p>}
                </div>
                <button onClick={() => dismiss(t.id)} className="shrink-0 text-white/40 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
