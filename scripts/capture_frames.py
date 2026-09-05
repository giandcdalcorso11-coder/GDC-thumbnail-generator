#!/usr/bin/env python3
"""
capture_frames.py — GDC Thumbnail Studio

Raccolta automatica di screenshot del volto dai video di un canale YouTube.
Eseguito da GitHub Actions (.github/workflows/capture_frames.yml), su
schedule o manualmente (workflow_dispatch), legge le righe in coda nella
tabella `thumb_capture_jobs` (create dal tool quando l'utente clicca
"Avvia raccolta automatica"), scarica i video più recenti del canale con
yt-dlp, estrae fotogrammi con ffmpeg, tiene solo quelli con un volto
rilevato (OpenCV) e li carica come candidati nella galleria del cliente
per la revisione manuale nel tool.

Richiede i secret di repository GitHub:
  SUPABASE_URL               (es. https://xxxx.supabase.co)
  SUPABASE_SERVICE_ROLE_KEY  (service role key — bypassa la RLS, mai esposta al browser)
"""
import os
import re
import sys
import json
import uuid
import shutil
import tempfile
import subprocess
from datetime import datetime, timezone

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "thumb-assets"

MAX_JOBS_PER_RUN = int(os.environ.get("MAX_JOBS_PER_RUN", "3"))
VIDEOS_PER_CLIENT = int(os.environ.get("VIDEOS_PER_CLIENT", "3"))
FRAMES_PER_VIDEO = int(os.environ.get("FRAMES_PER_VIDEO", "6"))
MAX_VIDEO_HEIGHT = os.environ.get("MAX_VIDEO_HEIGHT", "480")

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ── SUPABASE REST HELPERS ────────────────────────────────────────────────
def sb_select(table, query):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{query}", headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_update(table, match, data):
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/{table}?{match}", headers=HEADERS, json=data, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_insert(table, data):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers={**HEADERS, "Prefer": "return=representation"}, json=data, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_upsert_video(client_id, youtube_video_id, title, url, published_at):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/thumb_videos?on_conflict=client_id,youtube_video_id",
        headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"},
        json={
            "client_id": client_id, "youtube_video_id": youtube_video_id,
            "title": title, "url": url, "published_at": published_at,
        },
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None


def sb_upload_file(path, local_path, content_type="image/jpeg"):
    with open(local_path, "rb") as f:
        r = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
                     "Content-Type": content_type, "x-upsert": "true"},
            data=f.read(), timeout=60,
        )
    r.raise_for_status()


# ── YOUTUBE (RSS pubblico, nessuna API key) ──────────────────────────────
def resolve_channel_id(channel_url):
    m = re.search(r"/channel/(UC[\w-]{10,})", channel_url)
    if m:
        return m.group(1)
    resp = requests.get(channel_url, headers={"User-Agent": "Mozilla/5.0 (compatible; GDCThumbnailStudio/1.0)"}, timeout=20)
    resp.raise_for_status()
    m = re.search(r'"channelId":"(UC[\w-]{10,})"', resp.text) or re.search(r"channel/(UC[\w-]{10,})", resp.text)
    if not m:
        raise RuntimeError(f"Channel ID non trovato per {channel_url}")
    return m.group(1)


def fetch_recent_videos(channel_id, limit):
    resp = requests.get(f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}", timeout=20)
    resp.raise_for_status()
    xml = resp.text
    out = []
    for block in xml.split("<entry>")[1:]:
        vid = re.search(r"<yt:videoId>([^<]+)</yt:videoId>", block)
        title = re.search(r"<title>([^<]*)</title>", block)
        published = re.search(r"<published>([^<]+)</published>", block)
        if not vid or not title:
            continue
        out.append({
            "youtube_video_id": vid.group(1),
            "title": title.group(1),
            "url": f"https://www.youtube.com/watch?v={vid.group(1)}",
            "published_at": published.group(1) if published else None,
        })
        if len(out) >= limit:
            break
    return out


# ── DOWNLOAD + ESTRAZIONE FRAME ──────────────────────────────────────────
def download_video(url, out_dir):
    out_path = os.path.join(out_dir, "video.mp4")
    fmt = f"bestvideo[height<={MAX_VIDEO_HEIGHT}][ext=mp4]+bestaudio[ext=m4a]/best[height<={MAX_VIDEO_HEIGHT}][ext=mp4]/best"
    subprocess.run(
        ["yt-dlp", "-f", fmt, "-o", out_path, "--no-playlist", "--quiet", "--no-warnings", url],
        check=True, timeout=900,
    )
    return out_path


