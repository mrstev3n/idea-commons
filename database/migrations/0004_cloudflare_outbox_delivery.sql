begin;

alter table app_private.outbox_events
  add column dispatched_at timestamptz,
  add column dispatch_lease_until timestamptz,
  add column last_error_code text;

create index outbox_dispatch_ready_idx
  on app_private.outbox_events (available_at, occurred_at)
  where delivered_at is null and dispatched_at is null;

create unique index editorial_candidates_generation_unique_idx
  on app.editorial_candidates (generation_id)
  where generation_id is not null;

commit;
