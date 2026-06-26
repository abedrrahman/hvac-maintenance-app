import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getChecklistTemplate } from '@/constants/checklists';
import { colors, fontSize, spacing } from '@/constants/theme';
import {
  ChecklistItem,
  MachineType,
  PressureUnit,
  TempUnit,
} from '@/types';
import { buildChillerChecklist, getVisibleCompressorFields } from '@/utils/chillerFields';
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
}

function getFieldMeta(machineType: MachineType, fieldKey: string | null) {
  if (!fieldKey) return undefined;
  let def = getChecklistTemplate(machineType).find((f) => f.key === fieldKey);
  if (!def && machineType === 'chiller') {
    def = buildChillerChecklist(4, 4).find((f) => f.key === fieldKey);
  }
  return def;
}

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
}: Props) {
  const [pickerItem, setPickerItem] = useState<{
    id: string;
    options: string[];
  } | null>(null);

  const valueMap = useMemo(() => {
    const map: Record<string, string> = {};
    items.forEach((i) => {
      if (i.field_key) map[i.field_key] = i.value;
    });
    return map;
  }, [items]);

  const visibleItems = useMemo(() => {
    if (machineType !== 'chiller') return items;

    const compressorCount = parseInt(valueMap.compressor_count || '1', 10) || 1;
    const visibleKeys = new Set<string>();

    items.forEach((item) => {
      if (!item.field_key) {
        visibleKeys.add(item.id);
        return;
      }
      const key = item.field_key;
      if (
        key === 'compressor_count' ||
        key === 'circuit_count' ||
        key === 'refrigerant_type' ||
        key === 'phase_rotation' ||
        key.startsWith('evap_') ||
        key.startsWith('cond_') ||
        key === 'oil_pressure' ||
        key === 'electrical_panel'
      ) {
        visibleKeys.add(item.id);
        return;
      }

      const compMatch = key.match(/^compressor_(\d+)_/);
      if (compMatch) {
        const idx = parseInt(compMatch[1], 10);
        if (idx > compressorCount) return;
        const vt = valueMap[`compressor_${idx}_voltage_type`] ?? '';
        const allowed = getVisibleCompressorFields(idx - 1, vt);
        if (allowed.includes(key)) visibleKeys.add(item.id);
        return;
      }

      const circMatch = key.match(/^circuit_(\d+)_/);
      if (circMatch) {
        const idx = parseInt(circMatch[1], 10);
        const circuitCount = parseInt(valueMap.circuit_count || '1', 10) || 1;
        if (idx <= circuitCount) visibleKeys.add(item.id);
        return;
      }

      visibleKeys.add(item.id);
    });

    return items.filter((i) => visibleKeys.has(i.id));
  }, [items, machineType, valueMap]);

  let lastSection = '';

  return (
    <View>
      <Text style={styles.title}>Maintenance Checklist:</Text>
      {visibleItems.map((item) => {
        const def = getFieldMeta(machineType, item.field_key);
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
          <View key={item.id}>
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
                onChangeText={(text) => onUpdate(item.id, text)}
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
          </View>
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