def get_duration_seconds(video_path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def extract_frames(video_path, out_dir, count):
    duration = get_duration_seconds(video_path)
    # evita i primi/ultimi secondi (intro/outro/sponsor spesso meno rappresentativi)
    margin = duration * 0.08
    usable = max(duration - 2 * margin, 1)
    frames = []
    for i in range(count):
        ts = margin + usable * (i + 1) / (count + 1)
        frame_path = os.path.join(out_dir, f"frame_{i}.jpg")
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(ts), "-i", video_path, "-frames:v", "1", "-q:v", "3", frame_path],
            check=True, capture_output=True, timeout=60,
        )
        if os.path.exists(frame_path):
            frames.append(frame_path)
    return frames


def frame_has_face(frame_path):
    import cv2
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)
    img = cv2.imread(frame_path)
    if img is None:
        return False
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(int(img.shape[1] * 0.12), int(img.shape[1] * 0.12)))
    return len(faces) > 0


# ── PROCESSO PRINCIPALE ──────────────────────────────────────────────────
def process_job(job):
    client_id = job["client_id"]
    sb_update("thumb_capture_jobs", f"id=eq.{job['id']}", {"status": "running", "started_at": now_iso()})

    clients = sb_select("thumb_clients", f"id=eq.{client_id}&select=*")
    if not clients:
        raise RuntimeError("Cliente non trovato")
    client = clients[0]
    if not client.get("channel_url"):
        raise RuntimeError("Il cliente non ha un URL canale impostato")

    channel_id = resolve_channel_id(client["channel_url"])
    videos = fetch_recent_videos(channel_id, VIDEOS_PER_CLIENT)
    if not videos:
        sb_update("thumb_capture_jobs", f"id=eq.{job['id']}", {"status": "done", "frames_found": 0, "finished_at": now_iso()})
        return

    total_frames = 0
    for v in videos:
        video_row = sb_upsert_video(client_id, v["youtube_video_id"], v["title"], v["url"], v["published_at"])
        with tempfile.TemporaryDirectory() as tmp:
            try:
                video_path = download_video(v["url"], tmp)
            except Exception as e:
                print(f"  ! download fallito per {v['url']}: {e}", file=sys.stderr)
                continue
            frames = extract_frames(video_path, tmp, FRAMES_PER_VIDEO)
            for frame_path in frames:
                try:
                    if not frame_has_face(frame_path):
                        continue
                except Exception as e:
                    print(f"  ! rilevamento volto fallito: {e}", file=sys.stderr)
                    continue
                storage_path = f"clients/{client_id}/gallery/{uuid.uuid4()}.jpg"
                sb_upload_file(storage_path, frame_path)
                sb_insert("thumb_gallery_images", {
                    "client_id": client_id,
                    "video_id": video_row["id"] if video_row else None,
                    "storage_path": storage_path,
                    "source": "auto",
                    "status": "candidate",
                })
                total_frames += 1

    sb_update("thumb_capture_jobs", f"id=eq.{job['id']}", {"status": "done", "frames_found": total_frames, "finished_at": now_iso()})
    print(f"Job {job['id']}: {total_frames} frame candidati raccolti per {client['name']}")


def main():
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        print("ffmpeg/ffprobe non trovati sul runner", file=sys.stderr)
        sys.exit(1)

    jobs = sb_select("thumb_capture_jobs", f"status=eq.queued&select=*&order=requested_at.asc&limit={MAX_JOBS_PER_RUN}")
    if not jobs:
        print("Nessun job in coda.")
        return

    for job in jobs:
        print(f"Elaboro job {job['id']} (cliente {job['client_id']})…")
        try:
            process_job(job)
        except Exception as e:
            print(f"  ! job fallito: {e}", file=sys.stderr)
            try:
                sb_update("thumb_capture_jobs", f"id=eq.{job['id']}", {
                    "status": "error", "error_message": str(e)[:500], "finished_at": now_iso(),
                })
            except Exception:
                pass


if __name__ == "__main__":
    main()
