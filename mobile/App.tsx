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

/** 최소 구성의 이메일/비밀번호 로그인 화면 (Supabase Auth). */
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('로그인 실패', error.message);
  }

  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.loginTitle}>일정 공동관리 로그인</Text>
      <TextInput
        style={styles.input}
        placeholder="이메일"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="비밀번호"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title={loading ? '로그인 중...' : '로그인'} onPress={handleLogin} disabled={loading} />
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
});
