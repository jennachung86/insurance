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

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    if (res.status === 502 || res.status === 504) {
      throw new Error('서버 응답이 너무 오래 걸려 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    }
    throw new Error(`서버에서 올바르지 않은 응답을 받았습니다. (상태 코드: ${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data.error || 'OCR 처리에 실패했습니다.');
  }
  return data;
}
