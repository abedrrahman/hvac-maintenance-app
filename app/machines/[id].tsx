import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { File } from 'expo-file-system';
import { Button } from '@/components/Button';
import { colors, fontSize, spacing } from '@/constants/theme';
import {
  describeResult,
  downloadDocuments,
  openSavedDocument,
  savedDocument,
} from '@/services/offlineDocs';
import { getMachineById, parseTemplateJson } from '@/db/repositories/machines';
import { getReportsByMachineId } from '@/db/repositories/reports';
import { Machine, Report, WebDocument } from '@/types';
import { formatDisplayDate } from '@/utils/helpers';

export default function MachineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [downloading, setDownloading] = useState(false);

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
  // read on every draw (a few folder checks), so a finished download shows at once
  const saved = documents.map((doc) => savedDocument(doc.url));
  const missing = saved.filter((file) => !file).length;

  const handleDownload = async () => {
    if (!machine) return;
    setDownloading(true);
    try {
      const words = describeResult(await downloadDocuments([machine]));
      Alert.alert(words.title, words.message);
    } finally {
      setDownloading(false);
    }
  };

  const openDocument = (doc: WebDocument, file: File | null) => {
    const opening = file ? openSavedDocument(file) : Linking.openURL(doc.url);
    opening.catch(() =>
      Alert.alert(
        'تنبيه',
        file ? 'تعذر فتح المستند المحفوظ.' : 'تعذر فتح المستند. يحتاج إلى اتصال بالموقع.',
      ),
    );
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
          {documents.map((doc, i) => (
            <Pressable
              key={doc.url}
              style={styles.docRow}
              onPress={() => openDocument(doc, saved[i])}>
              <Text style={styles.docName}>{doc.name}</Text>
              <Text style={styles.tech}>
                {doc.type}
                {saved[i] ? ' — ✓ محفوظ على الهاتف' : ' — يحتاج إنترنت'}
              </Text>
            </Pressable>
          ))}
          {missing > 0 ? (
            <View style={styles.docButton}>
              <Button
                title="تنزيل المستندات للعمل بدون إنترنت"
                onPress={handleDownload}
                variant="accent"
                loading={downloading}
              />
            </View>
          ) : null}
        </View>
      )}

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
  docButton: { marginHorizontal: spacing.md },
  docRow: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'right',
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
