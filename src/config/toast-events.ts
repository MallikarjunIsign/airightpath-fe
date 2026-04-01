export const TOAST_EVENT = 'app:toast' as const;

export interface ToastEventDetail {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export function dispatchErrorToast(message: string): void {
  window.dispatchEvent(
    new CustomEvent<ToastEventDetail>(TOAST_EVENT, {
      detail: { message, type: 'error' },
    })
  );
}
