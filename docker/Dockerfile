# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG VITE_DISABLE_APPLE_EMOJIS=true
ARG VITE_LOAD_FROM_URL=false
ARG VITE_SPEC_DOWNLOADER=
ARG VITE_BASE_PATH=/
ENV VITE_DISABLE_APPLE_EMOJIS=${VITE_DISABLE_APPLE_EMOJIS} \
    VITE_LOAD_FROM_URL=${VITE_LOAD_FROM_URL} \
    VITE_SPEC_DOWNLOADER=${VITE_SPEC_DOWNLOADER} \
    VITE_BASE_PATH=${VITE_BASE_PATH}

RUN npm run build

FROM nginx:1.31.2-alpine-slim AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/config.json /usr/share/nginx/html/config.json
COPY --from=builder /app/dist/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"]
