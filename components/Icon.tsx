import { colors, fontSize as sizes } from '@/constants/theme';
import { I18nManager, Image, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

// Drawn for this app (single colour on transparent), at 1x, 2x and 3x so they stay sharp on every screen.
const ICONS = {
  check: require('@/assets/icons/check.png'),
  'check-circle': require('@/assets/icons/check-circle.png'),
  'checkbox-on': require('@/assets/icons/checkbox-on.png'),
  'checkbox-off': require('@/assets/icons/checkbox-off.png'),
  lock: require('@/assets/icons/lock.png'),
  close: require('@/assets/icons/close.png'),
  pen: require('@/assets/icons/pen.png'),
  gear: require('@/assets/icons/gear.png'),
  plus: require('@/assets/icons/plus.png'),
  file: require('@/assets/icons/file.png'),
  bell: require('@/assets/icons/bell.png'),
  fan: require('@/assets/icons/fan.png'),
  search: require('@/assets/icons/search.png'),
  cloud: require('@/assets/icons/cloud.png'),
  /** Points left: "go forward" in an Arabic layout. */
  chevron: require('@/assets/icons/chevron.png'),
};

export type IconName = keyof typeof ICONS;

/** A picture icon in any colour (the PNG is tinted). */
export function Icon({ name, size = 18, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Image source={ICONS[name]} style={{ width: size, height: size, tintColor: color }} accessibilityIgnoresInvertColors />;
}

const ARABIC = /[؀-ۿ]/;

/**
 * An icon beside a line of text, where an emoji used to start the text: on the right of Arabic text, on the left of English.
 * Works whether or not the phone lays the app out right-to-left.
 */
export function IconText({
  icon,
  text,
  color = colors.text,
  size,
  style,
  textStyle,
}: {
  icon: IconName;
  text: string;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const iconOnRight = ARABIC.test(text);
  // In a right-to-left layout "row" already starts on the right.
  const direction = iconOnRight === I18nManager.isRTL ? 'row' : 'row-reverse';
  const flat = StyleSheet.flatten(textStyle) ?? {};
  return (
    <View style={[styles.row, { flexDirection: direction }, style]}>
      <Icon name={icon} color={color} size={size ?? Math.round((flat.fontSize ?? sizes.md) * 1.15)} />
      <Text style={[{ color }, textStyle]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: 6 },
});
