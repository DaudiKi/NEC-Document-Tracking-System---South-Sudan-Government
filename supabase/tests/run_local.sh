#!/usr/bin/env bash
# Applies every migration to a throw-away database on a local PostgreSQL 16 and runs the
# workflow tests. Usage: PGHOST=/tmp/pg PGPORT=5544 PGUSER=postgres ./supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists nec_test" -c "create database nec_test"
P="$P -d nec_test"
$P -f supabase/tests/local_stubs.sql
for f in supabase/migrations/*.sql; do echo "applying $f"; $P -f "$f" 2>&1 | grep -v NOTICE || true; done
$P -f supabase/tests/workflow_test.sql 2>&1 | grep -v '^\s*$' | grep -E 'FAIL|ERROR|PASSED|PASS' | sed 's/^psql:[^ ]* //'
