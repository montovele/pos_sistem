#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
fi

if ! grep -Eq '^[[:space:]]*HARDWARE_AGENT_TOKEN[[:space:]]*=[[:space:]]*[^[:space:]#]' .env; then
  printf '%s\n' 'Error: falta HARDWARE_AGENT_TOKEN en .env. Reinstala el agente con el instalador actualizado.'
  exit 1
fi

chmod +x ./runtime/node
exec ./runtime/node ./app/server.js
