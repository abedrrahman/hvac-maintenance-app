import { AseeLogo } from '@/components/AseeLogo';
import { ReportCard } from '@/components/ReportCard';
import { colors, fontSize, spacing } from '@/constants/theme';
import { getReportsToUpload, searchReportsGlobal } from '@/db/repositories/reports';
import { VisitCard, getVisitCards } from '@/db/repositories/visits';
import { VISIT_STATE_TEXT, openVisitReport } from '@/services/visits';
import { WebLink, clearNewSites, loadWebLink } from '@/services/webSync';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

I18nManager.allowRTL(true);

export default function HomeScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ReturnType<typeof searchReportsGlobal>>([]);
  const [link, setLink] = useState<WebLink | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [visits, setVisits] = useState<VisitCard[]>([]);

  // Each time the home screen comes back: what the last sync found, and what still waits to upload.
  useFocusEffect(
    useCallback(() => {
      const load = () => {
        loadWebLink().then(setLink);
        setWaiting(getReportsToUpload().length);
        setVisits(getVisitCards());
      };
      load();
      // shortcut: looked at again every 5 seconds while this screen shows, because the download from the
      // website finishes a moment after the app opens and nothing tells this screen that it did.
      const timer = setInterval(load, 5000);
      return () => clearInterval(timer);
    }, []),
  );

  const handleSearch = (text: string) => {
    setSearch(text);
    if (text.trim().length >= 2) {
      setResults(searchReportsGlobal(text.trim()));
    } else {
      setResults([]);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <AseeLogo large />
      </View>

      {visits.length > 0 ? (
        <View style={styles.visits}>
          <Text style={styles.visitsTitle}>زياراتي / My visits</Text>
          {visits.map((card) => (
            <VisitCardView
              key={card.key}
              card={card}
              onPress={async () => {
                if (card.kind === 'contract') {
                  router.push({ pathname: '/visit', params: { contract: String(card.contractId) } } as never);
                  return;
                }
                const page = await openVisitReport(card.visit);
                if (page) router.push(page as never);
                else Alert.alert('تنبيه', 'هذه المعدة غير موجودة على الهاتف بعد. افتح الإعدادات واضغط "مزامنة الآن".');
              }}
            />
          ))}
        </View>
      ) : null}

      {link && (link.newSites?.length || link.newUnits) ? (
        <Pressable
          style={styles.notice}
          onPress={async () => {
            await clearNewSites();
            setLink(await loadWebLink());
            router.push('/machines' as never);
          }}>
          <Text style={styles.noticeTitle}>
            {link.newSites?.length
              ? `مواقع جديدة على الموقع: ${link.newSites.length}`
              : 'معدات جديدة على الموقع'}
            {link.newUnits ? ` — ${link.newUnits} معدة` : ''}
          </Text>
          {link.newSites?.length ? (
            <Text style={styles.noticeText}>{link.newSites.slice(0, 5).join('، ')}</Text>
          ) : null}
          <Text style={styles.noticeText}>اضغط للعرض</Text>
        </Pressable>
      ) : null}

      {link && waiting > 0 ? (
        <Text style={styles.waiting}>
          {link.autoUpload === false
            ? `تقارير بانتظار الرفع: ${waiting} — الرفع التلقائي متوقف`
            : `تقارير بانتظار الرفع: ${waiting} — سترفع عند توفر الإنترنت`}
        </Text>
      ) : null}

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="بحث..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={handleSearch}
          textAlign="right"
        />
      </View>

      {results.length > 0 && (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>نتائج البحث</Text>
          {results.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onPress={() =>
                router.push(
                  report.status === 'locked'
                    ? `/report/${report.id}/view`
                    : `/report/${report.id}/1`,
                )
              }
              onLongPress={() => {}}
            />
          ))}
        </View>
      )}

      <View style={styles.menu}>
        <MenuButton
          title="تقرير جديد"
          subtitle="إنشاء تقرير صيانة جديد"
          onPress={() => router.push('/new')}
          accent
        />
        <MenuButton
          title="التقارير السابقة"
          subtitle="عرض جميع التقارير المحفوظة"
          onPress={() => router.push('/reports')}
        />
        <MenuButton
          title="البحث عن الإنذارات"
          subtitle="رمز الإنذار أو وصف المشكلة — يعمل بدون إنترنت"
          onPress={() => router.push('/alarms' as never)}
        />
        <MenuButton
          title="المعدات المحفوظة"
          subtitle="قاعدة بيانات المعدات"
          onPress={() => router.push('/machines' as never)}
        />
      </View>

      <Pressable style={styles.settingsBtn} onPress={() => router.push('/settings')}>
        <Text style={styles.settingsText}>⚙️ الإعدادات (وحدات القياس)</Text>
      </Pressable>
    </ScrollView>
  );
}

