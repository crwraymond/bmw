// App-owned update manifest and artifact contract, served by GitHub Releases.
const http = require('http');
http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(501); return res.end('Outside update contract'); }
  const paths = {
    '/latest.json': [200, JSON.stringify({version:'0.2.42',versionCode:2042,packageId:'local.tokooffline.app',abi:'arm64-v8a'})],
    '/package.apk': [200, 'apk-fixture'],
    '/missing.json': [404, 'Release not found'],
    '/oversize.apk': [200, 'apk-fixture-with-extra-bytes'],
    '/truncated.apk': [200, 'apk'],
    '/failure.apk': [500, 'upstream failed'],
  };
  const entry = paths[req.url] || [501, 'Outside update contract'];
  res.writeHead(entry[0], {'Content-Type':req.url.endsWith('.json')?'application/json':'application/octet-stream'});
  res.end(entry[1]);
}).listen(process.env.PORT || 4512);
