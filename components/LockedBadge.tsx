import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '@/constants/theme';

export function LockedBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>🔒 SIGNED & LOCKED</Text>
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
