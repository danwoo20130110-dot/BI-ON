import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';

type Props = {
  nickname: string;
  photoUri: string | null;
  size: number;
};

export function ProfileAvatar({ nickname, photoUri, size }: Props) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (photoUri) {
    return <Image source={{ uri: photoUri }} style={box} contentFit="cover" />;
  }
  return (
    <View style={[styles.fallback, box]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
        {(nickname.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#2A2A2A',
    borderWidth: 2,
    borderColor: '#FFA51F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#FFA51F',
    fontWeight: '800',
  },
});
