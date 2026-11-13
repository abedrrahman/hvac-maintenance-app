import { Stack, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/theme';

export default function ReportLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen
        name="[step]"
        options={{ title: `تقرير ${id?.slice(0, 8) ?? ''}` }}
      />
      <Stack.Screen
        name="view"
        options={{ title: 'عرض التقرير' }}
      />
    </Stack>
  );
}
