import { Platform } from 'react-native';
import type { AdviceKind } from '@jetlag/engine';

/**
 * Night/day palette. Text colours are chosen for >= 4.5:1 contrast against
 * `background` and `surface` in each scheme (WCAG AA for body text).
 */
export const Colors = {
  light: {
    background: '#F6F4EF', // warm daylight paper
    surface: '#FFFFFF',
    surfaceAlt: '#EEEBE3',
    border: '#D5CFC2',
    text: '#171B26',
    textSecondary: '#4F5566',
    accent: '#2B4597', // night blue
    accentText: '#FFFFFF',
    danger: '#A3322A',
    warningBg: '#FBEFD5',
    warningText: '#6B4505',
    success: '#2E6B47',
  },
  dark: {
    background: '#0D1120', // night sky
    surface: '#161B2E',
    surfaceAlt: '#1F2540',
    border: '#2C3352',
    text: '#ECEEF5',
    textSecondary: '#A9AFC4',
    accent: '#93A9FF',
    accentText: '#0D1120',
    danger: '#FF8A80',
    warningBg: '#3A2E12',
    warningText: '#F6D58C',
    success: '#7BD3A0',
  },
} as const;

export type Scheme = keyof typeof Colors;
export type Palette = { [K in keyof typeof Colors.light]: string };

/** Block colours per advice kind. Colour is never the only signal: labels are always rendered as text. */
export const AdviceColors: Record<Scheme, Record<AdviceKind, string>> = {
  light: {
    seek_light: '#E9A23B',
    avoid_light: '#5B5F96',
    sleep: '#24356E',
    nap: '#8E7CC8',
    caffeine_ok: '#8B5A34',
    avoid_caffeine: '#C25B4F',
    melatonin: '#2F8F86',
  },
  dark: {
    seek_light: '#F2B856',
    avoid_light: '#8C90D9',
    sleep: '#5A6FC0',
    nap: '#B3A3EA',
    caffeine_ok: '#C48A5C',
    avoid_caffeine: '#E57F73',
    melatonin: '#5CC4B9',
  },
};

export const AdviceLabels: Record<AdviceKind, { title: string; verb: string }> = {
  seek_light: { title: 'Seek light', verb: 'Get bright light' },
  avoid_light: { title: 'Avoid light', verb: 'Avoid bright light' },
  sleep: { title: 'Sleep', verb: 'Sleep' },
  nap: { title: 'Nap', verb: 'Take a short nap' },
  caffeine_ok: { title: 'Caffeine OK', verb: 'Caffeine is fine' },
  avoid_caffeine: { title: 'No caffeine', verb: 'Skip caffeine' },
  melatonin: { title: 'Melatonin', verb: 'Melatonin time' },
};

/** Order for legends and sorting ties. */
export const AdviceOrder: AdviceKind[] = [
  'sleep',
  'nap',
  'seek_light',
  'avoid_light',
  'caffeine_ok',
  'avoid_caffeine',
  'melatonin',
];

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 6, md: 12, lg: 18 } as const;
export const MaxContentWidth = 720;

export const Fonts = Platform.select({
  web: {
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  ios: { sans: 'System', mono: 'Menlo' },
  default: { sans: 'sans-serif', mono: 'monospace' },
});
