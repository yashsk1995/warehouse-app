import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { Appearance } from 'react-native';

const palette = {
  primary: '#2563eb',
  secondary: '#0ea5e9',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  bgDark: '#0f172a',
  surfaceDark: '#1e293b',
};

const isDark = Appearance.getColorScheme() === 'dark';

export const theme = isDark
  ? {
      ...MD3DarkTheme,
      colors: { ...MD3DarkTheme.colors, primary: palette.primary, background: palette.bgDark, surface: palette.surfaceDark },
    }
  : {
      ...MD3LightTheme,
      colors: { ...MD3LightTheme.colors, primary: palette.primary },
    };

export { palette };
