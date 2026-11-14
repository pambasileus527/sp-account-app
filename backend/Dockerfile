FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# 以前のNode版のボリューム（uid 1000）をそのまま使えるように、同じuidで動かす
RUN useradd -u 1000 -m app && mkdir -p /data && chown app /data
COPY . .
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:factory", "--factory", "--host", "0.0.0.0", "--port", "8000"]
