import { useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { minutesToHHmm, hhmmToMinutes } from '@/lib/tz';

type TextVariant = 'title' | 'heading' | 'subheading' | 'body' | 'secondary' | 'small' | 'label' | 'mono';

const textStyles: Record<TextVariant, TextStyle> = {
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4, lineHeight: 34 },
  heading: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  subheading: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 16, lineHeight: 23 },
  secondary: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  mono: { fontSize: 15, fontVariant: ['tabular-nums'] },
};

export function T({
  variant = 'body',
  muted,
  style,
  ...rest
}: TextProps & { variant?: TextVariant; muted?: boolean }) {
  const { c } = usePalette();
  const color = muted || variant === 'secondary' || variant === 'label' ? c.textSecondary : c.text;
  return (
    <Text
      {...rest}
      style={[{ color, fontFamily: variant === 'mono' ? Fonts?.mono : Fonts?.sans }, textStyles[variant], style]}
    />
  );
}

/** Scrollable page with safe-area padding and a centred max width. */
export function Screen({
  children,
  scroll = true,
  contentStyle,
  topInset = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  topInset?: boolean;
}) {
  const { c } = usePalette();
  const insets = useSafeAreaInsets();
  const inner = (
    <View
      style={[
        styles.screenInner,
        { paddingTop: (topInset ? insets.top : 0) + Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl },
        contentStyle,
      ]}>
      {children}
    </View>
  );
  if (!scroll) return <View style={[styles.flex, { backgroundColor: c.background }]}>{inner}</View>;
  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: c.background }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled">
      {inner}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>
  );
}

export function Section({ title, children, hint }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <T variant="label" accessibilityRole="header">
        {title}
      </T>
      {hint ? <T variant="small" muted>{hint}</T> : null}
      <View style={{ gap: Spacing.sm }}>{children}</View>
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  accessibilityHint,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = usePalette();
  const bg = kind === 'primary' ? c.accent : kind === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = kind === 'primary' ? c.accentText : kind === 'danger' ? c.danger : kind === 'ghost' ? c.accent : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        kind === 'danger' && { borderWidth: 1, borderColor: c.danger },
        style,
      ]}>
      <Text style={[styles.buttonText, { color: fg, fontFamily: Fonts?.sans }]}>{title}</Text>
    </Pressable>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  children,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  const { c } = usePalette();
  return (
    <View style={[styles.row, { borderColor: c.border }]}>
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <T variant="subheading">{label}</T>
          {description ? <T variant="small" muted>{description}</T> : null}
        </View>
        <Switch
          accessibilityLabel={label}
          value={value}
          onValueChange={onChange}
          trackColor={{ true: c.accent, false: c.border }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={c.border}
          {...(Platform.OS === 'web' ? { activeThumbColor: '#FFFFFF' } : null)}
        />
      </View>
      {children}
    </View>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  accessibilityLabel: string;
}) {
  const { c } = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.segmented, { backgroundColor: c.surfaceAlt }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }]}>
            <T
              variant="secondary"
              numberOfLines={1}
              style={{ color: selected ? c.text : c.textSecondary, fontWeight: selected ? '700' : '500' }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** HH:mm value with ±step buttons (wraps around midnight). */
export function TimeStepper({
  label,
  value,
  onChange,
  step = 15,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
}) {
  const { c } = usePalette();
  const min = hhmmToMinutes(value) ?? 0;
  const bump = (d: number) => onChange(minutesToHHmm(Math.round((min + d) / step) * step));
  return (
    <View style={[styles.stepper, { borderColor: c.border, backgroundColor: c.surface }]}>
      <T variant="secondary" style={styles.flex}>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${step} minutes earlier`}
        onPress={() => bump(-step)}
        hitSlop={8}
        style={[styles.stepBtn, { backgroundColor: c.surfaceAlt }]}>
        <T variant="subheading">−</T>
      </Pressable>
      <T
        variant="mono"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${label} ${value}`}
        style={styles.stepValue}>
        {value}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${step} minutes later`}
        onPress={() => bump(step)}
        hitSlop={8}
        style={[styles.stepBtn, { backgroundColor: c.surfaceAlt }]}>
        <T variant="subheading">+</T>
      </Pressable>
    </View>
  );
}

export function Field({
  label,
  error,
  style,
  ...input
}: TextInputProps & { label: string; error?: string | null }) {
  const { c, scheme } = usePalette();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: Spacing.xs }, style as StyleProp<ViewStyle>]}>
      <T variant="small" muted>
        {label}
      </T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textSecondary}
        keyboardAppearance={scheme}
        autoCorrect={false}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: c.text,
            backgroundColor: c.surface,
            borderColor: error ? c.danger : focused ? c.accent : c.border,
            fontFamily: Fonts?.sans,
          },
        ]}
      />
      {error ? (
        <T variant="small" style={{ color: c.danger }} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
    </View>
  );
}

export function Banner({ children, tone = 'warning' }: { children: ReactNode; tone?: 'warning' | 'info' }) {
  const { c } = usePalette();
  const bg = tone === 'warning' ? c.warningBg : c.surfaceAlt;
  const fg = tone === 'warning' ? c.warningText : c.text;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      {typeof children === 'string' ? <T variant="secondary" style={{ color: fg }}>{children}</T> : children}
    </View>
  );
}

export function Pill({ text, color }: { text: string; color?: string }) {
  const { c } = usePalette();
  return (
    <View style={[styles.pill, { borderColor: color ?? c.border }]}>
      <T variant="small" style={{ fontWeight: '600' }}>
        {text}
      </T>
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  screenInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  section: { gap: Spacing.sm },
  button: {
    minHeight: 48,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  row: { paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  segmented: { flexDirection: 'row', borderRadius: Radius.md, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md - 2,
    paddingHorizontal: Spacing.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 20, fontWeight: '600', minWidth: 62, textAlign: 'center' },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  banner: { borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs },
  pill: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
});
