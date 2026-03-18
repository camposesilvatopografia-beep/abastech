import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: string;
  loginAt: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const checkAuth = useCallback(() => {
    try {
      const stored = localStorage.getItem('abastech_user');
      if (stored) {
        const userData = JSON.parse(stored) as AuthUser;
        
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(() => {
    localStorage.removeItem('abastech_user');
    setUser(null);
    navigate('/login');
  }, [navigate]);

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor' || isAdmin;
  const isViewer = user?.role === 'visualizador';

  return {
    user,
    isLoading,
    isAuthenticated,
    isAdmin,
    isSupervisor,
    logout,
    checkAuth
  };
}