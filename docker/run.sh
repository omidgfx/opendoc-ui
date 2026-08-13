#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH='' cd "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker CLI was not found. Install Docker Desktop or Docker Engine first." >&2
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed, but its daemon is not available." >&2
    exit 1
fi

PACKAGE_VERSION=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1)
if [ -z "$PACKAGE_VERSION" ]; then
    echo "Could not read the version from package.json." >&2
    exit 1
fi

IMAGE_NAME=${OPENDOC_IMAGE_NAME:-opendoc-ui}
IMAGE_VERSION=${1:-$PACKAGE_VERSION}
CONTAINER_NAME=${OPENDOC_CONTAINER_NAME:-opendoc-ui}
PORT=${OPENDOC_PORT:-3000}
RESTART_POLICY=${OPENDOC_RESTART_POLICY:-unless-stopped}
CONFIG_FILE=${OPENDOC_CONFIG_FILE:-$PROJECT_ROOT/docker/config.json}
IMAGE="$IMAGE_NAME:$IMAGE_VERSION"

case "$PORT" in
    '' | *[!0-9]*)
        echo "OPENDOC_PORT must be a numeric TCP port." >&2
        exit 1
        ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo "OPENDOC_PORT must be between 1 and 65535." >&2
    exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Configuration file not found: $CONFIG_FILE" >&2
    exit 1
fi
CONFIG_DIR=$(CDPATH='' cd "$(dirname "$CONFIG_FILE")" && pwd)
CONFIG_PATH="$CONFIG_DIR/$(basename "$CONFIG_FILE")"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "Docker image $IMAGE was not found. Run docker/build.sh first." >&2
    exit 1
fi

docker rm --force "$CONTAINER_NAME" >/dev/null 2>&1 || true
CONTAINER_ID=$(docker run \
    --detach \
    --name "$CONTAINER_NAME" \
    --restart "$RESTART_POLICY" \
    --publish "$PORT:80" \
    --mount "type=bind,source=$CONFIG_PATH,target=/usr/share/nginx/html/config.json,readonly" \
    "$IMAGE")

echo "$IMAGE is running as $CONTAINER_NAME at http://localhost:$PORT"
echo "Container ID: $CONTAINER_ID"
