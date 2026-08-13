#!/bin/sh
# Launch a container for opendoc-ui (killing the previous one if pressent) at PORT

PRODUCT=opendoc-ui
CURRENT_VERSION=$(grep -o '"version": *"[^"]*"' ./package.json | awk -F '"' '{print $4}')
VERSION=${1:-$CURRENT_VERSION}
PORT=3000

# Kill previous one
docker rm $PRODUCT --force 

# Launch a new one
docker run -d --name $PRODUCT -p $PORT:80 $PRODUCT:$VERSION &&
    echo "$PRODUCT:$VERSION running at http://localhost:$PORT"
