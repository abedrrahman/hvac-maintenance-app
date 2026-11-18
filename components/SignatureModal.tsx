import { colors, fontSize, spacing } from '@/constants/theme';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FormField } from './FormField';
import { SignatureBlock } from './SignatureBlock';

interface Props {
  /** Whose signature is being taken; null keeps the box closed. */
  type: 'technician' | 'client' | null;
  defaultName: string;
  onSave: (signature: string, name: string) => void;
  onClose: () => void;
}

/** The box to sign in, with the signer's name. Used by one report and by a whole contract visit. */
export function SignatureModal({ type, defaultName, onSave, onClose }: Props) {
  const sigRef = useRef<any>(null);
  const [name, setName] = useState(defaultName);
  useEffect(() => setName(defaultName), [type, defaultName]);

  return (
    <Modal visible={type !== null} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {type === 'technician' ? 'توقيع الفني / Technician' : 'توقيع العميل / Customer'}
          </Text>
          <FormField
            labelEn="Name" labelAr="الاسم"
            value={name}
            // at once, not after the 2-second pause: Save may be pressed right after typing
            onChangeText={setName}
            placeholder={type === 'client' ? 'مثال: Eng. Osama Alwaidh' : ''}
          />
          <View style={{ height: 260, width: '100%' }}>
            <SignatureBlock
              ref={sigRef}
              label=""
              onEmpty={() => Alert.alert('تنبيه', 'ارسم التوقيع داخل المربع أولاً.')}
              onSave={(sig) => onSave(sig, name)}
            />
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>إلغاء / Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.save}
              // the box closes when the signature arrives (onSave); closing on a timer lost slow ones
              onPress={() => sigRef.current?.readSignature()}>
              <Text style={styles.saveText}>حفظ / Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: spacing.md },
  card: { backgroundColor: colors.background, borderRadius: 20, padding: spacing.lg, gap: spacing.md, marginBottom: 20 },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  cancel: { flex: 1, paddingVertical: spacing.sm, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: fontSize.sm },
  save: { flex: 2, paddingVertical: spacing.sm, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: fontSize.sm },
});
