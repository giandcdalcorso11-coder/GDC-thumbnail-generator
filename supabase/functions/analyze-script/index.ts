// analyze-script
// Analizza lo script di un video (tono, argomento, mood, palette, titoli,
// pose/espressioni consigliate) con un motore di testo intercambiabile,
// esattamente come generate-thumbnail per le immagini: il frontend passa
// `provider_kind` + `provider_config` letti dalla riga attiva di
// thumb_text_providers, quindi cambiare motore = un click in Impostazioni,
// non una modifica di codice. Le chiavi restano solo come secret della
// Edge Function, mai nel browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type ProviderKind = "huggingface" | "anthropic" | "openai" | "gemini";

interface AnalyzeRequest {
  content: string;
  video_url?: string; // URL YouTube pubblico — solo Gemini lo può analizzare direttamente
  provider_kind?: ProviderKind;
  provider_config?: Record<string, unknown>;
  client_context?: { name?: string; niche?: string; tone?: string };
}

const SYSTEM_PROMPT = `Sei un art director specializzato in miniature YouTube ad alto CTR.
Ricevi lo script di un video (testo) OPPURE il video stesso da guardare direttamente,
e devi restituire SOLO un oggetto JSON valido (nessun testo fuori dal JSON, nessun
markdown, nessuna spiegazione) con questa forma esatta:

{
  "topic": "riassunto dell'argomento in una frase",
  "tone": "tono dominante (es: comico, drammatico, educativo, urgente, ispirazionale)",
  "keywords": ["parola chiave 1", "..."],
  "visual_mood": "descrizione breve dell'atmosfera visiva consigliata per la miniatura",
  "color_palette": ["#HEX1", "#HEX2", "#HEX3"],
  "title_suggestions": ["titolo breve 1", "titolo breve 2", "titolo breve 3"],
  "expression_suggestions": ["espressione facciale 1", "espressione facciale 2"],
  "pose_suggestions": ["posa/gesto 1", "posa/gesto 2"],
  "thumbnail_prompt": "un prompt in inglese pronto da passare a un modello di image generation, che descrive la scena della miniatura (soggetto, espressione, ambientazione, stile, colori) SENZA nominare persone reali o brand",
  "video_summary": "SOLO se hai guardato il video direttamente (non ti è stato fornito uno script): un riassunto in 4-6 frasi di cosa succede/di cosa si parla, utilizzabile come script di base. Se invece ti è stato fornito uno script, lascia questo campo vuoto."
}

Le title_suggestions devono essere brevi (max 6-7 parole), ad alto impatto, in italiano
se lo script è in italiano. I colori in color_palette devono essere coerenti col tono
e, se forniti, con i colori del brand del cliente.`;

function buildUserMessage(content: string, ctx: AnalyzeRequest["client_context"]): string {
  return [
    ctx?.name ? `Cliente/canale: ${ctx.name}` : null,
    ctx?.niche ? `Nicchia: ${ctx.niche}` : null,
    ctx?.tone ? `Tono abituale del canale: ${ctx.tone}` : null,
    "",
    "Script del video:",
    content,
  ].filter(Boolean).join("\n");
}

function extractJson(raw: string): unknown {
  let cleaned = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

// La chiave può arrivare incollata dall'utente in Impostazioni (provider_config.api_key,
// più comoda) oppure da un secret della Edge Function (più sicura, per quando il
// tool avrà più utenti) — qui proviamo prima la prima, poi la seconda.
function resolveApiKey(config: Record<string, unknown> | undefined, secretName: string): string | undefined {
  return (config?.api_key as string) || Deno.env.get(secretName);
}

async function runAnthropic(req: AnalyzeRequest): Promise<{ ok: boolean; analysis?: unknown; error?: string }> {
  const secretName = (req.provider_config?.secret_name as string) || "ANTHROPIC_API_KEY";
  const apiKey = resolveApiKey(req.provider_config, secretName);
  if (!apiKey) return { ok: false, error: `Chiave Anthropic non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — crea una chiave su console.anthropic.com/settings/keys.` };
  const model = (req.provider_config?.model as string) || "claude-haiku-4-5-20251001";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 1024, system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(req.content, req.client_context) }],
    }),
  });
  if (!res.ok) return { ok: false, error: `Anthropic error ${res.status}: ${await res.text()}` };
  const data = await res.json();
  const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
  try { return { ok: true, analysis: extractJson(textBlock?.text || "") }; }
  catch { return { ok: false, error: "Risposta del modello non in formato JSON valido" }; }
}

async function runOpenAI(req: AnalyzeRequest): Promise<{ ok: boolean; analysis?: unknown; error?: string }> {
  const secretName = (req.provider_config?.secret_name as string) || "OPENAI_API_KEY";
  const apiKey = resolveApiKey(req.provider_config, secretName);
  if (!apiKey) return { ok: false, error: `Chiave OpenAI non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — crea una chiave su platform.openai.com/api-keys.` };
  const model = (req.provider_config?.model as string) || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(req.content, req.client_context) },
      ],
    }),
  });
  if (!res.ok) return { ok: false, error: `OpenAI error ${res.status}: ${await res.text()}` };
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  try { return { ok: true, analysis: extractJson(text) }; }
  catch { return { ok: false, error: "Risposta del modello non in formato JSON valido" }; }
}

