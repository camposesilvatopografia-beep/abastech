import { useState } from 'react';
import { Shield, ShieldCheck, Eye, Edit, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRolePermissions, MODULE_LABELS, MODULE_GROUPS } from '@/hooks/useRolePermissions';

const ROLES = [
  { value: 'admin', label: 'Administrador', icon: ShieldCheck, color: 'bg-red-500', description: 'Acesso total ao sistema' },
  { value: 'supervisor', label: 'Supervisor', icon: Shield, color: 'bg-blue-500', description: 'Acesso intermediário' },
  { value: 'operador', label: 'Operador', icon: Shield, color: 'bg-green-500', description: 'Acesso básico' },
];

export function RolePermissionsManager() {
  const { permissions, loading, updatePermission, getPermission } = useRolePermissions();
  const [activeRole, setActiveRole] = useState('supervisor');
  const [updating, setUpdating] = useState<string | null>(null);

  const handleToggle = async (role: string, moduleId: string, field: 'can_view' | 'can_edit') => {
    if (role === 'admin') {
      toast.info('Administradores sempre têm acesso total');
      return;
    }

    const perm = getPermission(role, moduleId);
    const newValue = !(perm?.[field] ?? false);
    const key = `${role}-${moduleId}-${field}`;
    setUpdating(key);

    try {
      await updatePermission(role, moduleId, field, newValue);
      toast.success('Permissão atualizada');
    } catch {
      toast.error('Erro ao atualizar permissão');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Permissões por Perfil
        </CardTitle>
        <CardDescription>
          Configure quais módulos cada perfil pode visualizar e editar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeRole} onValueChange={setActiveRole}>
          <TabsList className="w-full grid grid-cols-3 mb-6">
            {ROLES.map(role => (
              <TabsTrigger key={role.value} value={role.value} className="gap-2">
                <role.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{role.label}</span>
                <span className="sm:hidden text-xs">{role.label.slice(0, 5)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {ROLES.map(role => (
            <TabsContent key={role.value} value={role.value}>
              {role.value === 'admin' && (
                <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-400">
                  <ShieldCheck className="w-4 h-4 inline mr-2" />
                  Administradores sempre têm acesso total a todos os módulos.
                </div>
              )}

              <div className="space-y-6">
                {MODULE_GROUPS.map(group => (
                  <div key={group.label}>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                      {group.label}
                    </h4>
                    <div className="space-y-1">
                      {group.modules.map(moduleId => {
                        const perm = getPermission(role.value, moduleId);
                        const isAdmin = role.value === 'admin';
                        const canViewVal = isAdmin ? true : (perm?.can_view ?? false);
                        const canEditVal = isAdmin ? true : (perm?.can_edit ?? false);

                        return (
                          <div
                            key={moduleId}
                            className={cn(
                              "flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors",
                              canViewVal
                                ? "bg-card border-border"
                                : "bg-muted/30 border-transparent opacity-60"
                            )}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="text-sm font-medium truncate">
                                {MODULE_LABELS[moduleId] || moduleId}
                              </span>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                              {/* View toggle */}
                              <div className="flex items-center gap-2">
                                <Eye className={cn("w-4 h-4", canViewVal ? "text-blue-500" : "text-muted-foreground")} />
                                <span className="text-xs text-muted-foreground hidden sm:inline">Ver</span>
                                <Switch
                                  checked={canViewVal}
                                  disabled={isAdmin || updating === `${role.value}-${moduleId}-can_view`}
                                  onCheckedChange={() => handleToggle(role.value, moduleId, 'can_view')}
                                  className="data-[state=checked]:bg-blue-500"
                                />
                              </div>

                              {/* Edit toggle */}
                              <div className="flex items-center gap-2">
                                <Edit className={cn("w-4 h-4", canEditVal ? "text-green-500" : "text-muted-foreground")} />
                                <span className="text-xs text-muted-foreground hidden sm:inline">Editar</span>
                                <Switch
                                  checked={canEditVal}
                                  disabled={isAdmin || !canViewVal || updating === `${role.value}-${moduleId}-can_edit`}
                                  onCheckedChange={() => handleToggle(role.value, moduleId, 'can_edit')}
                                  className="data-[state=checked]:bg-green-500"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
