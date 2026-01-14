import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  // Only run on client side
  if (typeof window === 'undefined') return 'light';
  
  try {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
    
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // localStorage might not be available
  }
  return 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // Set initial theme after mount
  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const root = window.document.documentElement;
    
    // Remove both classes first
    root.classList.remove('light', 'dark');
    
    // Add the current theme
    root.classList.add(theme);
    
    // Store in localStorage
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // localStorage might not be available
    }
  }, [theme, mounted]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  return { theme, setTheme, toggleTheme };
}
