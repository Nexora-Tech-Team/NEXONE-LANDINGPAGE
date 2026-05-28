create extension if not exists pgcrypto;

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company text not null,
  email text not null,
  phone text,
  main_need text not null,
  message text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'closed', 'lost')),
  source text not null default 'landing_page',
  language text not null default 'id',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_status_idx on leads(status);
create index if not exists leads_created_at_idx on leads(created_at desc);
create index if not exists leads_search_idx on leads using gin (
  to_tsvector('simple', full_name || ' ' || company || ' ' || email || ' ' || coalesce(phone, ''))
);
