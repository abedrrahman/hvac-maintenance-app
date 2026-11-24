import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { colors, fontSize, spacing } from '@/constants/theme';
import { Alarm, countAlarms, searchAlarms } from '@/db/repositories/alarms';
import { addAlarmToReport } from '@/db/repositories/reports';
import { BotAnswer, askAlarmBot, downloadAlarmList } from '@/services/webSync';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

/**
 * Alarm Lookup. The list on the phone answers at once and needs no signal;
 * the website's assistant adds step-by-step help when there is a connection.
 */
export default function AlarmsScreen() {
  // report: opened from a report, so an alarm can be added to it. q: an alarm to show at once.
  const { report, q } = useLocalSearchParams<{ report?: string; q?: string }>();
  const router = useRouter();
  const [text, setText] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [results, setResults] = useState<Alarm[]>([]);
  const [total, setTotal] = useState(0);
  const [answer, setAnswer] = useState<BotAnswer | null>(null);
  const [botNote, setBotNote] = useState('');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setTotal(countAlarms());
    if (q) handleChange(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const download = async () => {
    setDownloading(true);
    try {
      const count = await downloadAlarmList();
      setTotal(count);
      if (text.trim()) setResults(searchAlarms(text));
      Alert.alert('تم', `تم تنزيل ${count} إنذار. القائمة تعمل الآن بدون إنترنت.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert(
        'تعذر التنزيل',
        message === 'not signed in' ? 'اربط التطبيق بالموقع من الإعدادات أولاً.' : `يحتاج التنزيل إلى اتصال بالموقع.\n${message}`,
      );
    } finally {
      setDownloading(false);
    }
  };

  /** Puts the alarm in the report's "Needs attention" and goes back to the report. */
  const addToReport = (code: string, name: string) => {
    if (!report || !code.trim()) return;
    addAlarmToReport(report, code, name);
    router.back();
  };

  const handleChange = (value: string) => {
    setText(value);
    setAnswer(null);
    setBotNote('');
    setResults(searchAlarms(value));
  };

  const handleAsk = async () => {
    if (text.trim().length < 2) return;
    setAsking(true);
    setBotNote('');
    try {
      setAnswer(await askAlarmBot(text.trim()));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setAnswer(null);
      setBotNote(
        message === 'not signed in'
          ? 'المساعد يحتاج إلى الربط مع الموقع من الإعدادات.'
          : 'تعذر الوصول إلى المساعد (لا يوجد اتصال أو الاتصال بطيء). النتائج أدناه من القائمة المحفوظة على الهاتف.',
      );
    } finally {
      setAsking(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {report ? (
        <View style={styles.reportBar}>
          <Text style={styles.reportBarText}>اختر إنذاراً لإضافته إلى التقرير، أو اكتب إنذاراً جديداً.</Text>
          <Button title="رجوع إلى التقرير" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : null}
      <TextInput
        style={styles.search}
        placeholder="رمز الإنذار أو وصف المشكلة (مثال: d4.1 أو high pressure)"
        placeholderTextColor={colors.textSecondary}
        value={text}
        onChangeText={handleChange}
        autoCapitalize="none"
        autoCorrect={false}
        textAlign="right"
      />
      {report && text.trim() ? (
        <Button
          title={`إضافة «${text.trim()}» كإنذار جديد`}
          icon="plus"
          variant="primary"
          onPress={() => addToReport(text.trim(), '')}
        />
      ) : null}
      <Button title="اسأل المساعد (يحتاج إنترنت)" onPress={handleAsk} variant="accent" loading={asking} />
      {botNote ? <Text style={styles.note}>{botNote}</Text> : null}

      {answer && (
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>إجابة المساعد</Text>
          {answer.text ? <Text style={styles.botText}>{answer.text}</Text> : null}
          {(answer.alarms ?? []).map((a, i) => (
            <View key={`${a.code}-${i}`} style={styles.card}>
              <Text style={styles.code}>{a.code}</Text>
              <Text style={styles.name}>{a.name}</Text>
              {/* every part may be missing in the website's answer: show what came */}
              <UnitTags names={a.controllers ?? []} />
              <Row label="ماذا تفعل الوحدة" ar={a.effect ?? ''} />
              <Row label="الأسباب المحتملة" ar={a.causes ?? ''} />
              {(a.steps ?? []).map((s, n) => (
                <Text key={n} style={styles.step}>
                  {n + 1}. {s.label}: {s.text}
                </Text>
              ))}
              {a.source ? <Source source={a.source} prefix="المصدر: " /> : null}
              {report ? <Button title="إضافة إلى التقرير" icon="plus" variant="accent" onPress={() => addToReport(a.code, a.name)} /> : null}
            </View>
          ))}
          {(answer.passages ?? []).map((p, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.value}>{(p.snippet ?? '').replace(/\[\[|\]\]/g, '')}</Text>
              {p.source ? <Source source={p.source} /> : null}
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>
        {text.trim() ? `من القائمة المحفوظة (${results.length})` : `الإنذارات المحفوظة على الهاتف: ${total}`}
      </Text>
      {total === 0 ? (
        <Text style={styles.note}>لم تُنزَّل قائمة الإنذارات بعد. اضغط الزر أدناه (يحتاج الربط مع الموقع من الإعدادات).</Text>
      ) : null}
      <Button
        title={total === 0 ? 'تنزيل قائمة الإنذارات' : 'تحديث قائمة الإنذارات من الموقع'}
        icon="cloud"
        variant="secondary"
        onPress={download}
        loading={downloading}
      />
      {text.trim() && results.length === 0 && total > 0 ? (
        <Text style={styles.note}>لا توجد نتائج. جرّب رمز الإنذار كما يظهر على الشاشة أو كلمات أقل.</Text>
      ) : null}
      {results.map((a, i) => (
        <View key={`${a.key}-${a.controller}-${i}`} style={styles.card}>
          <Text style={styles.code}>{a.code}</Text>
          <UnitTags names={[a.controller]} />
          <Text style={styles.name}>{a.name_ar || a.name_en}</Text>
          {a.name_ar ? <Text style={styles.meta}>{a.name_en}</Text> : null}
          {a.effect_en.toLowerCase() !== 'none' ? <Row label="ماذا تفعل الوحدة" ar={a.effect_ar} en={a.effect_en} /> : null}
          <Row label="الأسباب المحتملة" ar={a.causes_ar} en={a.causes_en} />
          <Row label="الفحوصات" ar={a.checks_ar} en={a.checks_en} />
          <Row label="الإجراء" ar={a.action_ar} en={a.action_en} />
          <Row label="إعادة الضبط" ar={a.reset_ar} en={a.reset_en} />
          {report ? (
            <Button title="إضافة إلى التقرير" icon="plus" variant="accent" onPress={() => addToReport(a.code, a.name_en || a.name_ar)} />
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

/** The units (controller family) an alarm belongs to, as coloured tags, so the right unit stands out at a glance. */
function UnitTags({ names }: { names: string[] }) {
  const shown = names.map((n) => n.trim()).filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <View style={styles.tags}>
      {shown.map((name, i) => (
        <View key={`${name}-${i}`} style={styles.tag}>
          <Icon name="fan" size={14} color={colors.locked} />
          <Text style={styles.tagText}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

/** The manual a part of the answer comes from, with its page when the website gives one. */
function Source({ source, prefix = '' }: { source: { name?: string; page?: number }; prefix?: string }) {
  if (!source.name) return null;
  return (
    <Text style={styles.meta}>
      {prefix}
      {source.name}
      {source.page ? ` — صفحة ${source.page}` : ''}
    </Text>
  );
}

/** Arabic when the manual text has been translated, otherwise the English original. Nothing at all when both are empty. */
function Row({ label, ar, en = '' }: { label: string; ar: string; en?: string }) {
  if (!ar && !en) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={ar ? styles.valueAr : styles.value}>{ar || en}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.sm },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  block: { gap: spacing.sm },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: spacing.md,
  },
  note: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right' },
  botText: { fontSize: fontSize.md, color: colors.text, textAlign: 'right' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  reportBar: { gap: spacing.sm, backgroundColor: colors.accentLight, borderRadius: 12, padding: spacing.md },
  reportBarText: { fontSize: fontSize.md, fontWeight: '700', color: colors.brandDark, textAlign: 'right' },
  tags: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  tag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECEBFA',
    borderColor: colors.locked,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.locked },
  code: { fontSize: fontSize.lg, fontWeight: '800', color: colors.brandDark, textAlign: 'left' },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, textAlign: 'right', marginTop: 2 },
  meta: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },
  row: { marginTop: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, textAlign: 'right' },
  value: { fontSize: fontSize.md, color: colors.text, textAlign: 'left' },
  valueAr: { fontSize: fontSize.md, color: colors.text, textAlign: 'right' },
  step: { fontSize: fontSize.md, color: colors.text, textAlign: 'right', marginTop: spacing.xs },
});
