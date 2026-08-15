FROM golang:1.23-alpine AS build
RUN apk add --no-cache ca-certificates
WORKDIR /src
COPY go.mod ./
COPY downloader ./downloader
COPY cmd ./cmd
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/downloader ./cmd/server

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/downloader /downloader
ENV PORT=8080 OPENDOC_BIND=0.0.0.0
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/downloader"]
