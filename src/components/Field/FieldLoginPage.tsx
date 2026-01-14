import { useState } from 'react';
import { User, Lock, LogIn, Mic, Eye, EyeOff, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logoAbastech from '@/assets/logo-abastech-full.png';

interface FieldLoginPageProps {
  onLogin: (user: { id: string; name: string; username: string; role: string; assigned_locations?: string[] }) => void;
}

export function FieldLoginPage({ onLogin }: FieldLoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');
  const [pendingUser, setPendingUser] = useState<any>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      toast.error('Preencha usuário e senha');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('field_users')
        .select('id, name, username, password_hash, role, active, assigned_locations')
        .eq('username', username.toLowerCase().trim())
        .single();

      if (error || !data) {
        toast.error('Usuário não encontrado');
        setIsLoading(false);
        return;
      }

      if (!data.active) {
        toast.error('Usuário desativado');
        setIsLoading(false);
        return;
      }

      // Simple password check (in production, use proper hashing)
      if (data.password_hash !== password) {
        toast.error('Senha incorreta');
        setIsLoading(false);
        return;
      }

      // Show welcome animation
      setWelcomeName(data.name.split(' ')[0]);
      setPendingUser({
        id: data.id,
        name: data.name,
        username: data.username,
        role: data.role || 'operador',
        assigned_locations: (data as any).assigned_locations || ['Tanque Canteiro 01']
      });
      setShowWelcome(true);
      
      // Complete login after animation
      setTimeout(() => {
        onLogin({
          id: data.id,
          name: data.name,
          username: data.username,
          role: data.role || 'operador',
          assigned_locations: (data as any).assigned_locations || ['Tanque Canteiro 01']
        });
      }, 2500);
    } catch (err) {
      console.error('Login error:', err);
      toast.error('Erro ao fazer login');
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
              <div className="absolute inset-0 blur-3xl bg-amber-400/15 rounded-full scale-125 animate-pulse" />
              <img 
                src={logoAbastech} 
                alt="Abastech" 
                className="h-28 md:h-36 w-auto drop-shadow-2xl relative z-10"
              />
            </div>
            <div className="text-center">
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                Apontamento Campo
              </h1>
              <p className="text-slate-400 text-base mt-2">
                Sistema de Abastecimento
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300 text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Usuário
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Digite seu usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 h-12 text-lg focus:border-amber-500 focus:ring-amber-500/20"
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300 text-sm font-medium flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 h-12 text-lg pr-12 focus:border-amber-500 focus:ring-amber-500/20"
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
          </form>

          {/* Voice hint */}
          <div className="pt-4 border-t border-white/10 text-center">
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Mic className="w-4 h-4" />
              <span>Comando de voz disponível após login</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
