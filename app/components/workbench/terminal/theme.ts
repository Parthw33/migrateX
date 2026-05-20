import type { ITheme } from '@xterm/xterm';

const style = getComputedStyle(document.documentElement);
const cssVar = (token: string) => style.getPropertyValue(token) || undefined;

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssVar('--migratex-elements-terminal-cursorColor'),
    cursorAccent: cssVar('--migratex-elements-terminal-cursorColorAccent'),
    foreground: cssVar('--migratex-elements-terminal-textColor'),
    background: cssVar('--migratex-elements-terminal-backgroundColor'),
    selectionBackground: cssVar('--migratex-elements-terminal-selection-backgroundColor'),
    selectionForeground: cssVar('--migratex-elements-terminal-selection-textColor'),
    selectionInactiveBackground: cssVar('--migratex-elements-terminal-selection-backgroundColorInactive'),

    // ansi escape code colors
    black: cssVar('--migratex-elements-terminal-color-black'),
    red: cssVar('--migratex-elements-terminal-color-red'),
    green: cssVar('--migratex-elements-terminal-color-green'),
    yellow: cssVar('--migratex-elements-terminal-color-yellow'),
    blue: cssVar('--migratex-elements-terminal-color-blue'),
    magenta: cssVar('--migratex-elements-terminal-color-magenta'),
    cyan: cssVar('--migratex-elements-terminal-color-cyan'),
    white: cssVar('--migratex-elements-terminal-color-white'),
    brightBlack: cssVar('--migratex-elements-terminal-color-brightBlack'),
    brightRed: cssVar('--migratex-elements-terminal-color-brightRed'),
    brightGreen: cssVar('--migratex-elements-terminal-color-brightGreen'),
    brightYellow: cssVar('--migratex-elements-terminal-color-brightYellow'),
    brightBlue: cssVar('--migratex-elements-terminal-color-brightBlue'),
    brightMagenta: cssVar('--migratex-elements-terminal-color-brightMagenta'),
    brightCyan: cssVar('--migratex-elements-terminal-color-brightCyan'),
    brightWhite: cssVar('--migratex-elements-terminal-color-brightWhite'),

    ...overrides,
  };
}
