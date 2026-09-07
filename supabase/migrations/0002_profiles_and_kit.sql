-- Profilo cliente collegato all'account che lo ha creato/rivendicato, e
-- "kit permanente" (foto/documenti/regole di stile riusabili su ogni video,
-- distinti dalla galleria volto legata al singolo video/screenshot).

alter table public.thumb_clients
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

create index if not exists thumb_clients_owner_idx on public.thumb_clients (owner_user_id);

create table if not exists public.thumb_client_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.thumb_clients(id) on delete cascade,
  kind text not null check (kind in ('image','document','note')),
  title text,
  storage_path text,
  note_text text,
  created_at timestamptz not null default now()
);

alter table public.thumb_client_assets enable row level security;
create policy thumb_client_assets_auth_all
  on public.thumb_client_assets for all to authenticated using (true) with check (true);
