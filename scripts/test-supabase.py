"""Disposable local PostgreSQL test; never connect this script to production.
Usage: TOKO_TEST_SOCKET=/tmp/toko-supabase-socket python3 scripts/test-supabase.py
"""
import concurrent.futures, json, os, re, subprocess, uuid
from pathlib import Path
socket=os.environ['TOKO_TEST_SOCKET']
assert socket.startswith('/tmp/'), 'Use a disposable /tmp Unix socket only'
base=['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',socket,'-p','55439','postgres']
def sql(text, ok=True):
    result=subprocess.run(base,input=text,text=True,capture_output=True)
    if ok and result.returncode: raise AssertionError(result.stderr)
    if not ok: assert result.returncode, 'Expected SQL to fail'
    return result
admin = base.copy()
database = 'toko_schema_test_' + uuid.uuid4().hex
sql("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;")
sql(f'create database {database};')
base[-1] = database
sql('create schema auth; create table auth.users(id uuid primary key);')
sql(Path('supabase/migrations/001_initial_schema.sql').read_text())
second=Path('supabase/migrations/002_storage_rpc.sql').read_text()
sql(second)
store=re.search(r"values \('([a-f0-9-]+)', null", second).group(1)
key='disposable-local-test-capability'
sql(f"update public.stores set access_key_hash=encode(sha256(convert_to('{key}','UTF8')),'hex');")
fields={}
source=Path('src/types.ts').read_text()
interfaces={'Item':'items','Party':'parties','Doc':'documents','Line':'lines','Payment':'payments','Allocation':'allocations','Audit':'audit','Settings':'settings'}
for kind,table in interfaces.items():
    body=re.search(r'export interface '+kind+r' \{(.*?)\n\}',source,re.S).group(1)
    fields[table]=re.findall(r'^\s*(\w+)(\?)?: (.*?);',body,re.M)
def row(table, **overrides):
    result={}
    for name,opt,typ in fields[table]:
        if opt: continue
        result[name]=False if typ=='boolean' else 0 if typ=='number' else ''
    result.update(overrides)
    return result
db={'schema':1,'revision':19,**{t:[] for t in interfaces.values()}}
db['settings']=[row('settings',id='store',name='Toko uji',account='001200',warranty='Baris 1\nBaris 2; "quoted"')]
db['items']=[row('items',id='item-1',code='001',name='Barang uji',buyPrice=1000,sellPrice=1500,openingQty=2.125,openingCost=1000,active=True)]
db['parties']=[row('parties',id='party-1',kind='customer',code='C001',name='Customer uji',active=True)]
db['documents']=[row('documents',id='doc-1',kind='sale',status='draft',number='TEST-1',date='2026-10-30',partyId='party-1',createdAt='2026-10-30T12:00:00.000Z')]
db['lines']=[row('lines',id='line-1',docId='doc-1',itemId='item-1',qty=1,price=1500,total=1500,cost=1000)]
def read(k=key): return f"set role anon; select public.toko_read('{store}','{k}');"
def write(payload,rev,writeid,create=False):
    encoded=json.dumps(payload).replace("'","''")
    return f"set role anon; select public.toko_save('{store}','{key}',{rev},'{writeid}','{encoded}'::jsonb,{str(create).lower()});"
assert sql(read()).stdout.strip()=='null' or sql(read()).stdout.strip()==''
sql(read('wrong-key'),False)
sql('set role anon; select * from public.items;',False)
first='00000000-0000-4000-8000-000000000001'
result=json.loads(sql(write(db,0,first,True)).stdout)
assert result['db']['revision']==1
assert result['db']['items'][0]['openingQty']==2.125
assert result['db']['settings'][0]['account']=='001200'
assert result['db']['settings'][0]['warranty']==db['settings'][0]['warranty']
assert result['db']['documents'][0]['refId']==''
assert sql(write(db,0,first,True)).returncode==0
assert json.loads(sql(read()).stdout)['db']['revision']==1
sql(write(db,0,'00000000-0000-4000-8000-000000000002'),False)
bad=json.loads(json.dumps(db)); bad['lines'][0]['itemId']='missing'
sql(write(bad,1,'00000000-0000-4000-8000-000000000003'),False)
assert json.loads(sql(read()).stdout)['db']['lines'][0]['itemId']=='item-1'
# Both writes start from revision 1. Exactly one transaction may commit.
with concurrent.futures.ThreadPoolExecutor() as pool:
    results=list(pool.map(lambda n: subprocess.run(base,input=write(db,1,f'00000000-0000-4000-8000-{n:012d}'),text=True,capture_output=True),[4,5]))
assert sum(r.returncode==0 for r in results)==1
assert json.loads(sql(read()).stdout)['db']['revision']==2
print('PASS: empty read, access-key rejection, direct table denial, field roundtrip, idempotent retry, stale revision rejection, FK rollback, concurrent writer exclusion')

subprocess.run(admin, input=f'drop database {database};', text=True, check=True, capture_output=True)
