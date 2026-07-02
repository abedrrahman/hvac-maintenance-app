import { colors, fontSize, spacing } from '@/constants/theme';
import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle
} from 'react-native';
import { BilingualLabel } from './BilingualLabel';

interface Props extends TextInputProps {
  labelEn?: string;
  labelAr?: string;
  highlight?: boolean;
  readOnly?: boolean;
  containerStyle?: ViewStyle;
  onChangeText?: (v: string) => void;
  onDebouncedChange?: (v: string) => void;
  debounceMs?: number;
}

export function FormField({
  labelEn,
  labelAr,
  highlight,
  readOnly,
  style,
  containerStyle,
  value,
  onChangeText,
  onBlur,
  onDebouncedChange,
  debounceMs = 2000,
  ...props
}: Props) {
  const [localValue, setLocalValue] = useState(value ?? '');
  const debounceRef = useRef<any>(null);
  const onDebouncedRef = useRef(onDebouncedChange);
  onDebouncedRef.current = onDebouncedChange;

  useEffect(() => {
    setLocalValue(value ?? '');
  }, [value]);

  const handleChange = (e: any) => {
    const text = e?.nativeEvent?.text ?? e?.target?.value ?? '';
    setLocalValue(text);
    onChangeText?.(text);

    if (onDebouncedRef.current) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        console.log('💾 Debounced save:', text); // add this
        onDebouncedRef.current?.(text);
      }, debounceMs);
    }
  };

  const handleBlur = (e: any) => {
    // flush pending debounce immediately on blur
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    console.log('💾 Blur save:', localValue);
    onDebouncedRef.current?.(localValue);
    onBlur?.(e);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {labelEn && labelAr && (
        <BilingualLabel labelEn={labelEn} labelAr={labelAr} />
      )}
      <TextInput
        style={[
          styles.input,
          highlight && styles.highlight,
          readOnly && styles.readOnly,
          style,
        ]}
        placeholderTextColor={colors.textSecondary}
        editable={!readOnly}
        scrollEnabled={false}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: 44,
    flexShrink: 1,
  },
  highlight: {
    backgroundColor: colors.highlightBg,
    borderColor: colors.accent,
  },
  readOnly: {
    backgroundColor: '#F3F4F6',
    color: colors.textSecondary,
  },
});