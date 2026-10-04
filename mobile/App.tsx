import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import MainScreen from './src/screens/MainScreen';
import AccountRecoveryModal from './src/components/AccountRecoveryModal';
import { authenticateWithBiometric, isBiometricLockEnabled } from './src/lib/biometric';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = 로딩중
  const [orgId, setOrgId] = useState<string | null>(null);
  // undefined = 아직 확인 전, true = 잠금 활성 상태(인증 필요), false = 통과됨/비활성
  const [biometricLocked, setBiometricLocked] = useState<boolean | undefined>(undefined);

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

  // 앱 최초 실행 시 1회만 지문 잠금 여부를 확인한다 (세션 토큰 갱신 때마다 다시 잠그지 않음).
  useEffect(() => {
    if (!session || biometricLocked !== undefined) return;
    isBiometricLockEnabled().then((enabled) => setBiometricLocked(enabled));
  }, [session, biometricLocked]);

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

  if (biometricLocked) {
    return <BiometricLockScreen onUnlock={() => setBiometricLocked(false)} />;
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
      <MainScreen orgId={orgId} userId={session.user.id} userEmail={session.user.email ?? ''} />
    </SafeAreaView>
  );
}

/** 지문/얼굴 인식 잠금이 켜져 있을 때 앱 실행 직후 표시되는 잠금 해제 화면. */
function BiometricLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [authenticating, setAuthenticating] = useState(false);

  async function tryUnlock() {
    setAuthenticating(true);
    try {
      const success = await authenticateWithBiometric();
      if (success) onUnlock();
    } finally {
      setAuthenticating(false);
    }
  }

  useEffect(() => {
    tryUnlock();
  }, []);

  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.loginTitle}>🔒 잠금 해제</Text>
      <Text style={styles.infoText}>지문 또는 얼굴 인식으로 잠금을 해제하세요.</Text>
      <Button title={authenticating ? '인증 중...' : '다시 시도'} onPress={tryUnlock} disabled={authenticating} />
      <View style={styles.switchModeRow}>
        <Text style={styles.switchModeText} onPress={() => supabase.auth.signOut()}>
          다른 계정으로 로그아웃
        </Text>
      </View>
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
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);

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
    const phoneDigits = phoneNumber.replace(/\D/g, '');
    if (!phoneDigits && !recoveryEmail.trim()) {
      Alert.alert('입력 오류', '아이디/비밀번호 찾기에 쓸 휴대폰 번호 또는 복구용 이메일 중 하나는 입력하세요.');
      return;
    }
    if (recoveryEmail.trim() && !recoveryEmail.includes('@')) {
      Alert.alert('입력 오류', '복구용 이메일 형식이 올바르지 않습니다.');
      return;
    }
    if (phoneDigits && !/^01\d{8,9}$/.test(phoneDigits)) {
      Alert.alert('입력 오류', '휴대폰 번호 형식이 올바르지 않습니다. (예: 01012345678)');
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
      await supabase.from('profiles').upsert({
        id: userId,
        full_name: fullName || loginId,
        login_id: loginId.trim().toLowerCase(),
        recovery_email: recoveryEmail.trim() ? recoveryEmail.trim().toLowerCase() : null,
        phone_number: phoneDigits || null,
      });
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
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
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
        {mode === 'signup' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="휴대폰 번호 (아이디/비밀번호 찾기 문자 인증)"
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
            <TextInput
              style={styles.input}
              placeholder="복구용 이메일 (이메일 인증용, 둘 중 하나는 필수)"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={recoveryEmail}
              onChangeText={setRecoveryEmail}
            />
          </>
        )}

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
        {mode === 'login' && (
          <View style={styles.switchModeRow}>
            <Text style={styles.switchModeText} onPress={() => setRecoveryModalVisible(true)}>
              아이디/비밀번호를 잊으셨나요?
            </Text>
          </View>
        )}
      </ScrollView>

      <AccountRecoveryModal visible={recoveryModalVisible} onClose={() => setRecoveryModalVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  loginScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
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
