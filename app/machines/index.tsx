import { getMachineTypeInfo } from '@/constants/machineTypes';
import { colors, fontSize, spacing } from '@/constants/theme';
import { getAllMachines } from '@/db/repositories/machines';
import { Machine } from '@/types';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function MachinesListScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [machines, setMachines] = useState<Machine[]>([]);

  const load = useCallback(() => {
    setMachines(getAllMachines({ search }));
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="بحث بالعميل، الموديل، الرقم التسلسلي..."
        placeholderTextColor={colors.textSecondary}
        value={search}
        onChangeText={setSearch}
        textAlign="right"
      />
      <FlatList
        data={machines}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>لا توجد معدات محفوظة.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/machines/${item.id}` as never)}>
            <Text style={styles.model}>
              {item.name || item.model || item.serial_number || 'معدة بدون اسم'}
            </Text>
            <Text style={styles.type}>
              {getMachineTypeInfo(item.type).labelAr}
            </Text>
            <Text style={styles.client}>{item.client_name}</Text>
            <Text style={styles.site}>{item.site}</Text>
            {item.serial_number ? (
              <Text style={styles.serial}>S/N: {item.serial_number}</Text>
            ) : null}
          </Pressable>
        )}
      />
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
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
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
