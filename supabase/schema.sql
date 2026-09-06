-- ============================================================================
-- 보험/검사 일정 공동관리 앱 - Supabase (Postgres) 스키마
-- ============================================================================
-- 적용 방법: Supabase 대시보드 SQL Editor에 그대로 붙여넣고 실행하거나
--           `supabase db push` (supabase/migrations 로 옮겨서) 로 적용하세요.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. 조직(회사) & 멀티 계정 / RBAC
-- ----------------------------------------------------------------------------

-- auth.users 1:1 확장 프로필
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone_number text,
  push_token text,                    -- FCM device token (마지막 로그인 기기)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  master_user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('master', 'manager', 'member');

-- 조직 소속 + 권한 (마스터 1개 + 서브 계정 다수)
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists idx_org_members_user on public.organization_members (user_id);
create index if not exists idx_org_members_org on public.organization_members (org_id);

-- 권한 체크 헬퍼 (RLS 정책에서 재사용)
create or replace function public.current_role_in_org(p_org_id uuid)
returns public.member_role
language sql
security definer
stable
as $$
  select role from public.organization_members
  where org_id = p_org_id and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_manager_or_master(p_org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = auth.uid()
      and role in ('master', 'manager')
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. 커스텀 컬럼 정의 (셀 커스터마이즈)
-- ----------------------------------------------------------------------------
-- 항목명/분류/만료일 등 고정 컬럼 외에, 조직마다 추가하고 싶은 컬럼을
-- 메타데이터로 정의해두고 items.custom_fields(jsonb)에 값을 저장한다.

create type public.custom_field_type as enum ('text', 'number', 'date', 'select', 'boolean');

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  field_key text not null,             -- items.custom_fields 에서 사용하는 키 (예: 'policy_number')
  label text not null,                 -- 화면에 표시할 이름 (예: '증권번호')
  field_type public.custom_field_type not null default 'text',
  select_options jsonb,                -- field_type = 'select' 일 때 ["옵션1","옵션2"]
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (org_id, field_key)
);

-- ----------------------------------------------------------------------------
-- 3. 핵심 데이터: items (일정/셀)
-- ----------------------------------------------------------------------------

create type public.item_status as enum ('in_progress', 'completed');
create type public.time_unit as enum ('hour', 'day', 'week');

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,

  -- 고정 컬럼
  item_name text not null,             -- 항목명
  category text not null default '기타', -- 분류 (보험/검사/기타 등 자유 텍스트)
  due_date date,                       -- 만료일 / 납입일
  remind_before_value int not null default 7,   -- 만료일 며칠/시간/주 전에 알림
  remind_before_unit public.time_unit not null default 'day',
  assignee_user_id uuid references public.profiles (id), -- 담당자
  status public.item_status not null default 'in_progress',
  photo_url text,                      -- 최신 첨부 사진 (Supabase Storage 경로)

  -- 커스텀 컬럼 값 저장소: { "policy_number": "ABC-123", ... }
  custom_fields jsonb not null default '{}'::jsonb,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_items_org on public.items (org_id);
create index if not exists idx_items_status on public.items (org_id, status);
create index if not exists idx_items_due_date on public.items (due_date);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_items_updated_at on public.items;
create trigger trg_items_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. 사진 첨부 + OCR 추출 이력
-- ----------------------------------------------------------------------------