/** Why the visit is high on the list, as a short tag. */
function visitTag(card: VisitCard): string {
  if (card.rank === 0) return 'بدأها المكتب';
  if (card.rank === 1) return 'اليوم';
  return '';
}

function VisitCardView({ card, onPress }: { card: VisitCard; onPress: () => void }) {
  const tag = visitTag(card);
  const overdue = card.kind === 'contract' ? card.overdue : !!card.visit.overdue;
  const date = card.kind === 'contract' ? card.date : card.visit.scheduled_date.slice(0, 10);
  return (
    <Pressable style={[styles.visitCard, card.rank === 0 && styles.visitCardStarted]} onPress={onPress}>
      <View style={styles.visitTop}>
        <Text style={styles.visitName} numberOfLines={1}>
          {card.kind === 'contract'
            ? `عقد ${card.number || ''} — ${card.client || 'بدون عميل'}`
            : card.unit.unitName || 'معدة بدون اسم'}
        </Text>
        {tag ? <Text style={styles.visitTag}>{tag}</Text> : null}
        {overdue ? <Text style={[styles.visitTag, styles.visitLate]}>متأخر</Text> : null}
      </View>
      {card.kind === 'contract' ? (
        <>
          {card.title ? <Text style={styles.visitText}>{card.title}</Text> : null}
          <Text style={styles.visitText}>
            {card.units} معدات · تم {card.done} من {card.units}
            {date ? ` · ${date}` : ''}
          </Text>
        </>
      ) : (
        <Text style={styles.visitText}>
          {card.visit.client_name || 'بدون عميل'}
          {date ? ` · ${date}` : ''} · {VISIT_STATE_TEXT[card.unit.state]}
        </Text>
      )}
    </Pressable>
  );
}

function MenuButton({
  title,
  subtitle,
  onPress,
  accent,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable
      style={[styles.menuBtn, accent && styles.menuBtnAccent]}
      onPress={onPress}>
      <Text style={[styles.menuTitle, accent && styles.menuTitleAccent]}>
        {title}
      </Text>
      <Text style={[styles.menuSub, accent && styles.menuSubAccent]}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  header: {
    borderRadius: 1,
    padding: spacing.xs,
    marginBottom: spacing.xs,
    alignItems: 'center',
  },
  searchBox: {
    marginBottom: spacing.lg,
  },
  notice: {
    backgroundColor: colors.accentLight,
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.brandDark,
    textAlign: 'right',
  },
  noticeText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 2,
  },
  visits: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  visitsTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  visitCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  visitCardStarted: {
    borderColor: colors.brand,
    backgroundColor: colors.accentLight,
  },
  visitTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  visitName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  visitTag: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textLight,
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  visitLate: {
    backgroundColor: colors.danger,
  },
  visitText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 2,
  },
  waiting: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  results: {
    marginBottom: spacing.lg,
  },
  resultsTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    marginBottom: spacing.sm,
  },
  menu: {
    gap: spacing.md,
  },
  menuBtn: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuBtnAccent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  menuTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  menuTitleAccent: {
    color: colors.textLight,
  },
  menuSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  menuSubAccent: {
    color: colors.textLight,
    opacity: 0.9,
  },
  settingsBtn: {
    marginTop: spacing.xl,
    alignItems: 'center',
    padding: spacing.md,
  },
  settingsText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
});
