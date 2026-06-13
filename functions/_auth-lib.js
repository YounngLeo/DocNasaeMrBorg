/**
 * Auth helpers — richieste accesso tools, firma HMAC, email, KV
 */

export const COOKIE = 'dnmb_tools';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;
export const REQUEST_TTL = 60 * 60 * 24;

function enc() { return new TextEncoder(); }

export function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

export function hasCfAccess(request) {
  return !!(
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    request.headers.get('CF-Access-Jwt-Assertion') ||
    request.headers.get('Cf-Access-Authenticated-User-Email')
  );
}

export function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
}

export function authSecret(env) {
  return String(
    env.TOOLS_AUTH_SECRET ||
    env.TOOLS_ACCESS_CODE ||
    env.TOOLS_ACCESS_SALT ||
    'dnmb-tools-dev-secret'
  );
}

export function ownerEmail(env) {
  return String(env.TOOLS_OWNER_EMAIL || '').trim().toLowerCase();
}

export function needsProtection(env) {
  return !!(
    env.TOOLS_ACCESS_CODE ||
    env.TOOLS_PROTECT === '1' ||
    env.TOOLS_APPROVAL === '1' ||
    ownerEmail(env)
  );
}

function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc().encode(message));
  return b64url(new Uint8Array(sig));
}

async function hmacVerify(secret, message, sig) {
  const expected = await hmacSign(secret, message);
  return expected === sig;
}

export async function signData(env, payload) {
  const body = b64url(enc().encode(JSON.stringify(payload)));
  const sig = await hmacSign(authSecret(env), body);
  return body + '.' + sig;
}

export async function verifyData(env, token) {
  if (!token || token.indexOf('.') < 0) return null;
  const dot = token.lastIndexOf('.');
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await hmacVerify(authSecret(env), body, sig))) return null;
  try {
    const json = new TextDecoder().decode(b64urlDecode(body));
    const data = JSON.parse(json);
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function randomId() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function sessionToken(env, email) {
  const payload = { email: normalizeEmail(email), exp: Date.now() + COOKIE_MAX_AGE * 1000, kind: 'session' };
  return signData(env, payload);
}

export async function verifySessionToken(env, token) {
  const data = await verifyData(env, token);
  if (!data || data.kind !== 'session' || !data.email) return null;
  return data.email;
}

export async function authTokenFromCode(env) {
  const code = env.TOOLS_ACCESS_CODE;
  if (!code) return null;
  const enc2 = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc2.encode(String(code) + ':' + (env.TOOLS_ACCESS_SALT || 'dnmb-tools-gate')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc2.encode('dnmb-tools-session'));
  return b64url(new Uint8Array(sig));
}

export async function isAuthorized(request, env) {
  if (hasCfAccess(request)) return true;

  const cookie = getCookie(request, COOKIE);
  if (cookie) {
    const email = await verifySessionToken(env, cookie);
    if (email) return true;
    if (env.TOOLS_ACCESS_CODE) {
      const expected = await authTokenFromCode(env);
      if (expected && cookie === expected) return true;
    }
  }

  if (env.TOOLS_PROTECT === '1') return false;
  if (env.TOOLS_ACCESS_CODE || ownerEmail(env) || env.TOOLS_APPROVAL === '1') return false;
  return true;
}

export function authMode(env, request) {
  if (request && hasCfAccess(request)) return 'cf';
  if (ownerEmail(env) || env.TOOLS_APPROVAL === '1') return 'approval';
  if (env.TOOLS_ACCESS_CODE) return 'pass';
  if (env.TOOLS_PROTECT === '1') return 'cf-only';
  return 'open';
}

export async function kvGet(env, key) {
  if (!env.TOOLS_AUTH_KV) return null;
  const raw = await env.TOOLS_AUTH_KV.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export async function kvPut(env, key, value, ttl) {
  if (!env.TOOLS_AUTH_KV) return;
  await env.TOOLS_AUTH_KV.put(key, JSON.stringify(value), { expirationTtl: ttl || REQUEST_TTL });
}

export async function sendEmail(env, msg) {
  const to = msg.to;
  const subject = msg.subject;
  const html = msg.html;
  const text = msg.text || html.replace(/<[^>]+>/g, ' ');

  if (env.MAILER_URL && env.MAILER_SECRET) {
    const res = await fetch(String(env.MAILER_URL).replace(/\/$/, '') + '/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + env.MAILER_SECRET
      },
      body: JSON.stringify({ to, subject, html, text })
    });
    if (!res.ok) {
      const err = await res.text().catch(function () { return res.statusText; });
      throw new Error('mailer ' + res.status + ': ' + err);
    }
    return;
  }

  const from = env.TOOLS_MAIL_FROM || env.MAIL_FROM;
  if (!from) throw new Error('TOOLS_MAIL_FROM / MAILER_URL non configurato');

  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: 'DoctNasa Tools' },
      subject: subject,
      content: [{ type: 'text/html', value: html }]
    })
  });
  if (!res.ok) {
    const err = await res.text().catch(function () { return res.statusText; });
    throw new Error('mailchannels ' + res.status + ': ' + err);
  }
}

