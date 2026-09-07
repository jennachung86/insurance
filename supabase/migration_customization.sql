-- ============================================================================
-- 마이그레이션: 분류(카테고리) 자유 편집 + 탭 이름 변경 지원
-- ============================================================================
-- 적용 방법: Supabase 대시보드 SQL Editor에 전체 붙여넣고 실행 (한 번만 실행하면 됨)
-- (커스텀 항목/컬럼 기능은 이미 기존 custom_field_definitions 테이블로 지원되고 있어서
--  이 마이그레이션에서는 UI만 새로 만들고 DB는 그대로 사용합니다.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. category_options: 조직마다 자유롭게 정의하는 분류 목록 (기존엔 '보험/검사/기타' 고정)
-- ----------------------------------------------------------------------------
create table if not exists public.category_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, label)
);

create index if not exists idx_category_options_org on public.category_options (org_id);

alter table public.category_options enable row level security;

drop policy if exists category_options_select on public.category_options;
drop policy if exists category_options_write on public.category_options;

create policy category_options_select on public.category_options for select
  using (public.is_org_member(org_id));
create policy category_options_write on public.category_options for all
  using (public.is_org_manager_or_master(org_id));

-- 기존 조직들에게 기본 분류(보험/검사/기타)를 채워준다 (이미 있으면 건너뜀).
insert into public.category_options (org_id, label, sort_order)
select o.id, v.label, v.sort_order
from public.organizations o
cross join (values ('보험', 0), ('검사', 1), ('기타', 2)) as v(label, sort_order)
where not exists (select 1 from public.category_options c where c.org_id = o.id);

-- ----------------------------------------------------------------------------
-- 2. organizations.tab_labels: 하단 4개 탭 이름을 조직마다 원하는 대로 바꿀 수 있게
-- ----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists tab_labels jsonb not null default '{"upcoming":"업무 알림","calendar":"캘린더","tracking":"작업추적/기록","profile":"내 정보"}'::jsonb;

-- 완료. 실행 결과에 에러가 없으면 성공입니다.
