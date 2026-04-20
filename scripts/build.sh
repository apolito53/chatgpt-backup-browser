#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_NODE_DIR="$PROJECT_ROOT/tools/node-runtime"
LOCAL_NODE="$LOCAL_NODE_DIR/node"
TYPESCRIPT_CLI="$PROJECT_ROOT/tools/typescript/package/lib/tsc.js"
BUILD_DIR="$PROJECT_ROOT/.tsbuild"
APP_DIR="$PROJECT_ROOT/app"

if [ ! -f "$TYPESCRIPT_CLI" ]; then
  echo "TypeScript compiler not found at $TYPESCRIPT_CLI" >&2
  exit 1
fi

if [ ! -f "$LOCAL_NODE" ]; then
  mkdir -p "$LOCAL_NODE_DIR"
  RESOLVED_NODE="$(command -v node)"
  ln -sf "$RESOLVED_NODE" "$LOCAL_NODE"
fi

cd "$PROJECT_ROOT"

if [ -d "$BUILD_DIR" ]; then
  rm -rf "$BUILD_DIR"
fi

"$LOCAL_NODE" "$TYPESCRIPT_CLI" -p tsconfig.json

find "$BUILD_DIR" -name "*.js" -type f | while read -r file; do
  RELATIVE_PATH="${file#$BUILD_DIR/}"
  TARGET_PATH="$APP_DIR/$RELATIVE_PATH"
  TARGET_DIR="$(dirname "$TARGET_PATH")"
  mkdir -p "$TARGET_DIR"
  cp "$file" "$TARGET_PATH"
done
