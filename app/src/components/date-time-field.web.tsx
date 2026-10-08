import type { StyleProp, TextStyle } from 'react-native';

import { Field } from './ui';
import type { DateTimeFieldProps } from './date-time-field';

/** Web fallback: typed "YYYY-MM-DD" / "HH:mm" entry (the native picker module has no web build). */
export function DateTimeField({ mode, label, value, onChange, placeholder, style }: DateTimeFieldProps) {
  return (
    <Field
      // Field lays its container out with this style (see ui.tsx); its prop is typed for the input.
      style={style as StyleProp<TextStyle>}
      label={label}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder ?? (mode === 'date' ? 'YYYY-MM-DD' : 'HH:mm')}
      inputMode="numeric"
      maxLength={mode === 'date' ? 10 : 5}
    />
  );
}
