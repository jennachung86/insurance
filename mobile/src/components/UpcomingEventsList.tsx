import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ScheduleRow } from '../types';

function daysUntil(dueDate: string): number {
  const diffMs = new Date(dueDate).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** 화면 상단: 만료 임박 일정 (기본 14일 이내, 가까운 순 정렬). 한 품목의 여러 일정도 각각 카드로 보인다. */
export default function UpcomingEventsList({ rows }: { rows: ScheduleRow[] }) {
  const upcoming = rows
    .filter((r) => r.status === 'in_progress' && r.due_date)
    .filter((r) => daysUntil(r.due_date!) <= 14)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());

  if (upcoming.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>14일 이내 만료 예정 일정이 없습니다.</Text>
      </View>
    );
  }

  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={upcoming}
      keyExtractor={(row) => row.schedule_id}
      contentContainerStyle={styles.list}
      renderItem={({ item: row }) => {
        const d = daysUntil(row.due_date!);
        const urgent = d <= 3;
        return (
          <View style={[styles.card, urgent && styles.cardUrgent]}>
            <Text style={styles.cardCategory}>{row.category}</Text>
            <Text style={styles.cardName} numberOfLines={2}>
              {row.item_name}
            </Text>
            <Text style={[styles.cardDday, urgent && styles.cardDdayUrgent]}>
              {d <= 0 ? '오늘 만료' : `D-${d}`}
            </Text>
            <Text style={styles.cardDate}>{row.due_date}</Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, gap: 10, paddingVertical: 4 },
  card: {
    width: 140,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardUrgent: { borderColor: '#f87171', backgroundColor: '#fef2f2' },
  cardCategory: { fontSize: 11, color: '#6366f1', fontWeight: '700' },
  cardName: { fontSize: 13, fontWeight: '600', color: '#111827', minHeight: 34 },
  cardDday: { fontSize: 16, fontWeight: '800', color: '#4f46e5' },
  cardDdayUrgent: { color: '#dc2626' },
  cardDate: { fontSize: 11, color: '#9ca3af' },
  emptyBox: { paddingHorizontal: 16, paddingVertical: 12 },
  emptyText: { fontSize: 13, color: '#9ca3af' },
});
