import { Button } from '@/components/Button';
import { DropdownPicker } from '@/components/DropdownPicker';
import { MAINTENANCE_TYPES } from '@/constants/company';
import { MACHINE_TYPES, getMachineTypeInfo } from '@/constants/machineTypes';
import { colors, fontSize, spacing } from '@/constants/theme';
import { searchMachines } from '@/db/repositories/machines';
import {
  createReport,
  getCustomChecklistTemplates,
} from '@/db/repositories/reports';
import { Machine, MachineType, MaintenanceType } from '@/types';
import { loadGlobalUnits } from '@/utils/units';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function NewReportScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [isNewMachine, setIsNewMachine] = useState(false);
  const [selectedType, setSelectedType] = useState<MachineType | null>(null);
  const [maintenanceType, setMaintenanceType] =
    useState<MaintenanceType>('Preventive');
  const [showMaintenancePicker, setShowMaintenancePicker] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (query.trim().length >= 1) {
      setMachines(searchMachines(query.trim()));
    } else {
      setMachines([]);
    }
  }, [query]);

  const handleCreate = async () => {
    const type = selectedMachine?.type ?? selectedType;
    if (!type) {
      Alert.alert('تنبيه', 'يرجى اختيار نوع المعدة.');
      return;
    }

    if (type === 'custom') {
      const templates = getCustomChecklistTemplates();
      if (templates.length === 0) {
        Alert.alert('تنبيه', 'يرجى تعريف حقول القائمة المخصصة أولاً.', [
          { text: 'إلغاء', style: 'cancel' },
          {
            text: 'تعريف الحقول',
            onPress: () => router.push('/custom-templates'),
          },
        ]);
        return;
      }
    }

    setCreating(true);
    try {
      const globalUnits = await loadGlobalUnits();
      const report = await createReport(type, {
        machineId: selectedMachine?.id,
        maintenanceType,
        tempUnit: globalUnits.tempUnit,
        pressureUnit: globalUnits.pressureUnit,
      });
      router.replace(`/report/${report.id}/1`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>تقرير جديد</Text>
      <Text style={styles.subheading}>الخطوة 1: البحث عن معدة أو إنشاء جديدة</Text>

      <TextInput
        style={styles.search}
        placeholder="بحث بالاسم، الرقم التسلسلي، العميل..."
        placeholderTextColor={colors.textSecondary}
        value={query}
        onDebouncedChange={setQuery}
        textAlign="right"
      />

      {machines.length > 0 && !selectedMachine && !isNewMachine && (
        <FlatList
          data={machines}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable
              style={styles.machineCard}
              onPress={() => {
                setSelectedMachine(item);
                setSelectedType(item.type);
                setQuery('');
                setMachines([]);
              }}>
              <Text style={styles.machineTitle}>
                {item.model || item.serial_number}
              </Text>
              <Text style={styles.machineSub}>
                {item.client_name} — {item.site}
              </Text>
              <Text style={styles.machineType}>
                {getMachineTypeInfo(item.type).labelAr}
              </Text>
            </Pressable>
          )}
        />
      )}

      {!selectedMachine && !isNewMachine && (
        <Button
          title="معدة جديدة (إدخال يدوي)"
          onPress={() => setIsNewMachine(true)}
          variant="secondary"
        />
      )}

      {selectedMachine && (
        <View style={styles.selectedBox}>
          <Text style={styles.selectedTitle}>✓ معدة محددة</Text>
          <Text style={styles.selectedText}>
            {selectedMachine.model} — {selectedMachine.client_name}
          </Text>
          <Pressable onPress={() => setSelectedMachine(null)}>
            <Text style={styles.changeLink}>تغيير</Text>
          </Pressable>
        </View>
      )}

      {isNewMachine && !selectedMachine && (
        <>
          <Text style={styles.sectionTitle}>اختر نوع المعدة</Text>
          {MACHINE_TYPES.map((type) => (
            <Pressable
              key={type.id}
              style={[
                styles.typeCard,
                selectedType === type.id && styles.typeCardSelected,
              ]}
              onPress={() => setSelectedType(type.id)}>
              <Text
                style={[
                  styles.typeLabel,
                  selectedType === type.id && styles.typeLabelSelected,
                ]}>
                {type.labelAr}
              </Text>
              <Text style={styles.typeLabelEn}>{type.labelEn}</Text>
            </Pressable>
          ))}
          {selectedType === 'custom' && (
            <Pressable onPress={() => router.push('/custom-templates')}>
              <Text style={styles.link}>إدارة القوالب المخصصة ←</Text>
            </Pressable>
          )}
        </>
      )}

      {(selectedMachine || (isNewMachine && selectedType)) && (
        <>
          <Text style={styles.sectionTitle}>نوع الصيانة</Text>
          <Pressable
            style={styles.dropdown}
            onPress={() => setShowMaintenancePicker(true)}>
            <Text style={styles.dropdownText}>{maintenanceType}</Text>
          </Pressable>
          <Button
            title="إنشاء التقرير"
            onPress={handleCreate}
            variant="accent"
            loading={creating}
          />
        </>
      )}

      <DropdownPicker
        visible={showMaintenancePicker}
        options={[...MAINTENANCE_TYPES]}
        selected={maintenanceType}
        onSelect={(v) => setMaintenanceType(v as MaintenanceType)}
        onClose={() => setShowMaintenancePicker(false)}
        title="نوع الصيانة"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  heading: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  subheading: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: spacing.lg,
  },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.md,
  },
  machineCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  machineTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  machineSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  machineType: {
    fontSize: fontSize.sm,
    color: colors.accent,
    textAlign: 'right',
    marginTop: 4,
  },
  selectedBox: {
    backgroundColor: colors.accentLight,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  selectedTitle: {
    fontWeight: '700',
    color: colors.accent,
    textAlign: 'right',
  },
  selectedText: { textAlign: 'right', marginTop: 4 },
  changeLink: {
    color: colors.accent,
    textAlign: 'right',
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  typeCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  typeCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  typeLabel: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'right',
  },
  typeLabelSelected: { color: colors.accent },
  typeLabelEn: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'left',
  },
  link: {
    color: colors.accent,
    textAlign: 'right',
    marginBottom: spacing.md,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  dropdownText: { fontSize: fontSize.md, textAlign: 'right' },
});
