import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { colors, fontSize, spacing } from '@/constants/theme';
import { BilingualLabel } from './BilingualLabel';

interface Props extends TextInputProps {
  labelEn?: string;
  labelAr?: string;
  highlight?: boolean;
  readOnly?: boolean;
}

export function FormField({
  labelEn,
  labelAr,
  highlight,
  readOnly,
  style,
  ...props
}: Props) {
  return (
    <View style={styles.container}>
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
