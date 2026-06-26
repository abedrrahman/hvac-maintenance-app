import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fontSize, spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  title?: string;
}

export function DropdownPicker({
  visible,
  options,
  selected,
  onSelect,
  onClose,
  title = 'Select',
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView>
            {options.map((opt) => (
              <Pressable
                key={opt}
                style={[styles.option, selected === opt && styles.selected]}
                onPress={() => {
                  onSelect(opt);
                  onClose();
                }}>
                <Text
                  style={[
                    styles.optionText,
                    selected === opt && styles.selectedText,
                  ]}>
                  {opt}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '50%',
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    color: colors.text,
  },
  option: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  selected: {
    backgroundColor: colors.accentLight,
  },
  optionText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  selectedText: {
    color: colors.accent,
    fontWeight: '600',
  },
});
