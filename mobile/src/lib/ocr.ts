import { API_BASE_URL, getAccessToken } from './supabase';
import { uploadMultipart } from './upload';
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

  const fields: Record<string, string> = {};
  if (params.orgId) fields.org_id = params.orgId;
  if (params.itemId) fields.item_id = params.itemId;

  return uploadMultipart({
    url: `${API_BASE_URL}/api/ocr/parse`,
    uri: params.uri,
    fieldName: 'photo',
    mimeType: params.mimeType,
    token,
    fields,
  });
}
