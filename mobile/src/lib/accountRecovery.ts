import { API_BASE_URL } from './supabase';

async function parseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`서버에서 올바르지 않은 응답을 받았습니다. (상태 코드: ${res.status})`);
  }
}

/** 복구용 이메일로 가입된 로그인 아이디(마스킹됨)를 찾는다. 로그인 전에도 호출 가능. */
export async function findLoginId(recoveryEmail: string): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/api/auth/find-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recovery_email: recoveryEmail }),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(data.error || '아이디 찾기에 실패했습니다.');
  }
  return data.login_ids as string[];
}

/** 아이디 + 복구용 이메일 확인 후 비밀번호를 즉시 재설정한다. 로그인 전에도 호출 가능. */
export async function resetPassword(params: {
  loginId: string;
  recoveryEmail: string;
  newPassword: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login_id: params.loginId,
      recovery_email: params.recoveryEmail,
      new_password: params.newPassword,
    }),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(data.error || '비밀번호 재설정에 실패했습니다.');
  }
}
