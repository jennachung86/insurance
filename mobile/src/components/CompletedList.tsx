import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { ScheduleRow } from '../types';

/** 화면 하단: 완료된 항목 목록. 체크 해제 시 다시 진행중 테이블로 되돌릴 수 있다. */
export default function CompletedList({ rows, onChanged }: { rows: ScheduleRow[]; onChanged: () => void }) {
  async function reopen(row: ScheduleRow) {
    const { error } = await supabase
      .from('item_schedules')
      .update({ status: 'in_progress', completed_at: null })
      .eq('id', row.schedule_id);
    if (error) {
      Alert.alert('처리 실패', error.message);
      return;
    }
    onChanged();
  }

  if (rows.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>완료된 항목이 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {rows.map((row) => (
        <View key={row.schedule_id} style={styles.row}>
          <Pressable style={[styles.checkbox, styles.checkboxChecked]} onPress={() => reopen(row)}>
            <Text style={styles.checkMark}>✓</Text>
          </Pressable>
          <View style={styles.info}>
            <Text style={styles.itemName}>{row.item_name}</Text>
            <Text style={styles.meta}>
              {row.category} · 완료일 {row.completed_at?.slice(0, 10) ?? '-'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  info: { flex: 1 },
  itemName: { fontSize: 13, color: '#64748b', textDecorationLine: 'line-through' },
  meta: { fontSize: 11, color: '#94a3b8' },
  emptyBox: { paddingHorizontal: 16, paddingVertical: 12 },
  emptyText: { fontSize: 13, color: '#9ca3af' },
});