create table if not exists public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  storage_path text not null,          -- Supabase Storage 내 경로
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.ocr_extractions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items (id) on delete cascade,
  photo_storage_path text not null,
  model text not null,                 -- 사용된 Claude 모델 ID
  extracted_fields jsonb not null,      -- Claude가 반환한 구조화 필드
  confidence text,                     -- 'high' | 'medium' | 'low' (모델 자체 판단)
  applied boolean not null default false, -- 사용자가 자동입력값을 실제로 저장에 반영했는지
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- 일반 문서 첨부 + 텍스트 추출 (구 file-extract-app 기능을 항목 단위로 흡수).
-- 사진 OCR(ocr_extractions)과 달리 셀 자동 채움이 아니라, PDF/엑셀/HWP/워드/TXT
-- 원문 전체를 그대로 보관하고 검색/열람할 수 있게 하는 용도.
create table if not exists public.item_documents (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  original_name text not null,
  storage_path text not null,          -- Supabase Storage('item-documents') 내 경로
  mime_type text not null,
  size bigint not null,
  extracted_text text,                 -- pdf-parse/xlsx/mammoth/hwp 파서로 추출한 원문
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_item_documents_item on public.item_documents (item_id);

-- ----------------------------------------------------------------------------
-- 5. 알람 규칙 / 수신자 / 발송 로그
-- ----------------------------------------------------------------------------

create type public.alarm_channel as enum ('push', 'sms', 'kakao');

create table if not exists public.alarm_rules (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  channels public.alarm_channel[] not null default array['push']::public.alarm_channel[],
  next_trigger_at timestamptz,          -- due_date - remind_before 로 계산됨
  last_triggered_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_alarm_rules_next_trigger
  on public.alarm_rules (next_trigger_at)
  where is_active = true;

drop trigger if exists trg_alarm_rules_updated_at on public.alarm_rules;
create trigger trg_alarm_rules_updated_at
  before update on public.alarm_rules
  for each row execute function public.set_updated_at();

-- 알람 수신 전화번호/푸시 토큰 다중 등록.
-- item_id 가 NULL 이면 "조직 전체 공통 수신자", 값이 있으면 "해당 항목 전용 추가 수신자".
create table if not exists public.alarm_recipients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  display_name text not null,
  phone_number text,                    -- SMS / 카카오 알림톡 발신용
  push_token text,                      -- FCM 토큰
  created_at timestamptz not null default now()
);

create index if not exists idx_alarm_recipients_org on public.alarm_recipients (org_id);
create index if not exists idx_alarm_recipients_item on public.alarm_recipients (item_id);

create table if not exists public.alarm_logs (
  id uuid primary key default gen_random_uuid(),
  alarm_rule_id uuid references public.alarm_rules (id) on delete set null,
  item_id uuid references public.items (id) on delete set null,
  channel public.alarm_channel not null,
  recipient text not null,              -- 실제 전송된 전화번호 or 토큰
  status text not null,                 -- 'sent' | 'failed'
  error_message text,
  sent_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. 만료일 갱신 -> 알람 자동 재설정 트리거
-- ----------------------------------------------------------------------------
-- 완료된 항목의 due_date 를 새 날짜로 갱신하면:
--   1) status 를 다시 'in_progress' 로 되돌리고
--   2) 해당 항목의 alarm_rules.next_trigger_at 을 재계산 + 재활성화한다.

create or replace function public.recompute_next_trigger(
  p_due_date date,
  p_value int,
  p_unit public.time_unit
) returns timestamptz
language plpgsql
immutable
as $$
declare
  interval_text text;
begin
  if p_due_date is null then
    return null;
  end if;
  interval_text := p_value || ' ' || p_unit::text;
  return (p_due_date::timestamptz) - interval_text::interval;
end;
$$;

-- security definer: 이 트리거는 사용자의 due_date 수정에 딸려오는 "시스템 자동 처리"
-- (알람 재계산, 감사 로그 기록)이므로 호출한 사용자의 alarm_rules/alarm_logs 쓰기 권한과
-- 무관하게 항상 성공해야 한다. RLS를 우회하도록 정의자(테이블 생성자) 권한으로 실행한다.
create or replace function public.handle_item_due_date_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 만료일 또는 알림 리드타임이 바뀌면 알람을 재계산한다.
  if (tg_op = 'UPDATE') and (
       new.due_date is distinct from old.due_date
    or new.remind_before_value is distinct from old.remind_before_value
    or new.remind_before_unit is distinct from old.remind_before_unit
  ) then

    -- 완료 상태에서 새 날짜가 들어오면 자동으로 '진행중'으로 되돌린다 (다음 주기 시작)
    if old.status = 'completed' and new.due_date is not null and new.due_date is distinct from old.due_date then
      new.status := 'in_progress';
      new.completed_at := null;
    end if;

    update public.alarm_rules
       set next_trigger_at = public.recompute_next_trigger(new.due_date, new.remind_before_value, new.remind_before_unit),
           is_active = true,
           last_triggered_at = null
     where item_id = new.id;

    insert into public.alarm_logs (alarm_rule_id, item_id, channel, recipient, status, error_message, sent_at)
    select ar.id, new.id, 'push', 'SYSTEM', 'sent', '만료일 갱신으로 알람 재설정됨', now()
      from public.alarm_rules ar where ar.item_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_items_due_date_change on public.items;
