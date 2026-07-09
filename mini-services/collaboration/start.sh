#!/usr/bin/env bash
# Convenience launcher for the DocsMini collaboration mini-service.
# Usage:  ./start.sh   (from this folder)   or   bash mini-services/collaboration/start.sh
#
# The service MUST run on port 3003 (hardcoded in index.ts) so that the Caddy
# gateway can forward /?XTransformPort=3003 to it. The frontend connects with
#   io("/?XTransformPort=3003", { auth: { token } })

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Ensure @prisma/client is resolvable. It is shared from the parent project's
# node_modules (same generated client as the Next.js API -> guaranteed schema sync).
if [ ! -d "../../node_modules/@prisma/client" ]; then
  echo "[start] parent @prisma/client not found — run 'bun install' in project root first." >&2
  exit 1
fi

echo "[start] launching collaboration service on :3003 ..."
exec bun --hot index.ts
