# --- Stage 1: Build Frontend with Bun ⚡ ---
FROM oven/bun:1 as frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lockb* ./
RUN bun install

COPY frontend/ .
RUN bun run build

# --- Stage 2: Run Backend with Python 🐍 ---
FROM python:3.11-slim

WORKDIR /app

# 1. Install Python Dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. Copy Backend Code
COPY backend/ ./backend/

# 3. Copy Built Frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 4. Environment Variables
ENV PORT=8001
EXPOSE $PORT

# 5. Start Command
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001"]
