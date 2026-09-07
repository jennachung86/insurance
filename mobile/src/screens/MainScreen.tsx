import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { supabase } from '../lib/supabase';
import BottomTabBar, { type TabKey } from '../components/BottomTabBar';
import CellEditModal from '../components/CellEditModal';
import SettingsScreen from '../components/SettingsScreen';
import UpcomingTab from './tabs/UpcomingTab';
import CalendarTab from './tabs/CalendarTab';
import TrackingTab from './tabs/TrackingTab';
import ProfileTab from './tabs/ProfileTab';
import {
  DEFAULT_TAB_LABELS,
  type CategoryOption,
  type CustomFieldDefinition,
  type OrgMember,
  type ScheduleItem,
  type ScheduleRow,
  type TabLabels,
} from '../types';

/**
 * 메인 화면 - 하단 4개 탭으로 구성:
 *  1. 업무 알림 (Upcoming Events, D-day, 일정 추가)
 *  2. 캘린더
 *  3. 작업추적/기록 (진행중/완료)
 *  4. 내 정보 (+ 설정: 분류/커스텀항목/탭이름 편집)
 *
 * orgId는 로그인한 사용자가 속한 (첫 번째) 조직으로 가정한다.
 * 여러 조직을 지원하려면 조직 선택 드롭다운을 헤더에 추가하면 된다.
 */
export default function MainScreen({
  orgId,
  userId,
  userEmail,
}: {
  orgId: string;
  userId: string;
  userEmail: string;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [tabLabels, setTabLabels] = useState<TabLabels>(DEFAULT_TAB_LABELS);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null | undefined>(undefined); // undefined = 닫힘
  const [settingsVisible, setSettingsVisible] = useState(false);

  const loadData = useCallback(async () => {
    const [{ data: itemRows }, { data: memberRows }, { data: fieldRows }, { data: categoryRows }, { data: orgRow }] =
      await Promise.all([
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
        supabase
          .from('category_options')
          .select('*')
          .eq('org_id', orgId)
          .order('sort_order', { ascending: true }),
        supabase.from('organizations').select('tab_labels').eq('id', orgId).maybeSingle(),
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
    setCategoryOptions(categoryRows ?? []);
    if (orgRow?.tab_labels) {
      setTabLabels({ ...DEFAULT_TAB_LABELS, ...(orgRow.tab_labels as Partial<TabLabels>) });
    }
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
  const isManager = useMemo(() => {
    const role = members.find((m) => m.user_id === userId)?.role;
    return role === 'master' || role === 'manager';
  }, [members, userId]);

  function openItemBySchedule(row: ScheduleRow) {
    const found = items.find((i) => i.id === row.item_id) ?? null;
    setEditingItem(found);
  }

  return (
    <View style={styles.container}>
      <View style={styles.screenArea}>
        {activeTab === 'upcoming' && (
          <UpcomingTab
            rows={allRows}
            title={tabLabels.upcoming}
            onAddNew={() => setEditingItem(null)}
            onRowPress={openItemBySchedule}
          />
        )}
        {activeTab === 'calendar' && (
          <CalendarTab rows={allRows} title={tabLabels.calendar} onRowPress={openItemBySchedule} />
        )}
        {activeTab === 'tracking' && (
          <TrackingTab
            title={tabLabels.tracking}
            inProgressRows={inProgressRows}
            completedRows={completedRows}
            onRowPress={openItemBySchedule}
            onChanged={loadData}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileTab
            title={tabLabels.profile}
            orgId={orgId}
            userId={userId}
            userEmail={userEmail}
            members={members}
            onOpenSettings={() => setSettingsVisible(true)}
          />
        )}
      </View>

      <BottomTabBar active={activeTab} labels={tabLabels} onChange={setActiveTab} />

      <CellEditModal
        visible={editingItem !== undefined}
        orgId={orgId}
        item={editingItem ?? null}
        members={members}
        customFieldDefs={customFieldDefs}
        categoryOptions={categoryOptions}
        onClose={() => setEditingItem(undefined)}
        onSaved={loadData}
      />

      <SettingsScreen
        visible={settingsVisible}
        orgId={orgId}
        isManager={isManager}
        categoryOptions={categoryOptions}
        customFieldDefs={customFieldDefs}
        tabLabels={tabLabels}
        onClose={() => setSettingsVisible(false)}
        onChanged={loadData}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  screenArea: { flex: 1 },
});
