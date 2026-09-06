import { API_BASE_URL, getAccessToken } from './supabase';
import type { ItemDocument } from '../types';

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
