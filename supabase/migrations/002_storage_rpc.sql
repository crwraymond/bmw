-- Apply after 001_initial_schema.sql. No operational data is changed by this migration.
-- Shared installer access: no login UI and no service-role key in the app.
-- All table access stays closed; RPCs require the 256-bit shop capability bundled
-- in the privately distributed installer. Treat possession of that installer as access.
begin;
create schema if not exists toko_private;
revoke all on schema toko_private from public, anon, authenticated;
alter table public.stores alter column owner_id drop not null;
alter table public.stores add column access_key_hash text;
alter table public.stores add column initialized_at timestamptz;
alter table public.stores add constraint stores_access_identity check (owner_id is not null or access_key_hash is not null);
alter table public.stores add column last_write_id uuid;

create function toko_private.snapshot(p_store_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('store_id', s.id, 'db', jsonb_build_object(
    'schema', s.schema_version,
    'revision', s.revision,
    'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', to_jsonb(r.id), 'code', to_jsonb(r.code), 'name', to_jsonb(r.name), 'unit', to_jsonb(r.unit), 'pack', to_jsonb(r.pack), 'buyPrice', to_jsonb(r.buy_price), 'sellPrice', to_jsonb(r.sell_price), 'openingQty', to_jsonb(r.opening_qty), 'openingCost', to_jsonb(r.opening_cost), 'minStock', to_jsonb(r.min_stock), 'active', to_jsonb(r.active))) order by r.id) from public.items r where r.store_id = s.id), '[]'::jsonb),
    'parties', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('deleted', to_jsonb(r.deleted), 'id', to_jsonb(r.id), 'kind', to_jsonb(r.kind), 'code', to_jsonb(r.code), 'name', to_jsonb(r.name), 'address', to_jsonb(r.address), 'city', to_jsonb(r.city), 'phone', to_jsonb(r.phone), 'fax', to_jsonb(r.fax), 'openingBalance', to_jsonb(r.opening_balance), 'active', to_jsonb(r.active))) order by r.id) from public.parties r where r.store_id = s.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('serialTracking', to_jsonb(r.serial_tracking), 'id', to_jsonb(r.id), 'kind', to_jsonb(r.kind), 'status', to_jsonb(r.status), 'number', to_jsonb(r.number), 'date', coalesce(to_jsonb(r.date), '""'::jsonb), 'seq', to_jsonb(r.seq), 'partyId', coalesce(to_jsonb(r.party_id), '""'::jsonb), 'partyName', to_jsonb(r.party_name), 'partyAddress', to_jsonb(r.party_address), 'partyPhone', to_jsonb(r.party_phone), 'orderId', coalesce(to_jsonb(r.order_id), '""'::jsonb), 'refId', coalesce(to_jsonb(r.ref_id), '""'::jsonb), 'discount', to_jsonb(r.discount), 'downPayment', to_jsonb(r.down_payment), 'total', to_jsonb(r.total), 'notes', to_jsonb(r.notes), 'terms', to_jsonb(r.terms), 'issuerName', to_jsonb(r.issuer_name), 'issuerAddress', to_jsonb(r.issuer_address), 'issuerPhone', to_jsonb(r.issuer_phone), 'bank', to_jsonb(r.bank), 'beneficiary', to_jsonb(r.beneficiary), 'account', to_jsonb(r.account), 'bankBranch', to_jsonb(r.bank_branch), 'bankCode', to_jsonb(r.bank_code), 'country', to_jsonb(r.country), 'warranty', to_jsonb(r.warranty), 'signature', to_jsonb(r.signature), 'logo', to_jsonb(r.logo), 'partnerLogo', to_jsonb(r.partner_logo), 'createdAt', to_jsonb(r.created_at), 'cancelReason', to_jsonb(r.cancel_reason), 'invoiceDefaultsVersion', to_jsonb(r.invoice_defaults_version))) order by r.id) from public.documents r where r.store_id = s.id), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', to_jsonb(r.id), 'docId', coalesce(to_jsonb(r.doc_id), '""'::jsonb), 'itemId', coalesce(to_jsonb(r.item_id), '""'::jsonb), 'code', to_jsonb(r.code), 'name', to_jsonb(r.name), 'unit', to_jsonb(r.unit), 'qty', to_jsonb(r.qty), 'price', to_jsonb(r.price), 'discountType', to_jsonb(r.discount_type), 'discountValue', to_jsonb(r.discount_value), 'total', to_jsonb(r.total), 'cost', to_jsonb(r.cost), 'refLineId', coalesce(to_jsonb(r.ref_line_id), '""'::jsonb), 'serials', to_jsonb(r.serials))) order by r.id) from public.lines r where r.store_id = s.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', to_jsonb(r.id), 'number', to_jsonb(r.number), 'date', coalesce(to_jsonb(r.date), '""'::jsonb), 'partyId', coalesce(to_jsonb(r.party_id), '""'::jsonb), 'amount', to_jsonb(r.amount), 'direction', to_jsonb(r.direction), 'notes', to_jsonb(r.notes), 'status', to_jsonb(r.status), 'sourceDocId', to_jsonb(r.source_doc_id))) order by r.id) from public.payments r where r.store_id = s.id), '[]'::jsonb),
    'allocations', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', to_jsonb(r.id), 'paymentId', coalesce(to_jsonb(r.payment_id), '""'::jsonb), 'docId', coalesce(to_jsonb(r.doc_id), '""'::jsonb), 'amount', to_jsonb(r.amount))) order by r.id) from public.allocations r where r.store_id = s.id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', to_jsonb(r.id), 'time', to_jsonb(r.time), 'action', to_jsonb(r.action), 'entity', to_jsonb(r.entity), 'detail', to_jsonb(r.detail))) order by r.id) from public.audit r where r.store_id = s.id), '[]'::jsonb),
    'settings', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', to_jsonb(r.id), 'invoiceIssuer', to_jsonb(r.invoice_issuer), 'name', to_jsonb(r.name), 'address', to_jsonb(r.address), 'phone', to_jsonb(r.phone), 'bank', to_jsonb(r.bank), 'beneficiary', to_jsonb(r.beneficiary), 'account', to_jsonb(r.account), 'bankBranch', to_jsonb(r.bank_branch), 'bankCode', to_jsonb(r.bank_code), 'country', to_jsonb(r.country), 'warranty', to_jsonb(r.warranty), 'terms', to_jsonb(r.terms), 'signature', to_jsonb(r.signature), 'logo', to_jsonb(r.logo), 'partnerLogo', to_jsonb(r.partner_logo), 'brandingVersion', to_jsonb(r.branding_version), 'invoiceDefaultsVersion', to_jsonb(r.invoice_defaults_version), 'invoiceTextDefaultsVersion', to_jsonb(r.invoice_text_defaults_version))) order by r.id) from public.settings r where r.store_id = s.id), '[]'::jsonb)
  )) from public.stores s where s.id = p_store_id;
