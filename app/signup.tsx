import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/ui/text';
import { SchoolPicker } from '@/components/school-picker';
import { GRADES, type School } from '@/constants/schools';
import { authErrorText } from '@/hooks/use-auth';
import { isNicknameAvailable } from '@/hooks/use-profile';
import { supabase } from '@/lib/supabase';

const ORANGE = '#FFA51F';
const NICKNAME_MIN = 2;
const NICKNAME_MAX = 12;
const PASSWORD_MIN = 6;
const STEPS = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const [step, setStep] = useState(1);
  const [school, setSchool] = useState<School | null>(null);
  const [grade, setGrade] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 이메일 인증이 켜져 있어 바로 로그인되지 않은 경우
  const [checkMail, setCheckMail] = useState(false);

  const grades = GRADES[school?.level ?? '고등학교'];
  const nick = nickname.trim();
  const nickError =
    nick.length > 0 && nick.length < NICKNAME_MIN ? `닉네임은 ${NICKNAME_MIN}자 이상이에요` : null;
  const canNext = !!school && !!grade && nick.length >= NICKNAME_MIN && !saving;
  const emailOk = EMAIL_RE.test(email.trim());
  const pwError =
    password.length > 0 && password.length < PASSWORD_MIN
      ? `비밀번호는 ${PASSWORD_MIN}자 이상이에요`
      : password2.length > 0 && password !== password2
        ? '비밀번호가 서로 달라요'
        : null;
  const canSubmit = emailOk && password.length >= PASSWORD_MIN && password === password2 && !saving;

  const back = () => {
    setError(null);
    if (step === 1 || checkMail) router.back();
    else setStep(step - 1);
  };

  const next = async () => {
    if (!canNext) return;
    setSaving(true);
    setError(null);
    const ok = await isNicknameAvailable(nick);
    setSaving(false);
    if (!ok) setError('이미 사용 중인 닉네임이에요');
    else setStep(3);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const { data, error: e } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { nickname: nick, school_id: school?.id ?? null, grade } },
    });
    setSaving(false);
    if (e) {
      setError(e.message.includes('Database error') ? '이미 사용 중인 닉네임이에요' : authErrorText(e.message));
      return;
    }
    // 바로 로그인되면 메인 화면으로 자동 이동, 아니면 메일 확인 안내
    if (!data.session) setCheckMail(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {!checkMail ? (
          <Pressable onPress={back} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
        <Text style={styles.headerTitle}>회원가입</Text>
        <Text style={styles.stepText}>
          {step}/{STEPS}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / STEPS) * 100}%` }]} />
      </View>

      {step === 1 && (
        <View style={styles.body}>
          <Text style={styles.title}>어느 학교 라이더인가요?</Text>
          <Text style={styles.subtitle}>같은 학교 친구들과 함께 학교 랭킹에 도전해요</Text>
          <SchoolPicker
            selectedId={school?.id ?? null}
            onSelect={(picked) => {
              if (picked.id !== school?.id) setGrade('');
              setSchool(picked);
              setStep(2);
            }}
          />
        </View>
      )}

      {step === 2 && (
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Text style={styles.title}>학년과 닉네임을 알려주세요</Text>

          <Pressable style={styles.schoolCard} onPress={() => setStep(1)}>
            <Ionicons name="school" size={22} color={ORANGE} />
            <View style={{ flex: 1 }}>
              <Text style={styles.schoolName}>{school?.name}</Text>
              <Text style={styles.schoolMeta}>{school?.region}</Text>
            </View>
            <Text style={styles.change}>변경</Text>
          </Pressable>

          <Text style={styles.label}>학년</Text>
          <View style={styles.gradeRow}>
            {grades.map((g) => (
              <Pressable
                key={g}
                onPress={() => setGrade(g)}
                style={[styles.gradeChip, grade === g && styles.gradeChipActive]}
              >
                <Text style={[styles.gradeText, grade === g && styles.gradeTextActive]}>{g}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.label}>닉네임</Text>
            <Text style={styles.counter}>
              {nickname.length}/{NICKNAME_MAX}
            </Text>
          </View>
          <TextInput
            value={nickname}
            onChangeText={(t) => setNickname(t.slice(0, NICKNAME_MAX))}
            placeholder="랭킹과 땅따먹기에 보이는 이름"
            placeholderTextColor="#6A6A6A"
            style={styles.input}
            maxLength={NICKNAME_MAX}
            autoCorrect={false}
          />
          {(nickError || error) && <Text style={styles.error}>{nickError || error}</Text>}

          <View style={{ flex: 1 }} />
          <Pressable
            onPress={next}
            disabled={!canNext}
            style={({ pressed }) => [
              styles.primary,
              !canNext && styles.primaryDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.primaryText}>{saving ? '확인 중…' : '다음'}</Text>
          </Pressable>
        </KeyboardAvoidingView>
      )}

      {step === 3 && !checkMail && (
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Text style={styles.title}>로그인에 쓸 계정을 만들어요</Text>

          <Text style={styles.label}>이메일</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#6A6A6A"
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
          />

          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={`${PASSWORD_MIN}자 이상`}
            placeholderTextColor="#6A6A6A"
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <TextInput
            value={password2}
            onChangeText={setPassword2}
            placeholder="비밀번호 확인"
            placeholderTextColor="#6A6A6A"
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            onSubmitEditing={submit}
          />
          {(pwError || error) && <Text style={styles.error}>{pwError || error}</Text>}

          <View style={{ flex: 1 }} />
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.primary,
              !canSubmit && styles.primaryDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.primaryText}>{saving ? '가입 중…' : '가입하기'}</Text>
          </Pressable>
        </KeyboardAvoidingView>
      )}

      {checkMail && (
        <View style={[styles.body, styles.done]}>
          <View style={styles.doneIcon}>
            <Ionicons name="mail" size={40} color="#000" />
          </View>
          <Text style={styles.doneTitle}>메일을 확인해 주세요</Text>
          <Text style={styles.doneSub}>
            {email.trim()}로 보낸 인증 링크를 누르면{'\n'}가입이 끝나요. 그다음 로그인해 주세요.
          </Text>

          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => router.replace('/login')}
            style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.primaryText}>로그인 화면으로</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  stepText: {
    color: '#8A8A8A',
    fontSize: 13,
    width: 26,
    textAlign: 'right',
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#1F1F1F',
  },
  progressFill: {
    height: 3,
    backgroundColor: ORANGE,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#9A9A9A',
    fontSize: 14,
    marginTop: -4,
    marginBottom: 4,
  },
  schoolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginTop: 4,
  },
  schoolName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  schoolMeta: {
    color: '#8A8A8A',
    fontSize: 12,
    marginTop: 2,
  },
  change: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
    color: '#BDBDBD',
    fontSize: 13,
    marginTop: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  counter: {
    color: '#6A6A6A',
    fontSize: 12,
  },
  gradeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gradeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  gradeChipActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  gradeText: {
    color: '#DDDDDD',
    fontSize: 14,
  },
  gradeTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  input: {
    color: '#FFFFFF',
    fontSize: 16,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: {
    color: '#FF5A5F',
    fontSize: 12,
  },
  primary: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 14,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: {
    backgroundColor: '#3A3A3A',
  },
  primaryText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '700',
  },
  done: {
    alignItems: 'center',
    paddingTop: 60,
  },
  doneIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 8,
  },
  doneSub: {
    color: '#BDBDBD',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
