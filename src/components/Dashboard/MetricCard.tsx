import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'primary' | 'blue' | 'green' | 'red';
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
  const variantStyles = {
    default: {
      container: "bg-card border border-border",
      title: "text-muted-foreground",
      value: "text-foreground",
      subtitle: "text-muted-foreground",
      iconBg: "bg-muted",
      iconColor: "text-muted-foreground"
    },
    primary: {
      container: "bg-primary text-primary-foreground",
      title: "text-primary-foreground/80",
      value: "text-primary-foreground",
      subtitle: "text-primary-foreground/70",
      iconBg: "bg-primary-foreground/20",
      iconColor: "text-primary-foreground"
    },
    blue: {
      container: "bg-blue-600 text-white",
      title: "text-white/80",
      value: "text-white",
      subtitle: "text-white/70",
      iconBg: "bg-white/20",
      iconColor: "text-white"
    },
    green: {
      container: "bg-emerald-600 text-white",
      title: "text-white/80",
      value: "text-white",
      subtitle: "text-white/70",
      iconBg: "bg-white/20",
      iconColor: "text-white"
    },
    red: {
      container: "bg-red-600 text-white",
      title: "text-white/80",
      value: "text-white",
      subtitle: "text-white/70",
      iconBg: "bg-white/20",
      iconColor: "text-white"
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className={cn(
      "rounded-lg p-4 relative overflow-hidden",
      styles.container,
      className
    )}>
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            styles.title
          )}>
            {title}
          </p>
          <p className={cn(
            "text-2xl font-bold",
            styles.value
          )}>
            {value}
          </p>
          <p className={cn(
            "text-xs",
            styles.subtitle
          )}>
            {subtitle}
          </p>
        </div>
        
        {Icon && (
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            styles.iconBg
          )}>
            <Icon className={cn(
              "w-5 h-5",
              styles.iconColor
            )} />
          </div>
        )}
      </div>
    </div>
  );
}
