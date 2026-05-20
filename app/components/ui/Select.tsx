import React, { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '~/utils/classNames';

export type SelectVariant = 'default' | 'muted' | 'panel';

const variantClass: Record<SelectVariant, string> = {
  default: 'border-migratex-elements-borderColor bg-white focus:ring-violet-500/40 focus:border-violet-500/80',
  muted:
    'border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 focus:ring-purple-500/40 focus:border-purple-500',
  panel:
    'border-migratex-elements-borderColor bg-migratex-elements-background-depth-3 focus:ring-purple-500/50 focus:border-purple-500/60',
};

const sizeClass: Record<SelectVariant, string> = {
  default: 'px-3 py-2 text-sm',
  muted: 'px-3.5 py-2.5 text-sm',
  panel: 'px-3 py-2.5 text-sm',
};

const triggerBase =
  'inline-flex w-full items-center justify-between gap-2 rounded-lg border text-left text-migratex-elements-textPrimary transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50';

const noopEffectCleanup = () => {
  /* no-op */
};

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export interface SelectProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Listbox options (value + label). */
  options: SelectOption[];
  value?: string;

  /** Same shape as native `<select onChange>` for easy migration. */
  onChange?: (event: { target: { value: string } }) => void;
  variant?: SelectVariant;
  fullWidth?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      options,
      value = '',
      onChange,
      variant = 'default',
      fullWidth = true,
      disabled = false,
      id,
      name,
      required,
      className,
      ...rest
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
    const listId = useId();

    const assignButtonRef = useCallback(
      (node: HTMLButtonElement | null) => {
        buttonRef.current = node;

        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
        }
      },
      [ref],
    );

    const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
    const displayLabel = selected?.label ?? (value ? value : (options[0]?.label ?? 'Select…'));

    const close = useCallback(() => {
      setOpen(false);
      setMenuRect(null);
    }, []);

    const openMenu = useCallback(() => {
      if (disabled) {
        return;
      }

      const btn = buttonRef.current;

      if (btn) {
        const r = btn.getBoundingClientRect();

        setMenuRect({ top: r.bottom + 4, left: r.left, width: r.width });
      }

      setOpen(true);
    }, [disabled]);

    useLayoutEffect(() => {
      if (!open) {
        return noopEffectCleanup;
      }

      const update = () => {
        const btn = buttonRef.current;

        if (!btn) {
          return;
        }

        const r = btn.getBoundingClientRect();

        setMenuRect({ top: r.bottom + 4, left: r.left, width: r.width });
      };

      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);

      return () => {
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('resize', update);
      };
    }, [open]);

    useEffect(() => {
      if (!open) {
        return noopEffectCleanup;
      }

      const onDoc = (e: MouseEvent) => {
        const t = e.target as Node;
        const inRoot = rootRef.current?.contains(t);
        const inMenu = listRef.current?.contains(t);

        if (!inRoot && !inMenu) {
          close();
        }
      };

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          close();
        }
      };

      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);

      return () => {
        document.removeEventListener('mousedown', onDoc);
        document.removeEventListener('keydown', onKey);
      };
    }, [open, close]);

    useEffect(() => {
      if (disabled && open) {
        close();
      }
    }, [disabled, open, close]);

    const pick = (opt: SelectOption) => {
      if (opt.disabled || disabled) {
        return;
      }

      onChange?.({ target: { value: opt.value } });
      close();
    };

    return (
      <div ref={rootRef} className={classNames('relative', fullWidth ? 'w-full' : undefined, className)} {...rest}>
        {name != null ? (
          <input type="hidden" name={name} value={value} required={required} readOnly aria-hidden tabIndex={-1} />
        ) : null}

        <button
          ref={assignButtonRef}
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-required={required || undefined}
          onClick={() => {
            if (open) {
              close();
            } else {
              openMenu();
            }
          }}
          className={classNames(triggerBase, variantClass[variant], sizeClass[variant])}
        >
          <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
          <span
            className={classNames(
              'i-ph:caret-down shrink-0 text-base text-migratex-elements-textTertiary transition-transform duration-200',
              open ? 'rotate-180' : undefined,
            )}
            aria-hidden
          />
        </button>

        {open && menuRect && typeof document !== 'undefined'
          ? createPortal(
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                style={{
                  position: 'fixed',
                  top: menuRect.top,
                  left: menuRect.left,
                  width: menuRect.width,
                  zIndex: 280,
                }}
                className="max-h-60 overflow-auto rounded-lg border border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 py-1 shadow-lg shadow-black/10"
              >
                {options.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-migratex-elements-textTertiary">No options</li>
                ) : (
                  options.map((opt, idx) => {
                    const selectedOpt = opt.value === value;

                    return (
                      <li
                        key={`${opt.value}-${idx}`}
                        role="option"
                        aria-selected={selectedOpt}
                        aria-disabled={opt.disabled || undefined}
                        className={classNames(
                          'cursor-pointer px-3 py-2 text-sm transition-colors',
                          opt.disabled
                            ? 'cursor-not-allowed text-migratex-elements-textTertiary opacity-60'
                            : selectedOpt
                              ? 'bg-violet-50 text-violet-900 font-medium'
                              : 'text-migratex-elements-textPrimary hover:bg-migratex-elements-background-depth-2',
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                        }}
                        onClick={() => pick(opt)}
                      >
                        {opt.label}
                      </li>
                    );
                  })
                )}
              </ul>,
              document.body,
            )
          : null}
      </div>
    );
  },
);

Select.displayName = 'Select';

/** Class string aligned with {@link Select} `variant="default"` trigger — for text inputs beside selects. */
export const selectAlignedInputClassName =
  'w-full rounded-lg border border-migratex-elements-borderColor bg-white px-3 py-2 text-sm text-migratex-elements-textPrimary transition focus:border-violet-500/80 focus:outline-none focus:ring-2 focus:ring-violet-500/40 disabled:cursor-not-allowed disabled:opacity-50';
