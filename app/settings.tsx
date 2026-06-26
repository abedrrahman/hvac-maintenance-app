import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button } from '@/components/Button';
import { UnitsSelector } from '@/components/UnitsSelector';
import { colors, fontSize, spacing } from '@/constants/theme';
import {
  DEFAULT_UNITS,
  loadGlobalUnits,
  saveGlobalUnits,
} from '@/utils/units';
import { GlobalUnits, PressureUnit, TempUnit } from '@/types';

export default function SettingsScreen() {
  const router = useRouter();
  const [units, setUnits] = useState<GlobalUnits>(DEFAULT_UNITS);

  useEffect(() => {
    loadGlobalUnits().then(setUnits);
  }, []);

  const save = async (next: GlobalUnits) => {
    setUnits(next);
    await saveGlobalUnits(next);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>الإعدادات</Text>
      <Text style={styles.sub}>
        وحدات القياس الافتراضية للتقارير الجديدة
      </Text>

      <UnitsSelector
        tempUnit={units.tempUnit}
        pressureUnit={units.pressureUnit}
        onTempChange={(u: TempUnit) =>
          save({ ...units, tempUnit: u })
        }
        onPressureChange={(u: PressureUnit) =>
          save({ ...units, pressureUnit: u })
        }
      />

      <Button title="رجوع" onPress={() => router.back()} variant="secondary" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  heading: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    marginBottom: spacing.xs,
  },
  sub: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: spacing.lg,
  },
});
