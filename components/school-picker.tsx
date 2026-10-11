import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SCHOOLS, type School, type SchoolLevel } from '@/constants/schools';
import { canSearchOnline, searchSchools } from '@/lib/school-search';

const ORANGE = '#FFA51F';
const LEVELS: ('전체' | SchoolLevel)[] = ['전체', '초등학교', '중학교', '고등학교', '대학교', '기타'];
const MAX_RESULTS = 100;
// 입력이 멈추고 이 시간(ms) 뒤에 전국 검색
const SEARCH_DELAY_MS = 350;

const norm = (t: string) => t.replace(/\s/g, '');
// 검색용으로 미리 공백 없는 이름/지역을 만들어 둠
const INDEX = SCHOOLS.map((s) => ({ school: s, key: norm(s.name) + '|' + norm(s.region) }));

type Props = {
  selected: string;
  onSelect: (school: School) => void;
};

// 학교 검색(전국, 카카오) + 학교급 필터 + 목록에 없으면 직접 입력
export function SchoolPicker({ selected, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('전체');
  const [online, setOnline] = useState<{ query: string; schools: School[] }>({ query: '', schools: [] });
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const searching = canSearchOnline && trimmed.length >= 2 && online.query !== trimmed && !error;

  // 입력이 멈추면 전국 학교 검색 (이전 요청은 취소)
  useEffect(() => {
    if (!canSearchOnline || trimmed.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchSchools(trimmed, ctrl.signal)
        .then((schools) => {
          setError(null);
          setOnline({ query: trimmed, schools });
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setError('전국 검색에 실패했어요. 인터넷 연결을 확인해 주세요.');
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trimmed]);

  const q = norm(trimmed);
  const byLevel = (s: School) => level === '전체' || s.level === level;

  // 전국 검색 결과를 먼저, 그 뒤에 기본 목록에서 찾은 학교 (중복 제외)
  const remote = online.query === trimmed ? online.schools.filter(byLevel) : [];
  const seen = new Set(remote.map((s) => `${s.name}|${s.region}`));
  const local = INDEX.filter((e) => byLevel(e.school) && (q === '' || e.key.includes(q)))
    .sort((a, b) => (q ? Number(!a.key.startsWith(q)) - Number(!b.key.startsWith(q)) : 0))
    .map((e) => e.school)
    .filter((s) => !seen.has(`${s.name}|${s.region}`));
  const all = [...remote, ...local];
  const results = all.slice(0, MAX_RESULTS);
  const exact = all.some((s) => s.name === trimmed);

  let status = `${all.length.toLocaleString()}개 학교`;
  if (trimmed.length < 2) status = '학교 이름을 2글자 이상 입력하면 전국 학교를 찾아요';
  else if (searching) status = '전국 학교 검색 중…';
  else if (error) status = error;

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#8A8A8A" />
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setError(null);
          }}
          placeholder="학교 이름으로 검색 (예: 백석초)"
          placeholderTextColor="#6A6A6A"
          style={styles.searchInput}
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={ORANGE} />}
        {query.length > 0 && !searching && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#6A6A6A" />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chips}
      >
        {LEVELS.map((l) => (
          <Pressable
            key={l}
            onPress={() => setLevel(l)}
            style={[styles.chip, level === l && styles.chipActive]}
          >
            <Text style={[styles.chipText, level === l && styles.chipTextActive]}>{l}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={[styles.count, !!error && { color: '#FF5A5F' }]}>{status}</Text>

      <FlatList
        data={results}
        keyExtractor={(s) => `${s.name}|${s.region}`}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        ListFooterComponent={
          trimmed.length >= 2 && !exact && !searching ? (
            <Pressable
              style={styles.row}
              onPress={() => onSelect({ name: trimmed, region: '', level: '기타' })}
            >
              <Ionicons name="add-circle-outline" size={20} color={ORANGE} />
              <View style={styles.rowText}>
                <Text style={styles.name}>‘{trimmed}’ 직접 입력</Text>
                <Text style={styles.region}>찾는 학교가 없어요</Text>
              </View>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          const active = item.name === selected;
          return (
            <Pressable style={[styles.row, active && styles.rowActive]} onPress={() => onSelect(item)}>
              <Ionicons name="school-outline" size={20} color={active ? ORANGE : '#BDBDBD'} />
              <View style={styles.rowText}>
                <Text style={[styles.name, active && { color: ORANGE }]}>{item.name}</Text>
                <Text style={styles.region}>
                  {item.region ? `${item.region} · ` : ''}
                  {item.level}
                </Text>
              </View>
              {active && <Ionicons name="checkmark" size={20} color={ORANGE} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 12,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  count: {
    color: '#6A6A6A',
    fontSize: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  chipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  chipText: {
    color: '#BDBDBD',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222222',
  },
  rowActive: {
    backgroundColor: 'rgba(255,165,31,0.08)',
  },
  rowText: {
    flex: 1,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  region: {
    color: '#8A8A8A',
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    color: '#8A8A8A',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
  },
});
