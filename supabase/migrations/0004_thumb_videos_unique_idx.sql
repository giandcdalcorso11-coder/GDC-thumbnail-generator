-- L'upsert video di scripts/capture_frames.py usa
-- on_conflict=client_id,youtube_video_id, che richiede un indice/vincolo
-- unique NON parziale esattamente su queste colonne — sul progetto Supabase
-- dedicato ne esisteva già uno con lo stesso nome ma con un predicato
-- WHERE (youtube_video_id IS NOT NULL), che PostgREST non può usare come
-- target di ON CONFLICT (il predicato parziale non è inferibile dalla sola
-- lista di colonne). Lo ricreiamo pieno: gli indici unique normali di
-- Postgres trattano comunque i NULL come distinti tra loro, quindi non
-- serve alcuna clausola WHERE per permettere più video "manuali" senza
-- youtube_video_id per lo stesso cliente.
drop index if exists public.thumb_videos_client_yt_uidx;
create unique index thumb_videos_client_yt_uidx
  on public.thumb_videos (client_id, youtube_video_id);
notify pgrst, 'reload schema';
