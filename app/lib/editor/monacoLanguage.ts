/**
 * Map a workbench file path to a Monaco language id.
 *
 * We err on the side of returning a plain-text id when the extension isn't
 * recognised — Monaco still renders the file, just without language services
 * for unknown extensions.
 */

const EXT_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  d: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  cjs: 'javascript',
  mjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  cs: 'csharp',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  c: 'c',
  h: 'cpp',
  hpp: 'cpp',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  env: 'ini',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  svg: 'xml',
  xml: 'xml',
  dockerfile: 'dockerfile',
};

const BASENAME_LANGUAGE: Record<string, string> = {
  dockerfile: 'dockerfile',
  '.env': 'ini',
  '.env.local': 'ini',
  '.env.production': 'ini',
  '.env.development': 'ini',
  'docker-compose.yml': 'yaml',
  'docker-compose.yaml': 'yaml',
};

export function languageForPath(filePath: string | undefined | null): string {
  if (!filePath) return 'plaintext';
  const lower = filePath.toLowerCase();
  const base = lower.split('/').pop() ?? lower;

  if (BASENAME_LANGUAGE[base]) {
    return BASENAME_LANGUAGE[base];
  }

  const dot = base.lastIndexOf('.');
  if (dot >= 0) {
    const ext = base.slice(dot + 1);
    if (EXT_LANGUAGE[ext]) return EXT_LANGUAGE[ext];
  }

  return 'plaintext';
}
