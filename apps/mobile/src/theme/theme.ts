import { MD3LightTheme } from 'react-native-paper';

// Consistent light-only theme. (Dark mode can be added later by branching on
// useColorScheme(); for now we want a single predictable look.)
export const palette = {
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  secondary: '#0ea5e9',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  text: '#0f172a',
  textMuted: '#475569',
  background: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
};

export const theme = {
  ...MD3LightTheme,
  roundness: 12,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    onPrimary: '#ffffff',
    primaryContainer: '#dbeafe',
    onPrimaryContainer: palette.primaryDark,
    secondary: palette.secondary,
    background: palette.background,
    onBackground: palette.text,
    surface: palette.surface,
    onSurface: palette.text,
    onSurfaceVariant: palette.textMuted,
    outline: palette.border,
    error: palette.danger,
  },
};
