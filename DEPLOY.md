# Hedcut Studio — Deploy Guide (Cloudflare Pages)

A gift web app: visitor opens thepic.me, drops in a photo, downloads a WSJ-style
hedcut engraving. Frontend is static; the Gemini key lives only in the Cloudflare
backend function. Nothing for the recipient to configure.

## Files
- `public/index.html` — the page Yvon sees (frontend).
- `functions/api/render.js` — backend: holds the key, calls Gemini, returns the engraving.

## One-time setup (about 10 minutes)

### 1. Create the Cloudflare Pages project
Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → select
the `thepic` repo. Build command: *none*. Build output directory: `public`.
(Functions in `/functions` are picked up automatically.)

### 2. Set environment variables (Pages project → Settings → Variables and Secrets)
- `GEMINI_API_KEY` — **Secret.** Your Gemini key. *You* paste this; it never leaves Cloudflare.
- `ALLOWED_HOST` — `thepic.me` (locks the backend so only your own page can use the key).
- `DAILY_CAP` *(optional)* — max renders per day. Default `40`.
- `GEMINI_MODEL` *(optional)* — default `gemini-3-pro-image-preview` (matches our tests).
  Alternative: `gemini-3.1-flash-image` (faster/cheaper).
- `IMAGE_SIZE` *(optional)* — `1K`, `2K` (default), or `4K`.

### 3. Bind a KV namespace for the daily cap
Pages project → **Settings → Functions → KV namespace bindings** → Add:
- Variable name: `RATE_KV`
- Namespace: create one (e.g. `engraving-rate`)
(If you skip this, the app still works but the daily cap is not enforced.)

### 4. Point thepic.me
Pages project → **Custom domains → Set up a custom domain** → `thepic.me`.
Cloudflare issues HTTPS automatically.

## After deploy — verify
1. Open thepic.me. Drop in a clear, front-facing photo.
2. Click **Create the Engraving**. First render may take ~10–20s.
3. Confirm the download gives a clean PNG.

## Notes
- Photos are processed in memory and not stored.
- Cost is per render on your Gemini key; the daily cap is your spend ceiling.
- For maximum quality set `IMAGE_SIZE=4K` (slower, larger files).
