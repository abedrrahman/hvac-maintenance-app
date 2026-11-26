import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Icon, IconText } from '@/components/Icon';
import { maintenanceLabel } from '@/constants/company';
import { colors, fontSize, spacing } from '@/constants/theme';
import { getMachineById, parseTemplateJson } from '@/db/repositories/machines';
import { getReportsByMachineId } from '@/db/repositories/reports';
import { isSaved, openDocument, saveDocument } from '@/services/offlineDocs';
import { Machine, Report, WebDocument } from '@/types';

const megabytes = (bytes: number) => `${Math.max(bytes / 1048576, 0.1).toFixed(1)} MB`;

export default function MachineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // the document being downloaded, or 'all'

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

  const documents = machine
    ? parseTemplateJson<WebDocument[]>(machine.web_documents, [])
    : [];

  // A saved document opens with no signal. An unsaved one is downloaded first, which needs the website.
  const failed = (doc: WebDocument) =>
    Alert.alert(
      'تنبيه',
      doc.id == null
        ? 'اضغط "مزامنة الآن" في الإعدادات مرة واحدة، ثم حاول مرة أخرى.'
        : `تعذر تنزيل "${doc.name}". يحتاج التنزيل الأول إلى اتصال بالموقع.`,
    );
  const open = async (doc: WebDocument) => {
    setBusy(doc.url);
    try {
      await openDocument(doc);
    } catch {
      failed(doc);
    } finally {
      setBusy(null);
    }
  };
  const saveAll = async () => {
    setBusy('all');
    try {
      for (const doc of documents) {
        try {
          await saveDocument(doc);
        } catch {
          failed(doc);
          break; // no connection: the rest would fail the same way
        }
      }
    } finally {
      setBusy(null);
    }
  };

  if (!machine) {
    return (
      <View style={styles.center}>
        <Text>جاري التحميل...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
          <View style={styles.header}>
            <Text style={styles.title}>{machine.name || machine.model || 'معدة'}</Text>
            {machine.name ? <Text style={styles.sub}>{machine.model}</Text> : null}
            <Text style={styles.sub}>{machine.client_name} — {machine.site}</Text>
            {machine.project ? (
              <Text style={styles.sub}>المشروع: {machine.project}</Text>
            ) : null}
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

          {documents.length > 0 && (
            <View style={styles.docs}>
              <Text style={styles.sectionTitle}>المستندات ({documents.length})</Text>
              {documents.some((doc) => !isSaved(doc)) && (
                <Pressable
                  style={[styles.docRow, styles.saveAll]}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  onPress={saveAll}>
                  <Text style={styles.saveAllText}>
                    {busy === 'all' ? 'جاري التنزيل...' : 'تنزيل كل المستندات للعمل بدون إنترنت'}
                  </Text>
                </Pressable>
              )}
              {documents.map((doc) => (
                <Pressable
                  key={doc.url}
                  style={styles.docRow}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  onPress={() => open(doc)}>
                  <Text style={styles.docName}>{doc.name}</Text>
                  {busy !== doc.url && isSaved(doc) ? (
                    <IconText icon="check" text={`${doc.type} · محفوظ على الهاتف`} color={colors.success} textStyle={styles.tech} />
                  ) : (
                    <Text style={styles.tech}>
                      {doc.type} ·{' '}
                      {busy === doc.url
                        ? 'جاري التنزيل...'
                        : `اضغط للتنزيل${doc.size ? ` (${megabytes(doc.size)})` : ''}`}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>سجل التقارير ({reports.length})</Text>
          </>
        }
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
              <Text style={styles.date}>{item.date}</Text>
              {item.status === 'locked' && (
                <Icon name="lock" size={16} color={colors.locked} />
              )}
            </View>
            <Text style={styles.maint}>{maintenanceLabel(item.maintenance_type)}</Text>
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
    backgroundColor: colors.brand,
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
  docs: { paddingBottom: spacing.sm },
  docRow: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveAll: { backgroundColor: colors.brand, borderColor: colors.brand },
  saveAllText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textLight,
    textAlign: 'center',
  },
  docName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'right',
  },
  list: { paddingBottom: spacing.xl },
  empty: { textAlign: 'center', color: colors.textSecondary, padding: spacing.md },
  reportCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginHorizontal: spacing.md,
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
