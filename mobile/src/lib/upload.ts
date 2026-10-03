import * as FileSystem from 'expo-file-system';

/**
 * 파일을 백엔드로 멀티파트 업로드한다. RN의 fetch+FormData는 Android에서
 * expo-document-picker가 돌려주는 content:// URI를 읽다가 파일 파트를 통째로
 * 누락시키는 경우가 있어("file이 필요합니다" 에러로 나타남), 네이티브에서
 * 직접 파일을 읽어 전송하는 FileSystem.uploadAsync를 대신 사용한다.
 */
export async function uploadMultipart(params: {
  url: string;
  uri: string;
  fieldName: string;
  mimeType: string;
  token: string;
  fields?: Record<string, string>;
}): Promise<any> {
  const result = await FileSystem.uploadAsync(params.url, params.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: params.fieldName,
    mimeType: params.mimeType,
    parameters: params.fields,
    headers: { Authorization: `Bearer ${params.token}` },
  });

  let data: any;
  try {
    data = JSON.parse(result.body);
  } catch {
    if (result.status === 502 || result.status === 504) {
      throw new Error('서버 응답이 너무 오래 걸려 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    }
    throw new Error(`서버에서 올바르지 않은 응답을 받았습니다. (상태 코드: ${result.status})`);
  }
  if (result.status < 200 || result.status >= 300) {
    const debugSuffix = data.debug ? `\n[debug] ${JSON.stringify(data.debug)}` : '';
    throw new Error((data.error || '요청 처리에 실패했습니다.') + debugSuffix);
  }
  return data;
}
