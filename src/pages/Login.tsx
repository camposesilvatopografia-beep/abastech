import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn, Loader2, CheckCircle2, Sparkles, Smartphone } from 'lucide-react';
import logoAbastech from '@/assets/logo-abastech-full.png';
import { useIsMobile } from '@/hooks/use-mobile';

export default function Login() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('system_users')
        .select('*')
        .eq('username', username.trim().toLowerCase())
        .eq('active', true)
        .single();

      if (error || !data) {
        toast.error('Usuário não encontrado ou inativo');
        setIsLoading(false);
        return;
      }

      // Validate password (plain text for now, should be hashed in production)
      if (data.password_hash !== password) {
        toast.error('Senha incorreta');
        setIsLoading(false);
        return;
      }

      // Update last login
      await supabase
        .from('system_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id);

      // Store session in localStorage
      localStorage.setItem('abastech_user', JSON.stringify({
        id: data.id,
        username: data.username,
        name: data.name,
        role: data.role,
        loginAt: new Date().toISOString()
      }));

      // Show welcome animation
      setWelcomeName(data.name.split(' ')[0]);
      setShowWelcome(true);
      
      // Navigate after animation
      setTimeout(() => {
        navigate('/');
      }, 2500);
    } catch (err) {
      console.error('Login error:', err);
      toast.error('Erro ao fazer login. Tente novamente.');
      setIsLoading(false);
    }
  };

  // Welcome screen animation
  if (showWelcome) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center animate-in fade-in zoom-in duration-500">
          <div className="relative mb-8">
            <div className="absolute inset-0 blur-3xl bg-amber-500/30 rounded-full animate-pulse" />
            <div className="relative bg-gradient-to-br from-amber-400 to-amber-600 w-24 h-24 rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-amber-500/50">
              <CheckCircle2 className="w-12 h-12 text-white animate-in zoom-in duration-300 delay-200" />
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-amber-400 animate-in slide-in-from-bottom-4 duration-500 delay-300">
              <Sparkles className="w-5 h-5" />
              <span className="text-lg font-medium">Login realizado com sucesso!</span>
              <Sparkles className="w-5 h-5" />
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold text-white animate-in slide-in-from-bottom-4 duration-500 delay-500">
              Bem-vindo, {welcomeName}!
            </h1>
            
            <p className="text-slate-400 text-lg animate-in slide-in-from-bottom-4 duration-500 delay-700">
              Preparando seu ambiente de trabalho...
            </p>
            
            <div className="flex items-center justify-center gap-2 mt-8 animate-in fade-in duration-500 delay-1000">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI0MmYiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnYtNGgydjRoNHYyaC00djRoLTJ2LTR6bTAtMzBoMnY0aDR2Mmg0djJoLTR2NGgtMnYtNGgtNHYtMmgtNHYtMmg0di00em0wIDE0djJoMnY0aC0ydjJoLTJ2LTJoLTR2LTJoNHYtNGgyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-20" />
      
      <div className="w-full max-w-lg relative z-10">
        {/* Logo Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8 md:p-10 space-y-8">
          {/* Logo - Grande e em destaque */}
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 blur-2xl bg-amber-500/20 rounded-full scale-110" />
              <img 
                src={logoAbastech} 
                alt="Abastech" 
                className="h-32 md:h-40 w-auto drop-shadow-2xl relative z-10"
              />
            </div>
            <div className="text-center">
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                Gestão de Frotas
              </h1>
              <p className="text-slate-400 text-base mt-2">
                Faça login para acessar o sistema
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300 text-sm font-medium">
                Usuário
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Digite seu usuário ou e-mail"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 h-12 focus:border-amber-500 focus:ring-amber-500/20"
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300 text-sm font-medium">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 h-12 pr-12 focus:border-amber-500 focus:ring-amber-500/20"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-900 font-semibold text-base shadow-lg shadow-amber-500/25"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2" />
                  Entrar
                </>
              )}
            </Button>

            {/* Divider */}
            <div className="relative flex items-center gap-4">
              <div className="flex-1 border-t border-white/10" />
              <span className="text-slate-500 text-xs uppercase">ou</span>
              <div className="flex-1 border-t border-white/10" />
            </div>

            {/* Google Sign-In */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 border-white/20 text-white hover:bg-white/10 font-medium"
              disabled={isLoading}
              onClick={async () => {
                setIsLoading(true);
                const { error } = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin,
                });
                if (error) {
                  toast.error('Erro ao conectar com Google');
                  setIsLoading(false);
                }
              }}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Entrar com Google
            </Button>

            {/* Mobile: Button to Field App */}
            {isMobile && (
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300 font-medium"
                onClick={() => window.location.href = '/apontamento'}
              >
                <Smartphone className="w-5 h-5 mr-2" />
                Abrir Apontamento Campo
              </Button>
            )}
          </form>

          {/* Footer */}
          <div className="pt-4 border-t border-white/10 text-center">
            <p className="text-slate-500 text-xs">
              Desenvolvido por <span className="text-slate-400 font-medium">Jean Campos</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}