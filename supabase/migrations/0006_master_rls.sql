-- GDC Thumbnail Studio — accesso reale Master vs Cliente
--
-- Finora ogni tabella aveva policy "for all to authenticated using (true)":
-- qualsiasi account con login valido (compreso un qualsiasi cliente che ha
-- creato un profilo da onboarding.html) poteva leggere/scrivere i dati di
-- TUTTI i clienti, non solo i propri. Questa migrazione introduce una vera
-- distinzione: il Master (l'account del titolare GDC) vede/gestisce tutto;
-- un cliente vede/gestisce solo i dati collegati al proprio profilo
-- (thumb_clients.owner_user_id = il suo user id), sia a livello di tabelle
-- sia di file nello storage bucket 'thumb-assets'.
--
-- NOTA: le tabelle di configurazione globale dei motori AI
-- (thumb_image_providers, thumb_text_providers, thumb_edit_providers) e
-- thumb_app_settings restano permissive per ora — sono condivise da tutti i
-- clienti per come è strutturato oggi il tool (non esiste ancora un motore
-- "per cliente", solo una riga attiva globale). Vanno riviste quando si
-- lavora sulla webapp clienti per rendere i motori davvero per-cliente.

-- ── HELPER: chi è il Master ──────────────────────────────────────────────
create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'giandcdalcorso11@gmail.com';
$$;

-- ── HELPER: l'utente corrente possiede questo client_id? ─────────────────
create or replace function public.owns_client(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.thumb_clients c
    where c.id = cid and c.owner_user_id = auth.uid()
  );
$$;

-- ── THUMB_CLIENTS ─────────────────────────────────────────────────────────
drop policy if exists thumb_clients_auth_all on public.thumb_clients;

create policy thumb_clients_select on public.thumb_clients for select to authenticated
  using (is_master() or owner_user_id = auth.uid() or owner_user_id is null);

create policy thumb_clients_insert on public.thumb_clients for insert to authenticated
  with check (is_master() or owner_user_id = auth.uid());

-- using: permette di aggiornare una riga propria O una non ancora
-- rivendicata (serve per il flusso "claim" di onboarding.html); check:
-- il risultato finale deve restare proprio o del Master (impedisce di
-- assegnare un profilo a un altro utente).
create policy thumb_clients_update on public.thumb_clients for update to authenticated
  using (is_master() or owner_user_id = auth.uid() or owner_user_id is null)
  with check (is_master() or owner_user_id = auth.uid());

create policy thumb_clients_delete on public.thumb_clients for delete to authenticated
  using (is_master());

-- ── TABELLE FIGLIE (scoped via client_id) ────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'thumb_videos','thumb_gallery_images','thumb_scripts','thumb_jobs',
    'thumb_proposals','thumb_capture_jobs','thumb_client_assets'
  ]
  loop
    execute format('drop policy if exists %I on public.%I;', t || '_auth_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (is_master() or public.owns_client(client_id)) with check (is_master() or public.owns_client(client_id));',
      t || '_owner_all', t
    );
  end loop;
end $$;

-- ── STORAGE: bucket thumb-assets, scoped via clients/<client_id>/... ─────
create or replace function public.owns_storage_path(path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cid text;
begin
  if public.is_master() then
    return true;
  end if;
  cid := (storage.foldername(path))[2];
  if cid is null or cid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.owns_client(cid::uuid);
end;
$$;

drop policy if exists "thumb_assets_authenticated_all" on storage.objects;

create policy thumb_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'thumb-assets' and public.owns_storage_path(name));

create policy thumb_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'thumb-assets' and public.owns_storage_path(name));

create policy thumb_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'thumb-assets' and public.owns_storage_path(name))
  with check (bucket_id = 'thumb-assets' and public.owns_storage_path(name));

create policy thumb_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'thumb-assets' and public.owns_storage_path(name));
