import { useState } from 'react';
import { Shield, Eye, Edit, Loader2, RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useRolePermissions,
  MODULE_LABELS,
  SYSTEM_MODULES,
  FIELD_MODULES,
} from '@/hooks/useRolePermissions';

interface UserPermissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userRole: string;
  userType: 'system' | 'field'; // determines which modules to show
}

export function UserPermissionsModal({
  open,
  onOpenChange,
  userId,
  userName,
  userRole,
  userType,
}: UserPermissionsModalProps) {
  const {
    getPermission,
    getUserPermission,
    hasCustomPermissions,
    updateUserPermission,
    deleteUserPermissions,
  } = useRolePermissions();
  const [updating, setUpdating] = useState<string | null>(null);

  const modules = userType === 'field' ? FIELD_MODULES : SYSTEM_MODULES;
  const isAdmin = userRole === 'admin';

  const handleToggle = async (moduleId: string, field: 'can_view' | 'can_edit') => {
    if (isAdmin) {
      toast.info('Administradores sempre têm acesso total');
      return;
    }

    const userPerm = getUserPermission(userId, moduleId);
    const rolePerm = getPermission(userRole, moduleId);

    // Current effective value
    const currentValue = userPerm
      ? userPerm[field]
      : (rolePerm?.[field] ?? false);

    const key = `${moduleId}-${field}`;
    setUpdating(key);

    try {
      await updateUserPermission(userId, userType, moduleId, field, !currentValue);
      toast.success('Permissão atualizada');
    } catch {
      toast.error('Erro ao atualizar permissão');
    } finally {
      setUpdating(null);
    }
  };

  const handleResetToRole = async () => {
    try {
      await deleteUserPermissions(userId);
      toast.success('Permissões resetadas para o padrão do perfil');
    } catch {
      toast.error('Erro ao resetar permissões');
    }
  };

  // Get effective value for a module
  const getEffective = (moduleId: string, field: 'can_view' | 'can_edit'): boolean => {
    if (isAdmin) return true;
    const userPerm = getUserPermission(userId, moduleId);
    if (userPerm) return userPerm[field];
    const rolePerm = getPermission(userRole, moduleId);
    return rolePerm?.[field] ?? false;
  };

  const isOverridden = (moduleId: string): boolean => {
    return !!getUserPermission(userId, moduleId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Permissões: {userName}
          </DialogTitle>
          <DialogDescription>
            <span className="flex items-center gap-2 flex-wrap">
              Perfil base: <Badge variant="outline">{userRole}</Badge>
              {hasCustomPermissions(userId) && (
                <Badge className="bg-amber-500/20 text-amber-700 border-amber-300">
                  Personalizado
                </Badge>
              )}
            </span>
          </DialogDescription>
        </DialogHeader>

        {isAdmin && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-400">
            Administradores sempre têm acesso total a todos os módulos.
          </div>
        )}

        {hasCustomPermissions(userId) && !isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToRole}
            className="gap-2 self-start"
          >
            <RotateCcw className="w-4 h-4" />
            Resetar para padrão do perfil ({userRole})
          </Button>
        )}

        <div className="space-y-1 mt-2">
          {modules.map(moduleId => {
            const canViewVal = getEffective(moduleId, 'can_view');
            const canEditVal = getEffective(moduleId, 'can_edit');
            const overridden = isOverridden(moduleId);

            return (
              <div
                key={moduleId}
                className={cn(
                  "flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors",
                  canViewVal
                    ? "bg-card border-border"
                    : "bg-muted/30 border-transparent opacity-60",
                  overridden && "ring-1 ring-amber-400/50"
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {MODULE_LABELS[moduleId] || moduleId}
                  </span>
                  {overridden && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                      custom
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Eye className={cn("w-4 h-4", canViewVal ? "text-blue-500" : "text-muted-foreground")} />
                    <Switch
                      checked={canViewVal}
                      disabled={isAdmin || updating === `${moduleId}-can_view`}
                      onCheckedChange={() => handleToggle(moduleId, 'can_view')}
                      className="data-[state=checked]:bg-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Edit className={cn("w-4 h-4", canEditVal ? "text-green-500" : "text-muted-foreground")} />
                    <Switch
                      checked={canEditVal}
                      disabled={isAdmin || !canViewVal || updating === `${moduleId}-can_edit`}
                      onCheckedChange={() => handleToggle(moduleId, 'can_edit')}
                      className="data-[state=checked]:bg-green-500"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
