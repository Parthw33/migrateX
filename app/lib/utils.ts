import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui-style class merge. Works with UnoCSS too — `twMerge` only resolves
 *  conflicting Tailwind utilities; non-matching strings pass through unchanged. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
