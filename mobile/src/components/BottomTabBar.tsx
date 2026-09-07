import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type TabKey = 'upcoming' | 'calendar' | 'tracking' | 'profile';

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'upcoming', icon: '🔔', label: '업무 알림' },
  { key: 'calendar', icon: '📅', label: '캘린더' },
  { key: 'tracking', icon: '📋', label: '작업 기록' },
  { key: 'profile', icon: '👤', label: '내 정보' },
];

/** 화면 맨 아래 4개 탭 바 - 업무 알림 / 캘린더 / 작업추적·기록 / 내 정보. */
export default function BottomTabBar({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const selected = active === tab.key;
        return (
          <Pressable key={tab.key} style={styles.tabButton} onPress={() => onChange(tab.key)}>
            <Text style={[styles.icon, selected && styles.iconSelected]}>{tab.icon}</Text>
            <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
    paddingBottom: 6,
  },
  tabButton: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  icon: { fontSize: 20, opacity: 0.5 },
  iconSelected: { opacity: 1 },
  label: { fontSize: 11, color: '#9ca3af' },
  labelSelected: { color: '#4f46e5', fontWeight: '700' },
});
