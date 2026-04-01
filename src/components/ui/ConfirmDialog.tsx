import { ReactNode } from 'react';
import { AlertTriangle, Info, CheckCircle, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  isLoading?: boolean;
  icon?: ReactNode;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
  icon,
}: ConfirmDialogProps) {
  const variantConfig = {
    danger: {
      icon: <Trash2 size={24} />,
      iconBg: 'bg-[var(--errorMuted,var(--errorLight))] text-[var(--error)]',
      buttonVariant: 'danger' as const,
    },
    warning: {
      icon: <AlertTriangle size={24} />,
      iconBg: 'bg-[var(--warningMuted,var(--warningLight))] text-[var(--warning)]',
      buttonVariant: 'primary' as const,
    },
    info: {
      icon: <Info size={24} />,
      iconBg: 'bg-[var(--infoMuted,var(--infoLight))] text-[var(--info)]',
      buttonVariant: 'primary' as const,
    },
    success: {
      icon: <CheckCircle size={24} />,
      iconBg: 'bg-[var(--successMuted,var(--successLight))] text-[var(--success)]',
      buttonVariant: 'primary' as const,
    },
  };

  const config = variantConfig[variant];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            variant={config.buttonVariant}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center text-center py-2">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${config.iconBg}`}
        >
          {icon || config.icon}
        </div>
        <h3 className="text-lg font-semibold text-[var(--text)] mb-2 font-heading">{title}</h3>
        <div className="text-sm text-[var(--textSecondary)] leading-relaxed">{message}</div>
      </div>
    </Modal>
  );
}
