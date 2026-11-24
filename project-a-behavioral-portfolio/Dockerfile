# Single image: builds the React/Vite frontend, then serves it AND the FastAPI
# backend from one Python process on one port.
#
#   docker build -t behavior-gap .
#   docker run -p 8001:8000 behavior-gap
#   -> http://localhost:8001

# ---- stage 1: compile the frontend to static files ----
FROM node:22-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig*.json ./
COPY frontend/public ./public
COPY frontend/src ./src
COPY frontend/.env.production ./.env.production
# VITE_API_BASE is "" in production: the app calls /api/... on its own origin.
RUN npm run build

# ---- stage 2: runtime ----
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/data ./data
COPY --from=frontend-build /frontend/dist ./frontend_dist
ENV FRONTEND_DIST=/app/frontend_dist \
    DATA_DIR=/app/data \
    PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
