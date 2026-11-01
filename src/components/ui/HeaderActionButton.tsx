import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const HeaderActionButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function HeaderActionButton({ className, children, type = 'button', ...props }, ref) {
    return <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted p-0.5">
      <button ref={ref} type={type} {...props}
        className={cn('relative before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[\'\'] inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-card shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:opacity-40', className)}>
        {children}
      </button>
    </span>;
  },
);
