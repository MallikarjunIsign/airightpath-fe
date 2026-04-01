import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { TOAST_EVENT, type ToastEventDetail } from '@/config/toast-events';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type: Toast['type'], duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type'], duration = 5000) => {
    const id = Math.random().toString(36).substring(7);
    const toast: Toast = { id, message, type, duration };

    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const recentToasts = useRef<Set<string>>(new Set());

  useEffect(() => {
    function handleToastEvent(e: Event) {
      const { message, type } = (e as CustomEvent<ToastEventDetail>).detail;
      const key = `${type}:${message}`;
      if (recentToasts.current.has(key)) return;
      recentToasts.current.add(key);
      setTimeout(() => recentToasts.current.delete(key), 2000);
      showToast(message, type);
    }
    window.addEventListener(TOAST_EVENT, handleToastEvent);
    return () => window.removeEventListener(TOAST_EVENT, handleToastEvent);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2.5 max-w-md">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const icons = {
    success: <CheckCircle size={18} />,
    error: <XCircle size={18} />,
    warning: <AlertCircle size={18} />,
    info: <Info size={18} />,
  };

  const accentColors = {
    success: 'var(--success)',
    error: 'var(--error)',
    warning: 'var(--warning)',
    info: 'var(--info)',
  };

  return (
    <div
      className="
        flex items-start gap-3 p-4
        rounded-xl
        bg-[var(--bgElevated,var(--cardBg))]
        border border-[var(--borderMuted,var(--cardBorder))]/50
        shadow-[0_8px_32px_rgba(0,0,0,0.16),0_2px_8px_rgba(0,0,0,0.12)]
        animate-slide-in-right
        backdrop-blur-xl
      "
    >
      {/* Accent left bar */}
      <div
        className="w-0.5 self-stretch rounded-full flex-shrink-0 -ml-0.5"
        style={{ backgroundColor: accentColors[toast.type] }}
      />
      <div
        className="flex-shrink-0 mt-0.5"
        style={{ color: accentColors[toast.type] }}
      >
        {icons[toast.type]}
      </div>
      <p className="flex-1 text-sm font-medium text-[var(--text)]">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="flex-shrink-0 text-[var(--textTertiary)] hover:text-[var(--text)] p-0.5 rounded-lg transition-colors duration-150"
      >
        <X size={14} />
      </button>
    </div>
  );
}
