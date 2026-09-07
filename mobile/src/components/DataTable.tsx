import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { ScheduleRow } from '../types';

interface Props {
  rows: ScheduleRow[]; // status === 'in_progress' 인 (품목+일정) 행만 전달
  onRowPress: (row: ScheduleRow) => void; // 셀 편집 모달 열기 (품목 전체를 연다)
  onChanged: () => void;
}

const COLUMN_WIDTHS = {
  check: 40,
  name: 160,
  category: 80,
  dueDate: 110,
  assignee: 90,
  status: 90,
};

/** 화면 중앙: 편집 가능한 데이터 셀 테이블. 한 품목에 여러 일정이 있으면 행이 여러 개로 나뉘어 보인다. */
export default function DataTable({ rows, onRowPress, onChanged }: Props) {
  async function markCompleted(row: ScheduleRow) {
    const { error } = await supabase
      .from('item_schedules')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', row.schedule_id);
    if (error) {
      Alert.alert('처리 실패', error.message);
      return;
    }
    onChanged();
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
      <View>
        <View style={[styles.row, styles.headerRow]}>
          <HeaderCell width={COLUMN_WIDTHS.check} text="" />
          <HeaderCell width={COLUMN_WIDTHS.name} text="항목명" />
          <HeaderCell width={COLUMN_WIDTHS.category} text="분류" />
          <HeaderCell width={COLUMN_WIDTHS.dueDate} text="만료일" />
          <HeaderCell width={COLUMN_WIDTHS.assignee} text="담당자" />
          <HeaderCell width={COLUMN_WIDTHS.status} text="상태" />
        </View>

        {rows.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>진행 중인 항목이 없습니다. + 버튼으로 추가하세요.</Text>
          </View>
        ) : (
          rows.map((row) => (
            <Pressable key={row.schedule_id} style={styles.row} onPress={() => onRowPress(row)}>
              <View style={[styles.cell, { width: COLUMN_WIDTHS.check }]}>
                <Pressable
                  style={styles.checkbox}
                  onPress={(e) => {
                    e.stopPropagation();
                    markCompleted(row);
                  }}
                >
                  <Text style={styles.checkboxMark}> </Text>
                </Pressable>
              </View>
              <Cell width={COLUMN_WIDTHS.name} text={row.item_name} bold />
              <Cell width={COLUMN_WIDTHS.category} text={row.category} />
              <Cell width={COLUMN_WIDTHS.dueDate} text={row.due_date ?? '-'} />
              <Cell width={COLUMN_WIDTHS.assignee} text={row.assignee_name ?? '미지정'} />
              <View style={[styles.cell, { width: COLUMN_WIDTHS.status }]}>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>진행중</Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function HeaderCell({ width, text }: { width: number; text: string }) {
  return (
    <View style={[styles.cell, { width }]}>
      <Text style={styles.headerText}>{text}</Text>
    </View>
  );
}

function Cell({ width, text, bold }: { width: number; text: string; bold?: boolean }) {
  return (
    <View style={[styles.cell, { width }]}>
      <Text numberOfLines={1} style={[styles.cellText, bold && styles.cellTextBold]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  headerRow: { backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  cell: { paddingHorizontal: 10, paddingVertical: 12, justifyContent: 'center' },
  headerText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  cellText: { fontSize: 13, color: '#1e293b' },
  cellTextBold: { fontWeight: '600' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: { fontSize: 12 },
  statusPill: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusPillText: { fontSize: 11, color: '#4f46e5', fontWeight: '600' },
  emptyRow: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#9ca3af' },
});
