#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SCRIPT="$PROJECT_ROOT/scripts/build.sh"
LOCAL_NODE_DIR="$PROJECT_ROOT/tools/node-runtime"
LOCAL_NODE="$LOCAL_NODE_DIR/node"
SERVER_SCRIPT="$PROJECT_ROOT/scripts/serve.mjs"
DEFAULT_PORT="${CHATGPT_BROWSER_PORT:-4173}"
START_PAGE="${CHATGPT_BROWSER_PAGE:-app/index.html}"

test_build_required() {
  if [ ! -f "$BUILD_SCRIPT" ]; then
    return 1
  fi

  local source_files=()
  while IFS= read -r -d '' file; do
    source_files+=("$file")
  done < <(find "$PROJECT_ROOT/src" -type f \( -name "*.ts" -o -name "*.d.ts" \) -print0 2>/dev/null)

  [ -f "$PROJECT_ROOT/tsconfig.json" ] && source_files+=("$PROJECT_ROOT/tsconfig.json")
  [ -f "$PROJECT_ROOT/jsconfig.json" ] && source_files+=("$PROJECT_ROOT/jsconfig.json")

  if [ ${#source_files[@]} -eq 0 ]; then
    return 1
  fi

  local built_files=()
  while IFS= read -r -d '' file; do
    built_files+=("$file")
  done < <(find "$PROJECT_ROOT/app" -type f -name "*.js" -print0 2>/dev/null)

  if [ ${#built_files[@]} -eq 0 ]; then
    return 0
  fi

  local latest_source=""
  for file in "${source_files[@]}"; do
    if [ -z "$latest_source" ] || [ "$file" -nt "$latest_source" ]; then
      latest_source="$file"
    fi
  done

  local latest_build=""
  for file in "${built_files[@]}"; do
    if [ -z "$latest_build" ] || [ "$file" -nt "$latest_build" ]; then
      latest_build="$file"
    fi
  done

  [ "$latest_source" -nt "$latest_build" ]
}

if test_build_required; then
  bash "$BUILD_SCRIPT"
fi

if [ ! -f "$LOCAL_NODE" ]; then
  mkdir -p "$LOCAL_NODE_DIR"
  RESOLVED_NODE="$(command -v node)"
  ln -sf "$RESOLVED_NODE" "$LOCAL_NODE"
fi

"$LOCAL_NODE" "$SERVER_SCRIPT" &
SERVER_PID=$!

RESOLVED_PORT="$DEFAULT_PORT"
SERVER_READY=false

for attempt in {1..40}; do
  sleep 0.25

  while IFS= read -r port; do
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port/$START_PAGE" 2>/dev/null | grep -q "^[23]"; then
      RESOLVED_PORT="$port"
      SERVER_READY=true
      break
    fi
  done < <(ss -tlnH 2>/dev/null | awk '$4 ~ /127\.0\.0\.1:/ {split($4, a, ":"); print a[2]}' | sort -n)

  if [ "$SERVER_READY" = true ]; then
    break
  fi
done

URL="http://127.0.0.1:$RESOLVED_PORT/$START_PAGE"
echo "ChatGPT Backup Browser is starting at $URL"
echo "Server process id: $SERVER_PID"

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v gnome-open >/dev/null 2>&1; then
  gnome-open "$URL" >/dev/null 2>&1 &
elif command -v firefox >/dev/null 2>&1; then
  firefox "$URL" >/dev/null 2>&1 &
elif command -v google-chrome >/dev/null 2>&1; then
  google-chrome "$URL" >/dev/null 2>&1 &
fi
