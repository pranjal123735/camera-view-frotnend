# Car Vision — frontend (Expo web)

This folder is the **web UI only**. Run the Python API from `car-vision-backend` (or any host) and point this app at it.

## Run locally

```bash
npm install --legacy-peer-deps
npm run web
```

Set `EXPO_PUBLIC_BACKEND_URL` to your API base (for example `http://127.0.0.1:8001`) in `.env` or your shell before `npm run web` / `npm run build:web`.

## Build static export

```bash
npm run build:web
```

Output: `web-dist/`. Serve with any static host, or use the included `Dockerfile` (builds and runs `serve` on `$PORT`, default 8080).

## Related repo

Backend (FastAPI + YOLO): sibling folder `car-vision-backend` (same parent directory as this project).
