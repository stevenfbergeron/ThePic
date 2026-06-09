# Hedcut Studio

A gift web app for thepic.me. A visitor opens the site, drops in a photo, and
downloads a Wall Street Journal–style "hedcut" stipple-and-line engraving portrait.

- Frontend: `public/index.html` (static, what the visitor sees)
- Backend: `functions/api/render.js` (Cloudflare Pages Function; holds the Gemini key,
  calls the image model, returns the engraving)

The Gemini API key lives only as an encrypted Cloudflare env var (`GEMINI_API_KEY`).
The backend is locked to its own domain and rate-capped so the key can't be abused.

See **DEPLOY.md** for the full Cloudflare Pages setup.
