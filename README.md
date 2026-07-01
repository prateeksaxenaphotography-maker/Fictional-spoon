# thenerdyphotographer.in

A personal **photo studio website** for thenerdyphotographer.in — minimalist, neutral palette, bold headlines, generous whitespace — with an **easy portfolio photoshoot uploader** baked in.

## Features

- **Drag-and-drop upload** — drop a whole photoshoot at once, or click to browse.
- **Staging area** — preview every photo, remove the ones you don't want before publishing.
- **Shoot metadata** — title, brand/collection, and photographer per set.
- **Persistent gallery** — published photos are saved to the browser via **IndexedDB**, so they survive refreshes with no backend.
- **Brand filtering** — filter the masonry gallery by collection.
- **Lightbox** — click any photo for a full-screen view.
- **Live stats + responsive layout** — counts animate as you publish; works on mobile.

Large images are automatically downscaled (max 1600px, JPEG) on upload so the gallery stays fast and storage stays small.

## Run it

It's a static site — no build step, no dependencies.

```bash
# from this folder
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` directly in a browser.

### Deploy to GitHub Pages

Push to a repo and enable Pages (Settings → Pages → deploy from `main`, root). The site is self-contained.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup — hero, studio, upload, portfolio, brands, footer |
| `styles.css` | All styling and responsive rules |
| `app.js` | Upload, staging, IndexedDB persistence, filtering, lightbox |

## Notes

Photos live only in **your** browser (IndexedDB). Clearing site data wipes the gallery; nothing is uploaded anywhere.
