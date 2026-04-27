# Deploy Backend + Frontend on One Server

> **Split layout:** If you use two repos (`car-vision-frontend` + `car-vision-backend`), run the steps in each project separately, then copy `web-dist/` from the frontend build into the backend tree (or set `CAR_VISION_WEB_DIR` to that folder) so the API process can serve static files. The combined `camera-app` monorepo Dockerfile is unchanged there.

This project can be deployed as a single service:
- Backend API (FastAPI)
- Frontend web app (exported static build)

The backend now serves `web-dist` automatically when present.

## Structure

- Backend `main.py` -> API + optional static hosting
- `web-dist/` -> exported frontend files (next to the backend app in a monorepo, or path set via `CAR_VISION_WEB_DIR`)

## 1) Build frontend

From project root:

```bash
npm install
npm run build:web
```

This creates `web-dist/`.

## 2) Setup backend

From the backend project root (monorepo: `camera-app/backend`; split: `car-vision-backend`):

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## 3) Run one-server app

From that same backend directory:

```bash
uvicorn main:app --host 0.0.0.0 --port 8001
```

Open:
- `http://<server-ip>:8001/` -> frontend
- `http://<server-ip>:8001/docs` -> API docs

## Optional env vars

- `CAR_VISION_WEB_DIR`  
  Override static web path (default: `../web-dist` from `backend/main.py`).

Example:

```bash
set CAR_VISION_WEB_DIR=D:\deploy\camera-app\web-dist
uvicorn main:app --host 0.0.0.0 --port 8001
```

## Notes

- Frontend default backend URL now auto-uses `window.location.origin` in web mode, so same-host deploy works by default.
- Rebuild frontend (`npm run build:web`) whenever UI code changes.
