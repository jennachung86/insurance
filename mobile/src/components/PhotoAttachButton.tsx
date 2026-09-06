import React, { useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadPhotoForOcr } from '../lib/ocr';
import type { ExtractedDocumentFields } from '../types';

interface Props {
  orgId: string;
  itemId?: string; // 기존 항목에 재첨부하는 경우
  currentPhotoUrl?: string | null;
  onExtracted: (fields: ExtractedDocumentFields, storagePath: string) => void;
}

/**
 * '사진 첨부' 버튼 - 클릭 시 카메라 촬영 / 갤러리 선택을 고르게 하고,
 * 선택된 사진을 백엔드로 업로드해 Claude OCR 결과를 상위 컴포넌트로 전달한다.
 */
export default function PhotoAttachButton({ orgId, itemId, currentPhotoUrl, onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null);

  async function handlePick(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('권한 필요', '사진 접근 권한을 허용해주세요.');
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, base64: false })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: false });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setLocalPreviewUri(asset.uri);
    setLoading(true);
    try {
      const { extracted_fields, storage_path } = await uploadPhotoForOcr({
        uri: asset.uri,
        fileName: asset.fileName ?? `photo-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        orgId,
        itemId,
      });
      onExtracted(extracted_fields, storage_path);
    } catch (err) {
      Alert.alert('OCR 실패', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function openChooser() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['취소', '카메라로 촬영', '갤러리에서 선택'], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) handlePick('camera');
          if (index === 2) handlePick('library');
        }
      );
    } else {
      Alert.alert('사진 첨부', '방법을 선택하세요', [
        { text: '카메라로 촬영', onPress: () => handlePick('camera') },
        { text: '갤러리에서 선택', onPress: () => handlePick('library') },
        { text: '취소', style: 'cancel' },
      ]);
    }
  }

  const previewUri = localPreviewUri ?? currentPhotoUrl ?? null;

  return (
    <View style={styles.container}>
      <Pressable style={styles.button} onPress={openChooser} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>📷 사진 첨부 (자동 인식)</Text>
        )}
      </Pressable>
      {previewUri ? <Image source={{ uri: previewUri }} style={styles.preview} /> : null}
      {loading ? <Text style={styles.hint}>Claude로 문서를 분석하는 중입니다...</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  preview: { width: '100%', height: 160, borderRadius: 10, backgroundColor: '#eee' },
  hint: { fontSize: 12, color: '#6366f1', textAlign: 'center' },
});
