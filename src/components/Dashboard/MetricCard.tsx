import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'primary';
  className?: string;
}

export function MetricCard({ 
  title, 
  value, 
  subtitle = 'Hoje',
  icon: Icon,
  variant = 'default',
  className 
}: MetricCardProps) {
  const isPrimary = variant === 'primary';

  return (
    <div className={cn(
      "rounded-lg p-4 relative overflow-hidden",
      isPrimary 
        ? "bg-primary text-primary-foreground" 
        : "bg-card border border-border",
      className
    )}>
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            isPrimary ? "text-primary-foreground/80" : "text-muted-foreground"
          )}>
            {title}
          </p>
          <p className={cn(
            "text-2xl font-bold",
            isPrimary ? "text-primary-foreground" : "text-foreground"
          )}>
            {value}
          </p>
          <p className={cn(
            "text-xs",
            isPrimary ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {subtitle}
          </p>
        </div>
        
        {Icon && (
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            isPrimary ? "bg-primary-foreground/20" : "bg-muted"
          )}>
            <Icon className={cn(
              "w-5 h-5",
              isPrimary ? "text-primary-foreground" : "text-muted-foreground"
            )} />
          </div>
        )}
      </div>
    </div>
  );
}
