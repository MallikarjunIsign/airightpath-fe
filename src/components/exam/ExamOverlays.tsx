import { Camera, ShieldAlert, Maximize, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Blocking overlay for phones and tablets.
 *
 * Not merely a layout preference: the coding editor needs a physical keyboard,
 * the proctoring needs fullscreen and a stable front camera, and a mobile
 * browser will happily drop both when a call or notification arrives. Letting
 * someone start on a phone means failing them for their device.
 */
export function DesktopRequiredOverlay() {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="text-center p-8 rounded-2xl bg-[var(--cardBg)] border border-[var(--border)] max-w-md shadow-2xl">
        <Monitor className="w-16 h-16 text-[var(--primary)] mx-auto mb-4" />
        <h2 className="text-xl font-bold text-[var(--text)] mb-2">Desktop or laptop required</h2>
        <p className="text-[var(--textSecondary)] mb-4">
          This exam cannot be taken on a phone or tablet. Please switch to a desktop or laptop
          with a webcam, a keyboard and a stable internet connection.
        </p>
        <p className="text-sm text-[var(--textTertiary)]">
          Your exam has not been started, and no attempt has been recorded.
        </p>
      </div>
    </div>
  );
}

/** Blocking overlay shown while the camera is required but not yet live. */
export function CameraRequiredOverlay({
  message,
  onRetry,
}: Readonly<{ message: string | null; onRetry: () => void }>) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="text-center p-8 rounded-2xl bg-[var(--cardBg)] border border-[var(--border)] max-w-md mx-4 shadow-2xl">
        <Camera className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-[var(--text)] mb-2">Camera Required</h2>
        <p className="text-[var(--textSecondary)] mb-6">
          {message} Your exam cannot continue until camera access is enabled.
        </p>
        <Button onClick={onRetry} leftIcon={<Camera size={16} />}>
          Enable Camera &amp; Retry
        </Button>
      </div>
    </div>
  );
}

/** Blocking overlay shown while the exam is out of required fullscreen mode. */
export function FullscreenRequiredOverlay({ onReturn }: Readonly<{ onReturn: () => void }>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="text-center p-8 rounded-2xl bg-[var(--cardBg)] border border-[var(--border)] max-w-md mx-4 shadow-2xl">
        <ShieldAlert className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-[var(--text)] mb-2">Fullscreen Required</h2>
        <p className="text-[var(--textSecondary)] mb-6">
          You must remain in fullscreen mode during the exam. Exiting fullscreen is recorded as a warning.
        </p>
        <Button onClick={onReturn} leftIcon={<Maximize size={16} />}>
          Return to Fullscreen
        </Button>
      </div>
    </div>
  );
}
