#!/usr/bin/env bash
# Levanta un PostgreSQL 16 temporal, aplica stub + migración y corre las pruebas de RLS.
# Uso: bash supabase/tests/run.sh   (requiere binarios de PostgreSQL; si eres root se usa el usuario postgres)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
DIR="$(mktemp -d)"; PORT="${PGPORT_TEST:-55432}"
RUN=""; if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN="runuser -u postgres --"; fi
cleanup() { $RUN "$PGBIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
$RUN "$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c wal_level=logical" -l "$DIR/log" start >/dev/null
PSQL="psql -X -q -o /dev/null -h $DIR -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1"
$PSQL -f "$ROOT/supabase/tests/supabase_stub.sql"
$PSQL -f "$ROOT/supabase/migrations/0001_alignment_unblock.sql"
$PSQL -f "$ROOT/supabase/migrations/0001_alignment_unblock.sql"   # idempotente
psql -X -q -h $DIR -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -c "set client_min_messages=warning" -f "$ROOT/supabase/tests/rls_test.sql" | grep -E "RLS OK|ERROR"
if [ "${KEEP_RUNNING:-}" = "1" ]; then echo "PGHOST=$DIR PGPORT=$PORT"; trap - EXIT; fi
