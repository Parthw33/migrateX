import { useStore } from '@nanostores/react';
import { memo } from 'react';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { IconButton } from './IconButton';

interface ThemeSwitchProps {
  className?: string;
}

export const ThemeSwitch = memo(({ className }: ThemeSwitchProps) => {
  const theme = useStore(themeStore);

  // Always render the component, avoiding hydration issues
  return (
    <IconButton
      className={className}
      icon={theme === 'dark' ? 'i-ph:sun-dim-duotone' : 'i-ph:moon-stars-duotone'}
      size="xl"
      title="Toggle Theme"
      onClick={toggleTheme}
    />
  );
});
