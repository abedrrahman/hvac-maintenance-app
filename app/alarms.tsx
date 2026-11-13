import { Button } from '@/components/Button';
import { colors, fontSize, spacing } from '@/constants/theme';
import { Alarm, countAlarms, searchAlarms } from '@/db/repositories/alarms';
import { BotAnswer, askAlarmBot } from '@/services/webSync';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

/**
 * Alarm Lookup. The list on the phone answers at once and needs no signal;
 * the website's assistant adds step-by-step help when there is a connection.
 */
export default function AlarmsScreen() {
  const [text, setText] = useState('');
  const [results, setResults] = useState<Alarm[]>([]);
  const [total, setTotal] = useState(0);
  const [answer, setAnswer] = useState<BotAnswer | null>(null);
  const [botNote, setBotNote] = useState('');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setTotal(countAlarms());
  }, []);

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
      <Button title="اسأل المساعد (يحتاج إنترنت)" onPress={handleAsk} variant="accent" loading={asking} />
      {botNote ? <Text style={styles.note}>{botNote}</Text> : null}

      {answer && (
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>إجابة المساعد</Text>
          <Text style={styles.botText}>{answer.text}</Text>
          {(answer.alarms ?? []).map((a, i) => (
            <View key={`${a.code}-${i}`} style={styles.card}>
              <Text style={styles.code}>{a.code}</Text>
              <Text style={styles.name}>{a.name}</Text>
              <Text style={styles.meta}>{a.controllers.join('، ')}</Text>
              <Row label="ماذا تفعل الوحدة" ar={a.effect} />
              <Row label="الأسباب المحتملة" ar={a.causes} />
              {a.steps.map((s, n) => (
                <Text key={n} style={styles.step}>
                  {n + 1}. {s.label}: {s.text}
                </Text>
              ))}
              <Text style={styles.meta}>
                المصدر: {a.source.name} — صفحة {a.source.page}
              </Text>
            </View>
          ))}
          {(answer.passages ?? []).map((p, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.value}>{p.snippet.replace(/\[\[|\]\]/g, '')}</Text>
              <Text style={styles.meta}>
                {p.source.name} — صفحة {p.source.page}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>
        {text.trim() ? `من القائمة المحفوظة (${results.length})` : `الإنذارات المحفوظة على الهاتف: ${total}`}
      </Text>
      {total === 0 ? (
        <Text style={styles.note}>
          لم تُنزَّل قائمة الإنذارات بعد. اربط التطبيق بالموقع من الإعدادات ثم اضغط «مزامنة الآن».
        </Text>
      ) : null}
      {text.trim() && results.length === 0 && total > 0 ? (
        <Text style={styles.note}>لا توجد نتائج. جرّب رمز الإنذار كما يظهر على الشاشة أو كلمات أقل.</Text>
      ) : null}
      {results.map((a, i) => (
        <View key={`${a.key}-${a.controller}-${i}`} style={styles.card}>
          <Text style={styles.code}>{a.code}</Text>
          <Text style={styles.name}>{a.name_ar || a.name_en}</Text>
          {a.name_ar ? <Text style={styles.meta}>{a.name_en}</Text> : null}
          <Text style={styles.meta}>{a.controller}</Text>
          {a.effect_en.toLowerCase() !== 'none' ? <Row label="ماذا تفعل الوحدة" ar={a.effect_ar} en={a.effect_en} /> : null}
          <Row label="الأسباب المحتملة" ar={a.causes_ar} en={a.causes_en} />
          <Row label="الفحوصات" ar={a.checks_ar} en={a.checks_en} />
          <Row label="الإجراء" ar={a.action_ar} en={a.action_en} />
          <Row label="إعادة الضبط" ar={a.reset_ar} en={a.reset_en} />
        </View>
      ))}
    </ScrollView>
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
  code: { fontSize: fontSize.lg, fontWeight: '800', color: colors.brandDark, textAlign: 'left' },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, textAlign: 'right', marginTop: 2 },
  meta: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },
  row: { marginTop: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, textAlign: 'right' },
  value: { fontSize: fontSize.md, color: colors.text, textAlign: 'left' },
  valueAr: { fontSize: fontSize.md, color: colors.text, textAlign: 'right' },
  step: { fontSize: fontSize.md, color: colors.text, textAlign: 'right', marginTop: spacing.xs },
});
