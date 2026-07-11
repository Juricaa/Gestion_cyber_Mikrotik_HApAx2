# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim

WORKDIR /app

# Configuration npm robuste pour les connexions lentes/instables.
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json ./

# Le cache BuildKit évite de retélécharger tous les paquets à chaque build.
# --prefer-offline utilise le cache d'abord, puis Internet uniquement si nécessaire.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci \
      --legacy-peer-deps \
      --prefer-offline \
      --no-audit \
      --no-fund \
      --loglevel=info

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
