import { Router } from 'express';
import { getServiceClient } from '../supabaseClient.js';

const router = Router();

/** 아이디 뒷부분을 가려서 반환한다 (예: "donamcrew" -> "do*******"). */
function maskLoginId(id: string): string {
  if (id.length <= 2) return `${id[0]}*`;
  return `${id.slice(0, 2)}${'*'.repeat(id.length - 2)}`;
}

/**
 * POST /api/auth/find-id
 * body: { recovery_email }
 * 동작: 가입 시 등록한 복구용 이메일로 연결된 로그인 아이디를 찾아 마스킹해서 반환한다.
 */
router.post('/find-id', async (req, res) => {
  const recoveryEmail = (req.body?.recovery_email as string | undefined)?.trim().toLowerCase();
  if (!recoveryEmail) {
    return res.status(400).json({ error: '복구용 이메일을 입력하세요.' });
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('login_id')
      .ilike('recovery_email', recoveryEmail);
    if (error) throw error;

    const loginIds = (data || [])
      .map((row) => row.login_id as string | null)
      .filter((v): v is string => !!v);

    if (loginIds.length === 0) {
      return res.status(404).json({ error: '등록된 복구용 이메일을 찾을 수 없습니다.' });
    }
    res.json({ login_ids: loginIds.map(maskLoginId) });
  } catch (err) {
    console.error('아이디 찾기 실패:', err);
    const message = extractErrorMessage(err) || '아이디 찾기 중 오류가 발생했습니다.';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/auth/reset-password
 * body: { login_id, recovery_email, new_password }
 * 동작: 아이디+복구용 이메일이 가입 시 등록한 값과 일치하면 비밀번호를 즉시 재설정한다.
 * (로그인 ID가 실제 이메일이 아닌 가짜 도메인이라 Supabase 기본 이메일 재설정 링크를 쓸 수 없어,
 *  복구용 이메일을 본인 확인 수단으로 쓰고 서버가 서비스 롤 권한으로 직접 비밀번호를 바꾼다.)
 */
router.post('/reset-password', async (req, res) => {
  const loginId = (req.body?.login_id as string | undefined)?.trim().toLowerCase();
  const recoveryEmail = (req.body?.recovery_email as string | undefined)?.trim().toLowerCase();
  const newPassword = req.body?.new_password as string | undefined;

  if (!loginId || !recoveryEmail || !newPassword) {
    return res.status(400).json({ error: '아이디, 복구용 이메일, 새 비밀번호를 모두 입력하세요.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
  }

  try {
    const supabase = getServiceClient();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, recovery_email')
      .ilike('login_id', loginId)
      .maybeSingle();
    if (error) throw error;

    if (!profile || (profile.recovery_email || '').toLowerCase() !== recoveryEmail) {
      return res.status(404).json({ error: '아이디와 복구용 이메일이 일치하지 않습니다.' });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, {
      password: newPassword,
    });
    if (updateError) throw updateError;

    res.json({ ok: true });
  } catch (err) {
    console.error('비밀번호 재설정 실패:', err);
    const message = extractErrorMessage(err) || '비밀번호 재설정 중 오류가 발생했습니다.';
    res.status(500).json({ error: message });
  }
});

/** Error 인스턴스가 아닌 Postgrest/Auth 에러 객체({message, details, ...})에서도 메시지를 뽑아낸다. */
function extractErrorMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message;
  }
  return null;
}

export default router;
