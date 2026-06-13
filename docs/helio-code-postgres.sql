create table if not exists helio_code_jobs (
  id text primary key,
  org_id text not null,
  mission_id text not null,
  repo text not null,
  domain text not null,
  status text not null,
  payload jsonb not null,
  result jsonb,
  attempts integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists helio_code_jobs_queue_idx
  on helio_code_jobs (status, available_at, created_at)
  where status in ('code-queued', 'code-checks-failed');

create index if not exists helio_code_jobs_mission_idx
  on helio_code_jobs (org_id, mission_id, created_at desc);

create table if not exists helio_code_job_logs (
  id bigserial primary key,
  job_id text not null references helio_code_jobs(id) on delete cascade,
  level text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists helio_code_job_logs_job_idx
  on helio_code_job_logs (job_id, created_at);

create table if not exists helio_github_app_installations (
  id text primary key,
  org_id text not null,
  installation_id text not null,
  account_login text not null,
  repositories jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists helio_github_app_installations_org_installation_idx
  on helio_github_app_installations (org_id, installation_id);
