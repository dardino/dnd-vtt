#!/bin/sh
# Migrazioni Drizzle prima dell'avvio. Il server non applica DDL da solo:
# se questo passaggio fallisce il container non deve partire a metà.
set -eu

if [ "${SKIP_MIGRATIONS:-false}" = "true" ]; then
  echo "Migrazioni saltate (SKIP_MIGRATIONS=true)"
else
  node /app/server/dist/db/migrate-cli.js
fi

exec node /app/server/dist/index.js
