// edit-image — versione a FILE SINGOLO (per incollare direttamente
// nell'editor della Dashboard Supabase, senza gestire l'import condiviso).
// Sorgente "vera" e mantenuta: supabase/functions/edit-image/index.ts
//
// Modifica un'immagine esistente (galleria/kit) via istruzione testuale
// ("rendi lo sfondo più scuro", "aggiungi un sorriso"...), con provider
// intercambiabile — stesso pattern pluggable di generate-thumbnail/
// analyze-script. Il frontend passa `provider_kind` + `provider_config`
// letti dalla riga attiva di thumb_edit_providers.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ProviderKind = "huggingface" | "fal" | "replicate" | "openai";

interface EditRequest {
  provider_kind: ProviderKind;
  provider_config?: Record<string, unknown>;
  image_url: string;
  edit_prompt: string;
}

interface ProviderResult {
  ok: boolean;
  image_base64?: string;
  error?: string;
  status?: "processing";
  poll_ref?: string;
}

function resolveApiKey(config: Record<string, unknown> | undefined, secretName: string): string | undefined {
  return (config?.api_key as string) || Deno.env.get(secretName);
}

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossibile scaricare l'immagine (HTTP ${res.status})`);
  const contentType = res.headers.get("content-type") || "image/png";
  const buf = await res.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `data:${contentType};base64,${b64}`;
}

async function runHuggingFace(req: EditRequest): Promise<ProviderResult> {
  const secretName = (req.provider_config?.secret_name as string) || "HF_TOKEN";
  const token = resolveApiKey(req.provider_config, secretName);
  if (!token) {
    return { ok: false, error: `Chiave Hugging Face non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — è gratuita su huggingface.co/settings/tokens.` };
  }
  const model = (req.provider_config?.model as string) || "timbrooks/instruct-pix2pix";

  const imgRes = await fetch(req.image_url);
  if (!imgRes.ok) return { ok: false, error: `Impossibile scaricare l'immagine di partenza (HTTP ${imgRes.status})` };
  const imgBuf = await imgRes.arrayBuffer();
  const imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));

  const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" },
    body: JSON.stringify({ inputs: imgB64, parameters: { prompt: req.edit_prompt } }),
  });
  if (res.status === 503) {
    const info = await res.json().catch(() => ({}));
    return { ok: false, error: `Modello in caricamento su Hugging Face, riprova tra ~${Math.ceil(info.estimated_time || 20)}s.` };
  }
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `Hugging Face error ${res.status}: ${errText} — se il modello non supporta questo formato, cambialo in Impostazioni → Motori AI (cerca modelli "image-to-image" su huggingface.co/models).` };
  }
  const buf = await res.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { ok: true, image_base64: `data:image/png;base64,${b64}` };
}

async function runFal(req: EditRequest): Promise<ProviderResult> {
  const secretName = (req.provider_config?.secret_name as string) || "FAL_KEY";
  const key = resolveApiKey(req.provider_config, secretName);
  if (!key) {
    return { ok: false, error: `Chiave fal.ai non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — su fal.ai trovi crediti gratuiti di benvenuto.` };
  }
  const model = (req.provider_config?.model as string) || "fal-ai/flux-pro/kontext";

  const payload: Record<string, unknown> = {
    prompt: req.edit_prompt,
    image_url: req.image_url,
    ...(req.provider_config?.extra_params as Record<string, unknown> | undefined),
  };

  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `fal.ai error ${res.status}: ${errText}` };
  }
  const data = await res.json();
  const url = data?.images?.[0]?.url || data?.image?.url;
  if (!url) return { ok: false, error: "fal.ai: nessuna immagine nella risposta" };
  return { ok: true, image_base64: await urlToBase64(url) };
}

async function runReplicate(req: EditRequest): Promise<ProviderResult> {
  const secretName = (req.provider_config?.secret_name as string) || "REPLICATE_API_TOKEN";
  const token = resolveApiKey(req.provider_config, secretName);
  if (!token) {
    return { ok: false, error: `Chiave Replicate non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — crea un token su replicate.com/account/api-tokens.` };
  }
  const version = req.provider_config?.version as string | undefined;
  const model = req.provider_config?.model as string | undefined;

  const input: Record<string, unknown> = {
    prompt: req.edit_prompt,
    image: req.image_url,
    ...(req.provider_config?.extra_params as Record<string, unknown> | undefined),
  };

  const body = version ? { version, input } : { input };
  const url = version || !model
    ? "https://api.replicate.com/v1/predictions"
    : `https://api.replicate.com/v1/models/${model}/predictions`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json", Prefer: "wait=55" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `Replicate error ${res.status}: ${errText}` };
  }
  const pred = await res.json();
  if (pred.status === "succeeded") {
    const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    if (!out) return { ok: false, error: "Replicate: predizione riuscita ma senza output" };
    return { ok: true, image_base64: await urlToBase64(out) };
  }
  if (pred.status === "failed" || pred.status === "canceled") {
    return { ok: false, error: `Replicate: predizione ${pred.status} — ${pred.error || "errore sconosciuto"}` };
  }
  return { ok: false, status: "processing", poll_ref: pred.id, error: "Modifica ancora in corso su Replicate, riprova tra poco." };
}

// OpenAI — editing diretto via /v1/images/edits (multipart/form-data:
// immagine + istruzione, nessuna maschera richiesta con gpt-image-1).
async function runOpenAI(req: EditRequest): Promise<ProviderResult> {
  const secretName = (req.provider_config?.secret_name as string) || "OPENAI_API_KEY";
  const apiKey = resolveApiKey(req.provider_config, secretName);
  if (!apiKey) {
    return { ok: false, error: `Chiave OpenAI non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — crea una chiave su platform.openai.com/api-keys.` };
  }
  const model = (req.provider_config?.model as string) || "gpt-image-1";

  const imgRes = await fetch(req.image_url);
  if (!imgRes.ok) return { ok: false, error: `Impossibile scaricare l'immagine di partenza (HTTP ${imgRes.status})` };
  const imgBlob = await imgRes.blob();

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", req.edit_prompt);
  form.append("image", imgBlob, "image.png");

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `OpenAI error ${res.status}: ${errText}` };
  }
  const data = await res.json();
  const item = data?.data?.[0];
  if (item?.b64_json) return { ok: true, image_base64: `data:image/png;base64,${item.b64_json}` };
  if (item?.url) return { ok: true, image_base64: await urlToBase64(item.url) };
  return { ok: false, error: "OpenAI: nessuna immagine nella risposta" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  let body: EditRequest;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: "Body JSON non valido" }, 400); }

  if (!body.image_url) return jsonResponse({ ok: false, error: "Manca 'image_url'" }, 400);
  if (!body.edit_prompt?.trim()) return jsonResponse({ ok: false, error: "Scrivi un'istruzione di modifica" }, 400);

  try {
    let result: ProviderResult;
    switch (body.provider_kind) {
      case "huggingface": result = await runHuggingFace(body); break;
      case "fal": result = await runFal(body); break;
      case "replicate": result = await runReplicate(body); break;
      case "openai": result = await runOpenAI(body); break;
      default: result = { ok: false, error: `Provider sconosciuto: ${body.provider_kind}` };
    }
    return jsonResponse(result, result.ok ? 200 : 422);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});
