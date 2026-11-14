import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import 'react-native-reanimated';
import { DatabaseProvider } from '@/context/DatabaseProvider';
import { colors } from '@/constants/theme';
import { syncNow } from '@/services/webSync';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const SYNC_EVERY_MS = 60000;
const CHECK_SITES_EVERY_TICKS = 15;

/** Sends waiting reports to the website whenever a connection is there: at start, each minute, and when the app is reopened. */
function AutoSync() {
  useEffect(() => {
    let ticks = 0;
    const upload = () => {
      ticks += 1;
      // Every 15 minutes also ask the website whether sites or units were added.
      syncNow({ download: ticks % CHECK_SITES_EVERY_TICKS === 0 }).catch(() => {});
    };
    syncNow({ download: true }).catch(() => {});
    const timer = setInterval(upload, SYNC_EVERY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNow({ download: true }).catch(() => {});
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <DatabaseProvider>
      <AutoSync />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.brand },
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
        <Stack.Screen name="alarms" options={{ title: 'البحث عن الإنذارات' }} />
        <Stack.Screen
          name="custom-templates"
          options={{ title: 'قوالب القائمة المخصصة' }}
        />
        <Stack.Screen name="report/[id]" options={{ headerShown: false }} />
      </Stack>
    </DatabaseProvider>
  );
}
