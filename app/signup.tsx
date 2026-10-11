import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SchoolPicker } from '@/components/school-picker';
import { GRADES, schoolLevelOf } from '@/constants/schools';
import { DEFAULT_PROFILE, saveProfile } from '@/hooks/use-profile';

const ORANGE = '#FFA51F';
const NICKNAME_MIN = 2;
const NICKNAME_MAX = 12;
const STEPS = 3;

// 예시용: 학교 이름으로 항상 같은 '우리 학교 라이더 수 / 학교 순위'를 만듦
function sampleSchoolStats(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  h = Math.abs(h);
  return { riders: 12 + (h % 140), rank: 1 + ((h >> 3) % 60) };
}

export default function SignupScreen() {
  const [step, setStep] = useState(1);
  const [school, setSchool] = useState('');
  const [schoolRegion, setSchoolRegion] = useState('');
  const [grade, setGrade] = useState('');
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);

  const level = schoolLevelOf(school);
  const grades = GRADES[level];
  const nick = nickname.trim();
  const nickError =
    nick.length > 0 && nick.length < NICKNAME_MIN ? `닉네임은 ${NICKNAME_MIN}자 이상이에요` : null;
  const canSubmit = !!school && !!grade && nick.length >= NICKNAME_MIN && !saving;

  const back = () => {
    if (step === 1 || step === 3) router.back();
    else setStep(step - 1);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    await saveProfile({ ...DEFAULT_PROFILE, nickname: nick, school, grade });
    setSaving(false);
    setStep(3);
  };

  const stats = sampleSchoolStats(school);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {step < 3 ? (
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
            selected={school}
            onSelect={(picked) => {
              if (picked.name !== school) setGrade('');
              setSchool(picked.name);
              setSchoolRegion(picked.region);
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
              <Text style={styles.schoolName}>{school}</Text>
              <Text style={styles.schoolMeta}>
                {schoolRegion || '직접 입력한 학교'}
              </Text>
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
          {nickError && <Text style={styles.error}>{nickError}</Text>}

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

      {step === 3 && (
        <View style={[styles.body, styles.done]}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={44} color="#000" />
          </View>
          <Text style={styles.doneTitle}>가입 완료!</Text>
          <Text style={styles.doneSub}>
            {school} {grade} {nick}님,{'\n'}학교 대표 라이더가 되어 보세요
          </Text>

          <View style={styles.statsCard}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.riders}명</Text>
              <Text style={styles.statLabel}>우리 학교 라이더</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.rank}위</Text>
              <Text style={styles.statLabel}>학교 랭킹</Text>
            </View>
          </View>
          <Text style={styles.sample}>예시 데이터 (가상)</Text>

          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.primaryText}>라이딩 시작하기</Text>
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
  statsCard: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: 16,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#3A3A3A',
  },
  statValue: {
    color: ORANGE,
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    color: '#BDBDBD',
    fontSize: 12,
  },
  sample: {
    color: '#6A6A6A',
    fontSize: 11,
  },
});
