import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { PICKER_TZ, pickerDateToDateKey, pickerDateToHHmm, wallToPickerDate } from '@/lib/picker-value';
import { formatDateLabel } from '@/lib/tz';
import { T } from './ui';

export interface DateTimeFieldProps {
  mode: 'date' | 'time';
  label: string;
  /** "YYYY-MM-DD" (date) or "HH:mm" (time), wall clock at the airport. May be empty. */
  value: string;
  onChange: (v: string) => void;
  /** Used to seed the picker when `value` is empty; the other half of the wall clock. */
  fallbackDate: string;
  placeholder?: string;
  error?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Native date or time picker for one half of a local wall-clock time (iOS compact picker,
 * Android dialog). The web build uses date-time-field.web.tsx (typed entry) instead.
 */
export function DateTimeField({ mode, label, value, onChange, fallbackDate, placeholder, error, style }: DateTimeFieldProps) {
  const { c, scheme } = usePalette();
  const pickerValue =
    mode === 'date'
      ? wallToPickerDate(value, '12:00', { date: fallbackDate, time: '12:00' })
      : wallToPickerDate(fallbackDate, value, { date: fallbackDate, time: '12:00' });
  const emit = (d: Date | undefined) => {
    if (!d) return;
    onChange(mode === 'date' ? pickerDateToDateKey(d) : pickerDateToHHmm(d));
  };

  if (Platform.OS === 'ios') {
    return (
      <View style={[{ gap: Spacing.xs }, style]}>
        <T variant="small" muted>
          {label}
        </T>
        <View style={[st.iosBox, { borderColor: error ? c.danger : c.border, backgroundColor: c.surface }]}>
          {value ? (
            <DateTimePicker
              accessibilityLabel={label}
              value={pickerValue}
              mode={mode}
              display="compact"
              timeZoneName={PICKER_TZ}
              locale="en_GB"
              themeVariant={scheme}
              accentColor={c.accent}
              onValueChange={(_e, d) => emit(d)}
            />
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={`Set ${label.toLowerCase()}`} onPress={() => emit(pickerValue)}>
              <T style={{ color: c.accent }}>{placeholder ?? 'Set'}</T>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // Android (and any other native platform): a tappable field that opens the system dialog.
  const open = () =>
    DateTimePickerAndroid.open({
      value: pickerValue,
      mode,
      is24Hour: true,
      timeZoneName: PICKER_TZ,
      onValueChange: (_e, d) => emit(d),
    });
  const shown = value ? (mode === 'date' ? formatDateLabel(value) : value) : (placeholder ?? 'Set');
  return (
    <View style={[{ gap: Spacing.xs }, style]}>
      <T variant="small" muted>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        accessibilityHint="Opens a picker"
        onPress={open}
        style={({ pressed }) => [
          st.androidBox,
          { borderColor: error ? c.danger : c.border, backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 },
        ]}>
        <T variant={mode === 'time' ? 'mono' : 'body'} style={!value ? { color: c.textSecondary } : undefined}>
          {shown}
        </T>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  iosBox: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  androidBox: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
});
