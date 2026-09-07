import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScheduleRow } from '../../types';

function daysUntil(dueDate: string): number {
  const diffMs = new Date(dueDate).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

interface Props {
  rows: ScheduleRow[];
  title: string;
  onAddNew: () => void;
  onRowPress: (row: ScheduleRow) => void;
}

/** 탭1: 업무 알림 - 만료 임박한 모든 일정을 D-day 가까운 순으로 보여주고, 일정을 바로 추가할 수 있다. */
export default function UpcomingTab({ rows, title, onAddNew, onRowPress }: Props) {
  const upcoming = rows
    .filter((r) => r.status === 'in_progress' && r.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());

  const noDate = rows.filter((r) => r.status === 'in_progress' && !r.due_date);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable style={styles.addButton} onPress={onAddNew}>
          <Text style={styles.addButtonText}>+ 일정 추가</Text>
        </Pressable>
      </View>

      <FlatList
        data={[...upcoming, ...noDate]}
        keyExtractor={(row) => row.schedule_id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>등록된 업무 일정이 없습니다. 위의 + 버튼으로 추가하세요.</Text>
          </View>
        }
        renderItem={({ item: row }) => {
          const d = row.due_date ? daysUntil(row.due_date) : null;
          const urgent = d !== null && d <= 3;
          return (
            <Pressable style={[styles.card, urgent && styles.cardUrgent]} onPress={() => onRowPress(row)}>
              <View style={styles.cardLeft}>
                <Text style={styles.cardCategory}>{row.category}</Text>
                <Text style={styles.cardName} numberOfLines={1}>
                  {row.item_name}
                </Text>
                <Text style={styles.cardMeta}>
                  담당: {row.assignee_name ?? '미지정'} {row.due_date ? `· ${row.due_date}` : ''}
                </Text>
              </View>
              <Text style={[styles.dday, urgent && styles.ddayUrgent]}>
                {d === null ? '날짜없음' : d <= 0 ? '오늘 만료' : `D-${d}`}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  list: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardUrgent: { borderColor: '#f87171', backgroundColor: '#fef2f2' },
  cardLeft: { flex: 1, gap: 3 },
  cardCategory: { fontSize: 11, color: '#6366f1', fontWeight: '700' },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardMeta: { fontSize: 12, color: '#9ca3af' },
  dday: { fontSize: 16, fontWeight: '800', color: '#4f46e5', marginLeft: 8 },
  ddayUrgent: { color: '#dc2626' },
  emptyBox: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 24 },
});