create trigger trg_items_due_date_change
  before update on public.items
  for each row execute function public.handle_item_due_date_change();

-- 항목 최초 생성 시 기본 알람 규칙을 하나 만들어준다.
-- 동일한 이유로 security definer: 항목을 만든 사용자가 alarm_rules에 직접 쓸 권한이
-- 없어도(정책상 manager/master만 가능) 시스템이 자동으로 만드는 기본 규칙은 항상 생성돼야 한다.
create or replace function public.create_default_alarm_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.alarm_rules (item_id, channels, next_trigger_at)
  values (
    new.id,
    array['push']::public.alarm_channel[],
    public.recompute_next_trigger(new.due_date, new.remind_before_value, new.remind_before_unit)
  );
  return new;
end;
$$;

drop trigger if exists trg_items_create_alarm on public.items;
create trigger trg_items_create_alarm
  after insert on public.items
  for each row execute function public.create_default_alarm_rule();

-- ----------------------------------------------------------------------------
-- 7. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.items enable row level security;
alter table public.item_photos enable row level security;
alter table public.ocr_extractions enable row level security;
alter table public.item_documents enable row level security;
alter table public.alarm_rules enable row level security;
alter table public.alarm_recipients enable row level security;
alter table public.alarm_logs enable row level security;

-- profiles: 자기 자신은 항상 읽기/수정 가능
create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid());
create policy profiles_self_insert on public.profiles for insert with check (id = auth.uid());

-- organizations: 소속 멤버만 조회, 생성은 누구나(자기 자신을 master로), 수정/삭제는 master만
create policy org_select on public.organizations for select
  using (public.is_org_member(id));
create policy org_insert on public.organizations for insert
  with check (master_user_id = auth.uid());
create policy org_update on public.organizations for update
  using (public.current_role_in_org(id) = 'master');

-- organization_members: 같은 조직 멤버끼리 조회, master/manager 만 초대(추가), master 만 삭제
create policy org_members_select on public.organization_members for select
  using (public.is_org_member(org_id));
create policy org_members_insert on public.organization_members for insert
  with check (public.is_org_manager_or_master(org_id));
create policy org_members_delete on public.organization_members for delete
  using (public.current_role_in_org(org_id) = 'master');
create policy org_members_update on public.organization_members for update
  using (public.current_role_in_org(org_id) = 'master');

-- custom_field_definitions: 조직 멤버 조회, master/manager 만 편집
create policy custom_fields_select on public.custom_field_definitions for select
  using (public.is_org_member(org_id));
create policy custom_fields_write on public.custom_field_definitions for insert
  with check (public.is_org_manager_or_master(org_id));
create policy custom_fields_update on public.custom_field_definitions for update
  using (public.is_org_manager_or_master(org_id));
create policy custom_fields_delete on public.custom_field_definitions for delete
  using (public.is_org_manager_or_master(org_id));

-- items: 조직 멤버는 전체 조회 가능.
-- 생성/삭제는 master/manager. 수정은 master/manager 전체 + member는 본인이 담당자인 항목만.
create policy items_select on public.items for select
  using (public.is_org_member(org_id));
create policy items_insert on public.items for insert
  with check (public.is_org_manager_or_master(org_id));
