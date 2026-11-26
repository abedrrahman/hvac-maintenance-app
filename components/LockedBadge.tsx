import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IconText } from './Icon';
import { colors, fontSize, spacing } from '@/constants/theme';

export function LockedBadge() {
  return (
    <View style={styles.badge}>
      <IconText icon="lock" text="SIGNED & LOCKED" color={colors.textLight} textStyle={styles.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.locked,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  text: {
    color: colors.textLight,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
