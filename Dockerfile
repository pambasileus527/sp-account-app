# 本番用: 画面をビルドして、Pythonのサーバーから一緒に配る（1つのイメージ、1つのポート）。
#   docker build -t muscat-account .
#   docker run -p 8000:8000 -v muscat-data:/data -e SESSION_SECRET=... -e MAIL_DOMAIN=... muscat-account
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 STATIC_DIR=/app/static DB_FILE=/data/app.db
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd -u 1000 -m app && mkdir -p /data && chown app /data
COPY backend/ .
COPY --from=web /web/dist /app/static
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:factory", "--factory", "--host", "0.0.0.0", "--port", "8000"]
