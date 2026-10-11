import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileAvatar } from '@/components/profile-avatar';
import { SchoolPicker } from '@/components/school-picker';
import { GRADES, schoolLevelOf } from '@/constants/schools';
import { saveProfile, useProfile, type Profile } from '@/hooks/use-profile';

const ORANGE = '#FFA51F';
const NICKNAME_MAX = 12;
const BIO_MAX = 40;

function confirm(title: string, message: string, onOk: () => void, okText = '확인') {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: okText, style: 'destructive', onPress: onOk },
  ]);
}

function Field({
  label,
  value,
  onChange,
  max,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.counter}>
          {value.length}/{max}
        </Text>
      </View>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.slice(0, max))}
        placeholder={placeholder}
        placeholderTextColor="#6A6A6A"
        style={[styles.input, multiline && styles.inputMultiline]}
        multiline={multiline}
        maxLength={max}
      />
    </View>
  );
}

export default function ProfileSettingsScreen() {
  const { profile } = useProfile();
  const [draft, setDraft] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const [pickingSchool, setPickingSchool] = useState(false);
  const grades = GRADES[schoolLevelOf(draft.school)];

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const nicknameError = draft.nickname.trim().length === 0 ? '닉네임을 입력해 주세요' : null;

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('사진 접근 권한 필요', '프로필 사진을 고르려면 사진 접근을 허용해 주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) set('photoUri', result.assets[0].uri);
  };

  const close = () => {
    if (!dirty) {
      router.back();
      return;
    }
    confirm('변경 사항 버리기', '저장하지 않은 내용이 있어요. 나갈까요?', () => router.back(), '나가기');
  };

  const save = async () => {
    if (nicknameError || saving) return;
    setSaving(true);
    try {
      await saveProfile({
        ...draft,
        nickname: draft.nickname.trim(),
        school: draft.school.trim(),
        bio: draft.bio.trim(),
      });
      router.back();
    } catch {
      Alert.alert('저장 실패', '프로필을 저장하지 못했어요. 다시 시도해 주세요.');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={close} hitSlop={10}>
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title}>프로필 설정</Text>
        <Pressable onPress={save} hitSlop={10} disabled={!!nicknameError || !dirty || saving}>
          <Text style={[styles.saveText, (!!nicknameError || !dirty) && styles.saveDisabled]}>
            저장
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarArea}>
            <Pressable onPress={pickPhoto} style={styles.avatarWrap}>
              <ProfileAvatar nickname={draft.nickname} photoUri={draft.photoUri} size={104} />
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={16} color="#000" />
              </View>
            </Pressable>
            <View style={styles.photoActions}>
              <Pressable onPress={pickPhoto} hitSlop={6}>
                <Text style={styles.photoAction}>사진 변경</Text>
              </Pressable>
              {draft.photoUri && (
                <Pressable onPress={() => set('photoUri', null)} hitSlop={6}>
                  <Text style={[styles.photoAction, styles.photoRemove]}>사진 삭제</Text>
                </Pressable>
              )}
            </View>
          </View>

          <Field
            label="닉네임"
            value={draft.nickname}
            onChange={(v) => set('nickname', v)}
            max={NICKNAME_MAX}
            placeholder="랭킹과 땅따먹기에 보이는 이름"
          />
          {nicknameError && <Text style={styles.error}>{nicknameError}</Text>}

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>학교</Text>
            <Pressable style={styles.schoolRow} onPress={() => setPickingSchool(true)}>
              <Ionicons name="school-outline" size={18} color={draft.school ? ORANGE : '#6A6A6A'} />
              <Text style={[styles.schoolValue, !draft.school && styles.placeholder]} numberOfLines={1}>
                {draft.school || '학교 선택'}
              </Text>
              {draft.school ? (
                <Pressable
                  onPress={() => setDraft((d) => ({ ...d, school: '', grade: '' }))}
                  hitSlop={10}
                >
                  <Text style={styles.unregister}>등록 해제</Text>
                </Pressable>
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
              )}
            </Pressable>
            {!!draft.school && (
              <View style={styles.gradeRow}>
                {grades.map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => set('grade', draft.grade === g ? '' : g)}
                    style={[styles.gradeChip, draft.grade === g && styles.gradeChipActive]}
                  >
                    <Text style={[styles.gradeText, draft.grade === g && styles.gradeTextActive]}>{g}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <Field
            label="한 줄 소개"
            value={draft.bio}
            onChange={(v) => set('bio', v)}
            max={BIO_MAX}
            placeholder="예) 주말마다 한강 라이딩해요"
            multiline
          />

          <Pressable
            onPress={save}
            disabled={!!nicknameError || !dirty || saving}
            style={({ pressed }) => [
              styles.saveButton,
              (!!nicknameError || !dirty) && styles.saveButtonDisabled,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.saveButtonText}>{saving ? '저장 중…' : '저장하기'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={pickingSchool} animationType="slide" onRequestClose={() => setPickingSchool(false)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={() => setPickingSchool(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.title}>학교 선택</Text>
            <View style={{ width: 26 }} />
          </View>
          <View style={styles.pickerBody}>
            <SchoolPicker
              selected={draft.school}
              onSelect={({ name }) => {
                setDraft((d) => ({ ...d, school: name, grade: name === d.school ? d.grade : '' }));
                setPickingSchool(false);
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
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
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  saveText: {
    color: ORANGE,
    fontSize: 16,
    fontWeight: '700',
  },
  saveDisabled: {
    color: '#555555',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  avatarArea: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  avatarWrap: {
    position: 'relative',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ORANGE,
    borderWidth: 3,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 18,
  },
  photoAction: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  photoRemove: {
    color: '#FF5A5F',
  },
  field: {
    gap: 6,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: '#BDBDBD',
    fontSize: 13,
  },
  counter: {
    color: '#6A6A6A',
    fontSize: 12,
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
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  schoolValue: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  unregister: {
    color: '#FF5A5F',
    fontSize: 13,
    fontWeight: '600',
  },
  placeholder: {
    color: '#6A6A6A',
  },
  gradeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  gradeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  gradeChipActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  gradeText: {
    color: '#DDDDDD',
    fontSize: 13,
  },
  gradeTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  pickerBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  error: {
    color: '#FF5A5F',
    fontSize: 12,
    marginTop: -10,
  },
  saveButton: {
    marginTop: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#3A3A3A',
  },
  saveButtonText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '700',
  },
});
