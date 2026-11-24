# Single image: builds the React/Vite frontend, then serves it AND the FastAPI
# backend from one Python process on one port.
#
#   docker build -t ticket-pricing .
#   docker run -p 8002:8000 ticket-pricing
#   -> http://localhost:8002     (the app listens on 8000 inside the container,
#                                  like the sibling projects; host port is yours)
#
# Optional: mount credentials for a full Gurobi licence or to re-run calibration
#   docker run -p 8002:8000 -v "$PWD/../credentials.env:/app/credentials.env:ro" ticket-pricing

# ---- stage 1: compile the frontend to static files ----
FROM node:22-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig*.json ./
COPY frontend/public ./public
COPY frontend/src ./src
COPY frontend/.env.production ./.env.production
RUN npm run build

# ---- stage 2: runtime ----
FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/scripts ./scripts
# precomputed study + trained RL weights (+ calibration.json when it exists)
COPY backend/data ./data
COPY --from=frontend-build /frontend/dist ./frontend_dist
ENV FRONTEND_DIST=/app/frontend_dist \
    PRICING_DATA_DIR=/app/data \
    CREDENTIALS_ENV=/app/credentials.env
EXPOSE 8000
CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
