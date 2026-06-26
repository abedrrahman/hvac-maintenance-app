import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { DatabaseProvider } from '@/context/DatabaseProvider';
import { colors } from '@/constants/theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <DatabaseProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.textLight,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="reports" options={{ title: 'التقارير السابقة' }} />
        <Stack.Screen name="new" options={{ title: 'تقرير جديد' }} />
        <Stack.Screen
          name="machines/index"
          options={{ title: 'المعدات المحفوظة' }}
        />
        <Stack.Screen name="machines/[id]" options={{ title: 'تفاصيل المعدة' }} />
        <Stack.Screen name="settings" options={{ title: 'الإعدادات' }} />
        <Stack.Screen
          name="custom-templates"
          options={{ title: 'قوالب القائمة المخصصة' }}
        />
        <Stack.Screen name="report/[id]" options={{ headerShown: false }} />
      </Stack>
    </DatabaseProvider>
  );
}
