import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TabKeyName, TabLabels } from '../types';

export type TabKey = TabKeyName;

const TAB_ICONS: { key: TabKey; icon: string }[] = [
  { key: 'upcoming', icon: '🔔' },
  { key: 'calendar', icon: '📅' },
  { key: 'tracking', icon: '📋' },
  { key: 'profile', icon: '👤' },
];

/** 화면 맨 아래 4개 탭 바. 탭 이름은 조직 설정(labels)에서 자유롭게 바꿀 수 있다. */
export default function BottomTabBar({
  active,
  labels,
  onChange,
}: {
  active: TabKey;
  labels: TabLabels;
  onChange: (key: TabKey) => void;
}) {
  return (
    <View style={styles.container}>
      {TAB_ICONS.map((tab) => {
        const selected = active === tab.key;
        return (
          <Pressable key={tab.key} style={styles.tabButton} onPress={() => onChange(tab.key)}>
            <Text style={[styles.icon, selected && styles.iconSelected]}>{tab.icon}</Text>
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {labels[tab.key]}
            </Text>
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
  tabButton: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 2 },
  icon: { fontSize: 20, opacity: 0.5 },
  iconSelected: { opacity: 1 },
  label: { fontSize: 10, color: '#9ca3af' },
  labelSelected: { color: '#4f46e5', fontWeight: '700' },
});
