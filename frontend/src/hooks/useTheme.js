import { useEffect, useState } from 'react';
import { applyTheme, getInitialTheme } from '../lib/theme';

export default function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  return [theme, () => setTheme(t => t === 'dark' ? 'light' : 'dark')];
}
