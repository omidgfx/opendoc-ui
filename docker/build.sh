#!/bin/sh
# Builds the containers for opendoc-ui. 

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd $PROJECT_ROOT

PRODUCT=opendoc-ui
VERSION=$(grep -o '"version": *"[^"]*"' ./package.json | awk -F '"' '{print $4}')

docker build -t $PRODUCT:$VERSION -f docker/Dockerfile .
