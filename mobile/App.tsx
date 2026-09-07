import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import MainScreen from './src/screens/MainScreen';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = 로딩중
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setOrgId(data?.org_id ?? null));
  }, [session]);

  if (session === undefined) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (!orgId) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.infoText}>소속된 조직이 없습니다. 관리자에게 초대를 요청하세요.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex}>
      <MainScreen orgId={orgId} />
    </SafeAreaView>
  );
}

// 사용자가 이메일 없이 "아이디"만 입력해도 Supabase(이메일 기반 인증)와 호환되도록,
// '@'가 없는 입력값은 내부 전용 가짜 도메인을 붙여 이메일 형태로 바꿔준다.
const USERNAME_DOMAIN = '@insurance-schedule.local';

function toAuthEmail(idOrEmail: string): string {
  const trimmed = idOrEmail.trim();
  return trimmed.includes('@') ? trimmed : `${trimmed.toLowerCase()}${USERNAME_DOMAIN}`;
}

/** 최소 구성의 아이디(또는 이메일)/비밀번호 로그인 + 회원가입 화면 (Supabase Auth). */
function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!loginId || !password) {
      Alert.alert('입력 오류', '아이디(또는 이메일)와 비밀번호를 입력하세요.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: toAuthEmail(loginId),
      password,
    });
    setLoading(false);
    if (error) Alert.alert('로그인 실패', error.message);
  }

  async function handleSignUp() {
    if (!loginId || !password) {
      Alert.alert('입력 오류', '아이디(또는 이메일)와 비밀번호를 입력하세요.');
      return;
    }
    if (loginId.includes(' ')) {
      Alert.alert('입력 오류', '아이디에는 공백을 사용할 수 없습니다.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('입력 오류', '비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: toAuthEmail(loginId),
      password,
    });
    if (error) {
      setLoading(false);
      Alert.alert('회원가입 실패', error.message);
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      await supabase.from('profiles').upsert({ id: userId, full_name: fullName || loginId });
    }
    setLoading(false);

    if (data.session) {
      Alert.alert('회원가입 완료', '가입이 완료되었습니다.');
    } else {
      Alert.alert(
        '회원가입 완료',
        '이메일로 발송된 인증 링크를 클릭한 뒤 로그인해주세요.'
      );
      setMode('login');
    }
  }

  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.loginTitle}>
        {mode === 'login' ? '일정 공동관리 로그인' : '회원가입'}
      </Text>

      {mode === 'signup' && (
        <TextInput
          style={styles.input}
          placeholder="이름"
          value={fullName}
          onChangeText={setFullName}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="아이디 (또는 이메일)"
        autoCapitalize="none"
        autoCorrect={false}
        value={loginId}
        onChangeText={setLoginId}
      />
      <TextInput
        style={styles.input}
        placeholder="비밀번호 (6자 이상)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {mode === 'login' ? (
        <Button title={loading ? '로그인 중...' : '로그인'} onPress={handleLogin} disabled={loading} />
      ) : (
        <Button title={loading ? '가입 중...' : '회원가입'} onPress={handleSignUp} disabled={loading} />
      )}

      <View style={styles.switchModeRow}>
        <Text
          style={styles.switchModeText}
          onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
        >
          {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  infoText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  loginTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  switchModeRow: { marginTop: 16 },
  switchModeText: { color: '#2563eb', fontSize: 14 },
});
