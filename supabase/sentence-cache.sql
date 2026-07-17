-- 词灵录：跨实例判句缓存
-- 在 Supabase Dashboard → SQL Editor 中完整运行一次。

begin;

create table if not exists public.sentence_judgments (
  fingerprint text primary key check (fingerprint ~ '^[0-9a-f]{64}$'),
  sentence_text text,
  judge_version text not null,
  model text not null,
  score smallint not null check (score between 0 and 100),
  feedback text not null check (char_length(feedback) <= 64),
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),
  seen_count bigint not null default 1 check (seen_count >= 1),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Existing installations created before readable sentence storage receive the
-- column when this file is run again. Old rows remain null; new rows are filled.
alter table public.sentence_judgments
  add column if not exists sentence_text text;

alter table public.sentence_judgments enable row level security;
revoke all on table public.sentence_judgments from public, anon, authenticated;
grant select, insert, update on table public.sentence_judgments to service_role;

-- Secure the legacy six-argument function if an older version of this file
-- created it. Keep it in place so this migration is non-destructive.
do $permissions$
begin
  if to_regprocedure('public.cache_sentence_judgment(text,text,text,smallint,text,jsonb)') is not null then
    execute 'revoke execute on function public.cache_sentence_judgment(text, text, text, smallint, text, jsonb) from public';
    execute 'revoke execute on function public.cache_sentence_judgment(text, text, text, smallint, text, jsonb) from anon';
    execute 'revoke execute on function public.cache_sentence_judgment(text, text, text, smallint, text, jsonb) from authenticated';
  end if;
end
$permissions$;

create or replace function public.cache_sentence_judgment(
  p_fingerprint text,
  p_sentence_text text,
  p_judge_version text,
  p_model text,
  p_score smallint,
  p_feedback text,
  p_tags jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  was_inserted boolean := false;
begin
  insert into public.sentence_judgments (
    fingerprint, sentence_text, judge_version, model, score, feedback, tags
  ) values (
    p_fingerprint, left(p_sentence_text, 80), p_judge_version, p_model, p_score, p_feedback, p_tags
  )
  on conflict (fingerprint) do nothing
  returning true into was_inserted;

  if not coalesce(was_inserted, false) then
    update public.sentence_judgments
       set seen_count = seen_count + 1,
           last_seen_at = now()
     where fingerprint = p_fingerprint;
  end if;

  return coalesce(was_inserted, false);
end;
$$;

revoke execute on function public.cache_sentence_judgment(text, text, text, text, smallint, text, jsonb)
  from public;
revoke execute on function public.cache_sentence_judgment(text, text, text, text, smallint, text, jsonb)
  from anon;
revoke execute on function public.cache_sentence_judgment(text, text, text, text, smallint, text, jsonb)
  from authenticated;
grant execute on function public.cache_sentence_judgment(text, text, text, text, smallint, text, jsonb)
  to service_role;

commit;
