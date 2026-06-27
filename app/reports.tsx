import { Button } from '@/components/Button';
import { DropdownPicker } from '@/components/DropdownPicker';
import { ReportCard } from '@/components/ReportCard';
import { MACHINE_TYPES } from '@/constants/machineTypes';
import { colors, fontSize, spacing } from '@/constants/theme';
import { deleteReport, getAllReports } from '@/db/repositories/reports';
import { Report, ReportFilters } from '@/types';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function ReportsListScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState<string>('all');
  const [showFilter, setShowFilter] = useState(false);

  const loadReports = useCallback(() => {
    const filters: ReportFilters = {
      search,
      machineType: machineFilter as ReportFilters['machineType'],
      dateFrom: null,
      dateTo: null,
    };
    setReports(getAllReports(filters));
  }, [search, machineFilter]);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports]),
  );

  const handleDelete = (report: Report) => {
    Alert.alert(
      'حذف التقرير',
      `حذف تقرير ${report.client || 'هذا العميل'}؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            deleteReport(report.id);
            loadReports();
          },
        },
      ],
    );
  };

  const filterLabels: Record<string, string> = {
    all: 'الكل',
    ...Object.fromEntries(MACHINE_TYPES.map((m) => [m.id, m.labelAr])),
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="بحث..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onDebouncedChange={setSearch}
          textAlign="right"
        />
        <Pressable
          style={styles.filterBtn}
          onPress={() => setShowFilter(true)}>
          <Text style={styles.filterBtnText}>
            {filterLabels[machineFilter] ?? 'تصفية'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>لا توجد تقارير بعد.</Text>
        }
        renderItem={({ item }) => (
          <ReportCard
            report={item}
            onPress={() =>
              router.push(
                item.status === 'locked'
                  ? `/report/${item.id}/view`
                  : `/report/${item.id}/1`,
              )
            }
            onLongPress={() => handleDelete(item)}
          />
        )}
      />

      <View style={styles.fabRow}>
        <Button
          title="تقرير جديد +"
          onPress={() => router.push('/new')}
          variant="accent"
        />
      </View>

      <DropdownPicker
        visible={showFilter}
        options={Object.values(filterLabels)}
        selected={filterLabels[machineFilter] ?? 'الكل'}
        onSelect={(label) => {
          const key = Object.entries(filterLabels).find(
            ([, v]) => v === label,
          )?.[0];
          if (key) setMachineFilter(key);
        }}
        onClose={() => setShowFilter(false)}
        title="نوع المعدة"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  filterBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    justifyContent: 'center',
  },
  filterBtnText: {
    color: colors.textLight,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  list: { padding: spacing.md, paddingBottom: 100 },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
    fontSize: fontSize.md,
  },
  fabRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
