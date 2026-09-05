// analyze-script
// Riceve lo script/testo di un video e restituisce un'analisi (tono, argomento,
// mood visivo, palette, idee di titolo, pose/espressioni consigliate) usando
// Claude. La chiave API non tocca mai il browser: resta come secret dell'Edge
// Function (ANTHROPIC_API_KEY), impostabile da Supabase Dashboard → Edge
// Functions → Secrets, o via `supabase secrets set ANTHROPIC_API_KEY=...`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const ANTHROPIC_MODEL = Deno.env.get("ANALYZE_MODEL") || "claude-haiku-4-5-20251001";

interface AnalyzeRequest {
  content: string;
  client_context?: {
    name?: string;
    niche?: string;
    tone?: string;
  };
}

const SYSTEM_PROMPT = `Sei un art director specializzato in miniature YouTube ad alto CTR.
Ricevi lo script (o una bozza/scaletta) di un video e devi restituire SOLO un
oggetto JSON valido (nessun testo fuori dal JSON, nessun markdown) con questa forma esatta:

{
  "topic": "riassunto dell'argomento in una frase",
  "tone": "tono dominante (es: comico, drammatico, educativo, urgente, ispirazionale)",
  "keywords": ["parola chiave 1", "..."],
  "visual_mood": "descrizione breve dell'atmosfera visiva consigliata per la miniatura",
  "color_palette": ["#HEX1", "#HEX2", "#HEX3"],
  "title_suggestions": ["titolo breve 1", "titolo breve 2", "titolo breve 3"],
  "expression_suggestions": ["espressione facciale 1", "espressione facciale 2"],
  "pose_suggestions": ["posa/gesto 1", "posa/gesto 2"],
  "thumbnail_prompt": "un prompt in inglese pronto da passare a un modello di image generation, che descrive la scena della miniatura (soggetto, espressione, ambientazione, stile, colori) SENZA nominare persone reali o brand"
}

Le title_suggestions devono essere brevi (max 6-7 parole), ad alto impatto, in italiano
se lo script è in italiano. I colori in color_palette devono essere coerenti col tono
e, se forniti, con i colori del brand del cliente.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse({
      ok: false,
      error: "ANTHROPIC_API_KEY non configurata sul progetto Supabase. Impostala nei secrets della Edge Function per abilitare l'analisi AI dello script.",
    }, 500);
  }

  let body: AnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Body JSON non valido" }, 400);
  }

  const content = (body.content || "").trim();
  if (!content) return jsonResponse({ ok: false, error: "Script vuoto" }, 400);

  const ctx = body.client_context || {};
  const userMsg = [
    ctx.name ? `Cliente/canale: ${ctx.name}` : null,
    ctx.niche ? `Nicchia: ${ctx.niche}` : null,
    ctx.tone ? `Tono abituale del canale: ${ctx.tone}` : null,
    "",
    "Script del video:",
    content,
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({ ok: false, error: `Anthropic API error ${res.status}: ${errText}` }, 502);
    }

    const data = await res.json();
    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    const raw = textBlock?.text || "";

    let analysis;
    try {
      const cleaned = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      return jsonResponse({ ok: false, error: "Risposta del modello non in formato JSON valido", raw }, 502);
    }

    return jsonResponse({ ok: true, analysis });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});
