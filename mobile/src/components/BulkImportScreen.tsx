import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../lib/supabase';
import { analyzeItemDocumentBulk } from '../lib/documents';
import type { CategoryOption, ExtractedDocumentFields } from '../types';

const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/x-hwp',
  'application/haansofthwp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/plain',
];

interface Props {
  visible: boolean;
  orgId: string;
  categoryOptions: CategoryOption[];
  onClose: () => void;
  onImported: () => void; // 등록 완료 후 목록 새로고침
}

interface DraftRow extends ExtractedDocumentFields {
  selected: boolean;
}

/**
 * 엑셀/명단 파일 하나에 담긴 여러 건(장비/차량/계약 등)을 한 번에 분석해
 * 미리보기 리스트로 보여주고, 선택한 항목들을 일괄 등록한다.
 */
export default function BulkImportScreen({ visible, orgId, categoryOptions, onClose, onImported }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  function reset() {
    setRows([]);
    setFileName(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handlePick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: DOCUMENT_MIME_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setFileName(asset.name);
    setAnalyzing(true);
    setRows([]);
    try {
      const items = await analyzeItemDocumentBulk({
        uri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
      });
      if (items.length === 0) {
        Alert.alert('인식 결과 없음', '파일에서 등록할 항목을 찾지 못했습니다.');
      }
      setRows(items.map((item) => ({ ...item, selected: true })));
    } catch (err) {
      Alert.alert('분석 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleRow(idx: number) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r)));
  }

  function toggleAll(value: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, selected: value })));
  }

  async function handleImport() {
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) {
      Alert.alert('선택 필요', '등록할 항목을 1개 이상 선택해주세요.');
      return;
    }

    setImporting(true);
    try {
      // 새로 등장한 분류명이 있으면 분류 관리 목록에도 추가해준다.
      const existingLabels = new Set(categoryOptions.map((c) => c.label));
      const newLabels = [
        ...new Set(selected.map((r) => r.category || '기타').filter((label) => !existingLabels.has(label))),
      ];
      if (newLabels.length > 0) {
        await supabase.from('category_options').insert(
          newLabels.map((label, i) => ({ org_id: orgId, label, sort_order: categoryOptions.length + i }))
        );
      }

      let successCount = 0;
      for (const row of selected) {
        const { data: createdItem, error: itemError } = await supabase
          .from('items')
          .insert({ org_id: orgId, item_name: row.item_name || '이름없음' })
          .select()
          .single();
        if (itemError || !createdItem) continue;

        const { error: scheduleError } = await supabase.from('item_schedules').insert({
          item_id: createdItem.id,
          category: row.category || '기타',
          due_date: row.due_date,
          remind_before_value: 7,
          remind_before_unit: 'day',
          custom_fields: Object.fromEntries(
            Object.entries({
              issuer: row.issuer,
              amount: row.amount != null ? String(row.amount) : null,
              policy_or_document_number: row.policy_or_document_number,
              notes: row.notes,
            }).filter(([, v]) => v != null && v !== '')
          ),
        });
        if (!scheduleError) successCount++;
      }

      Alert.alert('등록 완료', `${successCount}개 항목이 등록되었습니다.`);
      onImported();
      handleClose();
    } catch (err) {
      Alert.alert('등록 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.header}>
        <Pressable onPress={handleClose}>
          <Text style={styles.headerButton}>닫기</Text>
        </Pressable>
        <Text style={styles.headerTitle}>엑셀·명단 일괄 등록</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.hint}>
          장비 목록, 차량 명단 같이 여러 건이 담긴 파일 하나를 올리면, 각 행을 자동으로 인식해 한 번에 등록할 수
          있습니다.
        </Text>

        <Pressable style={styles.pickButton} onPress={handlePick} disabled={analyzing}>
          {analyzing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.pickButtonText}>📊 파일 선택해서 분석하기</Text>
          )}
        </Pressable>
        {fileName && !analyzing && <Text style={styles.fileNameText}>선택된 파일: {fileName}</Text>}
        {analyzing && <Text style={styles.fileNameText}>Claude가 표 전체를 분석하는 중입니다...</Text>}

        {rows.length > 0 && (
          <>
            <View style={styles.selectAllRow}>
              <Text style={styles.resultCount}>
                인식된 항목 {rows.length}개 중 {selectedCount}개 선택됨
              </Text>
              <View style={styles.selectAllButtons}>
                <Pressable onPress={() => toggleAll(true)}>
                  <Text style={styles.selectAllText}>전체선택</Text>
                </Pressable>
                <Pressable onPress={() => toggleAll(false)}>
                  <Text style={styles.selectAllText}>전체해제</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView style={styles.list}>
              {rows.map((row, idx) => (
                <Pressable
                  key={idx}
                  style={[styles.rowCard, row.selected && styles.rowCardSelected]}
                  onPress={() => toggleRow(idx)}
                >
                  <View style={[styles.checkbox, row.selected && styles.checkboxChecked]}>
                    {row.selected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {row.item_name || '이름없음'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {row.category || '기타'} {row.due_date ? `· ${row.due_date}` : '· 날짜없음'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable style={styles.importButton} onPress={handleImport} disabled={importing}>
              {importing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.importButtonText}>선택한 {selectedCount}개 항목 등록</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </Modal>
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
  body: { flex: 1, padding: 16, gap: 12 },
  hint: { fontSize: 12, color: '#6b7280' },
  pickButton: {
    backgroundColor: '#0d9488',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  fileNameText: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
  selectAllRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  resultCount: { fontSize: 13, fontWeight: '700', color: '#111827' },
  selectAllButtons: { flexDirection: 'row', gap: 14 },
  selectAllText: { fontSize: 12, color: '#4f46e5', fontWeight: '600' },
  list: { flex: 1 },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  rowCardSelected: { borderColor: '#c7d2fe', backgroundColor: '#eef2ff' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  rowMeta: { fontSize: 12, color: '#6b7280' },
  importButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  importButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
