import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={`Switch to ${next} theme`}
    >
      {theme === 'light' ? 'Dark' : 'Light'}
    </button>
  );
}
