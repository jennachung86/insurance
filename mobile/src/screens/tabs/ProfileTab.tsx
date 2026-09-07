import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import type { OrgMember } from '../../types';

interface Props {
  title: string;
  orgId: string;
  userId: string;
  userEmail: string;
  members: OrgMember[];
  onOpenSettings: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  master: '마스터(관리자)',
  manager: '매니저',
  member: '멤버',
};

/** 탭4: 내 정보 - 로그인 계정/소속 조직/역할 확인, 이름·조직명 수정, 로그아웃. */
export default function ProfileTab({ title, orgId, userId, userEmail, members, onOpenSettings }: Props) {
  const [fullName, setFullName] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [orgNameDraft, setOrgNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const myRole = members.find((m) => m.user_id === userId)?.role ?? 'member';
  const canEditOrgName = myRole === 'master';

  useEffect(() => {
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => setFullName(data?.full_name ?? ''));

    supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => setOrgName(data?.name ?? ''));
  }, [orgId, userId]);

  // '@insurance-schedule.local' 로 끝나면 실제 이메일이 아니라 내부용 가짜 이메일(아이디 로그인)이므로 아이디만 보여준다.
  const displayLoginId = userEmail.endsWith('@insurance-schedule.local')
    ? userEmail.replace('@insurance-schedule.local', '')
    : userEmail;

  function startEditing() {
    setNameDraft(fullName);
    setOrgNameDraft(orgName);
    setEditing(true);
  }

  async function handleSaveProfile() {
    if (!nameDraft.trim()) {
      Alert.alert('입력 필요', '이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: nameDraft.trim() })
        .eq('id', userId);
      if (profileError) throw profileError;

      if (canEditOrgName && orgNameDraft.trim() && orgNameDraft.trim() !== orgName) {
        const { error: orgError } = await supabase
          .from('organizations')
          .update({ name: orgNameDraft.trim() })
          .eq('id', orgId);
        if (orgError) throw orgError;
        setOrgName(orgNameDraft.trim());
      }

      setFullName(nameDraft.trim());
      setEditing(false);
    } catch (err) {
      Alert.alert('저장 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.avatarBox}>
          <Text style={styles.avatarText}>{(fullName || displayLoginId).slice(0, 1).toUpperCase()}</Text>
        </View>

        {editing ? (
          <View style={styles.editForm}>
            <Text style={styles.editLabel}>이름</Text>
            <TextInput style={styles.editInput} value={nameDraft} onChangeText={setNameDraft} placeholder="이름" />

            {canEditOrgName && (
              <>
                <Text style={styles.editLabel}>소속 조직 이름</Text>
                <TextInput
                  style={styles.editInput}
                  value={orgNameDraft}
                  onChangeText={setOrgNameDraft}
                  placeholder="조직 이름"
                />
              </>
            )}

            <Text style={styles.loginId}>{displayLoginId}</Text>

            <View style={styles.editButtonsRow}>
              <Pressable style={styles.cancelButton} onPress={() => setEditing(false)} disabled={saving}>
                <Text style={styles.cancelButtonText}>취소</Text>
              </Pressable>
              <Pressable style={styles.saveButton} onPress={handleSaveProfile} disabled={saving}>
                <Text style={styles.saveButtonText}>{saving ? '저장 중...' : '저장'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.name}>{fullName || '이름 미설정'}</Text>
            <Text style={styles.loginId}>{displayLoginId}</Text>

            <View style={styles.infoCard}>
              <InfoRow label="소속 조직" value={orgName || '-'} />
              <InfoRow label="역할" value={ROLE_LABELS[myRole] ?? myRole} />
            </View>

            <Pressable style={styles.editProfileButton} onPress={startEditing}>
              <Text style={styles.editProfileButtonText}>✏️ 내 정보 수정</Text>
            </Pressable>

            <Pressable style={styles.settingsButton} onPress={onOpenSettings}>
              <Text style={styles.settingsButtonText}>⚙️ 분류 · 항목 · 탭 이름 설정</Text>
            </Pressable>

            <Pressable style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutButtonText}>로그아웃</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  body: { padding: 24, alignItems: 'center', gap: 6 },
  avatarBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: { fontSize: 28, color: '#fff', fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: '#111827' },
  loginId: { fontSize: 13, color: '#9ca3af', marginBottom: 20 },
  infoCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoLabel: { fontSize: 13, color: '#6b7280' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  editProfileButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  editProfileButtonText: { color: '#374151', fontWeight: '700', fontSize: 14 },
  settingsButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    marginBottom: 12,
  },
  settingsButtonText: { color: '#4f46e5', fontWeight: '700', fontSize: 14 },
  logoutButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutButtonText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
  editForm: { width: '100%', gap: 6 },
  editLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  editInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  editButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: { color: '#6b7280', fontWeight: '700', fontSize: 14 },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#4f46e5',
  },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
