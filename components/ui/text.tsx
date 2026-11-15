import { createContext, useContext, type ComponentProps } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextStyle,
} from 'react-native';

// 앱 전체 글꼴: Pretendard (굵기마다 파일이 따로 있어 fontWeight 를 파일 이름으로 바꿔 줌)
export const PRETENDARD_FONTS = {
  'Pretendard-Regular': require('@/assets/fonts/Pretendard-Regular.otf'),
  'Pretendard-Medium': require('@/assets/fonts/Pretendard-Medium.otf'),
  'Pretendard-SemiBold': require('@/assets/fonts/Pretendard-SemiBold.otf'),
  'Pretendard-Bold': require('@/assets/fonts/Pretendard-Bold.otf'),
  'Pretendard-ExtraBold': require('@/assets/fonts/Pretendard-ExtraBold.otf'),
};

const FAMILY: Record<string, keyof typeof PRETENDARD_FONTS> = {
  normal: 'Pretendard-Regular',
  '100': 'Pretendard-Regular',
  '200': 'Pretendard-Regular',
  '300': 'Pretendard-Regular',
  '400': 'Pretendard-Regular',
  '500': 'Pretendard-Medium',
  '600': 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  '700': 'Pretendard-Bold',
  '800': 'Pretendard-ExtraBold',
  '900': 'Pretendard-ExtraBold',
};

// 굵기를 따로 정하지 않은 안쪽 글자는 바깥 글자의 글꼴을 그대로 이어받음
const InsideText = createContext(false);

function fontStyle(style: ComponentProps<typeof RNText>['style'], inside: boolean): TextStyle | null {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (flat?.fontFamily) return null;
  if (inside && flat?.fontWeight == null) return null;
  // 굵기는 글꼴 파일로 정하므로 기기가 한 번 더 굵게 그리지 않도록 normal
  return { fontFamily: FAMILY[String(flat?.fontWeight ?? '400')] ?? FAMILY.normal, fontWeight: 'normal' };
}

export function Text({ style, ...props }: ComponentProps<typeof RNText>) {
  const inside = useContext(InsideText);
  const font = fontStyle(style, inside);
  return (
    <InsideText.Provider value>
      <RNText {...props} style={font ? [style, font] : style} />
    </InsideText.Provider>
  );
}

export function TextInput({ style, ...props }: ComponentProps<typeof RNTextInput>) {
  const font = fontStyle(style, false);
  return <RNTextInput {...props} style={font ? [style, font] : style} />;
}
