# Migracions

Aquest feature usa les taules KV de plataforma declarades al manifest
(`data.postgres.tables`: `scheduling_reminders`, `scheduling_settings`): les crea
el DAO del SDK (`@gaudi/core` PostgresKVStore, `CREATE TABLE IF NOT EXISTS`) al
primer ús. No té migracions pròpies — aquest directori es reserva per a canvis
d'esquema futurs.
