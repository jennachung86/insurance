import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import UpcomingEventsList from '../components/UpcomingEventsList';
import DataTable from '../components/DataTable';
import CompletedList from '../components/CompletedList';
import CellEditModal from '../components/CellEditModal';
import type { CustomFieldDefinition, OrgMember, ScheduleItem } from '../types';

/**
 * 메인 화면
 *  - 상단: Upcoming Events (만료 임박 일정)
 *  - 중앙: 편집 가능한 데이터 테이블 (진행중 항목)
 *  - 하단: 완료된 항목 목록
 *
 * orgId는 로그인한 사용자가 속한 (첫 번째) 조직으로 가정한다.
 * 여러 조직을 지원하려면 조직 선택 드롭다운을 헤더에 추가하면 된다.
 */
export default function MainScreen({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null | undefined>(undefined); // undefined = 닫힘

  const loadData = useCallback(async () => {
    const [{ data: itemRows }, { data: memberRows }, { data: fieldRows }] = await Promise.all([
      supabase
        .from('items')
        // 'profiles!assignee_user_id' : items.assignee_user_id 로 연결된 FK를 명시해
        // (담당자) profiles 를 임베드한다. PostgREST 임베딩 힌트 문법 - alias 없이 사용.
        .select('*, profiles!assignee_user_id ( full_name )')
        .eq('org_id', orgId)
        .order('due_date', { ascending: true }),
      supabase
        .from('organization_members')
        .select('user_id, role, profiles ( full_name )')
        .eq('org_id', orgId),
      supabase
        .from('custom_field_definitions')
        .select('*')
        .eq('org_id', orgId)
        .order('sort_order', { ascending: true }),
    ]);

    setItems(
      (itemRows ?? []).map((row: any) => ({
        ...row,
        assignee_name: row.profiles?.full_name ?? null,
      }))
    );
    setMembers(
      (memberRows ?? []).map((row: any) => ({
        user_id: row.user_id,
        full_name: row.profiles?.full_name ?? '이름없음',
        role: row.role,
      }))
    );
    setCustomFieldDefs(fieldRows ?? []);
  }, [orgId]);

  useEffect(() => {
    loadData();

    // 실시간 반영: 다른 계정이 항목을 수정/추가하면 자동 새로고침
    const channel = supabase
      .channel(`items-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `org_id=eq.${orgId}` }, () =>
        loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, loadData]);

  const inProgressItems = useMemo(() => items.filter((i) => i.status === 'in_progress'), [items]);
  const completedItems = useMemo(() => items.filter((i) => i.status === 'completed'), [items]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>일정 공동관리</Text>
        <Pressable style={styles.addButton} onPress={() => setEditingItem(null)}>
          <Text style={styles.addButtonText}>+ 추가</Text>
        </Pressable>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        <SectionTitle>Upcoming Events</SectionTitle>
        <UpcomingEventsList items={items} />

        <SectionTitle>진행 중인 항목</SectionTitle>
        <DataTable items={inProgressItems} onRowPress={setEditingItem} onChanged={loadData} />

        <SectionTitle>완료된 항목</SectionTitle>
        <CompletedList items={completedItems} onChanged={loadData} />
      </ScrollView>

      <CellEditModal
        visible={editingItem !== undefined}
        orgId={orgId}
        item={editingItem ?? null}
        members={members}
        customFieldDefs={customFieldDefs}
        onClose={() => setEditingItem(undefined)}
        onSaved={loadData}
      />
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  addButton: { backgroundColor: '#4f46e5', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  scrollContent: { paddingBottom: 40, gap: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 20,
    marginBottom: 8,
    marginHorizontal: 16,
    textTransform: 'uppercase',
  },
});
