-- Provider di "modifica immagine via testo" (diverso da generazione da zero:
-- richiede un'immagine di input + istruzione), stesso pattern pluggable di
-- thumb_image_providers/thumb_text_providers (un solo "active" alla volta).
-- Più: preferenze di notifica per cliente (funzionalità implementata più
-- avanti — la UI e lo storage sono pronti già da ora).

create table if not exists public.thumb_edit_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('huggingface','fal','replicate')),
  config jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists thumb_edit_providers_active_uidx
  on public.thumb_edit_providers ((active)) where (active);

alter table public.thumb_edit_providers enable row level security;
create policy thumb_edit_providers_auth_all
  on public.thumb_edit_providers for all to authenticated using (true) with check (true);

insert into public.thumb_edit_providers (name, kind, config, active)
select 'Hugging Face — modifica immagine (gratis)', 'huggingface',
       '{"model":"timbrooks/instruct-pix2pix"}'::jsonb, true
where not exists (select 1 from public.thumb_edit_providers);

alter table public.thumb_clients
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
