import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DropdownPicker } from './DropdownPicker';
import { colors, fontSize, spacing } from '@/constants/theme';
import {
  PRESSURE_UNIT_LABELS,
  PRESSURE_UNITS,
  TEMP_UNIT_LABELS,
  TEMP_UNITS,
  tempUnitLabel,
} from '@/utils/units';
import { PressureUnit, TempUnit } from '@/types';

interface Props {
  tempUnit: TempUnit;
  pressureUnit: PressureUnit;
  onTempChange: (unit: TempUnit) => void;
  onPressureChange: (unit: PressureUnit) => void;
  readOnly?: boolean;
  compact?: boolean;
}

export function UnitsSelector({
  tempUnit,
  pressureUnit,
  onTempChange,
  onPressureChange,
  readOnly,
  compact,
}: Props) {
  const [showTemp, setShowTemp] = useState(false);
  const [showPressure, setShowPressure] = useState(false);

  return (
    <View style={[styles.container, compact && styles.compact]}>
      <Text style={styles.title}>وحدات القياس | Units</Text>
      <View style={styles.row}>
        <Pressable
          style={styles.chip}
          onPress={() => !readOnly && setShowTemp(true)}
          disabled={readOnly}>
          <Text style={styles.chipLabel}>الحرارة</Text>
          <Text style={styles.chipValue}>{tempUnitLabel(tempUnit)}</Text>
        </Pressable>
        <Pressable
          style={styles.chip}
          onPress={() => !readOnly && setShowPressure(true)}
          disabled={readOnly}>
          <Text style={styles.chipLabel}>الضغط</Text>
          <Text style={styles.chipValue}>{pressureUnit}</Text>
        </Pressable>
      </View>

      <DropdownPicker
        visible={showTemp}
        options={TEMP_UNITS.map((u) => TEMP_UNIT_LABELS[u])}
        selected={TEMP_UNIT_LABELS[tempUnit]}
        onSelect={(label) => {
          const unit = TEMP_UNITS.find((u) => TEMP_UNIT_LABELS[u] === label);
          if (unit) onTempChange(unit);
        }}
        onClose={() => setShowTemp(false)}
        title="Temperature Unit"
      />
      <DropdownPicker
        visible={showPressure}
        options={PRESSURE_UNITS.map((u) => PRESSURE_UNIT_LABELS[u])}
        selected={PRESSURE_UNIT_LABELS[pressureUnit]}
        onSelect={(label) => {
          const unit = PRESSURE_UNITS.find(
            (u) => PRESSURE_UNIT_LABELS[u] === label,
          );
          if (unit) onPressureChange(unit);
        }}
        onClose={() => setShowPressure(false)}
        title="Pressure Unit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compact: {
    padding: spacing.sm,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    backgroundColor: colors.accentLight,
    borderRadius: 8,
    padding: spacing.sm,
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  chipValue: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 2,
  },
});
