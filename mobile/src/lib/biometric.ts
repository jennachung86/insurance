import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const BIOMETRIC_LOCK_KEY = 'biometric_lock_enabled';

/** 이 기기가 지문/얼굴 인식을 지원하고, 실제로 등록된 생체정보가 있는지 확인한다. */
export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled;
}

export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(BIOMETRIC_LOCK_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BIOMETRIC_LOCK_KEY, enabled ? 'true' : 'false');
  } catch {
    // 저장 실패해도 치명적이지 않음 - 다음 실행 시 기본값(비활성)으로 동작.
  }
}

/** 지문/얼굴 인식 프롬프트를 띄운다. 성공 시 true. */
export async function authenticateWithBiometric(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: '지문 또는 얼굴로 인증하세요',
    cancelLabel: '취소',
    disableDeviceFallback: false,
  });
  return result.success;
}
