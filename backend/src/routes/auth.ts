import { Router } from 'express';
import { getServiceClient } from '../supabaseClient.js';
import {
  isChannelConfigured,
  normalizeTarget,
  sendOtp,
  verifyOtp,
  type RecoveryChannel,
  type RecoveryPurpose,
} from '../services/recoveryOtp.js';

const router = Router();

const CHANNEL_COLUMN: Record<RecoveryChannel, 'recovery_email' | 'phone_number'> = {
  email: 'recovery_email',
  sms: 'phone_number',
};

function parseChannel(value: unknown): RecoveryChannel | null {
  return value === 'email' || value === 'sms' ? value : null;
}

/** Error 인스턴스가 아닌 Postgrest/Auth 에러 객체({message, details, ...})에서도 메시지를 뽑아낸다. */
function extractErrorMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message;
  }
  return null;
}

// 인증번호 발송 남용(문자 요금 폭탄) 방지: IP당 10분에 10회까지.
const sendHits = new Map<string, number[]>();
function overSendLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (sendHits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  sendHits.set(ip, recent);
  return recent.length > 10;
}

/** GET /api/auth/recovery/channels - 지금 사용 가능한 본인인증 수단(서버에 발송 설정이 된 것만). */
router.get('/recovery/channels', (_req, res) => {
  res.json({ email: isChannelConfigured('email'), sms: isChannelConfigured('sms') });
});

/**
 * POST /api/auth/recovery/send
 * body: { purpose: 'find-id' | 'reset-password', channel: 'email' | 'sms', target, login_id? }
 * 가입 시 등록한 이메일/휴대폰과 일치하는 계정이 있을 때만 인증번호를 보낸다.
 * 계정 존재 여부가 드러나지 않도록 일치 여부와 관계없이 같은 응답을 준다.
 */
router.post('/recovery/send', async (req, res) => {
  const purpose = req.body?.purpose as RecoveryPurpose | undefined;
  const channel = parseChannel(req.body?.channel);
  const rawTarget = req.body?.target as string | undefined;
  const loginId = (req.body?.login_id as string | undefined)?.trim().toLowerCase();

  if ((purpose !== 'find-id' && purpose !== 'reset-password') || !channel || !rawTarget?.trim()) {
    return res.status(400).json({ error: '인증 수단과 이메일/휴대폰 번호를 입력하세요.' });
  }
  if (purpose === 'reset-password' && !loginId) {
    return res.status(400).json({ error: '아이디를 입력하세요.' });
  }
  if (!isChannelConfigured(channel)) {
    return res.status(503).json({
      error: channel === 'sms' ? '문자 인증이 아직 설정되지 않았습니다.' : '이메일 인증이 아직 설정되지 않았습니다.',
    });
  }
  if (overSendLimit(req.ip || 'unknown')) {
    return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }

  const target = normalizeTarget(channel, rawTarget);
  try {
    const supabase = getServiceClient();
    let query = supabase.from('profiles').select('id').eq(CHANNEL_COLUMN[channel], target);
    if (purpose === 'reset-password') query = query.eq('login_id', loginId!);
    const { data, error } = await query.limit(1);
    if (error) throw error;

    if (data && data.length > 0) {
      const { cooldownSeconds } = await sendOtp({ purpose, channel, target, loginId });
      if (cooldownSeconds > 0) {
        return res.status(429).json({ error: `${cooldownSeconds}초 후에 다시 요청할 수 있습니다.` });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('인증번호 발송 실패:', err);
    res.status(500).json({ error: extractErrorMessage(err) || '인증번호 발송 중 오류가 발생했습니다.' });
  }
});

/**
 * POST /api/auth/find-id
 * body: { channel, target, code }
 * 인증번호가 맞으면 해당 이메일/휴대폰으로 가입된 로그인 아이디를 알려준다.
 */
router.post('/find-id', async (req, res) => {
  const channel = parseChannel(req.body?.channel);
  const rawTarget = req.body?.target as string | undefined;
  const code = req.body?.code as string | undefined;
  if (!channel || !rawTarget?.trim() || !code?.trim()) {
    return res.status(400).json({ error: '인증 수단, 이메일/휴대폰 번호, 인증번호를 입력하세요.' });
  }

  const target = normalizeTarget(channel, rawTarget);
  if (!verifyOtp({ purpose: 'find-id', channel, target, code })) {
    return res.status(400).json({ error: '인증번호가 올바르지 않거나 만료되었습니다.' });
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.from('profiles').select('login_id').eq(CHANNEL_COLUMN[channel], target);
    if (error) throw error;

    const loginIds = (data || [])
      .map((row) => row.login_id as string | null)
      .filter((v): v is string => !!v);
    res.json({ login_ids: loginIds });
  } catch (err) {
    console.error('아이디 찾기 실패:', err);
    res.status(500).json({ error: extractErrorMessage(err) || '아이디 찾기 중 오류가 발생했습니다.' });
  }
});

/**
 * POST /api/auth/reset-password
 * body: { login_id, channel, target, code, new_password }
 * 인증번호가 맞으면 비밀번호를 즉시 재설정한다.
 * (로그인 ID가 실제 이메일이 아닌 가짜 도메인이라 Supabase 기본 재설정 메일을 쓸 수 없어,
 *  서버가 서비스 롤 권한으로 직접 비밀번호를 바꾼다.)
 */
router.post('/reset-password', async (req, res) => {
  const loginId = (req.body?.login_id as string | undefined)?.trim().toLowerCase();
  const channel = parseChannel(req.body?.channel);
  const rawTarget = req.body?.target as string | undefined;
  const code = req.body?.code as string | undefined;
  const newPassword = req.body?.new_password as string | undefined;

  if (!loginId || !channel || !rawTarget?.trim() || !code?.trim() || !newPassword) {
    return res.status(400).json({ error: '아이디, 인증 정보, 인증번호, 새 비밀번호를 모두 입력하세요.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
  }

  const target = normalizeTarget(channel, rawTarget);
  if (!verifyOtp({ purpose: 'reset-password', channel, target, loginId, code })) {
    return res.status(400).json({ error: '인증번호가 올바르지 않거나 만료되었습니다.' });
  }

  try {
    const supabase = getServiceClient();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('login_id', loginId)
      .eq(CHANNEL_COLUMN[channel], target)
      .maybeSingle();
    if (error) throw error;
    if (!profile) {
      return res.status(404).json({ error: '일치하는 계정을 찾을 수 없습니다.' });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, {
      password: newPassword,
    });
    if (updateError) throw updateError;

    res.json({ ok: true });
  } catch (err) {
    console.error('비밀번호 재설정 실패:', err);
    res.status(500).json({ error: extractErrorMessage(err) || '비밀번호 재설정 중 오류가 발생했습니다.' });
  }
});

export default router;
