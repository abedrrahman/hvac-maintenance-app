import { spacing } from '@/constants/theme';
import { Image, StyleSheet, View } from 'react-native';

export function AseeLogo({ large = false }: { large?: boolean }) {
  return (
    <View style={[styles.container, large && styles.large]}>
      <Image
        source={require('@/assets/images/main_screen_icon.png')}
        style={[styles.logo, large && styles.logoLarge]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: {
    gap: spacing.sm,
  },
  logo: {
  width: '100%',
  aspectRatio: 3,
  },
  logoLarge: {
    width: 200,
    height: 80,
  },
});