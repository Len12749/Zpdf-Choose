import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  clickable?: boolean;
}

export function Card({ hover = false, clickable = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface-secondary border border-border rounded-2xl p-4 transition-all duration-200',
        hover && 'hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5',
        clickable && 'cursor-pointer active:scale-[0.98] hover:border-accent/30',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
