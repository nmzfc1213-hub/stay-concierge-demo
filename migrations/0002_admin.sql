ALTER TABLE reservation ADD COLUMN external_ref TEXT;
CREATE UNIQUE INDEX reservation_external_ref ON reservation(property_id, external_ref)
WHERE external_ref IS NOT NULL;

CREATE TABLE admin_operation (
  property_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (property_id, operation_id),
  FOREIGN KEY (property_id) REFERENCES property(property_id)
);

CREATE TRIGGER guard_settings_version BEFORE UPDATE OF current_version ON property BEGIN
  SELECT CASE WHEN NEW.current_version != OLD.current_version + 1
    THEN RAISE(ABORT, 'version_conflict') END;
END;
