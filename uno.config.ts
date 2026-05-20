import { globSync } from 'fast-glob';
import fs from 'node:fs/promises';
import { basename } from 'node:path';
import { defineConfig, presetIcons, presetUno, transformerDirectives } from 'unocss';

const iconPaths = globSync('./icons/*.svg');

const collectionName = 'migratex';

const customIconCollection = iconPaths.reduce(
  (acc, iconPath) => {
    const [iconName] = basename(iconPath).split('.');

    acc[collectionName] ??= {};
    acc[collectionName][iconName] = async () => fs.readFile(iconPath, 'utf8');

    return acc;
  },
  {} as Record<string, Record<string, () => Promise<string>>>,
);

// professional colors from color.scss
const BASE_COLORS = {
  white: '#FFFFFF',
  gray: {
    50: '#F7F9FC', // color-base-white-10
    100: '#DDE3EE', // color-brand-secondary-lightest / color-base-gray-40
    200: '#EBEBEB', // color-font-mercury
    300: '#A0AEC0', // derived light gray
    400: '#767676', // color-placeholder
    500: '#647696', // color-font-active
    600: '#637392', // color-font-gray
    700: '#475161', // color-font-base / color-base-gray-20
    800: '#253143', // color-font-black
    900: '#222222', // color-black-222
    950: '#1A1919', // color-gray-bg
  },
  accent: {
    50: '#F0EDFF',
    100: '#E0DBFF',
    200: '#C7BFFF',
    300: '#A99BF0',
    400: '#8A7AE6',
    500: '#6C5CE7', // color-brand-primary-base
    600: '#5A4BD1',
    700: '#4A3CB8',
    800: '#3A2D9A',
    900: '#2A1F7C',
    950: '#1A1260',
  },
  green: {
    50: '#F5FFFC', // color-brand-success-light
    100: '#E0FFF5',
    200: '#B3FFEA',
    300: '#66E6C4',
    400: '#33CC9E',
    500: '#00A66D',
    600: '#008F5D',
    700: '#007A52', // color-brand-success-base
    800: '#006644',
    900: '#004D33',
    950: '#003322',
  },
  orange: {
    50: '#FFF8EB', // color-brand-attention-light
    100: '#FFF0D6',
    200: '#FFE4B8',
    300: '#FFD28A',
    400: '#FFAE0A', // color-brand-attention-base
    500: '#E69B00',
    600: '#CC8A00',
    700: '#704B00', // color-brand-attention-dark
    800: '#5C3D00',
    900: '#4A3100',
  },
  red: {
    50: '#FFF0ED', // color-brand-fail-light
    100: '#FFE4DE',
    200: '#FFCFC5',
    300: '#FFB0A0',
    400: '#EB5646', // color-brand-warning-medium
    500: '#D64030',
    600: '#C2301F',
    700: '#A31B00', // color-brand-fail-base
    800: '#8A1700',
    900: '#711300',
    950: '#590F00',
  },
  blue: {
    50: '#F5FDFF', // color-brand-draft-light
    100: '#E6F7FF',
    200: '#CCF0FF',
    300: '#99DFFF',
    400: '#33B8FF',
    500: '#0469E3', // color-brand-draft-base
    600: '#0358C4',
    700: '#0247A5',
    800: '#023686',
    900: '#012567',
    950: '#011448',
  },
};

const COLOR_PRIMITIVES = {
  ...BASE_COLORS,
  alpha: {
    white: generateAlphaPalette(BASE_COLORS.white),
    gray: generateAlphaPalette(BASE_COLORS.gray[900]),
    red: generateAlphaPalette(BASE_COLORS.red[500]),
    accent: generateAlphaPalette(BASE_COLORS.accent[500]),
  },
};

