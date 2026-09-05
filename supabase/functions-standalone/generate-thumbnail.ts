// generate-thumbnail — versione a FILE SINGOLO (per incollare direttamente
// nell'editor della Dashboard Supabase, senza gestire l'import condiviso).
// Sorgente "vera" e mantenuta: supabase/functions/generate-thumbnail/index.ts
//
// Punto unico di generazione immagini, con provider intercambiabile. Il
// frontend passa `provider_kind` + `provider_config` (letti dalla riga
// attiva di thumb_image_providers) così cambiare motore di generazione è
// una modifica di dati (tabella), non di codice.
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

type ProviderKind = "huggingface" | "fal" | "replicate" | "manual";

interface GenerateRequest {
  provider_kind: ProviderKind;
  provider_config?: Record<string, unknown>;
  prompt: string;
  negative_prompt?: string;
  reference_image_urls?: string[];
  aspect_ratio?: string; // es. "16:9"
  seed?: number;
}

interface ProviderResult {
  ok: boolean;
  image_base64?: string; // data URL o base64 puro
  image_url?: string;
  error?: string;
  status?: "processing";
  poll_ref?: string;
}

// La chiave può arrivare in due modi, in ordine di priorità:
// 1. incollata dall'utente nella pagina "Motori AI" (salvata in
//    thumb_image_providers.config.api_key, arriva qui dentro provider_config) —
//    più comodo, ma visibile a chiunque acceda al progetto Supabase finché il
//    tool resta a singolo utente/non isolato.
// 2. un secret della Edge Function (Deno.env), impostato via Dashboard —
//    resta l'opzione più sicura per quando il tool avrà più utenti.
function resolveApiKey(config: Record<string, unknown> | undefined, secretName: string): string | undefined {
  return (config?.api_key as string) || Deno.env.get(secretName);
}

async function runHuggingFace(req: GenerateRequest): Promise<ProviderResult> {
  const secretName = (req.provider_config?.secret_name as string) || "HF_TOKEN";
  const token = resolveApiKey(req.provider_config, secretName);
  if (!token) {
    return { ok: false, error: `Chiave Hugging Face non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — è gratuita su huggingface.co/settings/tokens.` };
  }
  const model = (req.provider_config?.model as string) || "black-forest-labs/FLUX.1-schnell";

  // api-inference.huggingface.co è stato dismesso: il nuovo gateway unificato
  // di Hugging Face è router.huggingface.co (stesso backend "hf-inference").
  const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({
      inputs: req.prompt,
      parameters: { negative_prompt: req.negative_prompt },
    }),
  });

  if (res.status === 503) {
    const info = await res.json().catch(() => ({}));
    return { ok: false, error: `Modello in caricamento su Hugging Face, riprova tra ~${Math.ceil(info.estimated_time || 20)}s.` };
  }
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `Hugging Face error ${res.status}: ${errText}` };
  }
  const buf = await res.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { ok: true, image_base64: `data:image/png;base64,${b64}` };
}

// Scarica un'immagine da URL esterno (fal.ai/Replicate) e la converte in
// data URL base64. Fatto lato server per evitare che il canvas dell'editor
// (frontend) risulti "tainted" da CORS quando esporta il PNG finale.
async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossibile scaricare l'immagine generata (HTTP ${res.status})`);
  const contentType = res.headers.get("content-type") || "image/png";
  const buf = await res.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `data:${contentType};base64,${b64}`;
}

async function runFal(req: GenerateRequest): Promise<ProviderResult> {
  const secretName = (req.provider_config?.secret_name as string) || "FAL_KEY";
  const key = resolveApiKey(req.provider_config, secretName);
  if (!key) {
    return { ok: false, error: `Chiave fal.ai non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — su fal.ai trovi crediti gratuiti di benvenuto.` };
  }
  const model = (req.provider_config?.model as string) || "fal-ai/instant-id";

  const payload: Record<string, unknown> = {
    prompt: req.prompt,
    negative_prompt: req.negative_prompt,
    image_url: req.reference_image_urls?.[0],
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
  if (!url) return { ok: false, error: "fal.ai: nessuna immagine nella risposta", };
  return { ok: true, image_base64: await urlToBase64(url) };
}

async function runReplicate(req: GenerateRequest): Promise<ProviderResult> {
  const secretName = (req.provider_config?.secret_name as string) || "REPLICATE_API_TOKEN";
  const token = resolveApiKey(req.provider_config, secretName);
  if (!token) {
    return { ok: false, error: `Chiave Replicate non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — crea un token su replicate.com/account/api-tokens.` };
  }
  const version = req.provider_config?.version as string | undefined;
  const model = req.provider_config?.model as string | undefined;

  const input: Record<string, unknown> = {
    prompt: req.prompt,
    negative_prompt: req.negative_prompt,
    image: req.reference_image_urls?.[0],
    ...(req.provider_config?.extra_params as Record<string, unknown> | undefined),
  };

  const body = version ? { version, input } : { input };
  const url = version || !model
    ? "https://api.replicate.com/v1/predictions"
    : `https://api.replicate.com/v1/models/${model}/predictions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=55", // sincrono fino a 55s, resta dentro i limiti della Edge Function
    },
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
  // Ancora in corso oltre i 55s di attesa sincrona
  return { ok: false, status: "processing", poll_ref: pred.id, error: "Generazione ancora in corso su Replicate, riprova tra poco." };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Body JSON non valido" }, 400);
  }

  if (!body.prompt) return jsonResponse({ ok: false, error: "Manca 'prompt'" }, 400);

  try {
    let result: ProviderResult;
    switch (body.provider_kind) {
      case "huggingface":
        result = await runHuggingFace(body);
        break;
      case "fal":
        result = await runFal(body);
        break;
      case "replicate":
        result = await runReplicate(body);
        break;
      case "manual":
        result = { ok: false, error: "Provider 'manuale' selezionato: carica o incolla l'immagine direttamente nella scheda Genera/Proposte, non serve chiamare questa funzione." };
        break;
      default:
        result = { ok: false, error: `Provider sconosciuto: ${body.provider_kind}` };
    }
    return jsonResponse(result, result.ok ? 200 : 422);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});
