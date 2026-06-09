// POST /api/render  — Cloudflare Pages Function
// Receives a photo (multipart/form-data field "photo"), renders a hedcut engraving
// via the Gemini image API, and returns the result as a PNG.
//
// The Gemini key lives ONLY here, as the encrypted env var GEMINI_API_KEY.
// Guardrails (invisible to the visitor):
//   - Origin/Referer must match ALLOWED_HOST (so other sites can't borrow the key)
//   - Daily render cap via a KV namespace bound as RATE_KV (so the key can't be drained)

const PROMPT = [
  'Transform this photograph into a black-and-white "hedcut" stipple-and-line',
  'engraving portrait, in the exact style of a Wall Street Journal headshot',
  'illustration. Build all tone from fine black ink on a pure white background:',
  'tightly spaced hatching and cross-hatching lines that follow the contours of',
  'the face and hair, with delicate stippling (dots) in the midtone and transition',
  'areas. No color, no flat gray fills, no shading blocks — tone comes entirely',
  'from line density and dot spacing. Crisp, sharp engraved lines. Preserve the',
  "subject's exact likeness, facial features, proportions, and expression with",
  'high fidelity. Dignified, refined editorial engraving. Head-and-shoulders',
  'composition, softly fading to white at the lower edges. White background.'
].join(' ');

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB upload ceiling

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1) Origin lock — only our own site may call this endpoint.
  if (env.ALLOWED_HOST) {
    const ref = request.headers.get('origin') || request.headers.get('referer') || '';
    let ok = false;
    try { ok = ref && new URL(ref).host === env.ALLOWED_HOST; } catch (_) {}
    if (!ok) return json(403, { error: 'This studio can only be used from its own page.' });
  }

  // 2) Daily cap — protects the key from being drained.
  const cap = parseInt(env.DAILY_CAP || '40', 10);
  if (env.RATE_KV) {
    const day = new Date().toISOString().slice(0, 10);
    const key = `count:${day}`;
    const used = parseInt((await env.RATE_KV.get(key)) || '0', 10);
    if (used >= cap) {
      return json(429, { error: 'The studio is resting for today — please try again tomorrow.' });
    }
    // reserve a slot (expires after ~26h so the daily window self-clears)
    await env.RATE_KV.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  }

  if (!env.GEMINI_API_KEY) return json(500, { error: 'The studio is not configured yet.' });

  // 3) Read the uploaded photo.
  let file;
  try {
    const form = await request.formData();
    file = form.get('photo');
  } catch (_) {
    return json(400, { error: 'Could not read the photo. Please try again.' });
  }
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json(400, { error: 'Please choose a photograph first.' });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length === 0) return json(400, { error: 'That photo appears to be empty.' });
  if (buf.length > MAX_BYTES) return json(413, { error: 'That photo is too large — please use one under 12 MB.' });

  const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  const base64 = bytesToBase64(buf);

  // 4) Call Gemini.
  const model = env.GEMINI_MODEL || 'gemini-3-pro-image-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [
      { role: 'user', parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mimeType, data: base64 } }
      ] }
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE']
    }
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (_) {
    return json(502, { error: 'The studio could not be reached. Please try again in a moment.' });
  }

  if (!resp.ok) {
    return json(502, { error: 'The engraving could not be completed. Please try another photo.' });
  }

  let data;
  try { data = await resp.json(); } catch (_) {
    return json(502, { error: 'Unexpected response from the studio. Please try again.' });
  }

  // 5) Extract the first image part (response uses camelCase inlineData).
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  let imgB64 = null, outMime = 'image/png';
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data;
    if (inline && inline.data) { imgB64 = inline.data; outMime = inline.mimeType || inline.mime_type || outMime; break; }
  }
  if (!imgB64) return json(502, { error: 'No engraving was produced. Please try a clearer, front-facing photo.' });

  const out = Uint8Array.from(atob(imgB64), c => c.charCodeAt(0));
  return new Response(out, {
    status: 200,
    headers: { 'content-type': outMime, 'cache-control': 'no-store' }
  });
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json(405, { error: 'Method not allowed.' });
}
