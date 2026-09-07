import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { CategoryOption, CustomFieldDefinition, CustomFieldType, TabLabels } from '../types';

interface Props {
  visible: boolean;
  orgId: string;
  isManager: boolean; // master/manager만 편집 가능
  categoryOptions: CategoryOption[];
  customFieldDefs: CustomFieldDefinition[];
  tabLabels: TabLabels;
  onClose: () => void;
  onChanged: () => void; // 저장 후 부모 화면 새로고침
}

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: '텍스트' },
  { value: 'number', label: '숫자' },
  { value: 'date', label: '날짜' },
];

/** 조직 설정 화면: 분류(카테고리) 자유 편집 + 커스텀 항목(컬럼) 추가 + 하단 탭 이름 변경. */
export default function SettingsScreen({
  visible,
  orgId,
  isManager,
  categoryOptions,
  customFieldDefs,
  tabLabels,
  onClose,
  onChanged,
}: Props) {
  const [newCategory, setNewCategory] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('text');
  const [tabLabelDraft, setTabLabelDraft] = useState<TabLabels>(tabLabels);
  const [saving, setSaving] = useState(false);

  async function handleAddCategory() {
    const label = newCategory.trim();
    if (!label) return;
    const { error } = await supabase.from('category_options').insert({
      org_id: orgId,
      label,
      sort_order: categoryOptions.length,
    });
    if (error) {
      Alert.alert('추가 실패', error.message);
      return;
    }
    setNewCategory('');
    onChanged();
  }

  function handleDeleteCategory(opt: CategoryOption) {
    Alert.alert('분류 삭제', `"${opt.label}" 분류를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('category_options').delete().eq('id', opt.id);
          if (error) {
            Alert.alert('삭제 실패', error.message);
            return;
          }
          onChanged();
        },
      },
    ]);
  }

  async function handleAddField() {
    const label = newFieldLabel.trim();
    if (!label) return;
    const fieldKey = `custom_${Date.now()}`;
    const { error } = await supabase.from('custom_field_definitions').insert({
      org_id: orgId,
      field_key: fieldKey,
      label,
      field_type: newFieldType,
      sort_order: customFieldDefs.length,
    });
    if (error) {
      Alert.alert('추가 실패', error.message);
      return;
    }
    setNewFieldLabel('');
    setNewFieldType('text');
    onChanged();
  }

  async function handleToggleField(field: CustomFieldDefinition) {
    const { error } = await supabase
      .from('custom_field_definitions')
      .update({ is_active: !field.is_active })
      .eq('id', field.id);
    if (error) {
      Alert.alert('변경 실패', error.message);
      return;
    }
    onChanged();
  }

  function handleDeleteField(field: CustomFieldDefinition) {
    Alert.alert('항목 삭제', `"${field.label}" 항목을 삭제할까요? 기존에 입력된 값도 더 이상 보이지 않게 됩니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('custom_field_definitions').delete().eq('id', field.id);
          if (error) {
            Alert.alert('삭제 실패', error.message);
            return;
          }
          onChanged();
        },
      },
    ]);
  }

  async function handleSaveTabLabels() {
    setSaving(true);
    const { error } = await supabase.from('organizations').update({ tab_labels: tabLabelDraft }).eq('id', orgId);
    setSaving(false);
    if (error) {
      Alert.alert('저장 실패', error.message);
      return;
    }
    Alert.alert('저장 완료', '탭 이름이 변경되었습니다.');
    onChanged();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.header}>
        <Pressable onPress={onClose}>
          <Text style={styles.headerButton}>닫기</Text>
        </Pressable>
        <Text style={styles.headerTitle}>설정</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!isManager && (
          <Text style={styles.readOnlyHint}>
            현재 계정은 조회만 가능합니다. 편집은 관리자(마스터/매니저)만 할 수 있습니다.
          </Text>
        )}

        {/* 1. 분류(카테고리) 관리 */}
        <Section title="분류 관리" desc="일정에서 선택하는 '보험/검사/기타' 같은 분류를 자유롭게 추가·삭제합니다.">
          <View style={styles.chipRow}>
            {categoryOptions.map((opt) => (
              <View key={opt.id} style={styles.editableChip}>
                <Text style={styles.editableChipText}>{opt.label}</Text>
                {isManager && (
                  <Pressable onPress={() => handleDeleteCategory(opt)} hitSlop={8}>
                    <Text style={styles.editableChipRemove}>✕</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
          {isManager && (
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, styles.addInput]}
                placeholder="새 분류 이름 (예: 렌탈비)"
                value={newCategory}
                onChangeText={setNewCategory}
              />
              <Pressable style={styles.addButton} onPress={handleAddCategory}>
                <Text style={styles.addButtonText}>추가</Text>
              </Pressable>
            </View>
          )}
        </Section>

        {/* 2. 커스텀 항목(컬럼) 관리 */}
        <Section title="커스텀 항목 관리" desc="항목명/분류/날짜 외에 원하는 정보(가격, 담당업체 등)를 자유롭게 추가합니다.">
          {customFieldDefs.map((field) => (
            <View key={field.id} style={styles.fieldRow}>
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <Text style={styles.fieldType}>
                  {FIELD_TYPE_OPTIONS.find((t) => t.value === field.field_type)?.label ?? field.field_type}
                </Text>
              </View>
              {isManager && (
                <View style={styles.fieldActions}>
                  <Switch value={field.is_active} onValueChange={() => handleToggleField(field)} />
                  <Pressable onPress={() => handleDeleteField(field)}>
                    <Text style={styles.removeText}>🗑️</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
          {customFieldDefs.length === 0 && <Text style={styles.emptyText}>추가된 커스텀 항목이 없습니다.</Text>}

          {isManager && (
            <View style={styles.newFieldBox}>
              <TextInput
                style={styles.input}
                placeholder="새 항목 이름 (예: 계약금액)"
                value={newFieldLabel}
                onChangeText={setNewFieldLabel}
              />
              <View style={styles.chipRow}>
                {FIELD_TYPE_OPTIONS.map((t) => (
                  <Pressable
                    key={t.value}
                    style={[styles.typeChip, newFieldType === t.value && styles.typeChipSelected]}
                    onPress={() => setNewFieldType(t.value)}
                  >
                    <Text style={[styles.typeChipText, newFieldType === t.value && styles.typeChipTextSelected]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.addButtonFull} onPress={handleAddField}>
                <Text style={styles.addButtonText}>+ 항목 추가</Text>
              </Pressable>
            </View>
          )}
        </Section>

        {/* 3. 탭 이름 변경 */}
        <Section title="하단 탭 이름 변경" desc="화면 아래 4개 탭의 이름을 본인 용도에 맞게 바꿉니다.">
          <TabLabelInput
            label="1번 탭 (기본: 업무 알림)"
            value={tabLabelDraft.upcoming}
            onChangeText={(v) => setTabLabelDraft((prev) => ({ ...prev, upcoming: v }))}
            editable={isManager}
          />
          <TabLabelInput
            label="2번 탭 (기본: 캘린더)"
            value={tabLabelDraft.calendar}
            onChangeText={(v) => setTabLabelDraft((prev) => ({ ...prev, calendar: v }))}
            editable={isManager}
          />
          <TabLabelInput
            label="3번 탭 (기본: 작업추적/기록)"
            value={tabLabelDraft.tracking}
            onChangeText={(v) => setTabLabelDraft((prev) => ({ ...prev, tracking: v }))}
            editable={isManager}
          />
          <TabLabelInput
            label="4번 탭 (기본: 내 정보)"
            value={tabLabelDraft.profile}
            onChangeText={(v) => setTabLabelDraft((prev) => ({ ...prev, profile: v }))}
            editable={isManager}
          />
          {isManager && (
            <Pressable style={styles.addButtonFull} onPress={handleSaveTabLabels} disabled={saving}>
              <Text style={styles.addButtonText}>{saving ? '저장 중...' : '탭 이름 저장'}</Text>
            </Pressable>
          )}
        </Section>
      </ScrollView>
    </Modal>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDesc}>{desc}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function TabLabelInput({
  label,
  value,
  onChangeText,
  editable,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  editable: boolean;
}) {
  return (
    <View style={styles.tabLabelRow}>
      <Text style={styles.tabLabelCaption}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} editable={editable} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerButton: { fontSize: 15, color: '#4f46e5', fontWeight: '600' },
  body: { padding: 16, gap: 24, paddingBottom: 60 },
  readOnlyHint: {
    fontSize: 12,
    color: '#b45309',
    backgroundColor: '#fffbeb',
    padding: 10,
    borderRadius: 8,
  },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  sectionDesc: { fontSize: 12, color: '#9ca3af' },
  sectionBody: { gap: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editableChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  editableChipText: { fontSize: 13, color: '#4f46e5', fontWeight: '600' },
  editableChipRemove: { fontSize: 12, color: '#818cf8', fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  addButton: { backgroundColor: '#4f46e5', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  addButtonFull: {
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
  },
  fieldInfo: { gap: 2 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  fieldType: { fontSize: 11, color: '#9ca3af' },
  fieldActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  removeText: { fontSize: 16 },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },
  newFieldBox: {
    gap: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  typeChipSelected: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  typeChipText: { fontSize: 12, color: '#374151' },
  typeChipTextSelected: { color: '#fff', fontWeight: '600' },
  tabLabelRow: { gap: 4 },
  tabLabelCaption: { fontSize: 11, color: '#9ca3af' },
});
