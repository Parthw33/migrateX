import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/node';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { cssTransition, ToastContainer } from 'react-toastify';
import { isGenerateWebsitePath, syncThemeWithRoute, themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect } from 'react';
import { GlobalLoader } from './components/ui/GlobalLoader';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import unoCss from './styles/uno.css?url';

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'stylesheet', href: unoCss },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  setMigrateXTheme();

  function setMigrateXTheme() {
    var path = window.location.pathname || '';
    var onGenerate = path === '/generate-website' || path.indexOf('/generate-website/') === 0 || /\/[^\/]+\/generate-website(\/|$)/.test(path);
    var theme = 'light';

    if (onGenerate) {
      var stored = localStorage.getItem('migratex_theme');

      if (stored === 'dark' || stored === 'light') {
        theme = stored;
      }
    }

    document.documentElement.setAttribute('data-theme', theme);
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const theme = useStore(themeStore);

  useEffect(() => {
    syncThemeWithRoute(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (!isGenerateWebsitePath(location.pathname)) {
      return;
    }

    document.documentElement.setAttribute('data-theme', theme);
  }, [location.pathname, theme]);

  return (
    <>
      <GlobalLoader />
      {children}
      <ScrollRestoration />
      <Scripts />
      <ToastContainer
        autoClose={5000}
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-migratex-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-migratex-elements-icon-error text-2xl" />;
            }
            case 'info': {
              return <div className="i-ph:info-bold text-migratex-elements-icon-primary text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
      />
    </>
  );
}

export default function App() {
  return <Outlet />;
}
