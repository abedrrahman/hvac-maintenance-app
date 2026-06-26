import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { ChecklistSection } from '@/components/ChecklistSection';
import { LockedBadge } from '@/components/LockedBadge';
import { colors, fontSize, spacing } from '@/constants/theme';
import { getMachineTypeInfo } from '@/constants/machineTypes';
import { exportReportPdf, sharePdf } from '@/services/pdfGenerator';
import { useReport } from '@/hooks/useReport';
import { hasValue } from '@/utils/helpers';
import { useState } from 'react';

export default function ReportViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { report } = useReport(id!);
  const [exporting, setExporting] = useState(false);

  if (!report) {
    return (
      <View style={styles.center}>
        <Text>جاري التحميل...</Text>
      </View>
    );
  }

  const machineInfo = getMachineTypeInfo(report.type);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LockedBadge />
      <Text style={styles.title}>{machineInfo.labelAr}</Text>
      <Text style={styles.meta}>{report.client} — {report.site}</Text>
      <Text style={styles.meta}>{report.date} | {report.maintenance_type}</Text>
      <Text style={styles.meta}>{report.technician}</Text>
      <Text style={styles.meta}>{report.machine_model} | S/N: {report.serial_no}</Text>

      <Text style={styles.section}>قائمة الفحص</Text>
      <ChecklistSection
        items={report.checklist_items}
        machineType={report.type}
        tempUnit={report.temp_unit}
        pressureUnit={report.pressure_unit}
        readOnly
        onUpdate={() => {}}
      />

      {hasValue(report.required_maintenance) && (
        <>
          <Text style={styles.section}>الصيانة المطلوبة</Text>
          <Text style={styles.body}>{report.required_maintenance}</Text>
        </>
      )}

      {report.attention_notes.some((n) => hasValue(n.note)) && (
        <>
          <Text style={styles.section}>بحاجة إلى انتباه</Text>
          {report.attention_notes.filter((n) => hasValue(n.note)).map((n, i) => (
            <Text key={n.id} style={styles.body}>{n.unit_no || i + 1}. {n.note}</Text>
          ))}
        </>
      )}

      {report.materials.some((m) => hasValue(m.description)) && (
        <>
          <Text style={styles.section}>المواد المستخدمة</Text>
          {report.materials.filter((m) => hasValue(m.description)).map((m) => (
            <Text key={m.id} style={styles.body}>{m.description} — {m.qty} {m.unit}</Text>
          ))}
        </>
      )}

      {hasValue(report.general_notes) && (
        <>
          <Text style={styles.section}>الملاحظات</Text>
          <Text style={styles.body}>{report.general_notes}</Text>
        </>
      )}

      <Button title="تصدير PDF" variant="accent" loading={exporting}
        onPress={async () => {
          setExporting(true);
          try {
            const uri = await exportReportPdf(report);
            await sharePdf(uri);
          } finally { setExporting(false); }
        }} />
      <Button title="رجوع" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: '800', textAlign: 'right', color: colors.primary },
  meta: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right', marginTop: 4 },
  section: { fontSize: fontSize.lg, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm, textAlign: 'right' },
  body: { fontSize: fontSize.md, color: colors.text, textAlign: 'right', marginBottom: spacing.xs, lineHeight: 22 },
});
