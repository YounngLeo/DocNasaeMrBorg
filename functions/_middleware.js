/**
 * DoctNasa&MrBorg — gate /tools/* (Cloudflare Access JWT + passcode opzionale)
 *
 * Pages → Settings → Environment variables:
 *   TOOLS_ACCESS_CODE   — codice studio (consigliato)
 *   TOOLS_ACCESS_SALT   — opzionale, rinforza il cookie
 *   TOOLS_PROTECT=1     — richiede auth anche senza passcode (solo CF Access)
 */

const COOKIE = 'dnmb_tools';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

function hasCfAccess(request) {
  return !!(
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    request.headers.get('CF-Access-Jwt-Assertion') ||
    request.headers.get('Cf-Access-Authenticated-User-Email')
  );
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
}

function needsProtection(env) {
  return !!(env.TOOLS_ACCESS_CODE || env.TOOLS_PROTECT === '1');
}

async function authToken(code, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(code) + ':' + (salt || 'dnmb-tools-gate')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('dnmb-tools-session'));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function isAuthorized(request, env) {
  if (hasCfAccess(request)) return true;
  if (env.TOOLS_ACCESS_CODE) {
    const token = getCookie(request, COOKIE);
    if (token) {
      const expected = await authToken(env.TOOLS_ACCESS_CODE, env.TOOLS_ACCESS_SALT || '');
      if (token === expected) return true;
    }
  }
  if (env.TOOLS_PROTECT === '1') return false;
  if (env.TOOLS_ACCESS_CODE) return false;
  return true;
}

function authMode(env, request) {
  if (request && hasCfAccess(request)) return 'cf';
  if (env.TOOLS_ACCESS_CODE && env.TOOLS_PROTECT === '1') return 'cf-or-pass';
  if (env.TOOLS_ACCESS_CODE) return 'pass';
  if (env.TOOLS_PROTECT === '1') return 'cf-only';
  return 'open';
}

function loginHtml(nextPath, errorMsg) {
  const err = errorMsg
    ? '<p class="err">' + errorMsg + '</p>'
    : '';
  const next = nextPath || '/tools/';
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>ACCESSO TOOLS // DOCTNASA&amp;MRBORG</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #080808; color: #00ff41;
    font-family: "Courier New", Courier, monospace; font-size: 13px;
    background-image: repeating-linear-gradient(0deg, transparent 0, transparent 2px,
      rgba(0,255,65,0.025) 2px, rgba(0,255,65,0.025) 3px);
    padding: 24px;
  }
  .box {
    width: 100%; max-width: 380px;
    border: 1px solid #1a4d22; padding: 22px 20px;
    box-shadow: 0 0 32px rgba(0,255,65,0.06);
  }
  .brand { font-size: 9px; letter-spacing: 2px; opacity: 0.55; margin-bottom: 8px; }
  h1 { font-size: 16px; letter-spacing: 3px; margin-bottom: 6px; }
  p { font-size: 10px; letter-spacing: 1px; opacity: 0.65; line-height: 1.5; margin-bottom: 16px; }
  label { display: block; font-size: 9px; letter-spacing: 1.5px; opacity: 0.7; margin-bottom: 6px; }
  input[type=password] {
    width: 100%; background: #0a140a; border: 1px solid #1a4d22; color: #00ff41;
    font-family: inherit; font-size: 14px; letter-spacing: 2px;
    padding: 10px 12px; margin-bottom: 14px;
  }
  input[type=password]:focus { outline: none; border-color: #00ff41; }
  button {
    width: 100%; background: transparent; border: 1px solid #00ff41; color: #00ff41;
    font-family: inherit; font-size: 11px; letter-spacing: 2px;
    padding: 10px; cursor: pointer;
  }
  button:hover { background: #00ff41; color: #080808; }
  .err { color: #ff2b4a; font-size: 10px; margin-bottom: 12px; letter-spacing: 1px; }
  .foot { margin-top: 14px; font-size: 9px; opacity: 0.45; letter-spacing: 1px; }
  a { color: #00ff41; }
</style>
</head>
<body>
  <div class="box">
    <div class="brand">DOCTNASA&amp;MRBORG // STUDIO</div>
    <h1>TOOLS · ACCESSO</h1>
    <p>Sezione riservata. Inserisci il codice studio oppure accedi via email Cloudflare Access se abilitato.</p>
    ${err}
    <form method="POST" action="/tools/_auth/login">
      <input type="hidden" name="next" value="${next.replace(/"/g, '&quot;')}">
      <label for="code">CODICE STUDIO</label>
      <input id="code" name="code" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">ENTRA →</button>
    </form>
    <p class="foot"><a href="../">← torna allo studio</a></p>
  </div>
</body>
</html>`;
}

async function handleLogin(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  let next = '/tools/';
  let code = '';

  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const form = await request.formData();
    next = String(form.get('next') || '/tools/');
    code = String(form.get('code') || '');
  } else {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!next.startsWith('/tools')) next = '/tools/';
  if (!env.TOOLS_ACCESS_CODE) {
    return new Response(loginHtml(next, 'Passcode non configurato sul server.'), {
      status: 503,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }

  if (code !== env.TOOLS_ACCESS_CODE) {
    return new Response(loginHtml(next, 'Codice non valido.'), {
      status: 401,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }

  const token = await authToken(env.TOOLS_ACCESS_CODE, env.TOOLS_ACCESS_SALT || '');
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const setCookie = COOKIE + '=' + encodeURIComponent(token) +
    '; Path=/tools; HttpOnly; SameSite=Lax; Max-Age=' + COOKIE_MAX_AGE + secure;

  return new Response(null, {
    status: 302,
    headers: {
      Location: next,
      'Set-Cookie': setCookie
    }
  });
}

async function handleStatus(context) {
  const { request, env } = context;
  const ok = await isAuthorized(request, env);
  const body = JSON.stringify({
    authorized: ok,
    protected: needsProtection(env),
    cfAccess: hasCfAccess(request),
    mode: authMode(env, request)
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith('/tools')) {
    return next();
  }

  if (path === '/tools/_auth/login') {
    if (request.method === 'POST') return handleLogin(context);
    if (request.method === 'GET') {
      const nextPath = url.searchParams.get('next') || '/tools/';
      return new Response(loginHtml(nextPath, ''), {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'no-store'
        }
      });
    }
    return new Response('Method not allowed', { status: 405 });
  }

  if (path === '/tools/_auth/status') {
    return handleStatus(context);
  }

  if (isLocalHost(url.hostname)) {
    return next();
  }

  if (!needsProtection(env)) {
    return next();
  }

  if (await isAuthorized(request, env)) {
    return next();
  }

  const nextPath = path + url.search;
  const loginUrl = '/tools/_auth/login?next=' + encodeURIComponent(nextPath);
  return Response.redirect(new URL(loginUrl, url.origin).toString(), 302);
}
