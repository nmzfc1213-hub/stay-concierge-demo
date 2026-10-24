CREATE TABLE stay_profile (
  property_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  guide_version INTEGER NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('ja', 'en')),
  dinner INTEGER NOT NULL CHECK (dinner IN (0, 1)),
  late_arrival INTEGER NOT NULL CHECK (late_arrival IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1,
  update_id TEXT NOT NULL,
  PRIMARY KEY (property_id, reservation_id, guide_version),
  FOREIGN KEY (property_id, reservation_id) REFERENCES reservation(property_id, reservation_id),
  FOREIGN KEY (property_id, guide_version) REFERENCES property_version(property_id, version)
);

CREATE TABLE service_request (
  property_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  guide_version INTEGER NOT NULL,
  item_id TEXT,
  client_request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  message TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('ja', 'en')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  assigned_to TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  update_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (property_id, request_id),
  UNIQUE (property_id, reservation_id, client_request_id),
  FOREIGN KEY (property_id, reservation_id) REFERENCES reservation(property_id, reservation_id),
  FOREIGN KEY (property_id, guide_version) REFERENCES property_version(property_id, version),
  FOREIGN KEY (property_id, assigned_to) REFERENCES admin_user(property_id, user_id)
);

CREATE TABLE staff_note (
  property_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (property_id, note_id),
  FOREIGN KEY (property_id, request_id) REFERENCES service_request(property_id, request_id),
  FOREIGN KEY (property_id, author_id) REFERENCES admin_user(property_id, user_id)
);

CREATE TABLE oral_confirmation (
  property_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  guide_version INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  note TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  PRIMARY KEY (property_id, reservation_id, guide_version, item_id),
  FOREIGN KEY (property_id, reservation_id) REFERENCES reservation(property_id, reservation_id),
  FOREIGN KEY (property_id, guide_version) REFERENCES property_version(property_id, version),
  FOREIGN KEY (property_id, staff_id) REFERENCES admin_user(property_id, user_id)
);

CREATE INDEX request_queue ON service_request(property_id, status, created_at);
CREATE INDEX request_reservation ON service_request(property_id, reservation_id, guide_version);

-- Preserve existing special requests when upgrading the demo. This creates
-- queue entries only; it never sends emails or changes confirmation history.
INSERT INTO service_request (
  property_id, request_id, reservation_id, guide_version, client_request_id,
  payload_hash, message, language, created_at, updated_at
)
SELECT property_id,
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
  reservation_id, guide_version, 'completion:' || guide_version, payload_hash,
  CASE WHEN arrival_slot = 'late' THEN '夜間到着希望 / Late arrival requested. ' ELSE '' END || notes,
  language, completed_at, completed_at FROM submission WHERE needs_attention = 1;

CREATE TRIGGER lock_profile_insert BEFORE INSERT ON stay_profile BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM reservation WHERE property_id = NEW.property_id
    AND reservation_id = NEW.reservation_id AND guide_version = NEW.guide_version
    AND cancelled_at IS NULL AND completed_at IS NULL) THEN RAISE(ABORT, 'profile_locked') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM confirmation WHERE property_id = NEW.property_id
      AND reservation_id = NEW.reservation_id AND guide_version = NEW.guide_version
  ) OR EXISTS (
    SELECT 1 FROM oral_confirmation WHERE property_id = NEW.property_id
      AND reservation_id = NEW.reservation_id AND guide_version = NEW.guide_version
  ) THEN RAISE(ABORT, 'profile_locked') END;
END;

CREATE TRIGGER lock_profile_update BEFORE UPDATE ON stay_profile BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM reservation WHERE property_id = NEW.property_id
    AND reservation_id = NEW.reservation_id AND guide_version = NEW.guide_version
    AND cancelled_at IS NULL AND completed_at IS NULL) THEN RAISE(ABORT, 'profile_locked') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM confirmation WHERE property_id = NEW.property_id
      AND reservation_id = NEW.reservation_id AND guide_version = NEW.guide_version
  ) OR EXISTS (
    SELECT 1 FROM oral_confirmation WHERE property_id = NEW.property_id
      AND reservation_id = NEW.reservation_id AND guide_version = NEW.guide_version
  ) THEN RAISE(ABORT, 'profile_locked') END;
END;

DROP TRIGGER guard_submission;
CREATE TRIGGER guard_submission BEFORE INSERT ON submission BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM reservation r WHERE r.property_id = NEW.property_id
      AND r.reservation_id = NEW.reservation_id AND r.guide_version = NEW.guide_version
      AND r.cancelled_at IS NULL AND r.completed_at IS NULL
  ) THEN RAISE(ABORT, 'reservation_changed') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM property_version v, json_each(v.guide_json, '$.items') item
    WHERE v.property_id = NEW.property_id AND v.version = NEW.guide_version
      AND (
        COALESCE(json_extract(item.value, '$.audience'), 'all') NOT IN ('dinner', 'late')
        OR (json_extract(item.value, '$.audience') = 'dinner' AND EXISTS (
          SELECT 1 FROM stay_profile p WHERE p.property_id = NEW.property_id
            AND p.reservation_id = NEW.reservation_id AND p.guide_version = NEW.guide_version AND p.dinner = 1
        ))
        OR (json_extract(item.value, '$.audience') = 'late' AND EXISTS (
          SELECT 1 FROM stay_profile p WHERE p.property_id = NEW.property_id
            AND p.reservation_id = NEW.reservation_id AND p.guide_version = NEW.guide_version AND p.late_arrival = 1
        ))
      ) AND NOT EXISTS (
        SELECT 1 FROM confirmation c WHERE c.property_id = NEW.property_id
          AND c.reservation_id = NEW.reservation_id AND c.guide_version = NEW.guide_version
          AND c.item_id = json_extract(item.value, '$.id') AND c.answer = 1
      )
  ) THEN RAISE(ABORT, 'answers_missing') END;
END;
