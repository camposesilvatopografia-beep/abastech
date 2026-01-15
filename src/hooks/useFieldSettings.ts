import { useState, useEffect, useCallback } from 'react';

const FIELD_SETTINGS_KEY = 'abastech_field_settings';

interface FieldSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

const defaultSettings: FieldSettings = {
  soundEnabled: true,
  vibrationEnabled: true,
};

export function useFieldSettings() {
  const [settings, setSettings] = useState<FieldSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FIELD_SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch {
      // Use defaults
    }
    setLoaded(true);
  }, []);

  // Save settings to localStorage whenever they change
  const updateSettings = useCallback((updates: Partial<FieldSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      try {
        localStorage.setItem(FIELD_SETTINGS_KEY, JSON.stringify(newSettings));
      } catch {
        // Ignore storage errors
      }
      return newSettings;
    });
  }, []);

  const toggleSound = useCallback(() => {
    updateSettings({ soundEnabled: !settings.soundEnabled });
  }, [settings.soundEnabled, updateSettings]);

  const toggleVibration = useCallback(() => {
    updateSettings({ vibrationEnabled: !settings.vibrationEnabled });
  }, [settings.vibrationEnabled, updateSettings]);

  return {
    settings,
    loaded,
    updateSettings,
    toggleSound,
    toggleVibration,
  };
}

// Helper function to play success sound
export function playSuccessSound(enabled: boolean = true) {
  if (!enabled) return;
  
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Success sound - three ascending tones
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15); // E5
    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.3); // G5
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (audioErr) {
    console.log('Audio notification not available:', audioErr);
  }
}

// Helper function to vibrate
export function vibrateDevice(enabled: boolean = true) {
  if (!enabled) return;
  
  if ('vibrate' in navigator) {
    navigator.vibrate([100, 50, 100]);
  }
}
