// App-owned RPC contract. This is not a published provider mock.
const http = require('http');
http.createServer(async (req, res) => {
  const reply = (status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    res.end(JSON.stringify(value));
  };
  if (req.method === 'OPTIONS') return reply(200, {});
  const raw = req.body ?? await new Promise(resolve => {
    let text = ''; req.on('data', b => text += b); req.on('end', () => resolve(text ? JSON.parse(text) : {}));
  });
  const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const key = 'toko-supabase:store';
  if (req.url === '/__reset' && req.method === 'POST') { await pm.state.set(key, null); return reply(200, {}); }
  if (req.url === '/__advance' && req.method === 'POST') {
    const store = await pm.state.get(key); store.db.revision++; await pm.state.set(key, store); return reply(200, store);
  }
  if (req.method !== 'POST' || !['/rest/v1/rpc/toko_read','/rest/v1/rpc/toko_save'].includes(req.url))
    return reply(501, { message: 'Endpoint outside this simulation contract' });
  if (!body.p_access_key || !body.p_store_id || !req.headers.apikey) return reply(403, {code:'42501', message:'STORE_ACCESS_DENIED'});
  const store = await pm.state.get(key);
  if (req.url.endsWith('/toko_read')) return reply(200, store || null);
  if (store && store.last_write_id === body.p_write_id && store.db.revision === body.p_expected_revision + 1) return reply(200, store);
  if ((store && body.p_create) || (store ? store.db.revision : 0) !== body.p_expected_revision)
    return reply(409, {code:'PT409', message:'REVISION_CONFLICT'});
  const saved = {store_id: body.p_store_id, last_write_id: body.p_write_id, db:{...body.p_db,revision:body.p_expected_revision+1}};
  await pm.state.set(key,saved);
  return reply(200,saved);
}).listen(process.env.PORT || 4511);
