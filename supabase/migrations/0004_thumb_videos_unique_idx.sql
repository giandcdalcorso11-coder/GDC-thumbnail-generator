-- L'upsert video di scripts/capture_frames.py usa
-- on_conflict=client_id,youtube_video_id, che richiede un vincolo
-- unique/exclusion esattamente su queste colonne — mancava sul progetto
-- Supabase dedicato (probabilmente perso nella migrazione dal progetto
-- iniziale), causando 400 Bad Request su ogni upsert.
create unique index if not exists thumb_videos_client_yt_uidx
  on public.thumb_videos (client_id, youtube_video_id);
