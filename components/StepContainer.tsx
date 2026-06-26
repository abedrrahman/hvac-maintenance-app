import React from 'react';
import { StyleSheet, View, ViewProps, useWindowDimensions } from 'react-native';
import { spacing } from '@/constants/theme';

export function StepContainer({ children, style, ...props }: ViewProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  return (
    <View
      style={[styles.container, isWide && styles.wide, style]}
      {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.md,
  },
  wide: {
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
  },
});
