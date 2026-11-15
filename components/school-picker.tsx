import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/ui/text';
import { type School, type SchoolLevel } from '@/constants/schools';
import { searchSchools } from '@/lib/school-search';

const ORANGE = '#FFA51F';
const LEVELS: ('전체' | SchoolLevel)[] = ['전체', '초등학교', '중학교', '고등학교', '대학교', '기타'];
const SEARCH_DELAY_MS = 300;

type Props = {
  // 지금 고른 학교의 ID
  selectedId: string | null;
  onSelect: (school: School) => void;
};

export function SchoolPicker({ selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('전체');
  const [result, setResult] = useState<{ key: string; schools: School[] }>({ key: '', schools: [] });
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const key = `${level}|${trimmed}`;
  const searching = trimmed.length >= 1 && result.key !== key && !error;

  // 전국 학교 목록은 서버에 있어 입력이 멈출 때마다 검색
  useEffect(() => {
    if (trimmed.length < 1) return;
    let alive = true;
    const t = setTimeout(() => {
      searchSchools(trimmed, level === '전체' ? null : level)
        .then((schools) => {
          if (!alive) return;
          setError(null);
          setResult({ key: `${level}|${trimmed}`, schools });
        })
        .catch(() => alive && setError('학교 검색에 실패했어요. 인터넷 연결을 확인해 주세요.'));
    }, SEARCH_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [trimmed, level]);

  const results = result.key === key ? result.schools : [];

  let status = `${results.length.toLocaleString()}개 학교${results.length >= 100 ? ' (더 정확히 입력해 보세요)' : ''}`;
  if (trimmed.length < 1) status = '학교 이름을 입력하면 전국 학교를 찾아요';
  else if (searching) status = '검색 중…';
  else if (error) status = error;
  else if (!results.length) status = '찾는 학교가 없어요. 학교 이름을 다시 확인해 주세요';

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
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        renderItem={({ item }) => {
          const active = item.id === selectedId;
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
