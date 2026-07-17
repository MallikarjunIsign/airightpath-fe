import { useState, useEffect, Dispatch, SetStateAction } from 'react';

/**
 * Drop-in replacement for `useState` that persists the value so it survives a
 * page refresh/reload. Backed by `sessionStorage` by default (per-tab, cleared
 * when the tab closes) — ideal for filter/selection controls (dropdowns, status
 * filters, search boxes) that should keep their value when the user reloads.
 *
 * Pass `localStorage` as the third arg if the value should also persist across
 * browser sessions.
 *
 * @param key           Stable, unique key for this piece of state.
 * @param defaultValue  Value used on first load (or if nothing is stored).
 * @param storage       Storage backend (defaults to sessionStorage).
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  storage: Storage = sessionStorage,
): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = `rightpath:persist:${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = storage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // Corrupt/unavailable storage — fall back to the default.
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      storage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ignore quota / serialization / private-mode errors.
    }
  }, [storageKey, storage, value]);

  return [value, setValue];
}
