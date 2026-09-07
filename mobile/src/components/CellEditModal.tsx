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
import FileAttachButton from './FileAttachButton';
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

/** 품목 하나에 속한 일정(분류+만료일+알람주기) 한 건의 편집용 폼 상태. */
interface ScheduleForm {
  key: string; // React key (신규/기존 공용)
  id: string | null; // 기존 일정의 DB id, 신규면 null
  category: string;
  dueDate: Date | null;
  remindValue: string;
  remindUnit: TimeUnit;
  customValues: Record<string, string>;
}

let nextTempKey = 1;
function makeSchedule(partial?: Partial<ScheduleForm>): ScheduleForm {
  return {
    key: `new-${nextTempKey++}`,
    id: null,
    category: '보험',
    dueDate: null,
    remindValue: '7',
    remindUnit: 'day',
    customValues: {},
    ...partial,
  };
}

/** 품목(item) 하나를 생성/편집하는 모달. 한 품목에 여러 개의 일정(보험/검사 등)을 추가/삭제할 수 있다. */
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
  const [assigneeId, setAssigneeId] = useState<string | null>(item?.assignee_user_id ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(item?.photo_url ?? null);
  const [schedules, setSchedules] = useState<ScheduleForm[]>(() =>
    item && item.schedules.length > 0
      ? item.schedules.map((s) =>
          makeSchedule({
            id: s.id,
            category: s.category,
            dueDate: s.due_date ? new Date(s.due_date) : null,
            remindValue: String(s.remind_before_value),
            remindUnit: s.remind_before_unit,
            customValues: Object.fromEntries(
              Object.entries(s.custom_fields ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)])
            ),
          })
        )
      : [makeSchedule()]
  );
  const [deletedScheduleIds, setDeletedScheduleIds] = useState<string[]>([]);
  const [datePickerFor, setDatePickerFor] = useState<string | null>(null); // 날짜 선택 중인 schedule의 key
  const [saving, setSaving] = useState(false);

  function updateSchedule(key: string, patch: Partial<ScheduleForm>) {
    setSchedules((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addScheduleFromExtraction(fields: ExtractedDocumentFields) {
    const newSchedule = makeSchedule({
      category: fields.category ?? '보험',
      dueDate: fields.due_date ? new Date(fields.due_date) : null,
      customValues: {
        issuer: fields.issuer ?? '',
        amount: fields.amount != null ? String(fields.amount) : '',
        policy_or_document_number: fields.policy_or_document_number ?? '',
      },
    });
    setItemName((prev) => prev || fields.item_name);
    // 비어있는 첫 일정이 있으면 그 자리를 채우고, 아니면 새 카드로 추가한다.
    setSchedules((prev) => {
      const firstEmptyIdx = prev.findIndex((s) => !s.dueDate && s.id === null);
      if (firstEmptyIdx !== -1) {
        const next = [...prev];
        next[firstEmptyIdx] = { ...next[firstEmptyIdx], ...newSchedule, key: next[firstEmptyIdx].key };
        return next;
      }
      return [...prev, newSchedule];
    });
  }

  function handleOcrExtracted(fields: ExtractedDocumentFields, storagePath: string) {
    setPhotoUrl(storagePath);
    addScheduleFromExtraction(fields);
    Alert.alert(
      '자동 인식 완료',
      `신뢰도: ${fields.confidence}\n일정 카드가 자동으로 채워졌습니다. 확인 후 저장해주세요.`
    );
  }

  function handleFileExtracted(fields: ExtractedDocumentFields, fileName: string) {
    addScheduleFromExtraction(fields);
    Alert.alert(
      '자동 인식 완료',
      `"${fileName}" 분석 완료 (신뢰도: ${fields.confidence})\n일정 카드가 자동으로 채워졌습니다. 확인 후 저장해주세요.`
    );
  }

  function handleAddSchedule() {
    setSchedules((prev) => [...prev, makeSchedule()]);
  }

  function handleRemoveSchedule(key: string) {
    const target = schedules.find((s) => s.key === key);
    if (schedules.length <= 1) {
      Alert.alert('삭제 불가', '최소 1개의 일정은 있어야 합니다.');
      return;
    }
    if (target?.id) {
      setDeletedScheduleIds((prev) => [...prev, target.id!]);
    }
    setSchedules((prev) => prev.filter((s) => s.key !== key));
  }

  async function handleSave() {
    if (!itemName.trim()) {
      Alert.alert('입력 필요', '항목명을 입력해주세요.');
      return;
    }
    if (schedules.length === 0) {
      Alert.alert('입력 필요', '분류/날짜를 1개 이상 추가해주세요.');
      return;
    }

    setSaving(true);
    try {
      const itemPayload = {
        org_id: orgId,
        item_name: itemName.trim(),
        assignee_user_id: assigneeId,
        photo_url: photoUrl,
      };

      let itemId = item?.id;
      if (isNew) {
        const { data: createdItem, error: itemError } = await supabase
          .from('items')
          .insert(itemPayload)
          .select()
          .single();
        if (itemError) throw itemError;
        itemId = createdItem.id;
      } else {
        const { error: itemError } = await supabase.from('items').update(itemPayload).eq('id', item!.id);
        if (itemError) throw itemError;
      }

      for (const s of schedules) {
        const schedulePayload = {
          item_id: itemId,
          category: s.category,
          due_date: s.dueDate ? s.dueDate.toISOString().slice(0, 10) : null,
          remind_before_value: Number(s.remindValue) || 7,
          remind_before_unit: s.remindUnit,
          custom_fields: Object.fromEntries(Object.entries(s.customValues).filter(([, v]) => v !== '')),
        };
        const query = s.id
          ? supabase.from('item_schedules').update(schedulePayload).eq('id', s.id)
          : supabase.from('item_schedules').insert(schedulePayload);
        const { error: scheduleError } = await query;
        if (scheduleError) throw scheduleError;
      }

      if (deletedScheduleIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('item_schedules')
          .delete()
          .in('id', deletedScheduleIds);
        if (deleteError) throw deleteError;
      }

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
        <FileAttachButton onExtracted={handleFileExtracted} />

        <Field label="항목명">
          <TextInput
            style={styles.input}
            value={itemName}
            onChangeText={setItemName}
            placeholder="예: 자동차 (보험+검사 함께 관리)"
          />
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

        <View style={styles.scheduleSectionHeader}>
          <Text style={styles.scheduleSectionTitle}>분류 · 날짜 ({schedules.length}개)</Text>
          <Pressable style={styles.addScheduleButton} onPress={handleAddSchedule}>
            <Text style={styles.addScheduleButtonText}>+ 분류/날짜 추가</Text>
          </Pressable>
        </View>

        {schedules.map((s, idx) => (
          <View key={s.key} style={styles.scheduleCard}>
            <View style={styles.scheduleCardHeader}>
              <Text style={styles.scheduleCardTitle}>일정 {idx + 1}</Text>
              {schedules.length > 1 && (
                <Pressable onPress={() => handleRemoveSchedule(s.key)}>
                  <Text style={styles.removeScheduleText}>🗑️ 삭제</Text>
                </Pressable>
              )}
            </View>

            <Field label="분류">
              <View style={styles.chipRow}>
                {CATEGORY_OPTIONS.map((opt) => (
                  <Chip
                    key={opt}
                    label={opt}
                    selected={s.category === opt}
                    onPress={() => updateSchedule(s.key, { category: opt })}
                  />
                ))}
              </View>
            </Field>

            <Field label="만료일 / 납입일">
              <Pressable style={styles.input} onPress={() => setDatePickerFor(s.key)}>
                <Text>{s.dueDate ? s.dueDate.toISOString().slice(0, 10) : '날짜 선택'}</Text>
              </Pressable>
              {datePickerFor === s.key && (
                <DateTimePicker
                  value={s.dueDate ?? new Date()}
                  mode="date"
                  onChange={(_e, selected) => {
                    setDatePickerFor(null);
                    if (selected) updateSchedule(s.key, { dueDate: selected });
                  }}
                />
              )}
            </Field>

            <Field label="알람 주기 (만료 전 알림 시점)">
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  value={s.remindValue}
                  onChangeText={(v) => updateSchedule(s.key, { remindValue: v })}
                  keyboardType="number-pad"
                />
                <View style={styles.chipRow}>
                  {TIME_UNIT_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.value}
                      label={opt.label}
                      selected={s.remindUnit === opt.value}
                      onPress={() => updateSchedule(s.key, { remindUnit: opt.value })}
                    />
                  ))}
                </View>
              </View>
            </Field>

            {customFieldDefs
              .filter((f) => f.is_active)
              .map((f) => (
                <Field key={f.field_key} label={f.label}>
                  <TextInput
                    style={styles.input}
                    value={s.customValues[f.field_key] ?? ''}
                    onChangeText={(v) =>
                      updateSchedule(s.key, { customValues: { ...s.customValues, [f.field_key]: v } })
                    }
                    keyboardType={f.field_type === 'number' ? 'numeric' : 'default'}
                  />
                </Field>
              ))}
          </View>
        ))}

        {!isNew && (
          <View style={styles.field}>
            <DocumentAttachments itemId={item!.id} />
          </View>
        )}
        {isNew && (
          <Text style={styles.newItemDocHint}>
            📎 위의 "파일 첨부" 버튼으로 지금 바로 자동 인식할 수 있습니다.{'\n'}
            파일 원본 보관은 항목을 먼저 저장한 뒤 다시 열어서 추가할 수 있습니다.
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
  scheduleSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  scheduleSectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  addScheduleButton: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  addScheduleButtonText: { color: '#4f46e5', fontSize: 12, fontWeight: '700' },
  scheduleCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    gap: 14,
    backgroundColor: '#f9fafb',
  },
  scheduleCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scheduleCardTitle: { fontSize: 13, fontWeight: '700', color: '#4f46e5' },
  removeScheduleText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
});
