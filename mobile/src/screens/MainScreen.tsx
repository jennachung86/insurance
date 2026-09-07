import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import UpcomingEventsList from '../components/UpcomingEventsList';
import DataTable from '../components/DataTable';
import CompletedList from '../components/CompletedList';
import CellEditModal from '../components/CellEditModal';
import type { CustomFieldDefinition, OrgMember, ScheduleItem, ScheduleRow } from '../types';

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
        // 'item_schedules' : 한 품목에 딸린 여러 개의 일정(보험/검사 등)을 함께 가져온다.
        .select('*, profiles!assignee_user_id ( full_name ), item_schedules ( * )')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true }),
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
        schedules: row.item_schedules ?? [],
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

  // 품목(item) + 각 일정(schedule)을 평평하게 펼쳐서 화면에 한 줄씩 보여줄 행 목록을 만든다.
  const allRows = useMemo<ScheduleRow[]>(
    () =>
      items.flatMap((item) =>
        item.schedules.map((s) => ({
          item_id: item.id,
          schedule_id: s.id,
          item_name: item.item_name,
          category: s.category,
          due_date: s.due_date,
          remind_before_value: s.remind_before_value,
          remind_before_unit: s.remind_before_unit,
          assignee_user_id: item.assignee_user_id,
          assignee_name: item.assignee_name,
          status: s.status,
          photo_url: item.photo_url,
          custom_fields: s.custom_fields,
          completed_at: s.completed_at,
        }))
      ),
    [items]
  );

  const inProgressRows = useMemo(() => allRows.filter((r) => r.status === 'in_progress'), [allRows]);
  const completedRows = useMemo(() => allRows.filter((r) => r.status === 'completed'), [allRows]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  function openItemBySchedule(row: ScheduleRow) {
    const found = items.find((i) => i.id === row.item_id) ?? null;
    setEditingItem(found);
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
        <UpcomingEventsList rows={allRows} />

        <SectionTitle>진행 중인 항목</SectionTitle>
        <DataTable rows={inProgressRows} onRowPress={openItemBySchedule} onChanged={loadData} />

        <SectionTitle>완료된 항목</SectionTitle>
        <CompletedList rows={completedRows} onChanged={loadData} />
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
