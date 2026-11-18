import { Button } from '@/components/Button';
import { SignatureModal } from '@/components/SignatureModal';
import { getMachineTypeInfo } from '@/constants/machineTypes';
import { colors, fontSize, spacing } from '@/constants/theme';
import { getFullReport, isReadyToSign, signContractReports } from '@/db/repositories/reports';
import { VisitUnit, getContractUnits, machineForVisit } from '@/db/repositories/visits';
import { ContractPdfUnit, exportContractPdf, sharePdf } from '@/services/pdfGenerator';
import { VISIT_STATE_TEXT, openVisitReport } from '@/services/visits';
import { syncNow } from '@/services/webSync';
import { formatDate } from '@/utils/helpers';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

type Signed = { image: string; name: string };

/**
 * One contract: a report for each of its units, filled one by one, then signed once by the technician and the client.
 * "Sign all" puts the two signatures in every chosen report, gives them one batch id and locks them.
 */
export default function ContractScreen() {
  const router = useRouter();
  const { contract = '' } = useLocalSearchParams<{ contract: string }>();
  const contractId = Number(contract);

  const [units, setUnits] = useState<VisitUnit[]>([]);
  // ready reports the technician unticked; every other ready report is chosen
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [signing, setSigning] = useState<'technician' | 'client' | null>(null);
  const [technician, setTechnician] = useState<Signed | null>(null);
  const [client, setClient] = useState<Signed | null>(null);
  const [busy, setBusy] = useState<'sign' | 'pdf' | null>(null);

  const load = useCallback(() => setUnits(getContractUnits(contractId)), [contractId]);
  useFocusEffect(load);

  const first = units.find((u) => u.visit)?.visit ?? null;
  const anyReport = units.find((u) => u.report)?.report ?? null;
  const number = first?.contract_number || anyReport?.contract_number || '';
  const title = first?.contract_title || anyReport?.contract_title || '';
  const clientName = first?.client_name || anyReport?.client || '';
  const date = (first?.scheduled_date || anyReport?.date || '').slice(0, 10);

  const ready = units.filter((u) => u.report && isReadyToSign(u.report));
  const chosen = ready.filter((u) => !unticked.has(u.report!.id));
  const signedCount = units.filter((u) => u.state === 'signed').length;
  const techName = units.find((u) => u.report?.technician)?.report?.technician ?? '';

  const toggle = (reportId: string) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });

  const openUnit = async (unit: VisitUnit) => {
    if (unit.report) {
      router.push((unit.report.status === 'locked' ? `/report/${unit.report.id}/view` : `/report/${unit.report.id}/3`) as never);
      return;
    }
    const page = unit.visit ? await openVisitReport(unit.visit) : null;
    if (page) router.push(page as never);
    else Alert.alert('تنبيه', 'هذه المعدة غير موجودة على الهاتف بعد. افتح الإعدادات واضغط "مزامنة الآن" ثم حاول مرة أخرى.');
  };

  const signAll = async () => {
    if (!technician || !client) return;
    setBusy('sign');
    try {
      signContractReports(chosen.map((u) => u.report!.id), technician, client, formatDate());
      setTechnician(null);
      setClient(null);
      setUnticked(new Set());
      load();
      const result = await syncNow();
      load();
      Alert.alert(
        'تم التوقيع',
        result.waiting === 0
          ? `تم توقيع ${chosen.length} تقرير وقفلها ورفعها إلى الموقع.`
          : `تم توقيع ${chosen.length} تقرير وقفلها. سترفع إلى الموقع عند توفر الإنترنت.`,
      );
    } catch (error) {
      Alert.alert('خطأ', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const confirmSignAll = () => {
    if (!technician || !client) {
      Alert.alert('تنبيه', 'يجب توقيع الفني والعميل أولاً.');
      return;
    }
    Alert.alert(
      'توقيع الكل',
      `سيتم وضع التوقيعين في ${chosen.length} تقرير وقفلها نهائياً:\n${chosen.map((u) => u.unitName).join('، ')}\n\nمتابعة؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'توقيع وقفل', onPress: signAll },
      ],
    );
  };

  const contractPdf = async () => {
    setBusy('pdf');
    try {
      const pdfUnits: ContractPdfUnit[] = units.map((u) => {
        const report = u.report ? getFullReport(u.report.id) : null;
        const machine = u.visit ? machineForVisit(u.visit) : null;
        return {
          name: u.unitName,
          serial: report?.serial_no || machine?.serial_number || '',
          equipment: getMachineTypeInfo(report?.type ?? machine?.type ?? 'custom').labelEn,
          status: u.state,
          report,
        };
      });
      const uri = await exportContractPdf(
        { number, title, client: clientName, date, technician: techName },
        pdfUnits,
      );
      await sharePdf(uri);
    } catch (error) {
      Alert.alert('خطأ', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: number ? `عقد ${number}` : 'زيارة عقد' }} />
      <FlatList
        data={units}
        keyExtractor={(item) => String(item.unitId)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.head}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            <Text style={styles.note}>
              {clientName || 'بدون عميل'}
              {date ? ` — ${date}` : ''}
            </Text>
            <Text style={styles.note}>
              المعدات: {units.length} · جاهز للتوقيع: {ready.length} · تم التوقيع: {signedCount}
            </Text>
            <Button title="PDF للعقد / Contract PDF" onPress={contractPdf} variant="secondary" loading={busy === 'pdf'} />
          </View>
        }
        ListEmptyComponent={<Text style={styles.note}>لا توجد معدات لهذا العقد على الهاتف. جرّب المزامنة.</Text>}
        renderItem={({ item, index }) => {
          const isReady = item.state === 'ready';
          const ticked = isReady && !unticked.has(item.report!.id);
          return (
            <View style={[styles.card, ticked && styles.cardChosen]}>
              {isReady ? (
                <Pressable
                  style={styles.tick}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ticked }}
                  onPress={() => toggle(item.report!.id)}>
                  <Text style={[styles.tickText, ticked && styles.tickOn]}>{ticked ? '☑' : '☐'}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.cardBody} onPress={() => openUnit(item)}>
                <Text style={styles.unit}>
                  {index + 1}. {item.unitName || 'معدة بدون اسم'}
                </Text>
                {item.report ? (
                  <Text style={styles.type}>{getMachineTypeInfo(item.report.type).labelAr}</Text>
                ) : null}
                <Text style={[styles.status, styles[item.state]]}>
                  {VISIT_STATE_TEXT[item.state]}
                  {item.state === 'draft' && item.report ? ` — ناقص ${item.report.empty_rows} قراءة` : ''}
                  {item.state === 'signed' && item.report?.uploaded_at ? ' — تم الرفع' : ''}
                </Text>
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={
          ready.length > 0 ? (
            <View style={styles.foot}>
              <Text style={styles.footTitle}>توقيع الكل / Sign all</Text>
              <Text style={styles.note}>
                التقارير المختارة: {chosen.length} من {ready.length} جاهزة. يوقّع العميل مرة واحدة لكل التقارير المختارة.
              </Text>
              <View style={styles.signs}>
                <View style={styles.sign}>
                  <Button
                    title={technician ? `✓ ${technician.name || 'توقيع الفني'}` : 'توقيع الفني'}
                    onPress={() => setSigning('technician')}
                    variant="secondary"
                  />
                </View>
                <View style={styles.sign}>
                  <Button
                    title={client ? `✓ ${client.name || 'توقيع العميل'}` : 'توقيع العميل'}
                    onPress={() => setSigning('client')}
                    variant="secondary"
                  />
                </View>
              </View>
              <Button
                title={`توقيع وقفل ${chosen.length} تقرير`}
                onPress={confirmSignAll}
                variant="accent"
                disabled={chosen.length === 0 || !technician || !client}
                loading={busy === 'sign'}
              />
            </View>
          ) : units.some((u) => u.state === 'draft') ? (
            <Text style={[styles.note, styles.foot]}>
              يصبح التقرير جاهزاً للتوقيع عندما تُملأ كل قراءاته. الصف الذي لا ينطبق يمكن حذفه بالضغط المطوّل عليه.
            </Text>
          ) : null
        }
      />
      <SignatureModal
        type={signing}
        defaultName={signing === 'technician' ? technician?.name || techName : client?.name ?? ''}
        onClose={() => setSigning(null)}
        onSave={(image, name) => {
          if (signing === 'technician') setTechnician({ image, name });
          else setClient({ image, name });
          setSigning(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  head: { gap: spacing.sm, marginBottom: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'right' },
  foot: { gap: spacing.sm, marginTop: spacing.md },
  footTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.brandDark, textAlign: 'right' },
  note: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right' },
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardChosen: { borderColor: colors.brand, backgroundColor: colors.accentLight },
  cardBody: { flex: 1, padding: spacing.md },
  tick: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  tickText: { fontSize: 26, color: colors.textSecondary },
  tickOn: { color: colors.brand },
  unit: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, textAlign: 'right' },
  type: { fontSize: fontSize.sm, color: colors.accent, textAlign: 'right', marginTop: 2 },
  status: { fontSize: fontSize.sm, textAlign: 'right', marginTop: 4 },
  not_started: { color: colors.textSecondary },
  draft: { color: colors.primaryLight },
  ready: { color: colors.brand, fontWeight: '700' },
  signed: { color: colors.success },
  signs: { flexDirection: 'row', gap: spacing.sm },
  sign: { flex: 1 },
});
