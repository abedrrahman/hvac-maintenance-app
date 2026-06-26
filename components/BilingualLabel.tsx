import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from '@/constants/theme';

interface Props {
  labelEn: string;
  labelAr: string;
}

export function BilingualLabel({ labelEn, labelAr }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.en}>{labelEn}</Text>
      <Text style={styles.ar}>{labelAr}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  en: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  ar: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
