import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const { supabaseUrl, supabaseAnonKey, apiBaseUrl } = Constants.expoConfig?.extra ?? {};

export const supabase = createClient(supabaseUrl as string, supabaseAnonKey as string, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const API_BASE_URL = (apiBaseUrl as string) ?? 'http://localhost:4001';

/** 백엔드 API 호출에 쓸 현재 로그인 사용자의 액세스 토큰. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
