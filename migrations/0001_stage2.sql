PRAGMA foreign_keys = ON;

CREATE TABLE property (
  property_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_json TEXT NOT NULL,
  contact_json TEXT NOT NULL,
  wifi_json TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  demo INTEGER NOT NULL DEFAULT 1 CHECK (demo IN (0, 1)),
  direct_booking_enabled INTEGER NOT NULL DEFAULT 0 CHECK (direct_booking_enabled IN (0, 1)),
  direct_booking_url TEXT,
  notification_email TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE property_version (
  property_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  guide_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (property_id, version),
  FOREIGN KEY (property_id) REFERENCES property(property_id)
);

CREATE TABLE reservation (
  property_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  guest_label TEXT NOT NULL,
  arrival_date TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  guide_version INTEGER NOT NULL,
  cancelled_at TEXT,
  completed_at TEXT,
  PRIMARY KEY (property_id, reservation_id),
  FOREIGN KEY (property_id, guide_version) REFERENCES property_version(property_id, version)
);

CREATE TABLE guest_token (
  property_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  reservation_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (property_id, token_hash),
  FOREIGN KEY (property_id, reservation_id) REFERENCES reservation(property_id, reservation_id)
);

CREATE TABLE guest_session (
  property_id TEXT NOT NULL,
  session_hash TEXT NOT NULL UNIQUE,
  reservation_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (property_id, session_hash),
  FOREIGN KEY (property_id, token_hash) REFERENCES guest_token(property_id, token_hash),
  FOREIGN KEY (property_id, reservation_id) REFERENCES reservation(property_id, reservation_id)
);

CREATE TABLE confirmation (
  property_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  guide_version INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  answer INTEGER NOT NULL CHECK (answer = 1),
  language TEXT NOT NULL CHECK (language IN ('ja', 'en')),
  confirmed_at TEXT NOT NULL,
  PRIMARY KEY (property_id, reservation_id, guide_version, item_id),
  FOREIGN KEY (property_id, reservation_id) REFERENCES reservation(property_id, reservation_id),
  FOREIGN KEY (property_id, guide_version) REFERENCES property_version(property_id, version)
);

CREATE TABLE submission (
  property_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  guide_version INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  arrival_slot TEXT NOT NULL,
  notes TEXT NOT NULL,
  language TEXT NOT NULL,
  needs_attention INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (property_id, reservation_id, guide_version),
  UNIQUE (property_id, request_id),
  FOREIGN KEY (property_id, reservation_id) REFERENCES reservation(property_id, reservation_id)
);

CREATE TABLE notification (
  property_id TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  guide_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'accepted', 'failed', 'demo_skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  lease_until TEXT,
  provider_id TEXT,
  last_code TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (property_id, notification_id),
  UNIQUE (property_id, reservation_id, guide_version),
  FOREIGN KEY (property_id, reservation_id, guide_version) REFERENCES submission(property_id, reservation_id, guide_version)
);

CREATE TABLE notification_attempt (
  property_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  result_code TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  PRIMARY KEY (property_id, attempt_id),
  FOREIGN KEY (property_id, notification_id) REFERENCES notification(property_id, notification_id)
);

CREATE TABLE admin_user (
  property_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_subject TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (property_id, user_id),
  UNIQUE (property_id, access_subject),
  FOREIGN KEY (property_id) REFERENCES property(property_id)
);

CREATE TABLE audit_event (
  property_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  reservation_id TEXT,
  actor_kind TEXT NOT NULL,
  actor_ref TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (property_id, event_id),
  FOREIGN KEY (property_id) REFERENCES property(property_id)
);

CREATE TABLE rate_limit_bucket (
  property_id TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (property_id, bucket_key, window_start)
);

CREATE INDEX reservation_arrival ON reservation(property_id, arrival_date, completed_at);
CREATE INDEX notification_due ON notification(status, next_attempt_at);
CREATE INDEX audit_time ON audit_event(property_id, created_at);

CREATE TRIGGER guard_confirmation_insert BEFORE INSERT ON confirmation BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM reservation r
    WHERE r.property_id = NEW.property_id AND r.reservation_id = NEW.reservation_id
      AND r.guide_version = NEW.guide_version AND r.cancelled_at IS NULL
      AND r.completed_at IS NULL
  ) THEN RAISE(ABORT, 'confirmation_closed') END;
END;

CREATE TRIGGER guard_confirmation_update BEFORE UPDATE ON confirmation BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM submission s WHERE s.property_id = OLD.property_id
      AND s.reservation_id = OLD.reservation_id AND s.guide_version = OLD.guide_version
  ) THEN RAISE(ABORT, 'confirmation_closed') END;
END;

CREATE TRIGGER guard_submission BEFORE INSERT ON submission BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM reservation r WHERE r.property_id = NEW.property_id
      AND r.reservation_id = NEW.reservation_id AND r.guide_version = NEW.guide_version
      AND r.cancelled_at IS NULL AND r.completed_at IS NULL
  ) THEN RAISE(ABORT, 'reservation_changed') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM property_version v, json_each(v.guide_json, '$.items') item
    WHERE v.property_id = NEW.property_id AND v.version = NEW.guide_version
      AND NOT EXISTS (
        SELECT 1 FROM confirmation c WHERE c.property_id = NEW.property_id
          AND c.reservation_id = NEW.reservation_id AND c.guide_version = NEW.guide_version
          AND c.item_id = json_extract(item.value, '$.id') AND c.answer = 1
      )
  ) THEN RAISE(ABORT, 'answers_missing') END;
END;

CREATE TRIGGER immutable_version_update BEFORE UPDATE ON property_version BEGIN
  SELECT RAISE(ABORT, 'version_immutable');
END;
