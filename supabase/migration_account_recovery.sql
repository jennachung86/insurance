-- ============================================================================
-- 아이디 찾기 / 비밀번호 재설정을 위한 계정 복구 정보 추가
-- ============================================================================
-- 적용 방법: Supabase 대시보드 SQL Editor에 그대로 붙여넣고 실행하세요.
-- ============================================================================

alter table public.profiles
  add column if not exists login_id text,
  add column if not exists recovery_email text;

-- 아이디 중복 가입 방지 (대소문자 무시)
create unique index if not exists profiles_login_id_key
  on public.profiles (lower(login_id))
  where login_id is not null;

-- 복구용 이메일로 아이디를 찾을 때 조회 성능을 위한 인덱스
create index if not exists profiles_recovery_email_idx
  on public.profiles (lower(recovery_email))
  where recovery_email is not null;
