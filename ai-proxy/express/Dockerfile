FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
ENV PORT=8787 AI_GATEWAY_BIND=0.0.0.0
EXPOSE 8787
USER node
CMD ["node", "server.mjs"]
