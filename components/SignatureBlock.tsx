import React, { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import { colors, fontSize, spacing } from '@/constants/theme';

interface Props {
  label: string;
  onSave: (base64: string) => void;
  readOnly?: boolean;
  existingSignature?: string;
}

export function SignatureBlock({
  label,
  onSave,
  readOnly,
  existingSignature,
}: Props) {
  const ref = useRef<any>(null);

  const handleEnd = () => {
    ref.current?.readSignature();
  };

  const handleOK = (signature: string) => {
    if (signature) {
      onSave(signature);
    }
  };

  if (readOnly && existingSignature) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.readOnlyBox}>
          <Text style={styles.signedText}>✓ Signed</Text>
        </View>
      </View>
    );
  }

  if (readOnly) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.canvas, styles.readOnlyBox]}>
          <Text style={styles.placeholder}>No signature</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.canvas}>
        <SignatureCanvas
          ref={ref}
          onEnd={handleEnd}
          onOK={handleOK}
          onEmpty={() => {}}
          descriptionText=""
          clearText="Clear"
          confirmText="Save"
          webStyle={`.m-signature-pad { box-shadow: none; border: none; }
            .m-signature-pad--body { border: none; }
            .m-signature-pad--footer { display: none; }`}
          autoClear={false}
          backgroundColor="#FFFFFF"
          penColor="#1A2332"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  canvas: {
    height: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  readOnlyBox: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  signedText: {
    color: colors.success,
    fontWeight: '600',
    fontSize: fontSize.md,
  },
  placeholder: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
});
