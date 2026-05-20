# MigrateX UI (migrateX-UI)

Web front end for **MigrateX**: a workflow to plan and run **Contentstack**-related migrations (stack setup, scraping, imports, and progress tracking) with optional AI-assisted chat and GitHub integration.

This repository is the **UI** layer: a **Remix** app on **Vite**, targeting **Cloudflare Pages** (Wrangler). It talks to a separate **MigrateX API** (often an AWS Lambda URL), **Supabase** for job progress, **Contentstack** APIs, and **Anthropic** for chat features.

---

## MigrateX (product context)

- **Purpose**: Orchestrate migration tasks against Contentstack stacks and related assets, with visibility into job state.
- **Backend**: The UI expects a MigrateX HTTP API base URL (`VITE_MIGRATEX_API_BASE_URL`). Deploy and configure that service separately; the UI only needs the public base URL.
- **Realtime jobs**: Client-side progress often uses **Supabase** (`public.jobs` and related flows).

---

## migrateX-UI (this repo)

- **Stack**: Node.js 18.18+, **pnpm**, Remix 2, React 18, Vite 5, UnoCSS, Wrangler 3.
- **Dev**: Vite dev server with Remix (`pnpm dev`).
- **Production build**: Static client + server bundle via `remix vite:build`; local preview uses **Cloudflare Pages** dev (`pnpm start` / `pnpm preview`).

---

## Prerequisites

- [Node.js](https://nodejs.org/) **>= 18.18.0**
- [pnpm](https://pnpm.io/) **9.x** (see `package.json` `packageManager`)

---

## Setup

1. **Clone and install**

   ```bash
   git clone <your-repo-url> migrateX-UI
   cd migrateX-UI
   pnpm install
   ```

2. **Environment variables**

   Copy the template and fill in values (never commit `.env`):

   ```bash
   cp .env.example .env
   ```

   See `.env.example` for every variable and short comments. At minimum, set:

   - **MigrateX API**: `VITE_MIGRATEX_API_BASE_URL` (or legacy `VITE_LAMBDA_API_URL` / `LAMBDA_API_URL`).
   - **Supabase** (job progress): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and server-side `SUPABASE_*` if you use those code paths).
   - **Contentstack** (org/stack and server routes): `AUTH_TOKEN`, `ORGANIZATION_UID`, `CONTENTSTACK_BASE_URL` as needed.
   - **AI chat** (server): `ANTHROPIC_API_KEY`.
   - **GitHub** (server, optional): `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITHUB_API_BASE`.

3. **Wrangler / Cloudflare preview bindings**

   The `pnpm start` and `pnpm preview` scripts pass secrets into Pages dev via `bindings.sh`, which reads **`.env.local`** if present, otherwise **`.env`** (same `KEY=value` format).

   **Restricted environments** (read-only project dir, or missing `HOME`, e.g. some CI sandboxes): `pnpm start` runs `scripts/wrangler-pages-dev.sh`, which sets a writable `HOME` under `/tmp` and, if `./.wrangler` cannot be created in the repo, uses a temp directory with symlinks to `build/` and `wrangler.toml`. Override with `WRANGLER_HOME` if needed.

---

## Scripts

| Command | Description |
|--------|-------------|
| `pnpm dev` | Local development (Remix + Vite). |
| `pnpm build` | Production build to `./build`. |
| `pnpm start` | Serve built client with `wrangler pages dev` (via `scripts/wrangler-pages-dev.sh`); bindings from `.env.local` or `.env`. |
| `pnpm preview` | `build` then `start`. |
| `pnpm deploy` | `build` then `wrangler pages deploy`. |
| `pnpm typecheck` | TypeScript check. |
| `pnpm lint` / `pnpm lint:fix` | ESLint. |
| `pnpm test` | Vitest (once). |

---

## Local development

```bash
pnpm dev
```

Set `VITE_MIGRATEX_API_BASE_URL` in `.env` so the client can reach your MigrateX API. The Vite config can proxy `/lambda-api` to that base URL when configured.

---

## Build and deploy

```bash
pnpm build
```

Deploy to Cloudflare Pages (requires Wrangler auth and project config):

```bash
pnpm deploy
```

Update `wrangler.toml` (`name`, `compatibility_date`, etc.) to match your Cloudflare project.

---

## Security

- Keep **`.env`** and **`.env.local`** out of git (see `.gitignore`).
- Use **`.env.example`** / **`.env.sample`** only for placeholders.
- Do not put service-role Supabase keys or GitHub PATs in `VITE_*` variables (they are exposed to the browser).

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for general contribution notes (may still reference upstream Bolt tooling where relevant).
