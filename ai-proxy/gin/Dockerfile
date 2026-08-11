FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/gateway .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=build /out/gateway /gateway
ENV PORT=8787 AI_GATEWAY_BIND=0.0.0.0
EXPOSE 8787
USER 65532:65532
ENTRYPOINT ["/gateway"]
