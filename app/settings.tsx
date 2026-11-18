import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { UnitsSelector } from '@/components/UnitsSelector';
import { colors, fontSize, spacing } from '@/constants/theme';
import { getReportsToUpload } from '@/db/repositories/reports';
import {
  WebLink,
  loadWebLink,
  setAutoUpload,
  signIn,
  signOut,
  syncNow,
} from '@/services/webSync';
import {
  DEFAULT_UNITS,
  loadGlobalUnits,
  saveGlobalUnits,
} from '@/utils/units';
import { GlobalUnits, PressureUnit, TempUnit } from '@/types';
import { formatDisplayDate } from '@/utils/helpers';

export default function SettingsScreen() {
  const router = useRouter();
  const [units, setUnits] = useState<GlobalUnits>(DEFAULT_UNITS);
  const [link, setLink] = useState<WebLink | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLink(await loadWebLink());
    setWaiting(getReportsToUpload().length);
  }, []);

  useEffect(() => {
    loadGlobalUnits().then(setUnits);
    refresh();
  }, [refresh]);

  const save = async (next: GlobalUnits) => {
    setUnits(next);
    await saveGlobalUnits(next);
  };

  const handleSignIn = async () => {
    if (!address.trim() || !username.trim() || !password) {
      Alert.alert('تنبيه', 'أدخل عنوان الموقع واسم المستخدم وكلمة المرور.');
      return;
    }
    setBusy(true);
    try {
      await signIn(address, username, password);
      setPassword('');
      const result = await syncNow({ download: true });
      await refresh();
      Alert.alert(
        result.ok ? 'تم الربط' : 'تم تسجيل الدخول',
        result.ok ? 'تم تنزيل بيانات المواقع والمعدات.' : `تعذر تنزيل البيانات: ${result.message}`,
      );
    } catch (error) {
      Alert.alert('تعذر تسجيل الدخول', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      const result = await syncNow({ download: true, manual: true });
      await refresh();
      Alert.alert(
        result.ok ? 'تمت المزامنة' : 'لم تكتمل المزامنة',
        result.ok
          ? `تم رفع ${result.uploaded} تقرير وتحديث بيانات المعدات.`
          : result.message === 'offline'
            ? 'لا يوجد اتصال بالموقع. ستتم المحاولة تلقائياً لاحقاً.'
            : result.message,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('فصل الربط', 'التقارير غير المرفوعة ستبقى على الهاتف. متابعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'فصل',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          await refresh();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>الإعدادات</Text>

      <Text style={styles.section}>الربط مع موقع ASEE</Text>
      {link ? (
        <View style={styles.box}>
          <Text style={styles.line}>✓ متصل باسم: {link.userName}</Text>
          <Text style={styles.small}>{link.baseUrl}</Text>
          <Text style={styles.line}>
            المعدات المنزّلة: {link.machineCount}
            {link.lastSync ? ` — آخر مزامنة: ${formatDisplayDate(link.lastSync.slice(0, 10))}` : ''}
          </Text>
          <Text style={[styles.line, waiting > 0 && styles.waiting]}>
            تقارير بانتظار الرفع: {waiting}
          </Text>
          <View style={styles.switchRow}>
            <Switch
              value={link.autoUpload !== false}
              onValueChange={async (on) => {
                await setAutoUpload(on);
                await refresh();
              }}
              trackColor={{ true: colors.brand, false: colors.border }}
            />
            <View style={styles.switchText}>
              <Text style={styles.line}>رفع التقارير تلقائياً</Text>
              <Text style={styles.small}>
                عند التشغيل يُرفع كل تقرير مقفل إلى الموقع فور توفر الإنترنت. عند الإيقاف يُرفع فقط عند الضغط على «مزامنة الآن».
              </Text>
            </View>
          </View>
          <Button title="مزامنة الآن" onPress={handleSync} variant="accent" loading={busy} />
          <Button title="فصل الربط" onPress={handleSignOut} variant="secondary" />
        </View>
      ) : (
        <View style={styles.box}>
          <Text style={styles.small}>
            سجّل الدخول بحساب الموقع لتنزيل العملاء والمعدات وروابط المستندات، ورفع التقارير تلقائياً عند توفر الإنترنت.
          </Text>
          <FormField
            labelEn="Website address" labelAr="عنوان الموقع"
            value={address} onChangeText={setAddress}
            placeholder="https://hvac.example.com" autoCapitalize="none" autoCorrect={false} keyboardType="url"
          />
          <FormField
            labelEn="Username" labelAr="اسم المستخدم"
            value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
          />
          <FormField
            labelEn="Password" labelAr="كلمة المرور"
            value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"
          />
          <Button title="تسجيل الدخول والمزامنة" onPress={handleSignIn} variant="accent" loading={busy} />
        </View>
      )}

      <Text style={styles.section}>وحدات القياس الافتراضية للتقارير الجديدة</Text>
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
    marginBottom: spacing.md,
  },
  section: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  box: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  line: { fontSize: fontSize.md, color: colors.text, textAlign: 'right' },
  small: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right' },
  waiting: { color: colors.accent, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchText: { flex: 1 },
});
