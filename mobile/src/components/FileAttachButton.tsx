import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { analyzeItemDocument } from '../lib/documents';
import type { ExtractedDocumentFields } from '../types';

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
  onExtracted: (fields: ExtractedDocumentFields, fileName: string) => void;
}

/**
 * '파일 첨부' 버튼 - PDF/엑셀/HWP/워드/TXT를 선택하면 Claude로 분석해
 * 사진 첨부(OCR)와 동일하게 항목명/분류/만료일 등 필드를 자동으로 채워준다.
 * 항목을 아직 저장하지 않은 신규 생성 화면에서도 사용 가능 (분석만 하고 파일 자체는 저장하지 않음).
 */
export default function FileAttachButton({ onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handlePick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: DOCUMENT_MIME_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setFileName(asset.name);
    setLoading(true);
    try {
      const fields = await analyzeItemDocument({
        uri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
      });
      onExtracted(fields, asset.name);
    } catch (err) {
      Alert.alert('분석 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.button} onPress={handlePick} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>📎 파일 첨부 (자동 인식)</Text>
        )}
      </Pressable>
      <Text style={styles.hint}>
        {loading
          ? 'Claude로 문서를 분석하는 중입니다...'
          : fileName
            ? `선택된 파일: ${fileName}`
            : 'PDF · Excel · HWP · Word · TXT 지원'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  button: {
    backgroundColor: '#0d9488',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  hint: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
});