$$;
revoke all on function toko_private.snapshot(uuid) from public, anon, authenticated;

create function public.toko_read(p_store_id uuid, p_access_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_initialized timestamptz;
begin
  select initialized_at into v_initialized from public.stores where id = p_store_id
    and access_key_hash = encode(sha256(convert_to(p_access_key, 'UTF8')), 'hex');
  if not found then raise exception 'STORE_ACCESS_DENIED' using errcode = '42501'; end if;
  if v_initialized is null then return null; end if;
  return toko_private.snapshot(p_store_id);
end;
$$;
revoke all on function public.toko_read(uuid,text) from public;
grant execute on function public.toko_read(uuid,text) to anon, authenticated;

create function public.toko_save(
  p_store_id uuid, p_access_key text, p_expected_revision bigint, p_write_id uuid, p_db jsonb,
  p_create boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_store public.stores%rowtype; v_table text; v_rows jsonb;
begin
  if p_store_id is null or p_write_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if p_db is null or p_db->>'schema' is distinct from '1' or octet_length(p_db::text) > 20000000 then
    raise exception 'INVALID_SNAPSHOT' using errcode = '22023';
  end if;
  foreach v_table in array array['items','parties','documents','lines','payments','allocations','audit','settings'] loop
    if jsonb_typeof(p_db->v_table) is distinct from 'array' then
      raise exception 'INVALID_TABLE: %', v_table using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(p_db->'settings') <> 1 then raise exception 'INVALID_SETTINGS' using errcode = '22023'; end if;
  select * into v_store from public.stores where id = p_store_id
    and access_key_hash = encode(sha256(convert_to(p_access_key, 'UTF8')), 'hex') for update;
  if not found then raise exception 'STORE_ACCESS_DENIED' using errcode = '42501'; end if;
  if p_create and v_store.initialized_at is not null and v_store.last_write_id is distinct from p_write_id then
    raise exception 'STORE_ALREADY_EXISTS' using errcode = 'PT409';
  end if;
  if not p_create and v_store.initialized_at is null then raise exception 'STORE_NOT_INITIALIZED' using errcode = '22023'; end if;
  -- A repeated request can safely recover a response lost after commit.
  if v_store.last_write_id = p_write_id and v_store.revision = p_expected_revision + 1 then
    return toko_private.snapshot(p_store_id);
  end if;
  if v_store.revision <> p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode = 'PT409'; end if;
  -- Deferred FKs permit an atomic full-snapshot replacement, never a partial upload.
  set constraints all deferred;

  delete from public.settings where store_id = p_store_id;
  delete from public.audit where store_id = p_store_id;
  delete from public.allocations where store_id = p_store_id;
  delete from public.payments where store_id = p_store_id;
  delete from public.lines where store_id = p_store_id;
  delete from public.documents where store_id = p_store_id;
  delete from public.parties where store_id = p_store_id;
  delete from public.items where store_id = p_store_id;
  select coalesce(jsonb_agg(jsonb_build_object('store_id', to_jsonb(p_store_id), 'id', r->'id', 'code', r->'code', 'name', r->'name', 'unit', r->'unit', 'pack', r->'pack', 'buy_price', r->'buyPrice', 'sell_price', r->'sellPrice', 'opening_qty', r->'openingQty', 'opening_cost', r->'openingCost', 'min_stock', r->'minStock', 'active', r->'active')), '[]'::jsonb) into v_rows from jsonb_array_elements(p_db->'items') r;
  insert into public.items (store_id, id, code, name, unit, pack, buy_price, sell_price, opening_qty, opening_cost, min_stock, active) select store_id, id, code, name, unit, pack, buy_price, sell_price, opening_qty, opening_cost, min_stock, active from jsonb_populate_recordset(null::public.items, v_rows);
  select coalesce(jsonb_agg(jsonb_build_object('store_id', to_jsonb(p_store_id), 'deleted', r->'deleted', 'id', r->'id', 'kind', r->'kind', 'code', r->'code', 'name', r->'name', 'address', r->'address', 'city', r->'city', 'phone', r->'phone', 'fax', r->'fax', 'opening_balance', r->'openingBalance', 'active', r->'active')), '[]'::jsonb) into v_rows from jsonb_array_elements(p_db->'parties') r;
  insert into public.parties (store_id, deleted, id, kind, code, name, address, city, phone, fax, opening_balance, active) select store_id, deleted, id, kind, code, name, address, city, phone, fax, opening_balance, active from jsonb_populate_recordset(null::public.parties, v_rows);
  select coalesce(jsonb_agg(jsonb_build_object('store_id', to_jsonb(p_store_id), 'serial_tracking', r->'serialTracking', 'id', r->'id', 'kind', r->'kind', 'status', r->'status', 'number', r->'number', 'date', case when r->>'date' = '' then 'null'::jsonb else r->'date' end, 'seq', r->'seq', 'party_id', case when r->>'partyId' = '' then 'null'::jsonb else r->'partyId' end, 'party_name', r->'partyName', 'party_address', r->'partyAddress', 'party_phone', r->'partyPhone', 'order_id', case when r->>'orderId' = '' then 'null'::jsonb else r->'orderId' end, 'ref_id', case when r->>'refId' = '' then 'null'::jsonb else r->'refId' end, 'discount', r->'discount', 'down_payment', r->'downPayment', 'total', r->'total', 'notes', r->'notes', 'terms', r->'terms', 'issuer_name', r->'issuerName', 'issuer_address', r->'issuerAddress', 'issuer_phone', r->'issuerPhone', 'bank', r->'bank', 'beneficiary', r->'beneficiary', 'account', r->'account', 'bank_branch', r->'bankBranch', 'bank_code', r->'bankCode', 'country', r->'country', 'warranty', r->'warranty', 'signature', r->'signature', 'logo', r->'logo', 'partner_logo', r->'partnerLogo', 'created_at', r->'createdAt', 'cancel_reason', r->'cancelReason', 'invoice_defaults_version', r->'invoiceDefaultsVersion')), '[]'::jsonb) into v_rows from jsonb_array_elements(p_db->'documents') r;
  insert into public.documents (store_id, serial_tracking, id, kind, status, number, date, seq, party_id, party_name, party_address, party_phone, order_id, ref_id, discount, down_payment, total, notes, terms, issuer_name, issuer_address, issuer_phone, bank, beneficiary, account, bank_branch, bank_code, country, warranty, signature, logo, partner_logo, created_at, cancel_reason, invoice_defaults_version) select store_id, serial_tracking, id, kind, status, number, date, seq, party_id, party_name, party_address, party_phone, order_id, ref_id, discount, down_payment, total, notes, terms, issuer_name, issuer_address, issuer_phone, bank, beneficiary, account, bank_branch, bank_code, country, warranty, signature, logo, partner_logo, created_at, cancel_reason, invoice_defaults_version from jsonb_populate_recordset(null::public.documents, v_rows);
  select coalesce(jsonb_agg(jsonb_build_object('store_id', to_jsonb(p_store_id), 'id', r->'id', 'doc_id', case when r->>'docId' = '' then 'null'::jsonb else r->'docId' end, 'item_id', case when r->>'itemId' = '' then 'null'::jsonb else r->'itemId' end, 'code', r->'code', 'name', r->'name', 'unit', r->'unit', 'qty', r->'qty', 'price', r->'price', 'discount_type', r->'discountType', 'discount_value', r->'discountValue', 'total', r->'total', 'cost', r->'cost', 'ref_line_id', case when r->>'refLineId' = '' then 'null'::jsonb else r->'refLineId' end, 'serials', r->'serials')), '[]'::jsonb) into v_rows from jsonb_array_elements(p_db->'lines') r;
  insert into public.lines (store_id, id, doc_id, item_id, code, name, unit, qty, price, discount_type, discount_value, total, cost, ref_line_id, serials) select store_id, id, doc_id, item_id, code, name, unit, qty, price, discount_type, discount_value, total, cost, ref_line_id, serials from jsonb_populate_recordset(null::public.lines, v_rows);
  select coalesce(jsonb_agg(jsonb_build_object('store_id', to_jsonb(p_store_id), 'id', r->'id', 'number', r->'number', 'date', case when r->>'date' = '' then 'null'::jsonb else r->'date' end, 'party_id', case when r->>'partyId' = '' then 'null'::jsonb else r->'partyId' end, 'amount', r->'amount', 'direction', r->'direction', 'notes', r->'notes', 'status', r->'status', 'source_doc_id', case when r->>'sourceDocId' = '' then 'null'::jsonb else r->'sourceDocId' end)), '[]'::jsonb) into v_rows from jsonb_array_elements(p_db->'payments') r;
  insert into public.payments (store_id, id, number, date, party_id, amount, direction, notes, status, source_doc_id) select store_id, id, number, date, party_id, amount, direction, notes, status, source_doc_id from jsonb_populate_recordset(null::public.payments, v_rows);
  select coalesce(jsonb_agg(jsonb_build_object('store_id', to_jsonb(p_store_id), 'id', r->'id', 'payment_id', case when r->>'paymentId' = '' then 'null'::jsonb else r->'paymentId' end, 'doc_id', case when r->>'docId' = '' then 'null'::jsonb else r->'docId' end, 'amount', r->'amount')), '[]'::jsonb) into v_rows from jsonb_array_elements(p_db->'allocations') r;
  insert into public.allocations (store_id, id, payment_id, doc_id, amount) select store_id, id, payment_id, doc_id, amount from jsonb_populate_recordset(null::public.allocations, v_rows);
  select coalesce(jsonb_agg(jsonb_build_object('store_id', to_jsonb(p_store_id), 'id', r->'id', 'time', r->'time', 'action', r->'action', 'entity', r->'entity', 'detail', r->'detail')), '[]'::jsonb) into v_rows from jsonb_array_elements(p_db->'audit') r;
  insert into public.audit (store_id, id, time, action, entity, detail) select store_id, id, time, action, entity, detail from jsonb_populate_recordset(null::public.audit, v_rows);
  select coalesce(jsonb_agg(jsonb_build_object('store_id', to_jsonb(p_store_id), 'id', r->'id', 'invoice_issuer', r->'invoiceIssuer', 'name', r->'name', 'address', r->'address', 'phone', r->'phone', 'bank', r->'bank', 'beneficiary', r->'beneficiary', 'account', r->'account', 'bank_branch', r->'bankBranch', 'bank_code', r->'bankCode', 'country', r->'country', 'warranty', r->'warranty', 'terms', r->'terms', 'signature', r->'signature', 'logo', r->'logo', 'partner_logo', r->'partnerLogo', 'branding_version', r->'brandingVersion', 'invoice_defaults_version', r->'invoiceDefaultsVersion', 'invoice_text_defaults_version', r->'invoiceTextDefaultsVersion')), '[]'::jsonb) into v_rows from jsonb_array_elements(p_db->'settings') r;
  insert into public.settings (store_id, id, invoice_issuer, name, address, phone, bank, beneficiary, account, bank_branch, bank_code, country, warranty, terms, signature, logo, partner_logo, branding_version, invoice_defaults_version, invoice_text_defaults_version) select store_id, id, invoice_issuer, name, address, phone, bank, beneficiary, account, bank_branch, bank_code, country, warranty, terms, signature, logo, partner_logo, branding_version, invoice_defaults_version, invoice_text_defaults_version from jsonb_populate_recordset(null::public.settings, v_rows);
  update public.stores set revision = p_expected_revision + 1, last_write_id = p_write_id,
    name = p_db->'settings'->0->>'name', initialized_at = coalesce(initialized_at, now()) where id = p_store_id;
  -- Evaluate FK violations before returning success to the client.
  set constraints all immediate;
  return toko_private.snapshot(p_store_id);
end;
$$;
revoke all on function public.toko_save(uuid,text,bigint,uuid,jsonb,boolean) from public;
grant execute on function public.toko_save(uuid,text,bigint,uuid,jsonb,boolean) to anon, authenticated;

-- A single pre-provisioned shop, initially empty. Only the hash is stored here.
insert into public.stores(id, owner_id, name, access_key_hash) values ('4a6943d3-408c-4583-ad26-c7d27e1684f1', null, 'Toko Offline', '760568dba1929a15d4adb824b1dd2d2c7ca1e116a8879533df0fcf87257961e5');
notify pgrst, 'reload schema';
commit;

-- Verify RLS and that direct anonymous table access remains closed.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon_direct_access
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('stores','items','parties','documents','lines','payments','allocations','audit','settings')
order by c.relname;
