#!/bin/sh
set -eu
# psql variable substitution safely quotes the runtime password as an SQL literal.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
  --set=runtime_password="$POSTGRES_APP_PASSWORD" <<'SQL'
CREATE ROLE employee_runtime LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO employee_runtime;
SQL
