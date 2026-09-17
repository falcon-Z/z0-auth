-- Operator session policy is persisted with each session so every Application
-- Replica makes the same expiry and assurance decision from PostgreSQL state.

ALTER TABLE sessions
  ADD COLUMN idle_timeout_minutes INTEGER,
  ADD COLUMN idle_expires_at TIMESTAMPTZ,
  ADD COLUMN assurance_level TEXT;

UPDATE sessions
SET expires_at = LEAST(expires_at, created_at + INTERVAL '1 hour'),
    idle_timeout_minutes = 5,
    idle_expires_at = LEAST(
      expires_at,
      last_seen_at + INTERVAL '5 minutes',
      created_at + INTERVAL '1 hour'
    ),
    assurance_level = CASE
      WHEN authentication_method = 'passkey' THEN 'phishing_resistant'
      WHEN mfa_authenticated_at IS NOT NULL THEN 'multi_factor'
      ELSE 'primary'
    END;

-- During a mixed-version roll, old replicas omit the new columns. The trigger
-- gives those sessions the strictest supported policy until every replica has
-- upgraded; new replicas supply their configured policy explicitly.
CREATE FUNCTION apply_legacy_operator_session_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.idle_timeout_minutes IS NULL THEN
    NEW.expires_at := LEAST(NEW.expires_at, NEW.created_at + INTERVAL '1 hour');
    NEW.idle_timeout_minutes := 5;
    NEW.idle_expires_at := LEAST(
      NEW.expires_at,
      NEW.last_seen_at + INTERVAL '5 minutes'
    );
    NEW.assurance_level := CASE
      WHEN NEW.authentication_method = 'passkey' THEN 'phishing_resistant'
      WHEN NEW.mfa_authenticated_at IS NOT NULL THEN 'multi_factor'
      ELSE 'primary'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sessions_legacy_policy_before_insert
BEFORE INSERT ON sessions
FOR EACH ROW
EXECUTE FUNCTION apply_legacy_operator_session_policy();

ALTER TABLE sessions
  ALTER COLUMN idle_timeout_minutes SET NOT NULL,
  ALTER COLUMN idle_expires_at SET NOT NULL,
  ALTER COLUMN assurance_level SET NOT NULL,
  ADD CONSTRAINT sessions_idle_timeout_bounds
    CHECK (idle_timeout_minutes BETWEEN 5 AND 720),
  ADD CONSTRAINT sessions_idle_before_absolute_expiry
    CHECK (idle_expires_at <= expires_at),
  ADD CONSTRAINT sessions_assurance_level_valid
    CHECK (assurance_level IN ('primary', 'multi_factor', 'phishing_resistant'));

CREATE INDEX sessions_active_expiry_idx
  ON sessions (idle_expires_at, expires_at)
  WHERE revoked_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('0041_operator_session_assurance')
ON CONFLICT (version) DO NOTHING;
