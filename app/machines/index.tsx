import { Button } from '@/components/Button';
import { getMachineTypeInfo } from '@/constants/machineTypes';
import { colors, fontSize, spacing } from '@/constants/theme';
import {
  ClientSummary,
  CountrySummary,
  findMachines,
  getClientSummaries,
  getCountrySummaries,
} from '@/db/repositories/machines';
import {
  countDocuments,
  describeResult,
  downloadDocuments,
} from '@/services/offlineDocs';
import { Machine } from '@/types';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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

const SEARCH_LIMIT = 50;

/** Route value for units the website gave no country: an empty route parameter does not survive navigation. */
const NO_COUNTRY = '-';

/**
 * Equipment list in three steps, like the website: countries, then one country's clients, then one client's units.
 * With a single country (or none sent yet) the list opens on the clients.
 * A search looks through the units directly. The full list is never drawn at once.
 */
export default function MachinesListScreen() {
  const router = useRouter();
  const { client, country } = useLocalSearchParams<{ client?: string; country?: string }>();
  const inClient = client !== undefined;
  const [countries, setCountries] = useState<CountrySummary[]>([]);
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [docs, setDocs] = useState({ total: 0, saved: 0 });
  const [progress, setProgress] = useState('');
  const term = search.trim();
  const showUnits = inClient || term.length > 0;

  const load = useCallback(() => {
    if (inClient) {
      const units = findMachines({ client, search: term });
      setMachines(units);
      if (!term) setDocs(countDocuments(units));
    } else if (term) {
      setMachines(findMachines({ search: term, limit: SEARCH_LIMIT }));
    } else if (country !== undefined) {
      setClients(getClientSummaries(country === NO_COUNTRY ? '' : country));
    } else {
      const all = getCountrySummaries();
      setCountries(all.length > 1 ? all : []);
      if (all.length <= 1) setClients(getClientSummaries());
    }
  }, [client, country, inClient, term]);

  const showCountries = !showUnits && country === undefined && countries.length > 0;
  const countryLabel = country === NO_COUNTRY ? 'بدون دولة' : country;
  // The path so far, as on the website: Countries > Jordan > Client
  const crumbs = [
    country !== undefined ? 'الدول' : '',
    countryLabel ?? '',
    inClient ? client || 'بدون عميل' : '',
  ].filter(Boolean);

  useFocusEffect(load);

  const handleDownload = async () => {
    setProgress('...');
    try {
      const units = findMachines({ client });
      const result = await downloadDocuments(units, (done, total) => setProgress(`${done} / ${total}`));
      setDocs(countDocuments(units));
      const words = describeResult(result);
      Alert.alert(words.title, words.message);
    } finally {
      setProgress('');
    }
  };

  const header =
    !inClient || term ? null : docs.total === 0 ? (
      <Text style={styles.note}>لا توجد مستندات لمعدات هذا العميل على الموقع.</Text>
    ) : (
      <View style={styles.offline}>
        <Text style={styles.note}>
          المستندات المحفوظة على الهاتف: {docs.saved} من {docs.total}
          {progress ? ` — جاري التنزيل ${progress}` : ''}
        </Text>
        {docs.saved < docs.total ? (
          <Button
            title="تنزيل مستندات هذا العميل للعمل بدون إنترنت"
            onPress={handleDownload}
            variant="accent"
            loading={!!progress}
          />
        ) : null}
      </View>
    );

  return (
    <View style={styles.container}>
      {inClient ? (
        <Stack.Screen options={{ title: client || 'بدون عميل' }} />
      ) : country !== undefined ? (
        <Stack.Screen options={{ title: countryLabel }} />
      ) : null}
      <TextInput
        style={styles.search}
        placeholder={inClient ? 'بحث في معدات هذا العميل...' : 'بحث بالعميل، الموديل، الرقم التسلسلي...'}
        placeholderTextColor={colors.textSecondary}
        value={search}
        onChangeText={setSearch}
        textAlign="right"
      />
      {crumbs.length > 1 ? <Text style={styles.crumbs}>{crumbs.join('  ›  ')}</Text> : null}
      {showCountries ? (
        <FlatList
          data={countries}
          keyExtractor={(item) => item.country}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/machines', params: { country: item.country || NO_COUNTRY } } as never)
              }>
              <Text style={styles.model}>{item.country || 'بدون دولة'}</Text>
              <Text style={styles.type}>
                العملاء: {item.clients} · المعدات: {item.units}
              </Text>
            </Pressable>
          )}
        />
      ) : showUnits ? (
        <FlatList
          data={machines}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          ListEmptyComponent={<Text style={styles.empty}>لا توجد معدات مطابقة.</Text>}
          ListFooterComponent={
            !inClient && machines.length === SEARCH_LIMIT ? (
              <Text style={styles.empty}>تظهر أول {SEARCH_LIMIT} نتيجة. اكتب أكثر لتضييق البحث.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/machines/${item.id}` as never)}>
              <Text style={styles.model}>
                {item.name || item.model || item.serial_number || 'معدة بدون اسم'}
              </Text>
              <Text style={styles.type}>{getMachineTypeInfo(item.type).labelAr}</Text>
              {inClient ? null : <Text style={styles.client}>{item.client_name}</Text>}
              {item.location ? <Text style={styles.site}>{item.location}</Text> : null}
              {item.serial_number ? (
                <Text style={styles.serial}>S/N: {item.serial_number}</Text>
              ) : null}
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(item) => item.client_name}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>لا توجد معدات محفوظة.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: '/machines',
                  params: country === undefined ? { client: item.client_name } : { client: item.client_name, country },
                } as never)
              }>
              <Text style={styles.model}>{item.client_name || 'بدون عميل'}</Text>
              {item.site && item.site !== item.client_name ? (
                <Text style={styles.site}>{item.site}</Text>
              ) : null}
              <Text style={styles.type}>عدد المعدات: {item.units}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: {
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  list: { padding: spacing.md, paddingTop: 0 },
  crumbs: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
  offline: { marginBottom: spacing.md, gap: spacing.sm },
  note: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  model: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'right',
  },
  type: {
    fontSize: fontSize.sm,
    color: colors.accent,
    textAlign: 'right',
    marginTop: 2,
  },
  client: {
    fontSize: fontSize.md,
    color: colors.text,
    textAlign: 'right',
    marginTop: spacing.sm,
  },
  site: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  serial: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
});
