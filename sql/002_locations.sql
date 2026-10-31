-- Ubicaciones donde se hacen las acciones (fichas en Administración).
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text not null default '',
  capacity integer,
  notes text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table locations enable row level security;
insert into locations (name, position) values
  ('PAC', 1), ('Plaza Central', 2), ('Parking Ext.', 3), ('Coworker', 4), ('Activity', 5), ('Exterior', 6)
on conflict (name) do nothing;
