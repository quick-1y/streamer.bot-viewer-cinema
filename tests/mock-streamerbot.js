#!/usr/bin/env node
/*
 * Mock Streamer.bot WebSocket server for testing the overlay without Streamer.bot.
 * Implements the documented protocol: Hello (+ optional salt/challenge auth),
 * Authenticate, Subscribe, GetActiveViewers, and Twitch.PresentViewers events.
 *
 * Usage: node mock-streamerbot.js [--port 8080] [--password secret] [--enforce]
 * Control (HTTP on the same port):
 *   GET /set?viewers=alice,bob        set the present-viewer list
 *   GET /event                        broadcast Twitch.PresentViewers to subscribers
 *   GET /drop                         close every client socket
 *   GET /malformed                    send junk frames + make the next GetActiveViewers malformed
 *   GET /silent?on=1                  stop answering requests (half-open connection)
 *   GET /stats                        request counters as JSON
 * No dependencies: minimal RFC 6455 text framing.
 */
'use strict';
const http = require('http');
const crypto = require('crypto');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };
const PORT = +opt('port', 8080);
const PASSWORD = opt('password', '');
const ENFORCE = !!opt('enforce', false);

let viewers = [];
let credits = { users: { users: [] }, events: {}, groups: {} };
let creditsError = false;
let malformedNext = false;
let silent = false;
const clients = new Set();
const stats = { connections: 0, requests: {}, authOk: 0, authFail: 0 };

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');

function viewerObj(login, i) {
  return {
    channelPointsUsed: 0, display: login.replace(/^./, (c) => c.toUpperCase()), exempt: false, groups: [],
    id: String(100000 + i), login, previousActive: new Date().toISOString(),
    role: i === 0 ? 'Moderator' : 'Viewer', subscribed: i % 3 === 1
  };
}

// ------------------------------------------------------------------ framing
function encode(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

function send(c, obj) {
  if (c.closed) return;
  c.sock.write(encode(typeof obj === 'string' ? obj : JSON.stringify(obj)));
}

function closeClient(c) {
  if (c.closed) return;
  c.closed = true;
  try { c.sock.write(Buffer.from([0x88, 0x00])); } catch (e) { /* ignore */ }
  c.sock.end();
  clients.delete(c);
}

function parseFrames(c, chunk) {
  c.buf = Buffer.concat([c.buf, chunk]);
  while (c.buf.length >= 2) {
    const b0 = c.buf[0], b1 = c.buf[1];
    const op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, off = 2;
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (c.buf.length < 10) return; len = Number(c.buf.readBigUInt64BE(2)); off = 10; }
    const need = off + (masked ? 4 : 0) + len;
    if (c.buf.length < need) return;
    let data = c.buf.slice(off + (masked ? 4 : 0), need);
    if (masked) { const m = c.buf.slice(off, off + 4); data = Buffer.from(data.map((x, i) => x ^ m[i % 4])); }
    c.buf = c.buf.slice(need);
    if (op === 0x8) { closeClient(c); return; }
    if (op === 0x9) { c.sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; }
    if (op === 0x1) onMessage(c, data.toString('utf8'));
  }
}

// ------------------------------------------------------------------ protocol
function onMessage(c, text) {
  let msg;
  try { msg = JSON.parse(text); } catch (e) { return; }
  const req = msg.request;
  stats.requests[req] = (stats.requests[req] || 0) + 1;
  if (silent) return;
  const reply = (o) => send(c, Object.assign({ id: msg.id }, o));

  if (req === 'Authenticate') {
    if (!c.auth) return reply({ status: 'error', error: 'Authentication not enabled' });
    const expected = sha(sha(PASSWORD + c.auth.salt) + c.auth.challenge);
    if (msg.authentication === expected) { c.authenticated = true; stats.authOk++; return reply({ status: 'ok' }); }
    stats.authFail++;
    return reply({ status: 'error', error: 'Authentication failed' });
  }
  if (ENFORCE && c.auth && !c.authenticated) return reply({ status: 'error', error: 'Authentication required' });

  switch (req) {
    case 'Subscribe': {
      const ev = msg.events || {};
      for (const k of Object.keys(ev)) c.subs[k] = Array.from(new Set([...(c.subs[k] || []), ...ev[k]]));
      return reply({ status: 'ok', events: c.subs });
    }
    case 'GetCredits':
      return reply(creditsError ? { status: 'error', error: 'Credits unavailable' } : Object.assign({}, credits, { status: 'ok' }));
    case 'GetInfo':
      return reply({ status: 'ok', info: hello().info });
    case 'GetActiveViewers':
      if (malformedNext) { malformedNext = false; return reply({ status: 'ok', viewers: 'not-an-array', count: 'x' }); }
      return reply({ status: 'ok', viewers: viewers.map(viewerObj), count: viewers.length });
    default:
      return reply({ status: 'error', error: 'Unknown request' });
  }
}

