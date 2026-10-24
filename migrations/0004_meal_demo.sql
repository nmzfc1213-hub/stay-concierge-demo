-- Demo only. No production health information. Apply locally for testing.
CREATE TABLE meal_response (
  property_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  guide_version INTEGER NOT NULL,
  answers_json TEXT NOT NULL CHECK(json_valid(answers_json)),
  demo_date TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  PRIMARY KEY(property_id, reservation_id, guide_version),
  FOREIGN KEY(property_id, reservation_id) REFERENCES reservation(property_id, reservation_id) ON DELETE CASCADE,
  FOREIGN KEY(property_id, guide_version) REFERENCES property_version(property_id, version)
);
CREATE INDEX meal_response_expiry ON meal_response(expires_at);
