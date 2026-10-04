# Database tests

`workflow_test.sql` exercises the workflow functions end to end (89 checks): roles, locking,
Confidential visibility, routing, corrections, the outgoing lifecycle, alerts, search and reports.
It runs in one transaction that is rolled back.

To run it without Supabase, use a local PostgreSQL 16 with the platform stand-ins in `local_stubs.sql`:

```bash
PGHOST=/tmp/pg PGPORT=5544 PGUSER=postgres ./supabase/tests/run_local.sh
```

The script creates a throw-away database `nec_test`, applies every file in `supabase/migrations/`,
and runs the tests.
