import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DataTable from '../../components/DataTable';
import CompletedList from '../../components/CompletedList';
import type { ScheduleRow } from '../../types';

interface Props {
  inProgressRows: ScheduleRow[];
  completedRows: ScheduleRow[];
  onRowPress: (row: ScheduleRow) => void;
  onChanged: () => void;
}

type SubTab = 'in_progress' | 'completed';

/** 탭3: 작업추적/기록 - 진행 중(보류 포함) / 완료된 작업을 서브탭으로 전환하며 확인. */
export default function TrackingTab({ inProgressRows, completedRows, onRowPress, onChanged }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('in_progress');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>작업 추적 / 기록</Text>
      </View>

      <View style={styles.subTabRow}>
        <SubTabButton
          label={`진행중 (${inProgressRows.length})`}
          selected={subTab === 'in_progress'}
          onPress={() => setSubTab('in_progress')}
        />
        <SubTabButton
          label={`완료 (${completedRows.length})`}
          selected={subTab === 'completed'}
          onPress={() => setSubTab('completed')}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {subTab === 'in_progress' ? (
          <DataTable rows={inProgressRows} onRowPress={onRowPress} onChanged={onChanged} />
        ) : (
          <CompletedList rows={completedRows} onChanged={onChanged} />
        )}
      </ScrollView>
    </View>
  );
}

function SubTabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.subTabButton, selected && styles.subTabButtonSelected]} onPress={onPress}>
      <Text style={[styles.subTabText, selected && styles.subTabTextSelected]}>{label}</Text>
    </Pressable>
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
  subTabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  subTabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  subTabButtonSelected: { backgroundColor: '#4f46e5' },
  subTabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  subTabTextSelected: { color: '#fff' },
  body: { paddingBottom: 40 },
});
