-- GDC Thumbnail Studio — schema completo, progetto Supabase dedicato
-- (separato dal workspace GDC principale: nessuna tabella in comune)

create extension if not exists pgcrypto;

-- ── CLIENTS ──────────────────────────────────────────────────────────────
create table if not exists public.thumb_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel_url text,
  channel_id text,
  niche text,
  tone text,
  brand_colors jsonb default '[]'::jsonb,
  logo_path text,
  capture_mode text not null default 'manual' check (capture_mode in ('manual','auto','both')),
  notes text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── VIDEOS ────────────────────────────────────────────────────────────────
create table if not exists public.thumb_videos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.thumb_clients(id) on delete cascade,
  youtube_video_id text,
  title text not null,
  url text,
  published_at timestamptz,
  status text not null default 'new' check (status in ('new','script','generating','review','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists thumb_videos_client_yt_uidx
  on public.thumb_videos (client_id, youtube_video_id)
  where youtube_video_id is not null;

-- ── GALLERY IMAGES ────────────────────────────────────────────────────────
create table if not exists public.thumb_gallery_images (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.thumb_clients(id) on delete cascade,
  video_id uuid references public.thumb_videos(id) on delete set null,
  storage_path text not null,
  source text not null default 'manual' check (source in ('manual','auto')),
  status text not null default 'candidate' check (status in ('candidate','approved','rejected')),
  pose text,
  expression text,
  tags text[] default '{}',
  created_at timestamptz not null default now()
);

-- ── SCRIPTS + ANALISI AI ──────────────────────────────────────────────────
create table if not exists public.thumb_scripts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.thumb_videos(id) on delete cascade,
  client_id uuid not null references public.thumb_clients(id) on delete cascade,
  content text not null,
  analysis jsonb,
  analyzed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── MOTORE IMMAGINI (intercambiabile) ─────────────────────────────────────
create table if not exists public.thumb_image_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('huggingface','fal','replicate','manual')),
  config jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists thumb_image_providers_one_active
  on public.thumb_image_providers ((active)) where (active);

-- ── MOTORE TESTO / ANALISI SCRIPT (intercambiabile) ──────────────────────
create table if not exists public.thumb_text_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('huggingface','anthropic','openai','gemini')),
  config jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists thumb_text_providers_one_active
  on public.thumb_text_providers ((active)) where (active);

-- ── JOB DI GENERAZIONE ────────────────────────────────────────────────────
create table if not exists public.thumb_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.thumb_clients(id) on delete cascade,
  video_id uuid references public.thumb_videos(id) on delete cascade,
  provider_id uuid references public.thumb_image_providers(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  input jsonb not null default '{}'::jsonb,
  output_image_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── PROPOSTE FINALI (con supporto filigrana/sblocco a pagamento) ─────────
create table if not exists public.thumb_proposals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.thumb_clients(id) on delete cascade,
  video_id uuid not null references public.thumb_videos(id) on delete cascade,
  source_job_id uuid references public.thumb_jobs(id) on delete set null,
  storage_path text not null,
  title_text text,
  status text not null default 'draft' check (status in ('draft','approved','rejected','sent')),
  unlocked boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── RACCOLTA AUTOMATICA FRAME (yt-dlp + ffmpeg via GitHub Actions) ───────
create table if not exists public.thumb_capture_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.thumb_clients(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','done','error')),
  frames_found int,
  error_message text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- ── IMPOSTAZIONI DI PIATTAFORMA (filigrana) — riga singola ───────────────
create table if not exists public.thumb_app_settings (
  id text primary key default 'default',
  watermark_logo_path text,
  watermark_text text default 'GDC Thumbnail Studio',
  watermark_opacity numeric not null default 0.85,
  watermark_position text not null default 'bottom-right'
    check (watermark_position in ('bottom-right','bottom-left','top-right','top-left')),
  updated_at timestamptz not null default now()
);

-- ── RLS: tool a uso singolo/team ristretto, come il resto del workspace GDC ─
do $$
declare
  t text;
begin
  foreach t in array array[
    'thumb_clients','thumb_videos','thumb_gallery_images','thumb_scripts',
    'thumb_image_providers','thumb_text_providers','thumb_jobs','thumb_proposals',
    'thumb_capture_jobs','thumb_app_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t || '_auth_all', t
    );
  end loop;
end $$;

-- ── STORAGE BUCKET ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('thumb-assets', 'thumb-assets', false)
on conflict (id) do nothing;

create policy "thumb_assets_authenticated_all"
on storage.objects for all to authenticated
using (bucket_id = 'thumb-assets')
with check (bucket_id = 'thumb-assets');

-- ── SEED: provider gratuiti attivi di default ────────────────────────────
insert into public.thumb_image_providers (name, kind, config, active)
values
  ('Hugging Face — FLUX.1-schnell (gratuito)', 'huggingface',
    '{"model":"black-forest-labs/FLUX.1-schnell","secret_name":"HF_TOKEN"}'::jsonb, true),
  ('fal.ai — InstantID (identità coerente)', 'fal',
    '{"model":"fal-ai/instant-id","secret_name":"FAL_KEY"}'::jsonb, false),
  ('Replicate — InstantID (identità coerente)', 'replicate',
    '{"model":"zsxkib/instant-id","secret_name":"REPLICATE_API_TOKEN"}'::jsonb, false),
  ('Manuale (incolla/carica immagine)', 'manual', '{}'::jsonb, false)
on conflict do nothing;

insert into public.thumb_text_providers (name, kind, config, active)
values
  ('Hugging Face — Mistral-7B-Instruct (gratuito)', 'huggingface',
    '{"model":"mistralai/Mistral-7B-Instruct-v0.2","secret_name":"HF_TOKEN"}'::jsonb, true),
  ('Anthropic — Claude Haiku (a pagamento)', 'anthropic',
    '{"model":"claude-haiku-4-5-20251001","secret_name":"ANTHROPIC_API_KEY"}'::jsonb, false),
  ('OpenAI — GPT-4o mini (a pagamento)', 'openai',
    '{"model":"gpt-4o-mini","secret_name":"OPENAI_API_KEY"}'::jsonb, false)
on conflict do nothing;

insert into public.thumb_app_settings (id) values ('default') on conflict do nothing;
