const fs = require('fs');

const input = fs.readFileSync('config.txt', 'utf8');
const schemes = /(?:vless|tuic|hy2|ss|vmess|anytls):\/\/[^\s]+?(?=(?:vless|tuic|hy2|ss|vmess|anytls):\/\/|\s|$)/g;
const uris = input.match(schemes) || [];
const proxies = [];
const usedNames = new Map();
const skipped = [];

function decode(value = '') { try { return decodeURIComponent(value); } catch { return value; } }
function b64(value) {
  value = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(value + '='.repeat((4 - value.length % 4) % 4), 'base64').toString('utf8');
}
function nameFor(value, fallback) {
  const base = decode(value || fallback).replace(/[\r\n]/g, ' ').trim() || fallback;
  const count = usedNames.get(base) || 0;
  usedNames.set(base, count + 1);
  return count ? `${base} (${count + 1})` : base;
}
function endpoint(url) {
  return { server: url.hostname, port: Number(url.port) };
}
function bool(value) { return value === '1' || value === 'true'; }

for (const uri of uris) {
  try {
    const scheme = uri.slice(0, uri.indexOf('://'));
    if (scheme === 'vmess') {
      const raw = uri.slice(8).split('#')[0];
      const v = JSON.parse(b64(raw));
      const p = { name: nameFor(v.ps, 'vmess'), type: 'vmess', server: v.add, port: Number(v.port), uuid: v.id, alterId: Number(v.aid || 0), cipher: v.scy || 'auto', udp: true, tls: v.tls === 'tls', network: v.net || 'tcp' };
      if (v.sni) p.servername = v.sni;
      if (v.fp) p['client-fingerprint'] = v.fp;
      proxies.push(p);
      continue;
    }
    const url = new URL(uri);
    const q = url.searchParams;
    const fragment = decode(url.hash.slice(1));
    if (scheme === 'vless') {
      const p = { name: nameFor(fragment, 'vless'), type: 'vless', ...endpoint(url), uuid: decode(url.username), network: q.get('type') || 'tcp', udp: true, tls: q.get('security') === 'reality' || q.get('security') === 'tls' };
      if (q.get('flow')) p.flow = q.get('flow');
      if (q.get('sni')) p.servername = q.get('sni');
      if (q.get('fp')) p['client-fingerprint'] = q.get('fp');
      if (bool(q.get('allowInsecure')) || bool(q.get('allow_insecure'))) p['skip-cert-verify'] = true;
      if (q.get('security') === 'reality') {
        p['reality-opts'] = { 'public-key': q.get('pbk'), 'short-id': q.get('sid') || '' };
      }
      if (p.network === 'ws') p['ws-opts'] = { path: q.get('path') || '/', headers: q.get('host') ? { Host: q.get('host') } : undefined };
      if (p.network === 'grpc') p['grpc-opts'] = { 'grpc-service-name': q.get('serviceName') || '' };
      proxies.push(p);
    } else if (scheme === 'tuic') {
      const p = { name: nameFor(fragment, 'tuic'), type: 'tuic', ...endpoint(url), uuid: decode(url.username), password: decode(url.password), alpn: (q.get('alpn') || 'h3').split(',').filter(Boolean), 'skip-cert-verify': bool(q.get('allow_insecure')) };
      if (q.get('sni')) p.sni = q.get('sni');
      if (q.get('udp_relay_mode')) p['udp-relay-mode'] = q.get('udp_relay_mode');
      if (q.get('congestion_control')) p['congestion-controller'] = q.get('congestion_control');
      proxies.push(p);
    } else if (scheme === 'hy2') {
      const p = { name: nameFor(fragment, 'hysteria2'), type: 'hysteria2', ...endpoint(url), password: decode(url.username), 'skip-cert-verify': bool(q.get('insecure')) };
      if (q.get('sni')) p.sni = q.get('sni');
      proxies.push(p);
    } else if (scheme === 'anytls') {
      const p = { name: nameFor(fragment, 'anytls'), type: 'anytls', ...endpoint(url), password: decode(url.username), 'skip-cert-verify': bool(q.get('insecure')) };
      if (q.get('sni')) p.sni = q.get('sni');
      proxies.push(p);
    } else if (scheme === 'ss') {
      const p = { name: nameFor(fragment, 'shadowsocks'), type: 'ss', ...endpoint(url), udp: true };
      let auth = decode(url.username);
      if (!auth.includes(':')) auth = b64(auth);
      const pivot = auth.indexOf(':');
      if (pivot < 1) throw new Error('invalid Shadowsocks credentials');
      p.cipher = auth.slice(0, pivot);
      p.password = auth.slice(pivot + 1);
      proxies.push(p);
    }
  } catch (error) { skipped.push({ uri, error: error.message }); }
}

function scalar(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}
function yaml(value, level = 0) {
  const pad = '  '.repeat(level);
  if (Array.isArray(value)) return value.filter(v => v !== undefined).map(v => {
    if (v && typeof v === 'object') return `${pad}-\n${yaml(v, level + 1)}`;
    return `${pad}- ${scalar(v)}`;
  }).join('\n');
  return Object.entries(value).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => {
    if (v && typeof v === 'object') return `${pad}${k}:\n${yaml(v, level + 1)}`;
    return `${pad}${k}: ${scalar(v)}`;
  }).join('\n');
}

const names = proxies.map(p => p.name);
const config = {
  port: 7890, 'socks-port': 7891, 'mixed-port': 7892, 'allow-lan': true, mode: 'rule', 'log-level': 'info', 'unified-delay': true, 'global-client-fingerprint': 'chrome',
  dns: { enable: true, listen: ':53', ipv6: true, 'enhanced-mode': 'fake-ip', 'fake-ip-range': '198.18.0.1/16', 'default-nameserver': ['223.5.5.5', '114.114.114.114', '8.8.8.8'], nameserver: ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'], fallback: ['https://1.0.0.1/dns-query', 'tls://dns.google'], 'fallback-filter': { geoip: true, 'geoip-code': 'CN', ipcidr: ['240.0.0.0/4'] } },
  proxies,
  'proxy-groups': [
    { name: '负载均衡', type: 'load-balance', url: 'http://www.gstatic.com/generate_204', interval: 300, proxies: names },
    { name: '自动选择', type: 'url-test', url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50, proxies: names },
    { name: '🌍选择代理', type: 'select', proxies: ['负载均衡', '自动选择', 'DIRECT', ...names] }
  ],
  rules: ['GEOIP,LAN,DIRECT', 'GEOIP,CN,DIRECT', 'MATCH,🌍选择代理']
};

fs.writeFileSync('clash-meta.yaml', `# Generated from config.txt; requires Mihomo / Clash Meta for VLESS, TUIC, Hysteria2 and AnyTLS.\n# Parsed ${proxies.length} nodes; skipped ${skipped.length} malformed entries.\n${yaml(config)}\n`);
console.log(JSON.stringify({ sourceUris: uris.length, proxies: proxies.length, skipped: skipped.length, skipped: skipped.map(x => x.error) }, null, 2));
