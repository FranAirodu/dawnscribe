-- ============================================================
-- DawnScribe — Author tipping (Quills, 90/10 split)
-- Additive only: one table, one RPC, no changes to existing objects.
-- ============================================================

create table if not exists public.creator_tips (
  id            uuid primary key default gen_random_uuid(),
  tipper_id     uuid not null references auth.users(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  work_id       uuid references public.works(id) on delete set null,
  chapter_id    uuid references public.chapters(id) on delete set null,
  quill_amount  integer not null check (quill_amount > 0),
  author_share  integer not null check (author_share >= 0),
  message       text check (message is null or length(message) <= 280),
  is_anonymous  boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint creator_tips_no_self check (tipper_id <> author_id)
);

create index if not exists creator_tips_work_idx    on public.creator_tips(work_id, created_at desc);
create index if not exists creator_tips_chapter_idx on public.creator_tips(chapter_id, created_at desc);
create index if not exists creator_tips_author_idx  on public.creator_tips(author_id, created_at desc);

alter table public.creator_tips enable row level security;

-- Deliberately narrow. A reader may only select tips they sent themselves.
-- Everything shown publicly goes through list_work_tips() below, which never
-- returns tipper_id. If the table itself were readable, "tip anonymously"
-- would be a checkbox that hides a name in the UI while leaving it one
-- query away — that is not anonymity.
drop policy if exists creator_tips_read on public.creator_tips;
create policy creator_tips_read_own on public.creator_tips
  for select to authenticated using (tipper_id = auth.uid());

-- No insert/update/delete policy on purpose. Tips are only ever created by
-- tip_creator() below, which is SECURITY DEFINER. A direct insert would skip
-- the Quill debit entirely.

-- ============================================================
-- tip_creator: debit the tipper, record the tip, credit the author 90%.
-- Mirrors purchase_scroll(): debit first (respecting gift holds via
-- balance - reserved), then credit. Any failure after the debit raises,
-- which rolls the debit back with it.
-- ============================================================
create or replace function public.tip_creator(
  p_work_id    uuid,
  p_chapter_id uuid,
  p_quills     integer,
  p_message    text default null,
  p_anonymous  boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_tipper      uuid := auth.uid();
  v_author      uuid;
  v_new_balance integer;
  v_share       integer;
  v_tip_id      uuid;
  -- 90% to the author. Tips carry no production cost to DawnScribe, so the
  -- split is deliberately more generous than the 75/25 used on cosmetics.
  v_author_pct  numeric := 0.90;
  -- Same rate ds_scroll_grant() uses. Keep the two in step.
  v_rate        numeric(6,4) := 0.70;
begin
  perform public.require_active_account();

  if v_tipper is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  -- Floor and ceiling. The floor keeps the public tip list from filling with
  -- 1-Quill entries; the ceiling is a guard against a fat-fingered amount.
  if p_quills is null or p_quills < 10 then
    return jsonb_build_object('ok', false, 'error', 'Minimum tip is 10 Quills');
  end if;
  if p_quills > 100000 then
    return jsonb_build_object('ok', false, 'error', 'Maximum tip is 100,000 Quills');
  end if;

  select author_id into v_author from works where id = p_work_id;
  if v_author is null then
    return jsonb_build_object('ok', false, 'error', 'Story not found');
  end if;
  if v_author = v_tipper then
    return jsonb_build_object('ok', false, 'error', 'You cannot tip yourself');
  end if;

  -- If the chapter is supplied it must belong to the work, or the tip would
  -- be attributed to a chapter the author did not write.
  if p_chapter_id is not null
     and not exists (select 1 from chapters where id = p_chapter_id and work_id = p_work_id) then
    return jsonb_build_object('ok', false, 'error', 'Chapter does not belong to that story');
  end if;

  v_share := floor(p_quills * v_author_pct)::integer;

  -- Debit. balance - reserved respects Quills already held for pending gifts.
  update user_quills
     set balance = balance - p_quills, updated_at = now()
   where user_id = v_tipper
     and balance - coalesce(reserved, 0) >= p_quills
  returning balance into v_new_balance;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Insufficient quills');
  end if;

  insert into creator_tips(
    tipper_id, author_id, work_id, chapter_id,
    quill_amount, author_share, message, is_anonymous
  ) values (
    v_tipper, v_author, p_work_id, p_chapter_id,
    p_quills, v_share, nullif(btrim(coalesce(p_message, '')), ''), coalesce(p_anonymous, false)
  )
  returning id into v_tip_id;

  -- Credits the ledger and the payout balance. Despite the name this is the
  -- general-purpose earnings crediter; source_type is a free-text column.
  perform public.ds_credit_scroll_earning(
    v_author, 'tip', v_tip_id, v_tipper, v_share, v_rate
  );

  return jsonb_build_object(
    'ok', true,
    'tip_id', v_tip_id,
    'new_balance', v_new_balance,
    'author_share', v_share
  );
end;
$function$;

revoke all on function public.tip_creator(uuid, uuid, integer, text, boolean) from public;
grant execute on function public.tip_creator(uuid, uuid, integer, text, boolean) to authenticated;

-- ============================================================
-- list_work_tips: the public tip list. Resolves display names server-side so
-- an anonymous tipper's id never leaves the database. Also saves the client
-- a second round trip to profiles.
-- ============================================================
create or replace function public.list_work_tips(
  p_work_id uuid,
  p_limit   integer default 15
) returns table (
  id            uuid,
  display_name  text,
  quill_amount  integer,
  message       text,
  is_anonymous  boolean,
  is_mine       boolean,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select
    t.id,
    case when t.is_anonymous then null
         else coalesce(pr.display_name, pr.username, 'Reader')
    end as display_name,
    t.quill_amount,
    t.message,
    t.is_anonymous,
    -- Lets the sender recognise their own anonymous tip without exposing
    -- anyone else's identity.
    (t.tipper_id = auth.uid()) as is_mine,
    t.created_at
  from creator_tips t
  left join profiles pr
    on pr.id = t.tipper_id and not t.is_anonymous
  where t.work_id = p_work_id
  order by t.created_at desc
  limit least(greatest(coalesce(p_limit, 15), 1), 50);
$function$;

revoke all on function public.list_work_tips(uuid, integer) from public;
grant execute on function public.list_work_tips(uuid, integer) to authenticated, anon;

-- ============================================================
-- work_tip_totals: aggregate for the header line. Separate from the list so
-- the total covers every tip, not just the most recent page of them.
-- ============================================================
create or replace function public.work_tip_totals(p_work_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select jsonb_build_object(
    'tip_count',   count(*),
    'quill_total', coalesce(sum(quill_amount), 0)
  )
  from creator_tips
  where work_id = p_work_id;
$function$;

revoke all on function public.work_tip_totals(uuid) from public;
grant execute on function public.work_tip_totals(uuid) to authenticated, anon;
