-- Toko Offline initial schema; based on src/types.ts (2026-10-30).

-- Schema only: no CSV/customer/transaction data is imported.

-- camelCase app fields map to snake_case SQL columns.

-- Absent references/dates must be converted from empty strings to NULL.

-- All client access remains closed until authentication and policies are implemented.

begin;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  schema_version integer not null default 1 check (schema_version = 1),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now()
);

create index stores_owner_id_idx on public.stores(owner_id);

create table public.items (
  store_id uuid not null references public.stores(id),
  id text not null check (id <> ''),
  code text not null default '',
  name text not null default '',
  unit text not null default '',
  pack text not null default '',
  buy_price numeric not null default 0,
  sell_price numeric not null default 0,
  opening_qty numeric not null default 0,
  opening_cost numeric not null default 0,
  min_stock numeric not null default 0,
  active boolean not null default true,
  primary key (store_id, id),
  unique (store_id, code)
);

create table public.parties (
  store_id uuid not null references public.stores(id),
  deleted boolean,
  id text not null check (id <> ''),
  kind text not null check (kind in ('customer', 'supplier')),
  code text not null default '',
  name text not null default '',
  address text not null default '',
  city text not null default '',
  phone text not null default '',
  fax text not null default '',
  opening_balance numeric not null default 0,
  active boolean not null default true,
  primary key (store_id, id),
  unique (store_id, kind, code)
);

create table public.documents (
  store_id uuid not null references public.stores(id),
  serial_tracking text,
  id text not null check (id <> ''),
  kind text not null check (kind in ('sale','purchase','customer_order','supplier_order','sale_return','purchase_return')),
  status text not null check (status in ('draft','final','cancelled')),
  number text not null default '',
  date date,
  seq integer not null default 0,
  party_id text check (party_id is null or party_id <> ''),
  party_name text not null default '',
  party_address text not null default '',
  party_phone text not null default '',
  order_id text check (order_id is null or order_id <> ''),
  ref_id text check (ref_id is null or ref_id <> ''),
  discount numeric not null default 0,
  down_payment numeric not null default 0,
  total numeric not null default 0,
  notes text not null default '',
  terms text not null default '',
  issuer_name text not null default '',
  issuer_address text not null default '',
  issuer_phone text not null default '',
  bank text not null default '',
  beneficiary text not null default '',
  account text not null default '',
  bank_branch text not null default '',
  bank_code text not null default '',
  country text not null default '',
  warranty text not null default '',
  signature text not null default '',
  logo text not null default '',
  partner_logo text not null default '',
  created_at timestamptz not null default now(),
  cancel_reason text not null default '',
  invoice_defaults_version integer,
  primary key (store_id, id)
);

create table public.lines (
  store_id uuid not null references public.stores(id),
  id text not null check (id <> ''),
  doc_id text not null check (doc_id is null or doc_id <> ''),
  item_id text not null check (item_id is null or item_id <> ''),
  code text not null default '',
  name text not null default '',
  unit text not null default '',
  qty numeric not null default 0,
  price numeric not null default 0,
  discount_type text check (discount_type in ('amount', 'percent')),
  discount_value numeric,
  total numeric not null default 0,
  cost numeric not null default 0,
  ref_line_id text check (ref_line_id is null or ref_line_id <> ''),
  serials text not null default '',
  primary key (store_id, id)
);

create table public.payments (
  store_id uuid not null references public.stores(id),
  id text not null check (id <> ''),
  number text not null default '',
  date date,
  party_id text not null check (party_id is null or party_id <> ''),
  amount numeric not null default 0,
  direction text not null check (direction in ('in', 'out')),
  notes text not null default '',
  status text not null check (status in ('final', 'cancelled')),
  source_doc_id text check (source_doc_id is null or source_doc_id <> ''),
  primary key (store_id, id)
);

create table public.allocations (
  store_id uuid not null references public.stores(id),
  id text not null check (id <> ''),
  payment_id text not null check (payment_id is null or payment_id <> ''),
  doc_id text not null check (doc_id is null or doc_id <> ''),
  amount numeric not null default 0,
  primary key (store_id, id)
);

create table public.audit (
  store_id uuid not null references public.stores(id),
  id text not null check (id <> ''),
  time timestamptz not null default now(),
  action text not null default '',
  entity text not null default '',
  detail text not null default '',
  primary key (store_id, id)
);

create table public.settings (
  store_id uuid not null references public.stores(id),
  id text not null check (id <> ''),
  invoice_issuer text,
  name text not null default '',
  address text not null default '',
  phone text not null default '',
  bank text not null default '',
  beneficiary text not null default '',
  account text not null default '',
  bank_branch text not null default '',
  bank_code text not null default '',
  country text not null default '',
  warranty text not null default '',
  terms text not null default '',
  signature text not null default '',
  logo text not null default '',
  partner_logo text not null default '',
  branding_version integer,
  invoice_defaults_version integer,
  invoice_text_defaults_version integer,
  primary key (store_id, id)
);

