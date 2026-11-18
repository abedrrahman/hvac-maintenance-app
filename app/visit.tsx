import { Button } from '@/components/Button';
import { SignatureModal } from '@/components/SignatureModal';
import { getMachineTypeInfo } from '@/constants/machineTypes';
import { colors, fontSize, spacing } from '@/constants/theme';
import { findMachines } from '@/db/repositories/machines';
import {
  VisitReport,
  getVisitReports,
  lockVisit,
  saveVisitSignature,
  startVisit,
} from '@/db/repositories/reports';
import { syncNow } from '@/services/webSync';
import { formatDate } from '@/utils/helpers';
import { loadGlobalUnits } from '@/utils/units';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

function statusOf(report: VisitReport): string {
  if (report.uploaded_at) return '✓ تم الرفع إلى الموقع';
  if (report.status === 'locked') return '🔒 مقفل — بانتظار الرفع';
  return report.filled === 0 ? 'لم يُملأ بعد' : `قيد التعبئة — ${report.filled} قراءة`;
}

/**
 * One contract visit: a report for each unit the website scheduled at this client for the day.
 * The reports are filled one by one, then signed once, locked and sent together from here.
 */
export default function VisitScreen() {
  const router = useRouter();
  const { group = '' } = useLocalSearchParams<{ group: string }>();
  // the group is "date|client"
  const date = group.slice(0, group.indexOf('|'));
  const client = group.slice(group.indexOf('|') + 1);

  const [reports, setReports] = useState<VisitReport[]>([]);
  const [missing, setMissing] = useState(0);
  const [signing, setSigning] = useState<'technician' | 'client' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const list = getVisitReports(group);
    const have = new Set(list.map((r) => r.machine_id));
    setReports(list);
    setMissing(findMachines({ client, visitDate: date }).filter((m) => !have.has(m.id)).length);
  }, [group, client, date]);

  useFocusEffect(load);

  const open = reports.filter((r) => r.status === 'open');
  const techSigned = open.length > 0 && open.every((r) => r.tech_signed);
  const clientSigned = open.length > 0 && open.every((r) => r.client_signed);

  const handleStart = async () => {
    setBusy(true);
    try {
      await startVisit(group, findMachines({ client, visitDate: date }), await loadGlobalUnits());
      load();
    } finally {
      setBusy(false);
    }
  };

  const lockAndSend = async () => {
    setBusy(true);
    try {
      lockVisit(group);
      load();
      const result = await syncNow({ manual: true });
      load();
      Alert.alert(
        result.waiting === 0 ? 'تم الإرسال' : 'تم القفل',
        result.waiting === 0
          ? `تم قفل التقارير ورفعها إلى الموقع (${result.uploaded}).`
          : `تم قفل التقارير. بانتظار الرفع: ${result.waiting} — سترفع عند توفر الإنترنت.`,
      );
    } catch (error) {
      Alert.alert('خطأ', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleLock = () => {
    if (!clientSigned) {
      Alert.alert('تنبيه', 'يجب توقيع العميل قبل قفل التقارير.');
      return;
    }
    const empty = open.filter((r) => r.filled === 0);
    Alert.alert(
      'قفل وإرسال كل التقارير',
      (empty.length
        ? `تقارير لم تُملأ بعد (${empty.length}): ${empty.map((r) => r.unit_name).join('، ')}\n\n`
        : '') + `سيتم قفل ${open.length} تقرير نهائياً وإرسالها إلى الموقع. متابعة؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'قفل وإرسال', onPress: lockAndSend },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: client || 'زيارة عقد' }} />
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.head}>
            <Text style={styles.note}>زيارة عقد — {date}</Text>
            {missing > 0 ? (
              <Button
                title={`بدء الزيارة: إنشاء ${missing} تقرير`}
                onPress={handleStart}
                variant="accent"
                loading={busy}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          missing === 0 ? <Text style={styles.note}>لا توجد معدات مجدولة لهذه الزيارة.</Text> : null
        }
        renderItem={({ item, index }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push(
                (item.status === 'locked' ? `/report/${item.id}/view` : `/report/${item.id}/3`) as never,
              )
            }>
            <Text style={styles.unit}>
              {index + 1}. {item.unit_name || 'معدة بدون اسم'}
            </Text>
            <Text style={styles.type}>{getMachineTypeInfo(item.type).labelAr}</Text>
            <Text style={[styles.status, item.status === 'open' && item.filled === 0 && styles.statusEmpty]}>
              {statusOf(item)}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          open.length > 0 ? (
            <View style={styles.foot}>
              <Text style={styles.note}>توقيع واحد لكل تقارير الزيارة ({open.length})</Text>
              <View style={styles.signs}>
                <View style={styles.sign}>
                  <Button
                    title={techSigned ? '✓ توقيع الفني' : 'توقيع الفني'}
                    onPress={() => setSigning('technician')}
                    variant="secondary"
                  />
                </View>
                <View style={styles.sign}>
                  <Button
                    title={clientSigned ? '✓ توقيع العميل' : 'توقيع العميل'}
                    onPress={() => setSigning('client')}
                    variant="secondary"
                  />
                </View>
              </View>
              <Button title="قفل وإرسال كل التقارير" onPress={handleLock} variant="accent" loading={busy} />
            </View>
          ) : null
        }
      />
      <SignatureModal
        type={signing}
        defaultName={signing === 'technician' ? (open.find((r) => r.technician)?.technician ?? '') : ''}
        onClose={() => setSigning(null)}
        onSave={(signature, name) => {
          saveVisitSignature(group, signing!, signature, name, formatDate());
          setSigning(null);
          load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  head: { gap: spacing.sm, marginBottom: spacing.md },
  foot: { gap: spacing.sm, marginTop: spacing.md },
  note: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unit: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, textAlign: 'right' },
  type: { fontSize: fontSize.sm, color: colors.accent, textAlign: 'right', marginTop: 2 },
  status: { fontSize: fontSize.sm, color: colors.success, textAlign: 'right', marginTop: 4 },
  statusEmpty: { color: colors.textSecondary },
  signs: { flexDirection: 'row', gap: spacing.sm },
  sign: { flex: 1 },
});
