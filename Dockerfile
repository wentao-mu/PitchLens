FROM node:20-bookworm-slim AS web-builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

RUN npm ci
RUN npm run build


FROM python:3.13-slim AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=10000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt ./server/requirements.txt
RUN pip install --no-cache-dir -r ./server/requirements.txt

COPY server ./server
COPY --from=web-builder /app/dist ./dist

EXPOSE 10000

CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
