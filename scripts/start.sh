#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SCRIPT="$PROJECT_ROOT/scripts/build.sh"
LOCAL_NODE_DIR="$PROJECT_ROOT/tools/node-runtime"
LOCAL_NODE="$LOCAL_NODE_DIR/node"
SERVER_SCRIPT="$PROJECT_ROOT/scripts/serve.mjs"
DEFAULT_PORT="${CHATGPT_BROWSER_PORT:-4173}"
START_PAGE="${CHATGPT_BROWSER_PAGE:-app/index.html}"
HEALTH_PATH="__chatgpt_backup_browser_health"

REQUESTED_PORT="$DEFAULT_PORT"
if ! [[ "$REQUESTED_PORT" =~ ^[0-9]+$ ]] || [ "$REQUESTED_PORT" -lt 1 ] || [ "$REQUESTED_PORT" -gt 65535 ]; then
  REQUESTED_PORT=4173
fi

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

SERVER_TOKEN="$(date +%s)-$$-$RANDOM"
CHATGPT_BROWSER_SERVER_TOKEN="$SERVER_TOKEN" "$LOCAL_NODE" "$SERVER_SCRIPT" &
SERVER_PID=$!

RESOLVED_PORT="$REQUESTED_PORT"
SERVER_READY=false
MAX_PORT=$((REQUESTED_PORT + 50))
if [ "$MAX_PORT" -gt 65535 ]; then
  MAX_PORT=65535
fi

for attempt in {1..80}; do
  sleep 0.25

  for port in $(seq "$REQUESTED_PORT" "$MAX_PORT"); do
    HEALTH_BODY="$(curl -fsS --max-time 1 "http://127.0.0.1:$port/$HEALTH_PATH" 2>/dev/null || true)"
    if printf '%s' "$HEALTH_BODY" | grep -q '"app":"chatgpt-backup-browser"' &&
       printf '%s' "$HEALTH_BODY" | grep -q "\"token\":\"$SERVER_TOKEN\""; then
      RESOLVED_PORT="$port"
      SERVER_READY=true
      break
    fi
  done

  if [ "$SERVER_READY" = true ]; then
    break
  fi
done

if [ "$SERVER_READY" != true ]; then
  echo "ChatGPT Backup Browser started, but the launcher could not confirm its own local server. Another localhost app may be using port $REQUESTED_PORT. Close the other server or set CHATGPT_BROWSER_PORT to a free port, then try again." >&2
  exit 1
fi

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
