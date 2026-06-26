import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '@/constants/theme';
import { getMachineTypeInfo } from '@/constants/machineTypes';
import { Report } from '@/types';
import { formatDisplayDate } from '@/utils/helpers';

interface Props {
  report: Report;
  onPress: () => void;
  onLongPress: () => void;
}

export function ReportCard({ report, onPress, onLongPress }: Props) {
  const machineInfo = getMachineTypeInfo(report.type);
  const isLocked = report.status === 'locked';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}>
      <View style={styles.header}>
        <Text style={styles.type}>{machineInfo.labelEn}</Text>
        {isLocked && (
          <View style={styles.lockBadge}>
            <Text style={styles.lockText}>🔒 SIGNED & LOCKED</Text>
          </View>
        )}
        {!isLocked && (
          <View style={styles.openBadge}>
            <Text style={styles.openText}>Open</Text>
          </View>
        )}
      </View>
      <Text style={styles.client}>{report.client || 'No client'}</Text>
      <Text style={styles.site}>{report.site || 'No site'}</Text>
      <View style={styles.footer}>
        <Text style={styles.date}>{formatDisplayDate(report.date)}</Text>
        <Text style={styles.maintenance}>{report.maintenance_type}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  type: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
    flex: 1,
  },
  lockBadge: {
    backgroundColor: colors.locked,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lockText: {
    color: colors.textLight,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  openBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  openText: {
    color: colors.textLight,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  client: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  site: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  date: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  maintenance: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '600',
  },
});
