# SHAOOR | شعور

Pakistan's Creative Arts Platform.

This repository is a static site split from the production master:

- `index.html` — markup
- `css/` — styles
- `js/` — application JavaScript
- `json/` — structured data

Live: https://shaoorplatform.vercel.app/

## Local

Open `index.html` via a static server (required for `fetch` of JSON-LD):

```bash
python3 -m http.server 8080
```

## Deploy

Push to `main`. Vercel is already connected to this repo.
