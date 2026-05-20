import { useStore } from '@nanostores/react';
import { Link } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { authStore } from '~/lib/stores/auth';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { HeaderProfileMenu } from './HeaderProfileMenu.client';

export function Header() {
  const chat = useStore(chatStore);
  const auth = useStore(authStore);

  return (
    <header
      className={classNames(
        'sticky top-0 z-20 flex-shrink-0 bg-migratex-elements-background-depth-1 border-b shadow-sm',
      )}
    >
      <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 z-logo">
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-migratex-elements-textPrimary hover:opacity-90 transition-opacity shrink-0"
          >
            <svg width="28" height="28" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path
                d="M19.715 9.945v4.107l-9.878 1.37L0 14.052V9.945l9.837-1.37 9.878 1.37zM0 19.529v-4.107l5.75 3.08 13.965-3.08v4.107L5.75 23.979 0 19.53z"
                fill="#7c3aed"
              />
              <path d="M19.715 4.47v4.107l-5.75-3.08L0 8.577V4.47L13.965.02l5.75 4.45z" fill="#7c3aed" />
            </svg>
            <span>Migrate X</span>
          </Link>
        </div>
        {/* <span className="flex-1 px-2 sm:px-4 truncate text-center text-sm sm:text-base text-migratex-elements-textPrimary min-w-0">
          <ClientOnly>{() => <ChatDescription />}</ClientOnly>
        </span> */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {chat.started && (
            <ClientOnly>
              {() => (
                <div className="mr-0 sm:mr-1">
                  <HeaderActionButtons />
                </div>
              )}
            </ClientOnly>
          )}
          {auth.isAuthenticated && <ClientOnly fallback={null}>{() => <HeaderProfileMenu />}</ClientOnly>}
        </div>
      </div>
    </header>
  );
}
