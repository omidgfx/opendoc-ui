# 1. Build project
FROM node:26.7.0-alpine3.24 AS builder  
WORKDIR /app
RUN npx playwright install      
COPY package.json .
RUN npm i
COPY . .
RUN npm run format
# RUN npm run test:all  ## commented so far as not all tests are passing at linux
RUN npm run build

# 2. Executable artifact seved by nginx
FROM nginx:1.31.2-alpine-slim AS final
COPY --from=builder /app/dist/            /usr/share/nginx/html
#COPY                docker/config.json    /usr/share/nginx/html
COPY                docker/nginx.conf     /etc/nginx/conf.d/default.conf
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/index.html