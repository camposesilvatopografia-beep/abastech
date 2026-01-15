import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Edit, Trash2, Eye, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CardField {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  className?: string;
  hidden?: boolean;
}

export interface CardAction {
  icon: ReactNode;
  onClick: () => void;
  label?: string;
  variant?: 'default' | 'destructive' | 'ghost';
  className?: string;
}

export interface ResponsiveCardProps {
  title: string;
  subtitle?: string;
  badge?: {
    label: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
    className?: string;
  };
  fields: CardField[];
  actions?: CardAction[];
  isActive?: boolean;
  onToggleActive?: () => void;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export function ResponsiveCard({
  title,
  subtitle,
  badge,
  fields,
  actions,
  isActive,
  onToggleActive,
  onClick,
  selected,
  className,
}: ResponsiveCardProps) {
  const visibleFields = fields.filter(f => !f.hidden);

  return (
    <Card 
      className={cn(
        "overflow-hidden transition-all",
        selected && "ring-2 ring-primary bg-primary/5",
        isActive === false && "opacity-60",
        onClick && "cursor-pointer hover:shadow-md",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div className="bg-muted/50 px-4 py-2.5 flex items-center justify-between border-b">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-primary truncate">{title}</span>
                {badge && (
                  <Badge 
                    variant={badge.variant || 'secondary'} 
                    className={cn("text-xs shrink-0", badge.className)}
                  >
                    {badge.label}
                  </Badge>
                )}
              </div>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {onToggleActive !== undefined && (
              <Switch
                checked={isActive}
                onCheckedChange={onToggleActive}
                className="mr-2"
              />
            )}
            {actions?.map((action, idx) => (
              <Button 
                key={idx}
                variant="ghost" 
                size="icon" 
                className={cn("h-8 w-8", action.className)}
                onClick={action.onClick}
              >
                {action.icon}
              </Button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-2">
          {visibleFields.map((field, idx) => (
            <div 
              key={idx} 
              className={cn(
                "flex items-center gap-2 text-sm",
                field.className
              )}
            >
              {field.icon && (
                <span className="text-muted-foreground shrink-0">{field.icon}</span>
              )}
              <span className="text-muted-foreground shrink-0">{field.label}:</span>
              <span className="font-medium truncate">{field.value || '-'}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface ResponsiveCardGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}

export function ResponsiveCardGrid({ 
  children, 
  columns = 2,
  className 
}: ResponsiveCardGridProps) {
  return (
    <div className={cn(
      "grid gap-3",
      columns === 1 && "grid-cols-1",
      columns === 2 && "grid-cols-1 sm:grid-cols-2",
      columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      className
    )}>
      {children}
    </div>
  );
}

interface ViewModeToggleProps {
  viewMode: 'table' | 'cards';
  onViewModeChange: (mode: 'table' | 'cards') => void;
}

export function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  return (
    <div className="flex items-center border rounded-lg overflow-hidden">
      <Button 
        variant={viewMode === 'table' ? 'secondary' : 'ghost'}
        size="sm"
        className="rounded-none h-8 px-3"
        onClick={() => onViewModeChange('table')}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </Button>
      <Button 
        variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
        size="sm"
        className="rounded-none h-8 px-3"
        onClick={() => onViewModeChange('cards')}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </Button>
    </div>
  );
}

// Empty state component for card views
interface EmptyCardStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
}

export function EmptyCardState({ icon, title, description }: EmptyCardStateProps) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <div className="w-12 h-12 mx-auto mb-3 opacity-50 flex items-center justify-center">
        {icon}
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm mt-1">{description}</p>}
    </div>
  );
}
