# nerdyphotographer.in

A personal **photo studio website** for nerdyphotographer.in — minimalist, neutral palette, bold headlines, generous whitespace — with an **easy portfolio photoshoot uploader** baked in.

## Features

- **Drag-and-drop upload** — drop a whole photoshoot at once, or click to browse.
- **Staging area** — preview every photo, remove the ones you don't want before publishing.
- **Shoot metadata** — title, brand/collection, and photographer per set.
- **Persistent gallery** — shoots are saved to the browser via **IndexedDB**, and admins can sync them to this repo (a GitHub PAT with Contents write access to this repo is required) so every visitor sees them.
- **Photo files in `photos/`** — synced photos are committed as real image files; `data.js` only stores their paths.
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
| `app.js` | Upload, staging, IndexedDB persistence, GitHub sync, filtering, lightbox |
| `data.js` | Published portfolio data (auto-synced from the Admin Panel) |
| `photos/` | Published photo files (auto-synced from the Admin Panel) |

## Notes

Uploaded shoots are saved to the browser (IndexedDB) first. When an admin publishes, edits, or deletes a shoot, the site syncs the change into this repo via the GitHub API — photos are committed under `photos/` and metadata into `data.js` — so it goes live for everyone through GitHub Pages. The sync merges per shoot, so publishing from one device won't overwrite shoots added from another.

Keep the GitHub PAT scoped to **only this repository** (fine-grained token, Contents read/write) and never share it inside a URL.
