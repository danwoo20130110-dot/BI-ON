import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/ui/text';
import { authErrorText } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !busy;

  const login = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // 성공하면 로그인 상태가 바뀌면서 자동으로 메인 화면으로 이동
    if (e) setError(authErrorText(e.message));
  };

  return (
    <ImageBackground
      source={require('../assets/images/bike-background-dark.png')}
      style={s.bg}
      resizeMode="cover"
    >
      <View style={s.dim}>
        <SafeAreaView style={s.container}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior="padding"
          >
            <View style={s.center}>
              <Image source={require('../assets/images/BION.png')} style={s.logo} resizeMode="contain" />
              <Text style={s.title}>달린 만큼 내 땅이 된다</Text>
              <Text style={s.desc}>자전거 타고 동네를 차지해 보세요</Text>
            </View>

            <View style={s.form}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="이메일"
                placeholderTextColor="#8A8A8A"
                style={s.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="비밀번호"
                placeholderTextColor="#8A8A8A"
                style={s.input}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                onSubmitEditing={login}
              />
              {error && <Text style={s.error}>{error}</Text>}

              <Pressable onPress={login} disabled={!canSubmit} style={[s.login, !canSubmit && s.disabled]}>
                {busy ? <ActivityIndicator color="#111" /> : <Text style={s.loginText}>로그인</Text>}
              </Pressable>
              <Link href="/signup" asChild>
                <Pressable style={s.signup}>
                  <Text style={s.signupText}>회원가입</Text>
                </Pressable>
              </Link>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#000',
  },
  dim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 200,
    height: 46,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 24,
  },
  desc: {
    color: '#bbb',
    fontSize: 14,
    marginTop: 6,
  },
  form: {
    gap: 10,
    paddingBottom: 17,
  },
  input: {
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  error: {
    color: '#FF6B6B',
    fontSize: 13,
    textAlign: 'center',
  },
  login: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  disabled: {
    opacity: 0.5,
  },
  loginText: {
    color: '#111',
    fontSize: 17,
    fontWeight: '700',
  },
  signup: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupText: {
    color: '#fff',
    fontSize: 17,
  },
});
