import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import type { OrgMember } from '../../types';

interface Props {
  orgId: string;
  userId: string;
  userEmail: string;
  members: OrgMember[];
}

const ROLE_LABELS: Record<string, string> = {
  master: '마스터(관리자)',
  manager: '매니저',
  member: '멤버',
};

/** 탭4: 내 정보 - 로그인 계정/소속 조직/역할 확인 + 로그아웃. */
export default function ProfileTab({ orgId, userId, userEmail, members }: Props) {
  const [fullName, setFullName] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');

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

  const myRole = members.find((m) => m.user_id === userId)?.role ?? 'member';
  // '@insurance-schedule.local' 로 끝나면 실제 이메일이 아니라 내부용 가짜 이메일(아이디 로그인)이므로 아이디만 보여준다.
  const displayLoginId = userEmail.endsWith('@insurance-schedule.local')
    ? userEmail.replace('@insurance-schedule.local', '')
    : userEmail;

  function handleLogout() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>내 정보</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.avatarBox}>
          <Text style={styles.avatarText}>{(fullName || displayLoginId).slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{fullName || '이름 미설정'}</Text>
        <Text style={styles.loginId}>{displayLoginId}</Text>

        <View style={styles.infoCard}>
          <InfoRow label="소속 조직" value={orgName || '-'} />
          <InfoRow label="역할" value={ROLE_LABELS[myRole] ?? myRole} />
        </View>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>로그아웃</Text>
        </Pressable>
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
    marginBottom: 24,
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
});
