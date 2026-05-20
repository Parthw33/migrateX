import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { authStore, logoutAuth } from '~/lib/stores/auth';
import { classNames } from '~/utils/classNames';

function displayNameFromEmail(email: string | null | undefined): string {
  const e = email?.trim();

  if (!e) {
    return 'User';
  }

  const local = e.split('@')[0] || '';
  const parts = local.split(/[._-]+/).filter(Boolean);

  if (parts.length === 0) {
    return e;
  }

  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

function initialsFromEmail(email: string | null | undefined): string {
  const name = displayNameFromEmail(email);
  const words = name.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
  }

  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return name.slice(0, 2).toUpperCase() || 'U';
}

export interface HeaderProfileMenuProps {
  /** Tailwind classes for the root wrapper (e.g. shrink-0). */
  className?: string;
}

export function HeaderProfileMenu({ className }: HeaderProfileMenuProps) {
  const auth = useStore(authStore);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!auth.isAuthenticated) {
    return null;
  }

  const email = auth.email?.trim() || '';
  const displayName = displayNameFromEmail(auth.email);
  const initials = initialsFromEmail(auth.email);

  function handleLogout() {
    setOpen(false);
    logoutAuth();
    navigate('/login', { replace: true });
  }

  return (
    <div className={classNames('relative shrink-0', className)} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 text-[11px] font-semibold tracking-tight text-migratex-elements-textPrimary shadow-sm hover:bg-migratex-elements-background-depth-3 transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Account"
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          className="migratex-profile-menu absolute right-0 mt-2 w-[min(calc(100vw-1.5rem),280px)] py-4"
        >
          <div className="flex flex-col items-center px-5 pb-1">
            <div
              className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-gradient-to-br from-violet-700 to-violet-900 text-lg font-semibold text-white shadow-md"
              aria-hidden
            >
              {initials}
            </div>
            <p
              className="mt-3 w-full max-w-[240px] truncate text-center text-xs leading-snug text-migratex-elements-textSecondary"
              title={email || undefined}
            >
              {email || '—'}
            </p>
            <p
              className="mt-1 w-full max-w-[240px] truncate text-center text-[15px] font-semibold leading-snug text-migratex-elements-textPrimary"
              title={displayName}
            >
              {displayName}
            </p>
          </div>

          <div className="my-3 border-t border-[color:var(--migratex-elements-dividerColor)]" />

          <div className="px-2">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="migratex-profile-menu__signout flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors"
            >
              <span className="i-ph:sign-out text-lg opacity-90 shrink-0" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
