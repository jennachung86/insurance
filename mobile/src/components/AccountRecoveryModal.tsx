import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { findLoginId, resetPassword } from '../lib/accountRecovery';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Mode = 'find-id' | 'reset-password';

/** 로그인 화면에서 띄우는 "아이디 찾기 / 비밀번호 재설정" 모달. */
export default function AccountRecoveryModal({ visible, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('find-id');

  // 아이디 찾기
  const [findEmail, setFindEmail] = useState('');
  const [findLoading, setFindLoading] = useState(false);
  const [foundIds, setFoundIds] = useState<string[] | null>(null);

  // 비밀번호 재설정
  const [resetLoginId, setResetLoginId] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  function reset() {
    setFindEmail('');
    setFoundIds(null);
    setResetLoginId('');
    setResetEmail('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setMode('find-id');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFindId() {
    if (!findEmail.trim()) {
      Alert.alert('입력 필요', '가입 시 등록한 복구용 이메일을 입력하세요.');
      return;
    }
    setFindLoading(true);
    setFoundIds(null);
    try {
      const ids = await findLoginId(findEmail.trim());
      setFoundIds(ids);
    } catch (err) {
      Alert.alert('아이디 찾기 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setFindLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!resetLoginId.trim() || !resetEmail.trim() || !newPassword) {
      Alert.alert('입력 필요', '아이디, 복구용 이메일, 새 비밀번호를 모두 입력하세요.');
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
    setResetLoading(true);
    try {
      await resetPassword({
        loginId: resetLoginId.trim(),
        recoveryEmail: resetEmail.trim(),
        newPassword,
      });
      Alert.alert('변경 완료', '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.');
      handleClose();
    } catch (err) {
      Alert.alert('비밀번호 재설정 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.tabRow}>
            <Pressable style={[styles.tab, mode === 'find-id' && styles.tabActive]} onPress={() => setMode('find-id')}>
              <Text style={[styles.tabText, mode === 'find-id' && styles.tabTextActive]}>아이디 찾기</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, mode === 'reset-password' && styles.tabActive]}
              onPress={() => setMode('reset-password')}
            >
              <Text style={[styles.tabText, mode === 'reset-password' && styles.tabTextActive]}>비밀번호 재설정</Text>
            </Pressable>
          </View>

          {mode === 'find-id' ? (
            <View style={styles.form}>
              <Text style={styles.hint}>가입할 때 등록한 복구용 이메일을 입력하세요.</Text>
              <TextInput
                style={styles.input}
                placeholder="복구용 이메일"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={findEmail}
                onChangeText={setFindEmail}
              />
              <Pressable style={styles.primaryButton} onPress={handleFindId} disabled={findLoading}>
                {findLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>아이디 찾기</Text>}
              </Pressable>

              {foundIds && (
                <View style={styles.resultBox}>
                  <Text style={styles.resultLabel}>찾은 아이디</Text>
                  {foundIds.map((id) => (
                    <Text key={id} style={styles.resultValue}>
                      {id}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.hint}>아이디와 복구용 이메일이 일치하면 바로 새 비밀번호로 변경됩니다.</Text>
              <TextInput
                style={styles.input}
                placeholder="아이디"
                autoCapitalize="none"
                autoCorrect={false}
                value={resetLoginId}
                onChangeText={setResetLoginId}
              />
              <TextInput
                style={styles.input}
                placeholder="복구용 이메일"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={resetEmail}
                onChangeText={setResetEmail}
              />
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
              <Pressable style={styles.primaryButton} onPress={handleResetPassword} disabled={resetLoading}>
                {resetLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>비밀번호 변경</Text>
                )}
              </Pressable>
            </View>
          )}

          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>닫기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  tabActive: { backgroundColor: '#eef2ff' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#4f46e5' },
  form: { gap: 10 },
  hint: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  resultBox: {
    marginTop: 12,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  resultLabel: { fontSize: 12, color: '#4f46e5', fontWeight: '700' },
  resultValue: { fontSize: 15, color: '#111827', fontWeight: '700' },
  closeButton: { alignItems: 'center', marginTop: 16, paddingVertical: 6 },
  closeButtonText: { color: '#9ca3af', fontSize: 13 },
});
