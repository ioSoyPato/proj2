# Single image: builds the React/Vite frontend, then serves it AND the FastAPI
# backend from one Python process on one port.
#
#   docker build -t course-scheduling .
#   docker run -p 8003:8000 course-scheduling   (container listens on 8000)
#   -> http://localhost:8003
#
# Precomputed results (backend/app/results/*.json) and the trained Q-table
# (backend/app/policies/trained/q_table.json) are baked in, so the dashboard
# loads instantly; live endpoints simulate on demand.

# ---- stage 1: compile the frontend to static files ----
FROM node:22-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig*.json ./
COPY frontend/public ./public
COPY frontend/src ./src
COPY frontend/.env.production ./.env.production
RUN npm run build

# ---- stage 2: runtime ----
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/scripts ./scripts
COPY backend/tests ./tests
COPY --from=frontend-build /frontend/dist ./frontend_dist
ENV FRONTEND_DIST=/app/frontend_dist
EXPOSE 8000
CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
