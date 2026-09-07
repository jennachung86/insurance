-- ============================================================================
-- 마이그레이션: 한 품목(item)에 여러 개의 일정(보험/검사 등)을 등록할 수 있게 변경
-- ============================================================================
-- 적용 방법: Supabase 대시보드 SQL Editor에 전체 붙여넣고 실행 (한 번만 실행하면 됨)
-- 기존 items 안의 분류/만료일/알람 데이터는 자동으로 item_schedules 로 옮겨진다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. item_schedules: 품목 하나에 여러 개 등록 가능한 "일정" (보험/검사/기타 등)
-- ----------------------------------------------------------------------------
create table if not exists public.item_schedules (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  category text not null default '기타',
  due_date date,
  remind_before_value int not null default 7,
  remind_before_unit public.time_unit not null default 'day',
  status public.item_status not null default 'in_progress',
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_item_schedules_item on public.item_schedules (item_id);
create index if not exists idx_item_schedules_status on public.item_schedules (status);
create index if not exists idx_item_schedules_due_date on public.item_schedules (due_date);

drop trigger if exists trg_item_schedules_updated_at on public.item_schedules;
create trigger trg_item_schedules_updated_at
  before update on public.item_schedules
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. 기존 items 데이터를 item_schedules 로 옮기기 (이미 옮긴 경우 중복 방지)
-- ----------------------------------------------------------------------------
insert into public.item_schedules (item_id, category, due_date, remind_before_value, remind_before_unit, status, custom_fields, completed_at, created_at)
select i.id, i.category, i.due_date, i.remind_before_value, i.remind_before_unit, i.status, i.custom_fields, i.completed_at, i.created_at
from public.items i
where not exists (select 1 from public.item_schedules s where s.item_id = i.id);

-- ----------------------------------------------------------------------------
-- 3. alarm_rules 가 item_schedules 를 가리키도록 변경
-- ----------------------------------------------------------------------------
alter table public.alarm_rules add column if not exists schedule_id uuid references public.item_schedules (id) on delete cascade;

-- item_id 기준으로 만든 기존 alarm_rules 를 새로 생긴 item_schedules 와 연결
update public.alarm_rules ar
set schedule_id = s.id
from public.item_schedules s
where ar.item_id = s.item_id and ar.schedule_id is null;

alter table public.alarm_rules drop column if exists item_id cascade;
alter table public.alarm_rules alter column schedule_id set not null;

create index if not exists idx_alarm_rules_next_trigger on public.alarm_rules (next_trigger_at) where is_active = true;

-- ----------------------------------------------------------------------------
-- 4. items 테이블에서 이제 item_schedules 로 옮겨간 컬럼 제거
-- ----------------------------------------------------------------------------
drop trigger if exists trg_items_due_date_change on public.items;
drop trigger if exists trg_items_create_alarm on public.items;

alter table public.items drop column if exists category;
alter table public.items drop column if exists due_date;
alter table public.items drop column if exists remind_before_value;
alter table public.items drop column if exists remind_before_unit;
alter table public.items drop column if exists status;
alter table public.items drop column if exists completed_at;
alter table public.items drop column if exists custom_fields;

-- ----------------------------------------------------------------------------
-- 5. 트리거 함수들을 item_schedules 기준으로 재작성
-- ----------------------------------------------------------------------------
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

create or replace function public.handle_schedule_due_date_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE') and (
       new.due_date is distinct from old.due_date
    or new.remind_before_value is distinct from old.remind_before_value
    or new.remind_before_unit is distinct from old.remind_before_unit
  ) then

    if old.status = 'completed' and new.due_date is not null and new.due_date is distinct from old.due_date then
      new.status := 'in_progress';
      new.completed_at := null;
    end if;

    update public.alarm_rules
       set next_trigger_at = public.recompute_next_trigger(new.due_date, new.remind_before_value, new.remind_before_unit),
           is_active = true,
           last_triggered_at = null
     where schedule_id = new.id;

    insert into public.alarm_logs (alarm_rule_id, item_id, channel, recipient, status, error_message, sent_at)
    select ar.id, new.item_id, 'push', 'SYSTEM', 'sent', '만료일 갱신으로 알람 재설정됨', now()
      from public.alarm_rules ar where ar.schedule_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_item_schedules_due_date_change on public.item_schedules;
create trigger trg_item_schedules_due_date_change
  before update on public.item_schedules
  for each row execute function public.handle_schedule_due_date_change();

create or replace function public.create_default_alarm_rule_for_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.alarm_rules (schedule_id, channels, next_trigger_at)
  values (
    new.id,
    array['push']::public.alarm_channel[],
    public.recompute_next_trigger(new.due_date, new.remind_before_value, new.remind_before_unit)
  );
  return new;
end;
$$;

drop trigger if exists trg_item_schedules_create_alarm on public.item_schedules;
create trigger trg_item_schedules_create_alarm
  after insert on public.item_schedules
  for each row execute function public.create_default_alarm_rule_for_schedule();

-- ----------------------------------------------------------------------------
-- 6. Row Level Security: item_schedules / alarm_rules 정책 재설정
-- ----------------------------------------------------------------------------
alter table public.item_schedules enable row level security;

drop policy if exists item_schedules_select on public.item_schedules;
drop policy if exists item_schedules_insert on public.item_schedules;
drop policy if exists item_schedules_update on public.item_schedules;
drop policy if exists item_schedules_delete on public.item_schedules;

create policy item_schedules_select on public.item_schedules for select
  using (exists (select 1 from public.items i where i.id = item_id and public.is_org_member(i.org_id)));
create policy item_schedules_insert on public.item_schedules for insert
  with check (exists (select 1 from public.items i where i.id = item_id and public.is_org_manager_or_master(i.org_id)));
create policy item_schedules_delete on public.item_schedules for delete
  using (exists (select 1 from public.items i where i.id = item_id and public.is_org_manager_or_master(i.org_id)));
create policy item_schedules_update on public.item_schedules for update
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id
        and (public.is_org_manager_or_master(i.org_id) or i.assignee_user_id = auth.uid())
    )
  );

drop policy if exists alarm_rules_select on public.alarm_rules;
drop policy if exists alarm_rules_write on public.alarm_rules;

create policy alarm_rules_select on public.alarm_rules for select
  using (
    exists (
      select 1 from public.item_schedules s
      join public.items i on i.id = s.item_id
      where s.id = schedule_id and public.is_org_member(i.org_id)
    )
  );
create policy alarm_rules_write on public.alarm_rules for all
  using (
    exists (
      select 1 from public.item_schedules s
      join public.items i on i.id = s.item_id
      where s.id = schedule_id and public.is_org_manager_or_master(i.org_id)
    )
  );

-- 완료. 실행 결과에 에러가 없으면 성공입니다.
