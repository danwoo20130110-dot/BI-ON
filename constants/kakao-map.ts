export const KAKAO_MAP_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_MAP_JS_KEY;
export const KAKAO_SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_JS_KEY}&libraries=services&autoload=false`;
export const DEFAULT_CENTER = { latitude: 37.5665, longitude: 126.978 };
// 지도 타일 이미지에만 거는 다크 필터 (지도 전체에 걸면 안드로이드 WebView 메모리 한도 초과로 안 그려짐)
export const MAP_TILE_FILTER = 'invert(92%) hue-rotate(180deg) saturate(0.8) brightness(0.95)';
// https 로 두어야 카카오 스크립트/타일이 모두 https 로 로드됨 (안드로이드 http 차단 회피)
export const MAP_BASE_URL = 'https://localhost';