// Motore GRATUITO di default: Hugging Face Inference API su un modello
// instruct open-source. Nessun costo, serve solo un token gratuito da
// huggingface.co/settings/tokens. Il modello è configurabile in
// Impostazioni in qualsiasi momento (es. se quello di default non fosse
// più disponibile in hosted inference).
async function runHuggingFace(req: AnalyzeRequest): Promise<{ ok: boolean; analysis?: unknown; error?: string }> {
  const secretName = (req.provider_config?.secret_name as string) || "HF_TOKEN";
  const token = resolveApiKey(req.provider_config, secretName);
  if (!token) return { ok: false, error: `Chiave Hugging Face non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — crea un token gratuito su huggingface.co/settings/tokens.` };
  // ":hf-inference" fissa esplicitamente il provider gratuito di Hugging Face.
  // Senza questo suffisso il router sceglie in automatico QUALSIASI provider
  // disponibile per il modello — anche uno a pagamento con solo endpoint
  // dedicati (es. Together AI), che fallisce con un errore poco chiaro.
  const model = (req.provider_config?.model as string) || "Qwen/Qwen2.5-7B-Instruct:hf-inference";

  // API "chat completions" compatibile OpenAI.
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(req.content, req.client_context) },
      ],
    }),
  });
  if (res.status === 503) return { ok: false, error: "Modello in caricamento su Hugging Face, riprova tra qualche secondo." };
  if (!res.ok) return { ok: false, error: `Hugging Face error ${res.status}: ${await res.text()} — se il messaggio dice "model not supported", cambia il campo Modello in Impostazioni con un altro modello disponibile su huggingface.co/models.` };
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  try { return { ok: true, analysis: extractJson(text) }; }
  catch { return { ok: false, error: "Il modello gratuito non ha risposto in JSON valido — riprova, oppure cambia modello/provider in Impostazioni." }; }
}

// Google Gemini — unico motore che può GUARDARE il video direttamente da un
// URL YouTube pubblico (nessun download necessario), invece di leggere solo
// uno script incollato a mano. Tier gratuito disponibile su Google AI
// Studio (aistudio.google.com/apikey), nessuna carta richiesta.
async function runGemini(req: AnalyzeRequest): Promise<{ ok: boolean; analysis?: unknown; error?: string }> {
  const secretName = (req.provider_config?.secret_name as string) || "GEMINI_API_KEY";
  const apiKey = resolveApiKey(req.provider_config, secretName);
  if (!apiKey) return { ok: false, error: `Chiave Google Gemini non configurata. Incollala in Impostazioni → Motori AI, oppure imposta il secret '${secretName}' — crea una chiave gratuita su aistudio.google.com/apikey.` };
  const model = (req.provider_config?.model as string) || "gemini-2.5-flash";

  const parts: Record<string, unknown>[] = [];
  if (req.video_url) {
    parts.push({ fileData: { fileUri: req.video_url } });
    parts.push({ text: "Guarda questo video e analizzalo secondo le istruzioni. Non ti è stato fornito uno script scritto: usa il campo video_summary per riassumere di cosa parla, e basa tutto il resto dell'analisi su ciò che vedi/senti nel video." + (req.client_context ? "\n\n" + buildUserMessage("", req.client_context).replace(/\n*Script del video:\n*$/, "") : "") });
  } else {
    parts.push({ text: buildUserMessage(req.content, req.client_context) });
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `Gemini error ${res.status}: ${errText}${req.video_url ? " — verifica che il video sia pubblico (non privato/non in lista) e che l'URL sia valido." : ""}` };
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  try { return { ok: true, analysis: extractJson(text) }; }
  catch { return { ok: false, error: "Gemini non ha risposto in JSON valido — riprova, oppure verifica il modello in Impostazioni." }; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  let body: AnalyzeRequest;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: "Body JSON non valido" }, 400); }

  const content = (body.content || "").trim();
  const videoUrl = (body.video_url || "").trim();
  if (!content && !(videoUrl && body.provider_kind === "gemini")) {
    return jsonResponse({ ok: false, error: "Script vuoto" }, 400);
  }
  body.content = content;
  body.video_url = videoUrl || undefined;

  try {
    let result: { ok: boolean; analysis?: unknown; error?: string };
    switch (body.provider_kind) {
      case "anthropic": result = await runAnthropic(body); break;
      case "openai": result = await runOpenAI(body); break;
      case "gemini": result = await runGemini(body); break;
      case "huggingface":
      default: result = await runHuggingFace(body); break;
    }
    return jsonResponse(result, result.ok ? 200 : 422);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});
