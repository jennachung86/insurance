import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  findLoginId,
  getRecoveryChannels,
  resetPassword,
  sendRecoveryCode,
  type RecoveryChannel,
} from '../lib/accountRecovery';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Mode = 'find-id' | 'reset-password';

const RESEND_SECONDS = 60;

/** 로그인 화면에서 띄우는 "아이디 찾기 / 비밀번호 재설정" 모달 (이메일·문자 인증번호로 본인 확인). */
export default function AccountRecoveryModal({ visible, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('find-id');
  const [available, setAvailable] = useState<Record<RecoveryChannel, boolean> | null>(null);
  const [channel, setChannel] = useState<RecoveryChannel>('sms');
  const [target, setTarget] = useState('');
  const [loginId, setLoginId] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [foundIds, setFoundIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    getRecoveryChannels()
      .then((channels) => {
        setAvailable(channels);
        setChannel(channels.sms ? 'sms' : 'email');
      })
      .catch(() => setAvailable({ email: false, sms: false }));
  }, [visible]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function resetFlow() {
    setTarget('');
    setCode('');
    setCodeSent(false);
    setCooldown(0);
    setNewPassword('');
    setNewPasswordConfirm('');
    setFoundIds(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    resetFlow();
  }

  function switchChannel(next: RecoveryChannel) {
    setChannel(next);
    resetFlow();
  }

  function handleClose() {
    resetFlow();
    setLoginId('');
    setMode('find-id');
    onClose();
  }

  async function handleSendCode() {
    if (mode === 'reset-password' && !loginId.trim()) {
      Alert.alert('입력 필요', '아이디를 입력하세요.');
      return;
    }
    if (!target.trim()) {
      Alert.alert('입력 필요', channel === 'sms' ? '휴대폰 번호를 입력하세요.' : '이메일을 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      await sendRecoveryCode({ purpose: mode, channel, target: target.trim(), loginId: loginId.trim() });
      setCodeSent(true);
      setCooldown(RESEND_SECONDS);
      Alert.alert('인증번호 발송', '가입 시 등록한 정보와 일치하면 인증번호가 발송됩니다. 5분 안에 입력해주세요.');
    } catch (err) {
      Alert.alert('발송 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (code.trim().length < 6) {
      Alert.alert('입력 필요', '인증번호 6자리를 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'find-id') {
        const ids = await findLoginId({ channel, target: target.trim(), code: code.trim() });
        setFoundIds(ids);
        return;
      }

      if (newPassword.length < 6) {
        Alert.alert('입력 오류', '비밀번호는 6자 이상이어야 합니다.');
        return;
      }
      if (newPassword !== newPasswordConfirm) {
        Alert.alert('입력 오류', '새 비밀번호가 일치하지 않습니다.');
        return;
      }
      await resetPassword({
        loginId: loginId.trim(),
        channel,
        target: target.trim(),
        code: code.trim(),
        newPassword,
      });
      Alert.alert('변경 완료', '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.');
      handleClose();
    } catch (err) {
      Alert.alert(mode === 'find-id' ? '아이디 찾기 실패' : '비밀번호 재설정 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const noChannel = available !== null && !available.email && !available.sms;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.tabRow}>
              <Pressable style={[styles.tab, mode === 'find-id' && styles.tabActive]} onPress={() => switchMode('find-id')}>
                <Text style={[styles.tabText, mode === 'find-id' && styles.tabTextActive]}>아이디 찾기</Text>
              </Pressable>
              <Pressable
                style={[styles.tab, mode === 'reset-password' && styles.tabActive]}
                onPress={() => switchMode('reset-password')}
              >
                <Text style={[styles.tabText, mode === 'reset-password' && styles.tabTextActive]}>비밀번호 재설정</Text>
              </Pressable>
            </View>

            {available === null ? (
              <ActivityIndicator style={{ marginVertical: 20 }} />
            ) : noChannel ? (
              <Text style={styles.hint}>
                본인인증(문자/이메일) 발송이 아직 설정되지 않았습니다. 관리자에게 문의하세요.
              </Text>
            ) : (
              <View style={styles.form}>
                {available.email && available.sms && (
                  <View style={styles.channelRow}>
                    <Pressable
                      style={[styles.channelChip, channel === 'sms' && styles.channelChipActive]}
                      onPress={() => switchChannel('sms')}
                    >
                      <Text style={[styles.channelText, channel === 'sms' && styles.channelTextActive]}>휴대폰 문자</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.channelChip, channel === 'email' && styles.channelChipActive]}
                      onPress={() => switchChannel('email')}
                    >
                      <Text style={[styles.channelText, channel === 'email' && styles.channelTextActive]}>이메일</Text>
                    </Pressable>
                  </View>
                )}

                <Text style={styles.hint}>
                  가입(또는 내정보)에 등록한 {channel === 'sms' ? '휴대폰 번호' : '복구용 이메일'}로 인증번호를 보내드립니다.
                </Text>

                {mode === 'reset-password' && (
                  <TextInput
                    style={styles.input}
                    placeholder="아이디"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={loginId}
                    onChangeText={setLoginId}
                    editable={!codeSent}
                  />
                )}
                <TextInput
                  style={styles.input}
                  placeholder={channel === 'sms' ? '휴대폰 번호 (숫자만)' : '복구용 이메일'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={channel === 'sms' ? 'phone-pad' : 'email-address'}
                  value={target}
                  onChangeText={setTarget}
                  editable={!codeSent}
                />

                <Pressable
                  style={[styles.secondaryButton, (loading || cooldown > 0) && styles.buttonDisabled]}
                  onPress={handleSendCode}
                  disabled={loading || cooldown > 0}
                >
                  <Text style={styles.secondaryButtonText}>
                    {cooldown > 0 ? `재전송 (${cooldown}초)` : codeSent ? '인증번호 재전송' : '인증번호 받기'}
                  </Text>
                </Pressable>

                {codeSent && (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="인증번호 6자리"
                      keyboardType="number-pad"
                      maxLength={6}
                      value={code}
                      onChangeText={setCode}
                    />
                    {mode === 'reset-password' && (
                      <>
                        <TextInput
                          style={styles.input}
                          placeholder="새 비밀번호 (6자 이상)"
                          secureTextEntry
                          value={newPassword}
                          onChangeText={setNewPassword}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="새 비밀번호 확인"
                          secureTextEntry
                          value={newPasswordConfirm}
                          onChangeText={setNewPasswordConfirm}
                        />
                      </>
                    )}
                    <Pressable style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
                      {loading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>{mode === 'find-id' ? '아이디 확인' : '비밀번호 변경'}</Text>
                      )}
                    </Pressable>
                  </>
                )}

                {foundIds && (
                  <View style={styles.resultBox}>
                    <Text style={styles.resultLabel}>찾은 아이디</Text>
                    {foundIds.length === 0 ? (
                      <Text style={styles.resultValue}>등록된 아이디가 없습니다.</Text>
                    ) : (
                      foundIds.map((id) => (
                        <Text key={id} style={styles.resultValue}>
                          {id}
                        </Text>
                      ))
                    )}
                  </View>
                )}
              </View>
            )}

            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>닫기</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '90%' },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#f3f4f6' },
  tabActive: { backgroundColor: '#eef2ff' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#4f46e5' },
  form: { gap: 10 },
  channelRow: { flexDirection: 'row', gap: 8 },
  channelChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  channelChipActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  channelText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  channelTextActive: { color: '#4f46e5' },
  hint: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  primaryButton: { backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  secondaryButtonText: { color: '#4f46e5', fontWeight: '700', fontSize: 14 },
  buttonDisabled: { opacity: 0.5 },
  resultBox: { marginTop: 12, backgroundColor: '#eef2ff', borderRadius: 10, padding: 14, gap: 4 },
  resultLabel: { fontSize: 12, color: '#4f46e5', fontWeight: '700' },
  resultValue: { fontSize: 15, color: '#111827', fontWeight: '700' },
  closeButton: { alignItems: 'center', marginTop: 16, paddingVertical: 6 },
  closeButtonText: { color: '#9ca3af', fontSize: 13 },
});
