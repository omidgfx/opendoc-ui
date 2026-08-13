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
DISABLE_APPLE_EMOJIS=${VITE_DISABLE_APPLE_EMOJIS:-true}
LOAD_FROM_URL=${VITE_LOAD_FROM_URL:-false}
SPEC_DOWNLOADER=${VITE_SPEC_DOWNLOADER:-}
BASE_PATH=${VITE_BASE_PATH:-/}

echo "Building $IMAGE_NAME:$IMAGE_VERSION..."
docker build \
    --file "$PROJECT_ROOT/docker/Dockerfile" \
    --tag "$IMAGE_NAME:$IMAGE_VERSION" \
    --tag "$IMAGE_NAME:latest" \
    --build-arg "VITE_DISABLE_APPLE_EMOJIS=$DISABLE_APPLE_EMOJIS" \
    --build-arg "VITE_LOAD_FROM_URL=$LOAD_FROM_URL" \
    --build-arg "VITE_SPEC_DOWNLOADER=$SPEC_DOWNLOADER" \
    --build-arg "VITE_BASE_PATH=$BASE_PATH" \
    "$PROJECT_ROOT"

echo "Built $IMAGE_NAME:$IMAGE_VERSION and $IMAGE_NAME:latest."
