import { useEffect, useCallback, useRef } from 'react';

const STORAGE_PREFIX = 'abastech_form_';

/**
 * Persists form state to sessionStorage so it survives mobile camera round-trips.
 * When the mobile browser opens the camera app, the page can be unloaded from memory.
 * This hook saves form state before the camera opens and restores it on remount.
 */
export function useFormPersistence<T extends Record<string, any>>(
  formId: string,
  getState: () => T,
  setState: (state: T) => void
) {
  const key = `${STORAGE_PREFIX}${formId}`;
  const hasRestored = useRef(false);

  // Restore state on mount (only once)
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    try {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as T;
        setState(parsed);
        console.log(`[FormPersistence] Restored form state for ${formId}`);
      }
    } catch (e) {
      console.warn('[FormPersistence] Failed to restore:', e);
    }
  }, [key, formId, setState]);

  // Save current state to sessionStorage
  const saveState = useCallback(() => {
    try {
      const state = getState();
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn('[FormPersistence] Failed to save:', e);
    }
  }, [key, getState]);

  // Clear persisted state (call after successful submit)
  const clearState = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {
      // ignore
    }
  }, [key]);

  // Save state before the page is hidden (camera opens)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveState();
      }
    };

    const handleBeforeUnload = () => {
      saveState();
    };

    const handlePageHide = () => {
      saveState();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [saveState]);

  return { saveState, clearState };
}
