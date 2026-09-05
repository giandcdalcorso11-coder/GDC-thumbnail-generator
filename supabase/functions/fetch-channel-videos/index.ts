// fetch-channel-videos
// Recupera gli ultimi video pubblici di un canale YouTube usando il feed RSS
// ufficiale (gratuito, nessuna API key richiesta). Il fetch è lato server
// perché youtube.com non manda header CORS permissivi per il browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface Req {
  channel_url?: string;
  channel_id?: string;
}

interface VideoEntry {
  youtube_video_id: string;
  title: string;
  url: string;
  published_at: string | null;
}

async function resolveChannelId(input: Req): Promise<string> {
  if (input.channel_id) return input.channel_id;
  const url = (input.channel_url || "").trim();
  if (!url) throw new Error("Fornisci channel_url o channel_id");

  const directMatch = url.match(/\/channel\/(UC[\w-]{10,})/);
  if (directMatch) return directMatch[1];

  // @handle, /c/, /user/, o solo dominio+handle: scarichiamo la pagina e
  // leggiamo il channelId canonico.
  const pageRes = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GDCThumbnailStudio/1.0)" },
  });
  if (!pageRes.ok) throw new Error(`Impossibile aprire ${url} (HTTP ${pageRes.status})`);
  const html = await pageRes.text();
  const m = html.match(/"channelId":"(UC[\w-]{10,})"/) || html.match(/channel\/(UC[\w-]{10,})/);
  if (!m) throw new Error("Channel ID non trovato nella pagina del canale");
  return m[1];
}

function parseRss(xml: string): VideoEntry[] {
  const entries: VideoEntry[] = [];
  const blocks = xml.split("<entry>").slice(1);
  for (const block of blocks) {
    const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = block.match(/<title>([^<]*)<\/title>/)?.[1];
    const published = block.match(/<published>([^<]+)<\/published>/)?.[1] || null;
    if (!id || !title) continue;
    entries.push({
      youtube_video_id: id,
      title: title.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
      url: `https://www.youtube.com/watch?v=${id}`,
      published_at: published,
    });
  }
  return entries;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  let body: Req;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Body JSON non valido" }, 400);
  }

  try {
    const channelId = await resolveChannelId(body);
    const feedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!feedRes.ok) throw new Error(`Feed RSS non raggiungibile (HTTP ${feedRes.status})`);
    const xml = await feedRes.text();
    const videos = parseRss(xml);
    return jsonResponse({ ok: true, channel_id: channelId, videos });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e instanceof Error ? e.message : e) }, 422);
  }
});
