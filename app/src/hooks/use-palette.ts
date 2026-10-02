import { useColorScheme } from 'react-native';

import { AdviceColors, Colors, type Scheme } from '@/constants/theme';

export function useScheme(): Scheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function usePalette() {
  const scheme = useScheme();
  return { scheme, c: Colors[scheme], advice: AdviceColors[scheme] };
}
