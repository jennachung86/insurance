import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../lib/supabase';
import { deleteItemDocument, uploadItemDocument } from '../lib/documents';
import type { ItemDocument } from '../types';

// 구 file-extract-app이 지원하던 포맷 그대로.
const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/x-hwp',
  'application/haansofthwp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/plain',
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function extOf(name: string): string {
  return (name.split('.').pop() || '').toUpperCase();
}

/**
 * 항목에 첨부된 일반 문서(PDF/엑셀/HWP/워드/TXT) 목록 + 업로드/미리보기/다운로드/삭제.
 * 구 file-extract-app의 "업로드 즉시 텍스트 추출 + 미리보기" 기능을 항목 편집 화면 안으로 흡수한 것.
 * 사진(OCR) 첨부와 달리 셀을 자동으로 채우지 않고, 원문 텍스트를 그대로 보여준다.
 */
export default function DocumentAttachments({ itemId }: { itemId: string }) {
  const [documents, setDocuments] = useState<ItemDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    const { data, error } = await supabase
      .from('item_documents')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });
    if (!error) setDocuments(data ?? []);
    setLoading(false);
  }, [itemId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handlePick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: DOCUMENT_MIME_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const doc = await uploadItemDocument({
        uri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        itemId,
      });
      setDocuments((prev) => [doc, ...prev]);
      setExpandedId(doc.id);
    } catch (err) {
      Alert.alert('업로드 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: ItemDocument) {
    Alert.alert('삭제 확인', `"${doc.original_name}" 파일을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteItemDocument(doc.id);
            setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
          } catch (err) {
            Alert.alert('삭제 실패', err instanceof Error ? err.message : String(err));
          }
        },
      },
    ]);
  }

  async function handleDownload(doc: ItemDocument) {
    const { data, error } = await supabase.storage
      .from('item-documents')
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) {
      Alert.alert('다운로드 실패', error?.message ?? '다운로드 링크를 생성하지 못했습니다.');
      return;
    }
    Linking.openURL(data.signedUrl);
  }

  async function handleCopy(doc: ItemDocument) {
    if (!doc.extracted_text) return;
    await Clipboard.setStringAsync(doc.extracted_text);
    setCopiedId(doc.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>첨부 문서 ({documents.length})</Text>
        <Pressable style={styles.uploadButton} onPress={handlePick} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.uploadButtonText}>📎 파일 첨부</Text>
          )}
        </Pressable>
      </View>
      <Text style={styles.hint}>PDF · Excel · HWP · Word · TXT 지원 - 업로드 즉시 텍스트가 추출됩니다.</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : documents.length === 0 ? (
        <Text style={styles.emptyText}>첨부된 문서가 없습니다.</Text>
      ) : (
        documents.map((doc) => {
          const expanded = expandedId === doc.id;
          return (
            <View key={doc.id} style={styles.docCard}>
              <Pressable
                style={styles.docRow}
                onPress={() => setExpandedId(expanded ? null : doc.id)}
              >
                <View style={styles.docIcon}>
                  <Text style={styles.docIconText}>{extOf(doc.original_name)}</Text>
                </View>
                <View style={styles.docInfo}>
                  <Text style={styles.docName} numberOfLines={1}>
                    {doc.original_name}
                  </Text>
                  <Text style={styles.docMeta}>{formatBytes(doc.size)}</Text>
                </View>
                <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
              </Pressable>

              <View style={styles.docActions}>
                <Pressable onPress={() => handleDownload(doc)}>
                  <Text style={styles.actionText}>⬇️ 다운로드</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(doc)}>
                  <Text style={[styles.actionText, styles.deleteText]}>🗑️ 삭제</Text>
                </Pressable>
              </View>

              {expanded && (
                <View style={styles.previewBox}>
                  <View style={styles.previewHeader}>
                    <Text style={styles.previewLabel}>추출된 텍스트</Text>
                    <Pressable onPress={() => handleCopy(doc)}>
                      <Text style={styles.copyText}>{copiedId === doc.id ? '복사됨 ✓' : '복사하기'}</Text>
                    </Pressable>
                  </View>
                  <ScrollView style={styles.previewScroll} nestedScrollEnabled>
                    <Text style={styles.previewText}>
                      {doc.extracted_text || '(추출된 텍스트가 없습니다.)'}
                    </Text>
                  </ScrollView>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 13, fontWeight: '700', color: '#374151' },
  uploadButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  uploadButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  hint: { fontSize: 11, color: '#9ca3af' },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  docCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  docIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIconText: { fontSize: 10, fontWeight: '700', color: '#4f46e5' },
  docInfo: { flex: 1, minWidth: 0 },
  docName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  docMeta: { fontSize: 11, color: '#9ca3af' },
  chevron: { fontSize: 11, color: '#9ca3af' },
  docActions: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  actionText: { fontSize: 12, color: '#4f46e5', fontWeight: '600' },
  deleteText: { color: '#dc2626' },
  previewBox: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  previewLabel: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  copyText: { fontSize: 11, color: '#4f46e5', fontWeight: '600' },
  previewScroll: { maxHeight: 160 },
  previewText: { fontSize: 12, color: '#374151', fontFamily: 'monospace' },
});