function btn(url, label, color) {
  return '<a href="' + url + '" style="display:inline-block;margin:8px 8px 0 0;padding:10px 16px;border:1px solid ' +
    color + ';color:' + color + ';text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:1px">' +
    label + '</a>';
}

export async function notifyOwner(env, origin, reqId, requesterEmail, nextPath) {
  const owner = ownerEmail(env);
  if (!owner) throw new Error('TOOLS_OWNER_EMAIL mancante');

  const token = await signData(env, { id: reqId, exp: Date.now() + REQUEST_TTL * 1000, kind: 'owner' });
  const approve = origin + '/tools/_auth/decide?action=approve&token=' + encodeURIComponent(token);
  const deny = origin + '/tools/_auth/decide?action=deny&token=' + encodeURIComponent(token);

  const html =
    '<div style="font-family:Courier New,monospace;background:#080808;color:#00ff41;padding:20px">' +
    '<p style="opacity:0.7;font-size:11px;letter-spacing:2px">DOCTNASA&amp;MRBORG // TOOLS</p>' +
    '<h2 style="letter-spacing:2px">Richiesta accesso</h2>' +
    '<p><b>' + requesterEmail + '</b> chiede accesso alla sezione tools.</p>' +
    '<p style="font-size:12px;opacity:0.8">Destinazione: ' + nextPath + '</p>' +
    btn(approve, '✓ AUTORIZZA', '#00ff41') +
    btn(deny, '✕ NEGA', '#ff2b4a') +
    '<p style="margin-top:20px;font-size:10px;opacity:0.5">Link validi 24h. Se non hai richiesto nulla, ignora.</p></div>';

  await sendEmail(env, {
    to: owner,
    subject: '[TOOLS] Richiesta accesso · ' + requesterEmail,
    html: html
  });
}

export async function notifyVisitorApproved(env, origin, requesterEmail, ticket) {
  const enter = origin + '/tools/_auth/enter?ticket=' + encodeURIComponent(ticket);
  const html =
    '<div style="font-family:Courier New,monospace;background:#080808;color:#00ff41;padding:20px">' +
    '<p style="opacity:0.7;font-size:11px;letter-spacing:2px">DOCTNASA&amp;MRBORG // TOOLS</p>' +
    '<h2 style="letter-spacing:2px">Accesso autorizzato</h2>' +
    '<p>La tua richiesta è stata approvata.</p>' +
    btn(enter, '▶ ENTRA NEI TOOLS', '#00ff41') +
    '<p style="margin-top:16px;font-size:10px;opacity:0.5">Link valido 24 ore.</p></div>';

  await sendEmail(env, {
    to: requesterEmail,
    subject: 'Accesso TOOLS autorizzato · DoctNasa&MrBorg',
    html: html
  });
}

export async function notifyVisitorDenied(env, requesterEmail) {
  const html =
    '<div style="font-family:Courier New,monospace;background:#080808;color:#ff2b4a;padding:20px">' +
    '<h2 style="letter-spacing:2px">Accesso non autorizzato</h2>' +
    '<p>La richiesta di accesso alla sezione tools non è stata approvata.</p></div>';
  try {
    await sendEmail(env, { to: requesterEmail, subject: 'Accesso TOOLS negato', html: html });
  } catch (e) { /* optional */ }
}

export function setSessionCookie(token, secure) {
  return COOKIE + '=' + encodeURIComponent(token) +
    '; Path=/tools; HttpOnly; SameSite=Lax; Max-Age=' + COOKIE_MAX_AGE + (secure ? '; Secure' : '');
}
