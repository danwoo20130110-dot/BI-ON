import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import 'react-native-reanimated';

import { PRETENDARD_FONTS } from '@/components/ui/text';
import '@/lib/background-location';
import { useAuth } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: 'login',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  // 글꼴을 못 불러와도(오류) 기본 글꼴로 앱은 열리게
  const [fontsLoaded, fontError] = useFonts(PRETENDARD_FONTS);

  // 저장된 로그인 정보·글꼴을 읽는 동안은 빈 화면 (로그인 화면이 깜빡이지 않게)
  if (loading || (!fontsLoaded && !fontError)) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" options={{ headerShown: false, title: 'Login' }} />
          <Stack.Screen name="signup" options={{ headerShown: false, title: '회원가입' }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="ride-summary" options={{ headerShown: false, title: '라이딩 통계' }} />
          <Stack.Screen name="profile-settings" options={{ headerShown: false, title: '프로필 설정' }} />
          <Stack.Screen name="rides" options={{ headerShown: false, title: '전체 라이딩 기록' }} />
          <Stack.Screen name="ride/[id]" options={{ headerShown: false, title: '라이딩 기록' }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack.Protected>
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
