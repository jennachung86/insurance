import { API_BASE_URL } from './supabase';

export type RecoveryChannel = 'email' | 'sms';

async function postJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`서버에서 올바르지 않은 응답을 받았습니다. (상태 코드: ${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data;
}

/** 서버에 발송 설정이 되어 있어 지금 쓸 수 있는 본인인증 수단. */
export async function getRecoveryChannels(): Promise<Record<RecoveryChannel, boolean>> {
  const res = await fetch(`${API_BASE_URL}/api/auth/recovery/channels`);
  const data = await res.json();
  return { email: !!data.email, sms: !!data.sms };
}

/** 가입 시 등록한 이메일/휴대폰과 일치하면 인증번호를 발송한다. (일치 여부는 응답으로 알려주지 않음) */
export async function sendRecoveryCode(params: {
  purpose: 'find-id' | 'reset-password';
  channel: RecoveryChannel;
  target: string;
  loginId?: string;
}): Promise<void> {
  await postJson('/api/auth/recovery/send', {
    purpose: params.purpose,
    channel: params.channel,
    target: params.target,
    login_id: params.loginId,
  });
}

/** 인증번호 확인 후 로그인 아이디 목록을 받는다. */
export async function findLoginId(params: {
  channel: RecoveryChannel;
  target: string;
  code: string;
}): Promise<string[]> {
  const data = await postJson('/api/auth/find-id', params);
  return data.login_ids as string[];
}

/** 인증번호 확인 후 비밀번호를 재설정한다. */
export async function resetPassword(params: {
  loginId: string;
  channel: RecoveryChannel;
  target: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  await postJson('/api/auth/reset-password', {
    login_id: params.loginId,
    channel: params.channel,
    target: params.target,
    code: params.code,
    new_password: params.newPassword,
  });
}