create policy items_delete on public.items for delete
  using (public.is_org_manager_or_master(org_id));
create policy items_update on public.items for update
  using (
    public.is_org_manager_or_master(org_id)
    or assignee_user_id = auth.uid()
  );

-- item_photos / ocr_extractions: items 와 동일 조직 규칙을 따름
create policy item_photos_select on public.item_photos for select
  using (exists (select 1 from public.items i where i.id = item_id and public.is_org_member(i.org_id)));
create policy item_photos_insert on public.item_photos for insert
  with check (exists (select 1 from public.items i where i.id = item_id and public.is_org_member(i.org_id)));

create policy ocr_extractions_select on public.ocr_extractions for select
  using (exists (select 1 from public.items i where i.id = item_id and public.is_org_member(i.org_id)));
create policy ocr_extractions_insert on public.ocr_extractions for insert
  with check (exists (select 1 from public.items i where i.id = item_id and public.is_org_member(i.org_id)));

-- item_documents: 조회는 조직 멤버 전체, 업로드/삭제는 해당 항목을 수정할 수 있는 사람만
-- (items_update 정책과 동일 기준: manager/master 전체 + member는 본인이 담당자인 항목)
create policy item_documents_select on public.item_documents for select
  using (public.is_org_member(org_id));
create policy item_documents_insert on public.item_documents for insert
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id
        and i.org_id = item_documents.org_id
        and (public.is_org_manager_or_master(i.org_id) or i.assignee_user_id = auth.uid())
    )
  );
create policy item_documents_delete on public.item_documents for delete
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id
        and (public.is_org_manager_or_master(i.org_id) or i.assignee_user_id = auth.uid())
    )
  );

-- alarm_rules: items 와 동일 조직 규칙
create policy alarm_rules_select on public.alarm_rules for select
  using (exists (select 1 from public.items i where i.id = item_id and public.is_org_member(i.org_id)));
create policy alarm_rules_write on public.alarm_rules for all
  using (exists (select 1 from public.items i where i.id = item_id and public.is_org_manager_or_master(i.org_id)));

-- alarm_recipients: 조직 멤버 조회, master/manager 편집
create policy alarm_recipients_select on public.alarm_recipients for select
  using (public.is_org_member(org_id));
create policy alarm_recipients_write on public.alarm_recipients for all
  using (public.is_org_manager_or_master(org_id));

-- alarm_logs: 조직 멤버는 조회만 가능 (쓰기는 서버가 service_role 로 수행)
create policy alarm_logs_select on public.alarm_logs for select
  using (exists (select 1 from public.items i where i.id = item_id and public.is_org_member(i.org_id)));

-- ----------------------------------------------------------------------------
-- 8. Storage 버킷 (사진 첨부)
-- ----------------------------------------------------------------------------
-- Supabase 대시보드 > Storage 에서 'item-photos' 버킷을 만들거나 아래로 생성:
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

create policy "item photos read (org members)" on storage.objects
  for select using (
    bucket_id = 'item-photos'
    and auth.role() = 'authenticated'
  );

create policy "item photos upload (org members)" on storage.objects
  for insert with check (
    bucket_id = 'item-photos'
    and auth.role() = 'authenticated'
  );

-- 'item-documents' 버킷: 구 file-extract-app의 PDF/엑셀/HWP/워드/TXT 첨부 저장소.
-- 이미지(item-photos)와 별도 버킷으로 분리해 문서 원본을 보관한다.
insert into storage.buckets (id, name, public)
values ('item-documents', 'item-documents', false)
on conflict (id) do nothing;

create policy "item documents read (org members)" on storage.objects
  for select using (
    bucket_id = 'item-documents'
    and auth.role() = 'authenticated'
  );

create policy "item documents upload (org members)" on storage.objects
  for insert with check (
    bucket_id = 'item-documents'
    and auth.role() = 'authenticated'
  );

create policy "item documents delete (org members)" on storage.objects
  for delete using (
    bucket_id = 'item-documents'
    and auth.role() = 'authenticated'
  );
