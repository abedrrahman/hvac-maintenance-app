import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { getFieldDefinitions } from '@/constants/checklists';
import { colors, fontSize, spacing } from '@/constants/theme';
import {
  ChecklistItem,
  MachineType,
  PressureUnit,
  TempUnit,
} from '@/types';
import { visibleChecklistItems } from '@/utils/chillerFields';
import { pressureUnitLabel, tempUnitLabel } from '@/utils/units';
import { FormField } from './FormField';
import { DropdownPicker } from './DropdownPicker';
import { BilingualLabel } from './BilingualLabel';

interface Props {
  items: ChecklistItem[];
  machineType: MachineType;
  tempUnit: TempUnit;
  pressureUnit: PressureUnit;
  readOnly?: boolean;
  onUpdate: (id: string, value: string) => void;
  /** Given on an open report: holding a row offers to remove it from this report. */
  onDelete?: (id: string) => void;
}

// The phase and the counts decide which rows exist: removing one of them would leave the rest without a meaning.
const FIXED_KEYS = ['unit_phase', 'compressor_count', 'circuit_count', 'supply_fan_count', 'extract_fan_count', 'return_fan_count'];

function sectionTitle(section: string): string | null {
  const comp = section.match(/^compressor_(\d+)$/);
  if (comp) return `── Compressor ${comp[1]} ──`;
  const circ = section.match(/^circuit_(\d+)$/);
  if (circ) return `── Circuit ${circ[1]} ──`;
  return null;
}

export function ChecklistSection({
  items,
  machineType,
  tempUnit,
  pressureUnit,
  readOnly,
  onUpdate,
  onDelete,
}: Props) {
  const askDelete = (item: ChecklistItem) => {
    if (readOnly || !onDelete || FIXED_KEYS.includes(item.field_key ?? '')) return;
    Alert.alert('حذف الصف', `حذف "${item.label_ar || item.label_en}" من هذا التقرير ومن التقارير القادمة لهذه المعدة؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => onDelete(item.id) },
    ]);
  };

  const [pickerItem, setPickerItem] = useState<{
    id: string;
    options: string[];
  } | null>(null);

  const visibleItems = useMemo(() => visibleChecklistItems(machineType, items), [items, machineType]);
  const defs = useMemo(() => getFieldDefinitions(machineType), [machineType]);

  let lastSection = '';

  return (
    <View>
      <Text style={styles.title}>Maintenance Checklist:</Text>
      {!readOnly && onDelete ? (
        <Text style={styles.hint}>اضغط مطولاً على اسم أي صف لحذفه من هذا التقرير ومن التقارير القادمة لهذه المعدة.</Text>
      ) : null}
      {visibleItems.map((item) => {
        const def = defs.find((d) => d.key === item.field_key);
        const sec = def?.section ?? '';
        const showHeader = sec && sec !== lastSection;
        if (showHeader) lastSection = sec;
        const header = showHeader ? sectionTitle(sec) : null;

        const isDropdown =
          def?.type === 'dropdown' ||
          def?.type === 'count' ||
          (def?.options && def.options.length > 0);

        const unitSuffix =
          def?.type === 'temperature'
            ? tempUnitLabel(tempUnit)
            : def?.type === 'pressure'
              ? pressureUnitLabel(pressureUnit)
              : def?.unit ?? '';

        return (
          <Pressable key={item.id} onLongPress={() => askDelete(item)} delayLongPress={600}>
            {header && <Text style={styles.sectionHeader}>{header}</Text>}
            {isDropdown ? (
              <View style={styles.row}>
                <BilingualLabel
                  labelEn={item.label_en}
                  labelAr={item.label_ar}
                />
                <Pressable
                  style={[styles.dropdown, readOnly && styles.readOnly]}
                  onPress={() =>
                    !readOnly &&
                    setPickerItem({
                      id: item.id,
                      options: def?.options ?? ['1', '2', '3', '4'],
                    })
                  }
                  onLongPress={() => askDelete(item)}
                  delayLongPress={600}
                  disabled={readOnly}>
                  <Text
                    style={[
                      styles.dropdownText,
                      !item.value && styles.placeholder,
                    ]}>
                    {item.value || 'Select...'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <FormField
                labelEn={item.label_en}
                labelAr={item.label_ar}
                value={item.value}
                // saved after a short pause (and on leaving the field), not on every letter: each save reloads the whole report
                onDebouncedChange={(text) => onUpdate(item.id, text)}
                debounceMs={600}
                placeholder={
                  unitSuffix ? `___ ${unitSuffix}` : def?.placeholder ?? ''
                }
                readOnly={readOnly}
                highlight={!!item.value}
                keyboardType={
                  def?.type === 'number' ||
                  def?.type === 'temperature' ||
                  def?.type === 'pressure'
                    ? 'decimal-pad'
                    : 'default'
                }
              />
            )}
          </Pressable>
        );
      })}

      <DropdownPicker
        visible={!!pickerItem}
        options={pickerItem?.options ?? []}
        selected={
          items.find((i) => i.id === pickerItem?.id)?.value ?? ''
        }
        onSelect={(val) => {
          if (pickerItem) onUpdate(pickerItem.id, val);
        }}
        onClose={() => setPickerItem(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: spacing.md,
  },
  sectionHeader: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.accent,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  row: {
    marginBottom: spacing.md,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  readOnly: {
    backgroundColor: '#F3F4F6',
  },
  dropdownText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  placeholder: {
    color: colors.textSecondary,
  },
});
