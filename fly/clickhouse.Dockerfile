FROM clickhouse/clickhouse-server:24.12-alpine

COPY clickhouse-config/disable-system-logs.xml \
     /etc/clickhouse-server/config.d/disable-system-logs.xml
