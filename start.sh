#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  printf '未找到 %s，请先安装 Python 3.10+。\n' "$PYTHON_BIN" >&2
  exit 1
fi

VENV_DIR="${VENV_DIR:-$SCRIPT_DIR/.venv}"
VENV_PYTHON="$VENV_DIR/bin/python"
if [[ ! -x "$VENV_PYTHON" ]]; then
  printf '创建虚拟环境: %s\n' "$VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

if [[ -f requirements.txt ]]; then
  printf '安装/更新 Python 依赖\n'
  "$VENV_PYTHON" -m pip install -r requirements.txt
fi

# The key is read only into this process. It is never written to disk.
if [[ -z "${RIOT_API_KEY:-}" && -t 0 ]]; then
  printf '可选：输入 Riot API key（直接回车跳过，输入不会回显）: '
  read -r -s RIOT_API_KEY
  printf '\n'
  export RIOT_API_KEY
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8787}"
printf 'Daily Board: http://127.0.0.1:%s/\n' "$PORT"
printf '局域网访问地址: http://<本机局域网 IP>:%s/\n' "$PORT"

exec "$VENV_PYTHON" server.py --host "$HOST" --port "$PORT"
