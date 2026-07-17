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

-- Older revisions used SECURITY DEFINER RPC functions. The current backend
-- writes the table directly with the server-only Secret Key, so those RPCs are
-- no longer needed. Downgrade any existing copies to SECURITY INVOKER: even if
-- an old EXECUTE grant remains, RLS and the table grants above still block
-- browser roles. This deliberately avoids function-level REVOKE statements,
-- which some Supabase SQL Editor sessions reject while parsing migrations.
do $legacy_functions$
begin
  if to_regprocedure('public.cache_sentence_judgment(text,text,text,smallint,text,jsonb)') is not null then
    execute 'alter function public.cache_sentence_judgment(text, text, text, smallint, text, jsonb) security invoker';
  end if;
  if to_regprocedure('public.cache_sentence_judgment(text,text,text,text,smallint,text,jsonb)') is not null then
    execute 'alter function public.cache_sentence_judgment(text, text, text, text, smallint, text, jsonb) security invoker';
  end if;
end
$legacy_functions$;

commit;
