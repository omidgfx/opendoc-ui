FROM php:8.3-cli-alpine
RUN apk add --no-cache curl-dev && docker-php-ext-install curl
WORKDIR /app
COPY src ./src
COPY public ./public
ENV PORT=8080 OPENDOC_BIND=0.0.0.0
EXPOSE 8080
USER www-data
CMD ["php", "-S", "0.0.0.0:8080", "-t", "public", "public/index.php"]
