FROM rust:1.85-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=build /src/target/release/opendoc-ai-gateway /gateway
ENV PORT=8787 AI_GATEWAY_BIND=0.0.0.0
EXPOSE 8787
USER 65532:65532
ENTRYPOINT ["/gateway"]
