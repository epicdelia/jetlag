import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { CITIES, labelForZone, searchCities, type City } from '@/lib/cities';
import { canonicalZone, formatOffset, isValidTimeZone } from '@/lib/tz';
import { Button, Field, T } from './ui';

export interface PickedPlace {
  tz: string;
  label: string;
}

/** Tappable field that opens a searchable city list (plus manual IANA zone entry). */
export function PlaceField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: PickedPlace | null;
  onChange: (p: PickedPlace) => void;
  error?: string | null;
}) {
  const { c } = usePalette();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: Spacing.xs, flex: 1 }}>
      <T variant="small" muted>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? `${value.label}, ${value.tz}` : 'not set'}`}
        accessibilityHint="Opens a searchable list of cities"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          s.field,
          { borderColor: error ? c.danger : c.border, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 },
        ]}>
        {value ? (
          <>
            <T variant="subheading" numberOfLines={1}>
              {value.label}
            </T>
            <T variant="small" muted numberOfLines={1}>
              {value.tz} · {formatOffset(Date.now(), value.tz)}
            </T>
          </>
        ) : (
          <T variant="secondary">Choose city…</T>
        )}
      </Pressable>
      {error ? (
        <T variant="small" style={{ color: c.danger }}>
          {error}
        </T>
      ) : null}
      <CityPickerModal
        visible={open}
        title={label}
        onClose={() => setOpen(false)}
        onPick={(p) => {
          onChange(p);
          setOpen(false);
        }}
      />
    </View>
  );
}

function CityPickerModal({
  visible,
  title,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onPick: (p: PickedPlace) => void;
}) {
  const { c, scheme } = usePalette();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [manual, setManual] = useState('');
  const [manualErr, setManualErr] = useState<string | null>(null);
  const results = useMemo(() => searchCities(q), [q]);
  const now = Date.now();

  const pickCity = (city: City) => {
    setQ('');
    onPick({ tz: city.tz, label: `${city.name} (${city.code})` });
  };

  const submitManual = () => {
    const tz = manual.trim();
    if (!isValidTimeZone(tz)) {
      setManualErr('Not a recognised IANA zone. Use the form Region/City, e.g. "Asia/Kolkata".');
      return;
    }
    setManualErr(null);
    setManual('');
    const canonical = canonicalZone(tz, CITIES.map((city) => city.tz));
    onPick({ tz: canonical, label: labelForZone(canonical) });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.sheet, { backgroundColor: c.background, paddingTop: Spacing.lg }]}>
        <View style={s.inner}>
          <View style={s.header}>
            <T variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </T>
            <Button title="Cancel" kind="ghost" onPress={onClose} />
          </View>
          <Field
            label="Search city, airport code, country or zone"
            value={q}
            onChangeText={setQ}
            placeholder="e.g. Tokyo, LHR, India"
            autoFocus
            autoCapitalize="none"
            returnKeyType="search"
            keyboardAppearance={scheme}
          />
          <FlatList
            data={results}
            keyExtractor={(x) => `${x.code}-${x.tz}`}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: Spacing.lg }}
            ListEmptyComponent={
              <T variant="secondary" style={{ paddingVertical: Spacing.lg }}>
                No matching city. Enter the IANA time zone below instead.
              </T>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.country}, ${item.code}`}
                onPress={() => pickCity(item)}
                style={({ pressed }) => [s.item, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}>
                <View style={{ flex: 1 }}>
                  <T variant="subheading">
                    {item.name} <T variant="secondary">({item.code})</T>
                  </T>
                  <T variant="small" muted>
                    {item.country} · {item.tz}
                  </T>
                </View>
                <T variant="small" muted>
                  {formatOffset(now, item.tz)}
                </T>
              </Pressable>
            )}
          />
          <View style={[s.manual, { borderColor: c.border, paddingBottom: insets.bottom + Spacing.md }]}>
            <Field
              label="Or enter an IANA time zone"
              value={manual}
              onChangeText={(t) => {
                setManual(t);
                setManualErr(null);
              }}
              placeholder="Region/City, e.g. America/Halifax"
              autoCapitalize="none"
              onSubmitEditing={submitManual}
              error={manualErr}
            />
            <Button title="Use this zone" kind="secondary" onPress={submitManual} disabled={!manual.trim()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 56,
    justifyContent: 'center',
  },
  sheet: { flex: 1 },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  manual: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.md, gap: Spacing.sm },
});
