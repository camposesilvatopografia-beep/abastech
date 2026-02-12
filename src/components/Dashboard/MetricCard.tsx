import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'primary' | 'blue' | 'green' | 'red' | 'yellow' | 'white' | 'navy';
  className?: string;
  onClick?: () => void;
}

export function MetricCard({ 
  title, 
  value, 
  subtitle = 'Hoje',
  icon: Icon,
  variant = 'default',
  className,
  onClick
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
    },
    yellow: {
      container: "bg-amber-500 text-white",
      title: "text-white/80",
      value: "text-white",
      subtitle: "text-white/70",
      iconBg: "bg-white/20",
      iconColor: "text-white"
    },
    white: {
      container: "bg-card border border-border text-foreground",
      title: "text-muted-foreground",
      value: "text-foreground",
      subtitle: "text-muted-foreground",
      iconBg: "bg-muted",
      iconColor: "text-muted-foreground"
    },
    navy: {
      container: "bg-blue-900 text-white",
      title: "text-white/80",
      value: "text-white",
      subtitle: "text-white/70",
      iconBg: "bg-white/20",
      iconColor: "text-white"
    }
  };

  const styles = variantStyles[variant];

  return (
    <div 
      className={cn(
        "rounded-lg p-3 md:p-4 relative overflow-hidden",
        styles.container,
        onClick && "cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-0.5 md:space-y-1 min-w-0">
          <p className={cn(
            "text-[10px] md:text-xs font-semibold uppercase tracking-wider truncate",
            styles.title
          )}>
            {title}
          </p>
          <p className={cn(
            "text-lg md:text-2xl font-bold truncate",
            styles.value
          )}>
            {value}
          </p>
          <p className={cn(
            "text-[10px] md:text-xs truncate",
            styles.subtitle
          )}>
            {subtitle}
          </p>
        </div>
        
        {Icon && (
          <div className={cn(
            "w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center shrink-0",
            styles.iconBg
          )}>
            <Icon className={cn(
              "w-4 h-4 md:w-5 md:h-5",
              styles.iconColor
            )} />
          </div>
        )}
      </div>
    </div>
  );
}
