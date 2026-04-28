CREATE TABLE IF NOT EXISTS maintenance_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name VARCHAR(128) NOT NULL UNIQUE,
  last_run_at TIMESTAMP,
  status VARCHAR(32) NOT NULL DEFAULT 'idle',
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO maintenance_jobs(job_name, status)
VALUES ('audit_retention_cleanup', 'idle')
ON CONFLICT (job_name) DO NOTHING;
