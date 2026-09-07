import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ScheduleRow } from '../../types';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 한 달치 달력 셀(이전달 꼬리 + 이번달 + 다음달 꼬리 포함, 항상 6주=42칸)을 만든다. */
function buildMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0=일요일
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

interface Props {
  rows: ScheduleRow[];
  title: string;
  onRowPress: (row: ScheduleRow) => void;
}

/** 탭2: 캘린더 - 월별로 만료일이 있는 일정을 점으로 표시하고, 날짜를 누르면 그날 일정 목록을 보여준다. */
export default function CalendarTab({ rows, title, onRowPress }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [selectedKey, setSelectedKey] = useState(toDateKey(today));

  const rowsByDate = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    for (const row of rows) {
      if (!row.due_date) continue;
      const list = map.get(row.due_date) ?? [];
      list.push(row);
      map.set(row.due_date, list);
    }
    return map;
  }, [rows]);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayKey = toDateKey(today);
  const selectedRows = rowsByDate.get(selectedKey) ?? [];

  function goToMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.monthNav}>
          <Pressable onPress={() => goToMonth(-1)} style={styles.navButton}>
            <Text style={styles.navButtonText}>◀</Text>
          </Pressable>
          <Text style={styles.monthLabel}>
            {viewYear}년 {viewMonth + 1}월
          </Text>
          <Pressable onPress={() => goToMonth(1)} style={styles.navButton}>
            <Text style={styles.navButtonText}>▶</Text>
          </Pressable>
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((w, i) => (
            <Text
              key={w}
              style={[styles.weekdayText, i === 0 && styles.sundayText, i === 6 && styles.saturdayText]}
            >
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {grid.map((date, idx) => {
            const key = toDateKey(date);
            const inMonth = date.getMonth() === viewMonth;
            const hasEvents = rowsByDate.has(key);
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            return (
              <Pressable
                key={idx}
                style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                onPress={() => setSelectedKey(key)}
              >
                <View style={[styles.dayNumberWrap, isToday && styles.dayNumberToday]}>
                  <Text
                    style={[
                      styles.dayNumber,
                      !inMonth && styles.dayNumberOutside,
                      isToday && styles.dayNumberTodayText,
                      isSelected && styles.dayNumberSelectedText,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </View>
                {hasEvents && <View style={styles.eventDot} />}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.selectedSection}>
          <Text style={styles.selectedTitle}>{selectedKey} 일정</Text>
          {selectedRows.length === 0 ? (
            <Text style={styles.emptyText}>이 날짜에 등록된 일정이 없습니다.</Text>
          ) : (
            selectedRows.map((row) => (
              <Pressable key={row.schedule_id} style={styles.eventRow} onPress={() => onRowPress(row)}>
                <View style={styles.eventDotSmall} />
                <View style={styles.eventInfo}>
                  <Text style={styles.eventCategory}>{row.category}</Text>
                  <Text style={styles.eventName}>{row.item_name}</Text>
                </View>
                <Text style={styles.eventStatus}>{row.status === 'completed' ? '완료' : '진행중'}</Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
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
  scrollBody: { padding: 16, gap: 16 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  navButton: { padding: 8 },
  navButtonText: { fontSize: 16, color: '#4f46e5', fontWeight: '700' },
  monthLabel: { fontSize: 16, fontWeight: '800', color: '#111827', minWidth: 110, textAlign: 'center' },
  weekdayRow: { flexDirection: 'row' },
  weekdayText: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#6b7280' },
  sundayText: { color: '#dc2626' },
  saturdayText: { color: '#2563eb' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 8,
  },
  dayCellSelected: { backgroundColor: '#eef2ff' },
  dayNumberWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  dayNumberToday: { backgroundColor: '#4f46e5' },
  dayNumber: { fontSize: 13, color: '#111827' },
  dayNumberOutside: { color: '#d1d5db' },
  dayNumberTodayText: { color: '#fff', fontWeight: '700' },
  dayNumberSelectedText: { fontWeight: '700', color: '#4f46e5' },
  eventDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#f97316' },
  selectedSection: { gap: 10, marginTop: 8 },
  selectedTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  emptyText: { fontSize: 13, color: '#9ca3af' },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  eventDotSmall: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f97316' },
  eventInfo: { flex: 1 },
  eventCategory: { fontSize: 11, color: '#6366f1', fontWeight: '700' },
  eventName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  eventStatus: { fontSize: 12, color: '#9ca3af' },
});