function hello(c) {
  const h = {
    timestamp: new Date().toISOString(), session: crypto.randomUUID(), request: 'Hello',
    info: { instanceId: 'mock-instance', name: 'Streamer.bot', version: '1.0.1', os: 'windows', osVersion: '10', mode: 'ui', darkMode: true, source: 'websocketServer' }
  };
  if (c && c.auth) h.authentication = c.auth;
  return h;
}

function broadcastPresent() {
  const data = {
    isTest: false, isLive: true,
    users: viewers.map((l, i) => ({ id: String(100000 + i), userName: l, display: l, role: 1, isSubscribed: false }))
  };
  for (const c of clients) {
    if ((c.subs.Twitch || []).includes('PresentViewers')) {
      send(c, { timeStamp: new Date().toISOString(), event: { source: 'Twitch', type: 'PresentViewers' }, data });
    }
  }
}

// ------------------------------------------------------------------ server
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const ok = (o) => { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/credits') {
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { credits = JSON.parse(body); creditsError = u.searchParams.get('error') === '1'; ok({ saved: true }); }
      catch (_) { res.writeHead(400); res.end(); }
    });
    return;
  }
  if (u.pathname === '/chat') {
    const type = u.searchParams.get('type') || 'ChatMessage';
    for (const c of clients) if ((c.subs.Twitch || []).includes(type)) {
      send(c, { event: { source: 'Twitch', type }, data: { message: {
        displayName: u.searchParams.get('name') || 'Alice', message: u.searchParams.get('text') || 'Hello'
      } } });
    }
    return ok({ sent: true });
  }
  if (u.pathname === '/set') {
    viewers = (u.searchParams.get('viewers') || '').split(',').map((s) => s.trim()).filter(Boolean);
    return ok({ viewers: viewers.length });
  }
  if (u.pathname === '/event') { broadcastPresent(); return ok({ sent: true }); }
  if (u.pathname === '/drop') { for (const c of Array.from(clients)) { c.sock.destroy(); clients.delete(c); } return ok({ dropped: true }); }
  if (u.pathname === '/malformed') {
    malformedNext = true;
    for (const c of clients) {
      send(c, 'this is not json {');
      send(c, '[]');
      send(c, '{"event":{"source":"Twitch"}}');
      send(c, '{"timeStamp":"x","event":{"source":"Twitch","type":"PresentViewers"},"data":null}');
    }
    return ok({ malformed: true });
  }
  if (u.pathname === '/silent') { silent = u.searchParams.get('on') === '1'; return ok({ silent }); }
  if (u.pathname === '/stats') return ok(Object.assign({ clients: clients.size, viewers: viewers.length }, stats));
  res.writeHead(404); res.end();
});

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  const c = { sock, buf: Buffer.alloc(0), subs: {}, closed: false, authenticated: false,
    auth: PASSWORD ? { salt: crypto.randomBytes(16).toString('base64'), challenge: crypto.randomBytes(16).toString('base64') } : null };
  clients.add(c);
  stats.connections++;
  sock.on('data', (d) => parseFrames(c, d));
  sock.on('close', () => { c.closed = true; clients.delete(c); });
  sock.on('error', () => { c.closed = true; clients.delete(c); });
  send(c, hello(c));
});

server.listen(PORT, '127.0.0.1', () => console.log(`mock streamer.bot on ws://127.0.0.1:${PORT}/ auth=${!!PASSWORD} enforce=${ENFORCE}`));
