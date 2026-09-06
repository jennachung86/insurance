import { API_BASE_URL, getAccessToken } from './supabase';
import type { ExtractedDocumentFields } from '../types';

interface ParsePhotoResult {
  extraction_id: string | null;
  storage_path: string;
  extracted_fields: ExtractedDocumentFields;
}

/**
 * 카메라/갤러리에서 고른 사진을 백엔드로 업로드하여 Claude OCR 파싱 결과를 받는다.
 * uri는 expo-image-picker 결과의 asset.uri.
 */
export async function uploadPhotoForOcr(params: {
  uri: string;
  fileName: string;
  mimeType: string;
  orgId?: string;
  itemId?: string;
}): Promise<ParsePhotoResult> {
  const token = await getAccessToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const form = new FormData();
  // React Native FormData는 { uri, name, type } 형태의 객체를 파일로 받는다.
  form.append('photo', {
    uri: params.uri,
    name: params.fileName,
    type: params.mimeType,
  } as unknown as Blob);
  if (params.orgId) form.append('org_id', params.orgId);
  if (params.itemId) form.append('item_id', params.itemId);

  const res = await fetch(`${API_BASE_URL}/api/ocr/parse`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'OCR 처리에 실패했습니다.');
  }
  return data;
}
