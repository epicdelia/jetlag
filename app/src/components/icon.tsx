import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

type Names = ComponentProps<typeof SymbolView>['name'];

/** Cross-platform icon: SF Symbols on iOS, Material Symbols on Android/web. */
export function Icon({ name, color, size = 22 }: { name: Exclude<Names, string>; color: ColorValue; size?: number }) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
