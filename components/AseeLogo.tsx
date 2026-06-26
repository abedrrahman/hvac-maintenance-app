import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COMPANY } from '@/constants/company';
import { colors, fontSize, spacing } from '@/constants/theme';

export function AseeLogo({ large = false }: { large?: boolean }) {
  return (
    <View style={[styles.container, large && styles.large]}>
      <View style={styles.logoMark}>
        <Text style={styles.logoLetter}>A</Text>
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.nameEn, large && styles.nameEnLarge]}>
          {COMPANY.nameEn}
        </Text>
        <Text style={[styles.nameAr, large && styles.nameArLarge]}>
          {COMPANY.nameAr}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  large: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoLetter: {
    color: colors.textLight,
    fontSize: 28,
    fontWeight: '800',
  },
  textBlock: {
    flex: 1,
  },
  nameEn: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textLight,
  },
  nameEnLarge: {
    fontSize: fontSize.lg,
    textAlign: 'center',
    color: colors.text,
  },
  nameAr: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    opacity: 0.9,
    textAlign: 'right',
    marginTop: 2,
  },
  nameArLarge: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