export default defineConfig({
  content: {
    filesystem: ['app/**/*.{html,js,ts,jsx,tsx,vue,svelte,astro,mdx,md,scss}'],
  },
  shortcuts: {
    'migratex-ease-cubic-bezier': 'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'transition-theme': 'transition-[background-color,border-color,color] duration-150 migratex-ease-cubic-bezier',
    kdb: 'bg-migratex-elements-code-background text-migratex-elements-code-text py-1 px-1.5 rounded-md',
    'max-w-chat': 'max-w-[var(--chat-max-width)]',
  },
  rules: [
    /**
     * This shorthand doesn't exist in Tailwind and we overwrite it to avoid
     * any conflicts with minified CSS classes.
     */
    ['b', {}],
  ],
  theme: {
    colors: {
      ...COLOR_PRIMITIVES,
      migratex: {
        elements: {
          borderColor: 'var(--migratex-elements-borderColor)',
          borderColorActive: 'var(--migratex-elements-borderColorActive)',
          background: {
            depth: {
              1: 'var(--migratex-elements-bg-depth-1)',
              2: 'var(--migratex-elements-bg-depth-2)',
              3: 'var(--migratex-elements-bg-depth-3)',
              4: 'var(--migratex-elements-bg-depth-4)',
            },
          },
          textPrimary: 'var(--migratex-elements-textPrimary)',
          textSecondary: 'var(--migratex-elements-textSecondary)',
          textTertiary: 'var(--migratex-elements-textTertiary)',
          code: {
            background: 'var(--migratex-elements-code-background)',
            text: 'var(--migratex-elements-code-text)',
          },
          button: {
            primary: {
              background: 'var(--migratex-elements-button-primary-background)',
              backgroundHover: 'var(--migratex-elements-button-primary-backgroundHover)',
              text: 'var(--migratex-elements-button-primary-text)',
            },
            secondary: {
              background: 'var(--migratex-elements-button-secondary-background)',
              backgroundHover: 'var(--migratex-elements-button-secondary-backgroundHover)',
              text: 'var(--migratex-elements-button-secondary-text)',
            },
            danger: {
              background: 'var(--migratex-elements-button-danger-background)',
              backgroundHover: 'var(--migratex-elements-button-danger-backgroundHover)',
              text: 'var(--migratex-elements-button-danger-text)',
            },
          },
          item: {
            contentDefault: 'var(--migratex-elements-item-contentDefault)',
            contentActive: 'var(--migratex-elements-item-contentActive)',
            contentAccent: 'var(--migratex-elements-item-contentAccent)',
            contentDanger: 'var(--migratex-elements-item-contentDanger)',
            backgroundDefault: 'var(--migratex-elements-item-backgroundDefault)',
            backgroundActive: 'var(--migratex-elements-item-backgroundActive)',
            backgroundAccent: 'var(--migratex-elements-item-backgroundAccent)',
            backgroundDanger: 'var(--migratex-elements-item-backgroundDanger)',
          },
          actions: {
            background: 'var(--migratex-elements-actions-background)',
            code: {
              background: 'var(--migratex-elements-actions-code-background)',
            },
          },
          artifacts: {
            background: 'var(--migratex-elements-artifacts-background)',
            backgroundHover: 'var(--migratex-elements-artifacts-backgroundHover)',
            borderColor: 'var(--migratex-elements-artifacts-borderColor)',
            inlineCode: {
              background: 'var(--migratex-elements-artifacts-inlineCode-background)',
              text: 'var(--migratex-elements-artifacts-inlineCode-text)',
            },
          },
          messages: {
            background: 'var(--migratex-elements-messages-background)',
            linkColor: 'var(--migratex-elements-messages-linkColor)',
            code: {
              background: 'var(--migratex-elements-messages-code-background)',
            },
            inlineCode: {
              background: 'var(--migratex-elements-messages-inlineCode-background)',
              text: 'var(--migratex-elements-messages-inlineCode-text)',
            },
          },
          icon: {
            success: 'var(--migratex-elements-icon-success)',
            error: 'var(--migratex-elements-icon-error)',
            primary: 'var(--migratex-elements-icon-primary)',
            secondary: 'var(--migratex-elements-icon-secondary)',
            tertiary: 'var(--migratex-elements-icon-tertiary)',
          },
          preview: {
            addressBar: {
              background: 'var(--migratex-elements-preview-addressBar-background)',
              backgroundHover: 'var(--migratex-elements-preview-addressBar-backgroundHover)',
              backgroundActive: 'var(--migratex-elements-preview-addressBar-backgroundActive)',
              text: 'var(--migratex-elements-preview-addressBar-text)',
              textActive: 'var(--migratex-elements-preview-addressBar-textActive)',
            },
          },
          terminals: {
            background: 'var(--migratex-elements-terminals-background)',
            buttonBackground: 'var(--migratex-elements-terminals-buttonBackground)',
          },
          dividerColor: 'var(--migratex-elements-dividerColor)',
          loader: {
            background: 'var(--migratex-elements-loader-background)',
            progress: 'var(--migratex-elements-loader-progress)',
          },
          prompt: {
            background: 'var(--migratex-elements-prompt-background)',
          },
          sidebar: {
            dropdownShadow: 'var(--migratex-elements-sidebar-dropdownShadow)',
            buttonBackgroundDefault: 'var(--migratex-elements-sidebar-buttonBackgroundDefault)',
            buttonBackgroundHover: 'var(--migratex-elements-sidebar-buttonBackgroundHover)',
            buttonText: 'var(--migratex-elements-sidebar-buttonText)',
          },
          cta: {
            background: 'var(--migratex-elements-cta-background)',
            text: 'var(--migratex-elements-cta-text)',
          },
        },
      },
    },
  },
  transformers: [transformerDirectives()],
  presets: [
    presetUno({
      dark: {
        light: '[data-theme="light"]',
        dark: '[data-theme="dark"]',
      },
    }),
    presetIcons({
      warn: true,
      collections: {
        ...customIconCollection,
        ph: () => import('@iconify-json/ph/icons.json').then((m) => m.default),
        'svg-spinners': () => import('@iconify-json/svg-spinners/icons.json').then((m) => m.default),
      },
    }),
  ],
});

/**
 * Generates an alpha palette for a given hex color.
 *
 * @param hex - The hex color code (without alpha) to generate the palette from.
 * @returns An object where keys are opacity percentages and values are hex colors with alpha.
 *
 * Example:
 *
 * ```
 * {
 *   '1': '#FFFFFF03',
 *   '2': '#FFFFFF05',
 *   '3': '#FFFFFF08',
 * }
 * ```
 */
function generateAlphaPalette(hex: string) {
  return [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].reduce(
    (acc, opacity) => {
      const alpha = Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');

      acc[opacity] = `${hex}${alpha}`;

      return acc;
    },
    {} as Record<number, string>,
  );
}
