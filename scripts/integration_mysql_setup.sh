#!/bin/bash

# Grants required by migration trigger creation and lock-observation tests on
# this disposable MySQL service only. Application schema still comes from migrations.
(
set -eu
mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" <<'SQL'
SET GLOBAL log_bin_trust_function_creators = 1;
SQL
mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
GRANT SELECT ON performance_schema.data_lock_waits TO '$MYSQL_USER'@'%';
SQL
)
