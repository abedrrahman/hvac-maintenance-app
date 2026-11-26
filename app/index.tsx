import { Icon, IconName } from '@/components/Icon';
import { ReportCard } from '@/components/ReportCard';
import { colors, fontSize, spacing } from '@/constants/theme';
import { countOpenReports, getReportsToUpload, searchReportsGlobal } from '@/db/repositories/reports';
import { VisitCard, getVisitCards } from '@/db/repositories/visits';
import { VISIT_STATE_TEXT, openVisitReport } from '@/services/visits';
import { WebLink, clearNewSites, loadWebLink } from '@/services/webSync';
import { formatDate } from '@/utils/helpers';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  I18nManager,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

I18nManager.allowRTL(true);

// Rows that start on the right (Arabic reading order), whether or not the phone lays the app out right-to-left.
const FROM_RIGHT = I18nManager.isRTL ? 'row' : 'row-reverse';
const RIGHT_EDGE = I18nManager.isRTL ? 'flex-start' : 'flex-end';

/** "Last sync" in words: the time when it was today, else the date. */
function syncText(link: WebLink): string {
  if (link.signedOut) return 'تم تسجيل خروج هذا الهاتف من الموقع · اضغط لتسجيل الدخول';
  if (!link.lastSync) return 'متصل بالموقع · لم تتم المزامنة بعد';
  const when = new Date(link.lastSync);
  const time = `${when.getHours()}:${String(when.getMinutes()).padStart(2, '0')}`;
  return `متصل بالموقع · آخر مزامنة ${formatDate(when) === formatDate() ? time : formatDate(when)}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ReturnType<typeof searchReportsGlobal>>([]);
  const [link, setLink] = useState<WebLink | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [open, setOpen] = useState(0);
  const [visits, setVisits] = useState<VisitCard[]>([]);

  // Each time the home screen comes back: what the last sync found, and what still waits to upload.
  useFocusEffect(
    useCallback(() => {
      const load = () => {
        loadWebLink().then(setLink);
        setWaiting(getReportsToUpload().length);
        setOpen(countOpenReports());
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
    setResults(text.trim().length >= 2 ? searchReportsGlobal(text.trim()) : []);
  };

  const openCard = async (card: VisitCard) => {
    if (card.kind === 'contract') {
      router.push({ pathname: '/visit', params: { contract: String(card.contractId) } } as never);
      return;
    }
    const page = await openVisitReport(card.visit);
    if (page) router.push(page as never);
    else Alert.alert('تنبيه', 'هذه المعدة غير موجودة على الهاتف بعد. افتح الإعدادات واضغط "مزامنة الآن".');
  };

  const today = visits.filter((v) => v.rank <= 1).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      keyboardShouldPersistTaps="handled">
      {/* Header: logo and settings, then who is signed in and whether the website is reachable */}
      <View style={[styles.topBar, { flexDirection: FROM_RIGHT }]}>
        <Image source={require('@/assets/images/main_screen_icon.png')} style={styles.logo} resizeMode="contain" />
        <Pressable
          style={styles.roundBtn}
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="الإعدادات">
          <Icon name="gear" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.hello}>
        <Text style={styles.helloTitle}>{link?.userName ? `مرحباً، ${link.userName}` : 'مرحباً'}</Text>
        <Pressable
          style={[styles.status, { flexDirection: FROM_RIGHT }]}
          onPress={() => router.push('/settings')}>
          <View style={[styles.dot, { backgroundColor: !link ? colors.textSecondary : link.signedOut ? colors.danger : colors.success }]} />
          <Text style={styles.statusText}>{link ? syncText(link) : 'غير مربوط بالموقع · اضغط للربط'}</Text>
        </Pressable>
      </View>

      {/* At a glance: what is on today, what is unfinished, what has not reached the website */}
      <View style={[styles.stats, { flexDirection: FROM_RIGHT }]}>
        <Stat value={today} label="زيارات اليوم" />
        <Stat value={open} label="تقارير مفتوحة" onPress={() => router.push('/reports')} />
        <Stat
          value={waiting}
          label={link?.autoUpload === false && waiting > 0 ? 'بانتظار الرفع (متوقف)' : 'بانتظار الرفع'}
          warn={waiting > 0}
          onPress={() => router.push('/settings')}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.primary, { flexDirection: FROM_RIGHT }, pressed && styles.pressed]}
        onPress={() => router.push('/new')}
        accessibilityRole="button">
        <View style={styles.primaryIcon}>
          <Icon name="plus" size={28} color={colors.brand} />
        </View>
        <View style={styles.primaryText}>
          <Text style={styles.primaryTitle}>تقرير جديد</Text>
          <Text style={styles.primarySub}>إنشاء تقرير صيانة لمعدة</Text>
        </View>
      </Pressable>

      <View style={[styles.searchBox, { flexDirection: FROM_RIGHT }]}>
        <Icon name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="ابحث في التقارير: عميل، موقع، موديل، رقم تسلسلي..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={handleSearch}
          textAlign="right"
        />
      </View>

      {results.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>نتائج البحث ({results.length})</Text>
          {results.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onPress={() =>
                router.push(report.status === 'locked' ? `/report/${report.id}/view` : `/report/${report.id}/1`)
              }
              onLongPress={() => {}}
            />
          ))}
        </View>
      )}

      {link && (link.newSites?.length || link.newUnits) ? (
        <Pressable
          style={styles.notice}
          onPress={async () => {
            await clearNewSites();
            setLink(await loadWebLink());
            router.push('/machines' as never);
          }}>
          <Text style={styles.noticeTitle}>
            {link.newSites?.length ? `مواقع جديدة على الموقع: ${link.newSites.length}` : 'معدات جديدة على الموقع'}
            {link.newUnits ? ` — ${link.newUnits} معدة` : ''}
          </Text>
          {link.newSites?.length ? (
            <Text style={styles.noticeText}>{link.newSites.slice(0, 5).join('، ')}</Text>
          ) : null}
          <Text style={styles.noticeText}>اضغط للعرض</Text>
        </Pressable>
      ) : null}

      {visits.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>زياراتي ({visits.length})</Text>
          {visits.map((card) => (
            <VisitCardView key={card.key} card={card} onPress={() => openCard(card)} />
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>الوصول السريع</Text>
        <View style={[styles.grid, { flexDirection: FROM_RIGHT }]}>
          <Tile icon="file" title="التقارير" sub="كل التقارير المحفوظة" onPress={() => router.push('/reports')} />
          <Tile icon="bell" title="الإنذارات" sub="يعمل بدون إنترنت" onPress={() => router.push('/alarms' as never)} />
          <Tile icon="fan" title="المعدات" sub="الدول، العملاء، المعدات" onPress={() => router.push('/machines' as never)} />
          <Tile icon="gear" title="الإعدادات" sub="الربط ووحدات القياس" onPress={() => router.push('/settings')} />
        </View>
      </View>
    </ScrollView>
  );
}

function Stat({ value, label, warn, onPress }: { value: number; label: string; warn?: boolean; onPress?: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.stat, pressed && onPress && styles.pressed]} onPress={onPress} disabled={!onPress}>
      <Text style={[styles.statValue, warn && styles.statWarn]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function Tile({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button">
      <View style={styles.tileIcon}>
        <Icon name={icon} size={24} color={colors.brand} />
      </View>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileSub} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
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
    <Pressable
      style={({ pressed }) => [
        styles.visitCard,
        { flexDirection: FROM_RIGHT },
        card.rank === 0 && styles.visitCardStarted,
        pressed && styles.pressed,
      ]}
      onPress={onPress}>
      <View style={styles.visitBody}>
        <View style={[styles.visitTop, { flexDirection: FROM_RIGHT }]}>
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
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: `${card.units ? (card.done / card.units) * 100 : 0}%` }]} />
            </View>
          </>
        ) : (
          <Text style={styles.visitText}>
            {card.visit.client_name || 'بدون عميل'}
            {date ? ` · ${date}` : ''} · {VISIT_STATE_TEXT[card.unit.state]}
          </Text>
        )}
      </View>
      <Icon name="chevron" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const CARD = {
  backgroundColor: colors.surface,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl * 2 },
  pressed: { opacity: 0.85 },

  topBar: { alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 150, height: 52 },
  roundBtn: {
    ...CARD,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hello: { marginTop: spacing.md, gap: 4 },
  helloTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text, textAlign: 'right' },
  status: { alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right' },

  stats: { gap: spacing.sm, marginTop: spacing.lg },
  stat: { ...CARD, flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: 'center' },
  statValue: { fontSize: fontSize.title, fontWeight: '800', color: colors.text },
  statWarn: { color: colors.brand },
  statLabel: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },

  primary: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: 18,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: colors.brand,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { flex: 1 },
  primaryTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.textLight, textAlign: 'right' },
  primarySub: { fontSize: fontSize.md, color: colors.textLight, opacity: 0.9, textAlign: 'right', marginTop: 2 },

  searchBox: {
    ...CARD,
    marginTop: spacing.md,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: fontSize.md, color: colors.text },

  section: { marginTop: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, textAlign: 'right' },

  notice: {
    marginTop: spacing.md,
    backgroundColor: colors.accentLight,
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.md,
  },
  noticeTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.brandDark, textAlign: 'right' },
  noticeText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },

  visitCard: { ...CARD, padding: spacing.md, alignItems: 'center', gap: spacing.sm },
  visitCardStarted: { borderColor: colors.brand, backgroundColor: colors.accentLight },
  visitBody: { flex: 1 },
  visitTop: { alignItems: 'center', gap: spacing.sm },
  visitName: { flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.text, textAlign: 'right' },
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
  visitLate: { backgroundColor: colors.danger },
  visitText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },
  progress: { height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: colors.success, alignSelf: RIGHT_EDGE },

  grid: { flexWrap: 'wrap', gap: spacing.sm },
  tile: { ...CARD, width: '48.5%', padding: spacing.md, alignItems: RIGHT_EDGE, minHeight: 116 },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  tileTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, textAlign: 'right' },
  tileSub: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },
});
