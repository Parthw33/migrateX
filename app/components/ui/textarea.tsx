import * as React from 'react';
import { cn } from '~/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[44px] w-full rounded-xl border border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 px-3 py-2.5 text-sm leading-relaxed shadow-sm placeholder:text-migratex-elements-textTertiary',
        'outline-none transition-shadow focus:border-violet-400/80 focus:ring-2 focus:ring-violet-500/15',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
