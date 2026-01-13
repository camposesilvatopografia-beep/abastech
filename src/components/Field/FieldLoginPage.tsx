import { useState } from 'react';
import { Fuel, User, Lock, LogIn, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FieldLoginPageProps {
  onLogin: (user: { id: string; name: string; username: string; role: string }) => void;
}

export function FieldLoginPage({ onLogin }: FieldLoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
        .select('id, name, username, password_hash, role, active')
        .eq('username', username.toLowerCase().trim())
        .single();

      if (error || !data) {
        toast.error('Usuário não encontrado');
        return;
      }

      if (!data.active) {
        toast.error('Usuário desativado');
        return;
      }

      // Simple password check (in production, use proper hashing)
      if (data.password_hash !== password) {
        toast.error('Senha incorreta');
        return;
      }

      toast.success(`Bem-vindo, ${data.name}!`);
      onLogin({
        id: data.id,
        name: data.name,
        username: data.username,
        role: data.role || 'operador'
      });
    } catch (err) {
      console.error('Login error:', err);
      toast.error('Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/20 via-background to-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Fuel className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Abastech Campo</h1>
          <p className="text-muted-foreground mt-1">Apontamentos de Abastecimento</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="bg-card rounded-2xl border border-border p-6 space-y-6 shadow-lg">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Usuário
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Digite seu usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12 text-lg"
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-lg"
                autoComplete="current-password"
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 text-lg gap-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <>Entrando...</>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Entrar
              </>
            )}
          </Button>
        </form>

        {/* Voice hint */}
        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Mic className="w-4 h-4" />
            <span>Comando de voz disponível após login</span>
          </div>
        </div>
      </div>
    </div>
  );
}
