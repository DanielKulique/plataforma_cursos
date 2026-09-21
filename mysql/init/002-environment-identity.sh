#!/bin/bash

# The official MySQL entrypoint sources *.sh files instead of executing them.
# Keep strict mode inside a subshell so it cannot leak `set -u` into the
# parent entrypoint (MySQL 8.4 legitimately reads optional unset variables).
(
set -eu

: "${MYSQL_DATABASE:?MYSQL_DATABASE é obrigatório}"
: "${PLATFORM_DB_IDENTITY:?PLATFORM_DB_IDENTITY é obrigatório}"

case "$MYSQL_USER" in
    ''|*[!A-Za-z0-9_]*)
        echo 'MYSQL_USER deve conter somente letras, números e underscore.' >&2
        exit 1
        ;;
esac

case "$MYSQL_DATABASE:$PLATFORM_DB_IDENTITY" in
    plataforma_cursos_dev:plataforma_cursos_dev|\
    plataforma_cursos_test:plataforma_cursos_test|\
    plataforma_cursos_staging:plataforma_cursos_staging|\
    plataforma_cursos:plataforma_cursos_prod) ;;
    *)
        echo 'Combinação MYSQL_DATABASE/PLATFORM_DB_IDENTITY recusada.' >&2
        exit 1
        ;;
esac

mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" <<SQL
INSERT INTO environment_identity (singleton_id, identity_key, database_name)
VALUES (1, '$PLATFORM_DB_IDENTITY', '$MYSQL_DATABASE');
SQL

if [ -n "${PLATFORM_TEST_DATABASE:-}" ] || [ -n "${PLATFORM_TEST_DB_IDENTITY:-}" ]; then
    [ "${PLATFORM_TEST_DATABASE:-}" = plataforma_cursos_test ] \
        && [ "${PLATFORM_TEST_DB_IDENTITY:-}" = plataforma_cursos_test ] || {
        echo 'Identidade do banco local de testes recusada.' >&2
        exit 1
    }
    mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE \`$PLATFORM_TEST_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`$PLATFORM_TEST_DATABASE\`.* TO '$MYSQL_USER'@'%';
GRANT SELECT ON performance_schema.data_lock_waits TO '$MYSQL_USER'@'%';
SQL
    mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" "$PLATFORM_TEST_DATABASE" \
        < /docker-entrypoint-initdb.d/001-schema.sql
    mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" "$PLATFORM_TEST_DATABASE" <<SQL
INSERT INTO environment_identity (singleton_id, identity_key, database_name)
VALUES (1, '$PLATFORM_TEST_DB_IDENTITY', '$PLATFORM_TEST_DATABASE');
SQL
fi
)
