import { API_BASE_URL, getAccessToken } from './supabase';
import type { ExtractedDocumentFields, ItemDocument } from '../types';

/**
 * 문서 파일(.pdf/.xlsx/.xls/.hwp/.docx/.txt)을 Claude로 분석해
 * 항목명/분류/만료일 등 구조화된 필드를 자동으로 추출한다.
 * 사진 OCR과 동일하게, 항목을 아직 저장하지 않은 신규 생성 화면에서도 사용할 수 있다.
 */
export async function analyzeItemDocument(params: {
  uri: string;
  fileName: string;
  mimeType: string;
}): Promise<ExtractedDocumentFields> {
  const token = await getAccessToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const form = new FormData();
  form.append('file', {
    uri: params.uri,
    name: params.fileName,
    type: params.mimeType,
  } as unknown as Blob);

  const res = await fetch(`${API_BASE_URL}/api/documents/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '문서 분석에 실패했습니다.');
  }
  return data.extracted_fields as ExtractedDocumentFields;
}

/**
 * 여러 건이 나열된 표 형태 문서(장비 목록, 차량 명단 등)를 Claude로 한 번에 분석해
 * 항목 배열로 추출한다. analyzeItemDocument와 달리 한 파일에서 여러 항목을 뽑아낸다.
 */
export async function analyzeItemDocumentBulk(params: {
  uri: string;
  fileName: string;
  mimeType: string;
}): Promise<ExtractedDocumentFields[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const form = new FormData();
  form.append('file', {
    uri: params.uri,
    name: params.fileName,
    type: params.mimeType,
  } as unknown as Blob);

  const res = await fetch(`${API_BASE_URL}/api/documents/bulk-analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '문서 일괄 분석에 실패했습니다.');
  }
  return data.items as ExtractedDocumentFields[];
}

/**
 * 문서 파일(.pdf/.xlsx/.xls/.hwp/.docx/.txt)을 백엔드로 업로드해
 * 텍스트 추출까지 마친 뒤 저장된 첨부 레코드를 받는다.
 * uri/name/mimeType은 expo-document-picker 결과의 asset 값을 그대로 넘기면 된다.
 */
export async function uploadItemDocument(params: {
  uri: string;
  fileName: string;
  mimeType: string;
  itemId: string;
}): Promise<ItemDocument> {
  const token = await getAccessToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const form = new FormData();
  form.append('file', {
    uri: params.uri,
    name: params.fileName,
    type: params.mimeType,
  } as unknown as Blob);
  form.append('item_id', params.itemId);

  const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '파일 업로드에 실패했습니다.');
  }
  return data.document as ItemDocument;
}

export async function deleteItemDocument(id: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch(`${API_BASE_URL}/api/documents/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '삭제에 실패했습니다.');
  }
}
