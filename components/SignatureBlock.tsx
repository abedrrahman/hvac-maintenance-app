import { colors, fontSize, spacing } from '@/constants/theme';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';

interface Props {
  label?: string;
  onSave: (base64: string) => void;
  readOnly?: boolean;
  existingSignature?: string;
}

export const SignatureBlock = forwardRef<any, Props>(
  ({ label, onSave, readOnly, existingSignature }, ref) => {
    const canvasRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      readSignature: () => canvasRef.current?.readSignature(),
      clearSignature: () => canvasRef.current?.clearSignature(),
    }));

    const handleOK = (signature: string) => {
      if (signature) {
        onSave(signature);
      }
    };

    if (readOnly && existingSignature) {
      return (
        <View style={styles.container}>
          {!!label && <Text style={styles.label}>{label}</Text>}
          <View style={styles.readOnlyBox}>
            <Text style={styles.signedText}>✓ Signed</Text>
          </View>
        </View>
      );
    }

    if (readOnly) {
      return (
        <View style={styles.container}>
          {!!label && <Text style={styles.label}>{label}</Text>}
          <View style={[styles.canvas, styles.readOnlyBox]}>
            <Text style={styles.placeholder}>No signature</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        {!!label && <Text style={styles.label}>{label}</Text>}
        <View style={styles.canvas}>
          <SignatureCanvas
            ref={canvasRef}
            onOK={handleOK}
            onEmpty={() => {}}
            descriptionText=""
            clearText=""
            confirmText=""
            webStyle={`
              * { box-sizing: border-box; }
              body, html { margin: 0; padding: 0; height: 100%; }
              .m-signature-pad {
                box-shadow: none;
                border: none;
                margin: 0;
                width: 100%;
                height: 100%;
              }
              .m-signature-pad--body {
                border: none;
                width: 100%;
                height: 100%;
              }
              .m-signature-pad--footer {
                display: none;
              }
            `}
            autoClear={false}
            backgroundColor="#FFFFFF"
            penColor="#1A2332"
            minWidth={2}
            maxWidth={4}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => canvasRef.current?.clearSignature()}
          >
            <Text style={styles.clearText}>مسح / Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  canvas: {
    height: 200,
    minHeight: 200,
    width: '100%',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
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
  actions: {
    flexDirection: 'row',
  },
  clearBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  clearText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
});