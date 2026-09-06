import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import PhotoAttachButton from './PhotoAttachButton';
import DocumentAttachments from './DocumentAttachments';
import type { CustomFieldDefinition, ExtractedDocumentFields, OrgMember, ScheduleItem, TimeUnit } from '../types';

interface Props {
  visible: boolean;
  orgId: string;
  item: ScheduleItem | null; // null이면 신규 생성 모드
  members: OrgMember[];
  customFieldDefs: CustomFieldDefinition[];
  onClose: () => void;
  onSaved: () => void; // 저장 후 목록 새로고침 트리거
}

const CATEGORY_OPTIONS = ['보험', '검사', '기타'];
const TIME_UNIT_OPTIONS: { value: TimeUnit; label: string }[] = [
  { value: 'hour', label: '시간' },
  { value: 'day', label: '일' },
  { value: 'week', label: '주' },
];

/** 항목(셀) 하나를 생성/편집하는 모달. 사진 첨부 → OCR 자동 채움도 여기서 처리한다. */
export default function CellEditModal({
  visible,
  orgId,
  item,
  members,
  customFieldDefs,
  onClose,
  onSaved,
}: Props) {
  const isNew = item === null;

  const [itemName, setItemName] = useState(item?.item_name ?? '');
  const [category, setCategory] = useState(item?.category ?? '보험');
  const [dueDate, setDueDate] = useState<Date | null>(item?.due_date ? new Date(item.due_date) : null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [remindValue, setRemindValue] = useState(String(item?.remind_before_value ?? 7));
  const [remindUnit, setRemindUnit] = useState<TimeUnit>(item?.remind_before_unit ?? 'day');
  const [assigneeId, setAssigneeId] = useState<string | null>(item?.assignee_user_id ?? null);
  const [customValues, setCustomValues] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(item?.custom_fields ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)])
    )
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(item?.photo_url ?? null);
  const [saving, setSaving] = useState(false);

  function handleOcrExtracted(fields: ExtractedDocumentFields, storagePath: string) {
    // 사용자가 검토할 수 있도록 폼 입력값만 채우고, 저장은 '저장' 버튼으로 명시적으로 한다.
    setItemName((prev) => prev || fields.item_name);
    setCategory(fields.category ?? category);
    if (fields.due_date) setDueDate(new Date(fields.due_date));
    setPhotoUrl(storagePath);
    setCustomValues((prev) => ({
      ...prev,
      issuer: prev.issuer || fields.issuer || '',
      amount: prev.amount || (fields.amount != null ? String(fields.amount) : ''),
      policy_or_document_number: prev.policy_or_document_number || fields.policy_or_document_number || '',
    }));
    Alert.alert(
      '자동 인식 완료',
      `신뢰도: ${fields.confidence}\n항목명/만료일 등이 자동으로 채워졌습니다. 확인 후 저장해주세요.`
    );
  }

  async function handleSave() {
    if (!itemName.trim()) {
      Alert.alert('입력 필요', '항목명을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        org_id: orgId,
        item_name: itemName.trim(),
        category,
        due_date: dueDate ? dueDate.toISOString().slice(0, 10) : null,
        remind_before_value: Number(remindValue) || 7,
        remind_before_unit: remindUnit,
        assignee_user_id: assigneeId,
        photo_url: photoUrl,
        custom_fields: Object.fromEntries(
          Object.entries(customValues).filter(([, v]) => v !== '')
        ),
      };

      const query = isNew
        ? supabase.from('items').insert(payload)
        : supabase.from('items').update(payload).eq('id', item!.id);

      const { error } = await query;
      if (error) throw error;

      onSaved();
      onClose();
    } catch (err) {
      Alert.alert('저장 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.header}>
        <Pressable onPress={onClose}>
          <Text style={styles.headerButton}>취소</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{isNew ? '새 항목 추가' : '항목 편집'}</Text>
        <Pressable onPress={handleSave} disabled={saving}>
          <Text style={[styles.headerButton, styles.saveButton]}>{saving ? '저장 중...' : '저장'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <PhotoAttachButton
          orgId={orgId}
          itemId={item?.id}
          currentPhotoUrl={photoUrl}
          onExtracted={handleOcrExtracted}
        />

        <Field label="항목명">
          <TextInput
            style={styles.input}
            value={itemName}
            onChangeText={setItemName}
            placeholder="예: 자동차보험 (삼성화재)"
          />
        </Field>

        <Field label="분류">
          <View style={styles.chipRow}>
            {CATEGORY_OPTIONS.map((opt) => (
              <Chip key={opt} label={opt} selected={category === opt} onPress={() => setCategory(opt)} />
            ))}
          </View>
        </Field>

        <Field label="만료일 / 납입일">
          <Pressable style={styles.input} onPress={() => setShowDatePicker(true)}>
            <Text>{dueDate ? dueDate.toISOString().slice(0, 10) : '날짜 선택'}</Text>
          </Pressable>
          {showDatePicker && (
            <DateTimePicker
              value={dueDate ?? new Date()}
              mode="date"
              onChange={(_e, selected) => {
                setShowDatePicker(false);
                if (selected) setDueDate(selected);
              }}
            />
          )}
        </Field>

        <Field label="알람 주기 (만료 전 알림 시점)">
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.smallInput]}
              value={remindValue}
              onChangeText={setRemindValue}
              keyboardType="number-pad"
            />
            <View style={styles.chipRow}>
              {TIME_UNIT_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={remindUnit === opt.value}
                  onPress={() => setRemindUnit(opt.value)}
                />
              ))}
            </View>
          </View>
        </Field>

        <Field label="담당자">
          <View style={styles.chipRow}>
            {members.map((m) => (
              <Chip
                key={m.user_id}
                label={m.full_name}
                selected={assigneeId === m.user_id}
                onPress={() => setAssigneeId(assigneeId === m.user_id ? null : m.user_id)}
              />
            ))}
          </View>
        </Field>

        {customFieldDefs
          .filter((f) => f.is_active)
          .map((f) => (
            <Field key={f.field_key} label={f.label}>
              <TextInput
                style={styles.input}
                value={customValues[f.field_key] ?? ''}
                onChangeText={(v) => setCustomValues((prev) => ({ ...prev, [f.field_key]: v }))}
                keyboardType={f.field_type === 'number' ? 'numeric' : 'default'}
              />
            </Field>
          ))}

        {!isNew && (
          <View style={styles.field}>
            <DocumentAttachments itemId={item!.id} />
          </View>
        )}
        {isNew && (
          <Text style={styles.newItemDocHint}>
            📎 파일(PDF·엑셀·HWP·워드·TXT) 첨부는 항목을 먼저 저장한 뒤 다시 열어서 추가할 수 있습니다.
          </Text>
        )}
      </ScrollView>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipSelected]} onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
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
  headerButton: { fontSize: 15, color: '#6b7280' },
  saveButton: { color: '#4f46e5', fontWeight: '700' },
  body: { padding: 16, gap: 16, paddingBottom: 48 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    justifyContent: 'center',
  },
  smallInput: { width: 70, marginRight: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  newItemDocHint: { fontSize: 12, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },
});
