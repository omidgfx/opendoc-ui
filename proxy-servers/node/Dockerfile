FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
ENV PORT=8080 OPENDOC_BIND=0.0.0.0
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