alter table public.documents add constraint documents_party_id_fkey foreign key (store_id, party_id) references public.parties(store_id, id) deferrable initially deferred;

create index documents_party_id_idx on public.documents(store_id, party_id);

alter table public.documents add constraint documents_order_id_fkey foreign key (store_id, order_id) references public.documents(store_id, id) deferrable initially deferred;

create index documents_order_id_idx on public.documents(store_id, order_id);

alter table public.documents add constraint documents_ref_id_fkey foreign key (store_id, ref_id) references public.documents(store_id, id) deferrable initially deferred;

create index documents_ref_id_idx on public.documents(store_id, ref_id);

alter table public.lines add constraint lines_doc_id_fkey foreign key (store_id, doc_id) references public.documents(store_id, id) deferrable initially deferred;

create index lines_doc_id_idx on public.lines(store_id, doc_id);

alter table public.lines add constraint lines_item_id_fkey foreign key (store_id, item_id) references public.items(store_id, id) deferrable initially deferred;

create index lines_item_id_idx on public.lines(store_id, item_id);

alter table public.lines add constraint lines_ref_line_id_fkey foreign key (store_id, ref_line_id) references public.lines(store_id, id) deferrable initially deferred;

create index lines_ref_line_id_idx on public.lines(store_id, ref_line_id);

alter table public.payments add constraint payments_party_id_fkey foreign key (store_id, party_id) references public.parties(store_id, id) deferrable initially deferred;

create index payments_party_id_idx on public.payments(store_id, party_id);

alter table public.payments add constraint payments_source_doc_id_fkey foreign key (store_id, source_doc_id) references public.documents(store_id, id) deferrable initially deferred;

create index payments_source_doc_id_idx on public.payments(store_id, source_doc_id);

alter table public.allocations add constraint allocations_payment_id_fkey foreign key (store_id, payment_id) references public.payments(store_id, id) deferrable initially deferred;

create index allocations_payment_id_idx on public.allocations(store_id, payment_id);

alter table public.allocations add constraint allocations_doc_id_fkey foreign key (store_id, doc_id) references public.documents(store_id, id) deferrable initially deferred;

create index allocations_doc_id_idx on public.allocations(store_id, doc_id);

create unique index documents_kind_number_uidx on public.documents(store_id, kind, number) where number <> '';

create unique index payments_number_uidx on public.payments(store_id, number) where number <> '';

create index documents_date_idx on public.documents(store_id, date);

create index payments_date_idx on public.payments(store_id, date);

create index audit_time_idx on public.audit(store_id, time);

alter table public.stores enable row level security;

revoke all on table public.stores from anon, authenticated;

comment on table public.stores is 'Toko Offline: schema foundation. Client access intentionally closed pending Auth policies and transactional write API.';

alter table public.items enable row level security;

revoke all on table public.items from anon, authenticated;

comment on table public.items is 'Toko Offline: schema foundation. Client access intentionally closed pending Auth policies and transactional write API.';

alter table public.parties enable row level security;

revoke all on table public.parties from anon, authenticated;

comment on table public.parties is 'Toko Offline: schema foundation. Client access intentionally closed pending Auth policies and transactional write API.';

alter table public.documents enable row level security;

revoke all on table public.documents from anon, authenticated;

comment on table public.documents is 'Toko Offline: schema foundation. Client access intentionally closed pending Auth policies and transactional write API.';

alter table public.lines enable row level security;

revoke all on table public.lines from anon, authenticated;

comment on table public.lines is 'Toko Offline: schema foundation. Client access intentionally closed pending Auth policies and transactional write API.';

alter table public.payments enable row level security;

revoke all on table public.payments from anon, authenticated;

comment on table public.payments is 'Toko Offline: schema foundation. Client access intentionally closed pending Auth policies and transactional write API.';

alter table public.allocations enable row level security;

revoke all on table public.allocations from anon, authenticated;

comment on table public.allocations is 'Toko Offline: schema foundation. Client access intentionally closed pending Auth policies and transactional write API.';

alter table public.audit enable row level security;

revoke all on table public.audit from anon, authenticated;

comment on table public.audit is 'Toko Offline: schema foundation. Client access intentionally closed pending Auth policies and transactional write API.';

alter table public.settings enable row level security;

revoke all on table public.settings from anon, authenticated;

comment on table public.settings is 'Toko Offline: schema foundation. Client access intentionally closed pending Auth policies and transactional write API.';

commit;

-- Verify all nine tables, RLS, and zero policies for the initial closed schema.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('stores','items','parties','documents','lines','payments','allocations','audit','settings')
order by c.relname;
