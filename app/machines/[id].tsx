import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fontSize, spacing } from '@/constants/theme';
import { getMachineById } from '@/db/repositories/machines';
import { getReportsByMachineId } from '@/db/repositories/reports';
import { Machine, Report } from '@/types';
import { formatDisplayDate } from '@/utils/helpers';

export default function MachineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [reports, setReports] = useState<Report[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    setMachine(getMachineById(id));
    setReports(getReportsByMachineId(id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!machine) {
    return (
      <View style={styles.center}>
        <Text>جاري التحميل...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{machine.model || 'معدة'}</Text>
        <Text style={styles.sub}>{machine.client_name} — {machine.site}</Text>
        {machine.serial_number ? (
          <Text style={styles.sub}>S/N: {machine.serial_number}</Text>
        ) : null}
        {machine.brand ? (
          <Text style={styles.sub}>العلامة: {machine.brand}</Text>
        ) : null}
        {machine.capacity ? (
          <Text style={styles.sub}>السعة: {machine.capacity}</Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>سجل التقارير ({reports.length})</Text>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>لا توجد تقارير لهذه المعدة.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.reportCard}
            onPress={() =>
              router.push(
                item.status === 'locked'
                  ? `/report/${item.id}/view`
                  : `/report/${item.id}/1`,
              )
            }>
            <View style={styles.reportRow}>
              <Text style={styles.date}>{formatDisplayDate(item.date)}</Text>
              {item.status === 'locked' && (
                <Text style={styles.locked}>🔒</Text>
              )}
            </View>
            <Text style={styles.maint}>{item.maintenance_type}</Text>
            <Text style={styles.tech}>{item.technician}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: colors.primary,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textLight,
    textAlign: 'right',
  },
  sub: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    opacity: 0.9,
    textAlign: 'right',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    padding: spacing.md,
    textAlign: 'right',
    color: colors.text,
  },
  list: { padding: spacing.md, paddingTop: 0 },
  empty: { textAlign: 'center', color: colors.textSecondary },
  reportCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  locked: { fontSize: fontSize.md },
  maint: {
    fontSize: fontSize.sm,
    color: colors.accent,
    textAlign: 'right',
    marginTop: 4,
  },
  tech: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
  },
});
