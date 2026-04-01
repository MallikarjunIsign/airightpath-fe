import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`
          relative w-full ${sizes[size]} mx-4
          bg-[var(--bgElevated,var(--cardBg))]
          rounded-2xl
          shadow-[0_24px_64px_rgba(0,0,0,0.24),0_8px_24px_rgba(0,0,0,0.16)]
          border border-[var(--borderMuted,var(--cardBorder))]/50
          max-h-[85vh] flex flex-col
          animate-scale-in
        `}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-5 flex-shrink-0">
            <h2 className="text-lg font-semibold text-[var(--text)] font-heading">{title}</h2>
            <button
              onClick={onClose}
              className="
                p-1.5 rounded-xl
                text-[var(--textTertiary)]
                hover:text-[var(--text)]
                hover:bg-[var(--bgOverlay,var(--surface1))]
                transition-all duration-150
              "
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div
          className={`
            px-6 overflow-y-auto scrollbar-thin flex-1
            ${title ? 'pb-6' : 'py-6'}
          `}
        >
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--borderMuted,var(--border))]/50 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-[var(--textSecondary)]">{message}</p>
    </Modal>
  );
}
