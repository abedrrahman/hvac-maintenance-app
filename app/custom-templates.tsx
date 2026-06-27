import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, fontSize, spacing } from '@/constants/theme';
import {
  deleteCustomChecklistTemplate,
  getCustomChecklistTemplates,
  saveCustomChecklistTemplate,
} from '@/db/repositories/reports';
import { CustomChecklistTemplate } from '@/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function CustomTemplatesScreen() {
  const router = useRouter();
  const [templates, setTemplates] = useState(getCustomChecklistTemplates());
  const [labelEn, setLabelEn] = useState('');
  const [labelAr, setLabelAr] = useState('');

  const refresh = () => setTemplates(getCustomChecklistTemplates());

  const handleAdd = () => {
    if (!labelEn.trim()) {
      Alert.alert('Required', 'English label is required.');
      return;
    }
    saveCustomChecklistTemplate(labelEn.trim(), labelAr.trim() || labelEn.trim());
    setLabelEn('');
    setLabelAr('');
    refresh();
  };

  const handleDelete = (item: CustomChecklistTemplate) => {
    Alert.alert('Delete', `Remove "${item.label_en}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCustomChecklistTemplate(item.id);
          refresh();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.info}>
        Define checklist fields for Custom machine type reports. These templates
        are used when creating new Custom reports.
      </Text>

      <FormField
        labelEn="English Label"
        labelAr="التسمية بالإنجليزية"
        value={labelEn}
        onDebouncedChange={setLabelEn}
        placeholder="e.g. Motor Amps"
      />
      <FormField
        labelEn="Arabic Label"
        labelAr="التسمية بالعربية"
        value={labelAr}
        onDebouncedChange={setLabelAr}
        placeholder="e.g. أمبير المotor"
      />
      <Button title="Add Field" onPress={handleAdd} variant="accent" />

      <FlatList
        data={templates}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListHeaderComponent={
          <Text style={styles.listTitle}>Saved Templates ({templates.length})</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.templateRow}>
            <View style={styles.templateText}>
              <Text style={styles.templateEn}>{item.label_en}</Text>
              <Text style={styles.templateAr}>{item.label_ar}</Text>
            </View>
            <Button
              title="Delete"
              onPress={() => handleDelete(item)}
              variant="danger"
            />
          </View>
        )}
      />

      <Button title="Done" onPress={() => router.back()} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  info: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  list: {
    flex: 1,
    marginVertical: spacing.md,
  },
  listTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  templateText: {
    flex: 1,
  },
  templateEn: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  templateAr: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
  },
});
