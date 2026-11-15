import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform } from 'react-native';

const TASK = 'bion-ride-location';
const OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,
  distanceInterval: 2,
};

type OnLocation = (location: Location.LocationObject) => void;

// Expo Go 는 화면이 꺼진 동안의 위치 추적을 지원하지 않음 (전용 빌드에서만 가능)
const supported =
  Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let listener: OnLocation | null = null;

if (supported) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    if (error || !data) return;
    data.locations.forEach((l) => listener?.(l));
  });
}

// 권한 창을 띄우기 전에 왜 필요한지 먼저 알림 (Google Play 필수 안내)
function explain() {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      '화면이 꺼져도 기록할까요?',
      'BI:ON은 라이딩 중 화면이 꺼져 있거나 다른 앱을 쓰는 동안에도 경로를 기록하기 위해 위치 정보를 수집합니다. 라이딩을 끝내면 수집을 멈춥니다.',
      [
        { text: '나중에', style: 'cancel', onPress: () => resolve(false) },
        { text: '계속', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

async function backgroundAllowed() {
  const now = await Location.getBackgroundPermissionsAsync();
  if (now.granted) return true;
  if (!now.canAskAgain || !(await explain())) return false;
  return (await Location.requestBackgroundPermissionsAsync()).granted;
}

// 라이딩 위치 받기. 가능하면 화면이 꺼져도 계속 받고, 아니면 앱을 보는 동안만 받음
export async function watchRideLocation(
  onLocation: OnLocation,
  onError: (reason: string) => void,
): Promise<{ remove: () => void }> {
  if (supported) {
    try {
      if (await backgroundAllowed()) {
        listener = onLocation;
        await Location.startLocationUpdatesAsync(TASK, {
          ...OPTIONS,
          activityType: Location.ActivityType.Fitness,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'BI:ON 라이딩 기록 중',
            notificationBody: '라이딩을 끝내면 위치 수집을 멈춰요',
            notificationColor: '#FFA51F',
          },
        });
        return {
          remove() {
            listener = null;
            Location.stopLocationUpdatesAsync(TASK).catch(() => {});
          },
        };
      }
    } catch (e) {
      listener = null;
      console.warn('백그라운드 위치 추적 시작 실패', e);
    }
  }
  return Location.watchPositionAsync(OPTIONS, onLocation, onError);
}
