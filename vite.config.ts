import { vitePlugin as remixVitePlugin } from '@remix-run/dev';
import { defineConfig, type ViteDevServer, loadEnv } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig((config) => {
  const env = loadEnv(config.mode, process.cwd(), '');

  return {
    build: {
      target: 'esnext',
      rollupOptions: {
        output: {
          manualChunks(id): string | undefined {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
              return 'react-vendor';
            }

            if (id.includes('@supabase')) {
              return 'supabase';
            }

            if (id.includes('@codemirror') || id.includes('@lezer')) {
              return 'codemirror';
            }

            if (id.includes('framer-motion')) {
              return 'framer-motion';
            }

            if (id.includes('@xterm')) {
              return 'xterm';
            }

            if (id.includes('shiki')) {
              return 'shiki';
            }

            return undefined;
          },
        },
      },
    },

    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          silenceDeprecations: ['legacy-js-api'],
        },
      },
    },

    preview: {
      port: 3000,
      strictPort: false,
    },

    server: {
      port: 3000,
      proxy: {
        '/crawl': { target: 'http://localhost:5002', changeOrigin: true, secure: false },
        '/analysis': { target: 'http://localhost:5002', changeOrigin: true, secure: false },
        '/migrate': { target: 'http://localhost:5002', changeOrigin: true, secure: false },
        '/download-assets': { target: 'http://localhost:5002', changeOrigin: true, secure: false },
        '/entry': { target: 'http://localhost:5002', changeOrigin: true, secure: false },
        '/logs': { target: 'http://localhost:5002', changeOrigin: true, secure: false },
        '/auth': { target: 'http://localhost:5002', changeOrigin: true, secure: false },
        '/contentstack': { target: 'http://localhost:5002', changeOrigin: true, secure: false },
        '/lambda-api': {
          target:
            env.VITE_MIGRATEX_API_BASE_URL || env.VITE_LAMBDA_API_URL || env.LAMBDA_API_URL || 'http://127.0.0.1:9',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/lambda-api/, '') || '/',
        },
      },
    },

    define: {
      'process.env.AUTH_TOKEN': JSON.stringify(env.AUTH_TOKEN),
      'process.env.ORGANIZATION_UID': JSON.stringify(env.ORGANIZATION_UID),
      'process.env.GITHUB_TOKEN': JSON.stringify(env.GITHUB_TOKEN),
      'process.env.GITHUB_PERSONAL_ACCESS_TOKEN': JSON.stringify(env.GITHUB_PERSONAL_ACCESS_TOKEN),
      'process.env.GITHUB_API_BASE': JSON.stringify(env.GITHUB_API_BASE),
      'import.meta.env.SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''),
      'import.meta.env.SUPABASE_KEY': JSON.stringify(
        env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_KEY || env.VITE_SUPABASE_KEY || '',
      ),
    },

    plugins: [
      nodePolyfills({
        include: ['path', 'buffer'],
      }),
      remixVitePlugin({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
        },
      }),
      tsconfigPaths(),
      chrome129IssuePlugin(),
      // Only run CSS module optimisation during builds, not dev server
      config.mode === 'production' && optimizeCssModules({ apply: 'build' }),
    ],
  };
});

function chrome129IssuePlugin() {
  return {
    name: 'chrome129IssuePlugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const raw = req.headers['user-agent']?.match(/Chrom(e|ium)\/([0-9]+)\./);

        if (raw && parseInt(raw[2], 10) === 129) {
          res.setHeader('content-type', 'text/html');
          res.end(
            '<body><h1>Please use Chrome Canary for testing.</h1><p>Chrome 129 has an issue with JavaScript modules & Vite local development.</p></body>',
          );

          return;
        }

        next();
      });
    },
  };
}
