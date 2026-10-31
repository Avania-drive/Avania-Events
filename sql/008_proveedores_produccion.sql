-- Proveedores (imprentas, etc.) y envíos a producción.
create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table providers enable row level security;
insert into providers (name, email, position) values ('Top Impresión', 'topimpresion@gmail.com', 1) on conflict (name) do nothing;

create table if not exists production_sends (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  provider_id uuid references providers(id) on delete set null,
  provider_name text not null default '',
  sent_to text not null default '',
  sent_by uuid references team_users(id) on delete set null,
  sender_name text not null default '',
  files jsonb not null default '[]'::jsonb,
  message text not null default '',
  folder_url text not null default '',
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists production_sends_event_idx on production_sends(event_id, created_at desc);
alter table production_sends enable row level security;
