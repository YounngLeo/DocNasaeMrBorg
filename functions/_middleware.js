/**
 * DoctNasa&MrBorg — gate /tools/*
 * Approvazione email all'owner · passcode · Cloudflare Access JWT
 */
import {
  COOKIE, getCookie, hasCfAccess, isLocalHost, needsProtection, ownerEmail,
  isAuthorized, authMode, signData, verifyData, randomId, normalizeEmail, isValidEmail,
  sessionToken, authTokenFromCode, kvGet, kvPut, kvDelete, checkRateLimit, clientIp,
  notifyOwner, notifyVisitorApproved, notifyVisitorDenied, setSessionCookie, REQUEST_TTL
} from './_auth-lib.js';

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title}</title>
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
    width: 100%; max-width: 420px;
    border: 1px solid #1a4d22; padding: 22px 20px;
    box-shadow: 0 0 32px rgba(0,255,65,0.06);
  }
  .brand { font-size: 9px; letter-spacing: 2px; opacity: 0.55; margin-bottom: 8px; }
  h1 { font-size: 16px; letter-spacing: 3px; margin-bottom: 6px; }
  p { font-size: 10px; letter-spacing: 1px; opacity: 0.65; line-height: 1.55; margin-bottom: 14px; }
  label { display: block; font-size: 9px; letter-spacing: 1.5px; opacity: 0.7; margin-bottom: 6px; }
  input[type=email], input[type=password] {
    width: 100%; background: #0a140a; border: 1px solid #1a4d22; color: #00ff41;
    font-family: inherit; font-size: 13px; letter-spacing: 1px;
    padding: 10px 12px; margin-bottom: 12px;
  }
  input:focus { outline: none; border-color: #00ff41; }
  button {
    width: 100%; background: transparent; border: 1px solid #00ff41; color: #00ff41;
    font-family: inherit; font-size: 11px; letter-spacing: 2px;
    padding: 10px; cursor: pointer; margin-top: 4px;
  }
  button:hover { background: #00ff41; color: #080808; }
  .err { color: #ff2b4a; font-size: 10px; margin-bottom: 12px; letter-spacing: 1px; }
  .ok { color: #00ff41; font-size: 10px; margin-bottom: 12px; letter-spacing: 1px; }
  .foot { margin-top: 14px; font-size: 9px; opacity: 0.45; letter-spacing: 1px; }
  a { color: #00ff41; }
  .sep { border-top: 1px solid #1a4d22; margin: 16px 0; opacity: 0.5; }
  .pulse { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:.45} 50%{opacity:1} }
</style>
</head>
<body><div class="box">${body}</div></body></html>`;
}

function loginHtml(nextPath, errorMsg, okMsg, approvalEnabled, passcodeEnabled) {
  const err = errorMsg ? '<p class="err">' + errorMsg + '</p>' : '';
  const ok = okMsg ? '<p class="ok">' + okMsg + '</p>' : '';
  const next = nextPath || '/tools/';
  let forms = '';

  if (approvalEnabled) {
    forms +=
      '<p>Richiedi accesso: riceverai un link via email dopo l\'approvazione dello studio.</p>' +
      '<form method="POST" action="/tools/_auth/request">' +
      '<input type="hidden" name="next" value="' + next.replace(/"/g, '&quot;') + '">' +
      '<label for="email">LA TUA EMAIL</label>' +
      '<input id="email" name="email" type="email" autocomplete="email" required placeholder="nome@esempio.com">' +
      '<button type="submit">RICHIEDI ACCESSO →</button></form>';
  }

  if (approvalEnabled && passcodeEnabled) {
    forms += '<div class="sep"></div>';
  }

  if (passcodeEnabled) {
    forms +=
      '<p>Codice studio (accesso diretto).</p>' +
      '<form method="POST" action="/tools/_auth/login">' +
      '<input type="hidden" name="next" value="' + next.replace(/"/g, '&quot;') + '">' +
      '<label for="code">CODICE STUDIO</label>' +
      '<input id="code" name="code" type="password" autocomplete="current-password">' +
      '<button type="submit">ENTRA CON CODICE →</button></form>';
  }

  if (!forms) {
    forms = '<p class="err">Protezione attiva ma non configurata. Contatta lo studio.</p>';
  }

  return page('ACCESSO TOOLS', (
    '<div class="brand">DOCTNASA&amp;MRBORG // STUDIO</div>' +
    '<h1>TOOLS · ACCESSO</h1>' + ok + err + forms +
    '<p class="foot"><a href="../">← torna allo studio</a></p>'
  ));
}

function waitHtml(reqId) {
  return page('IN ATTESA', (
    '<div class="brand">DOCTNASA&amp;MRBORG // STUDIO</div>' +
    '<h1>IN ATTESA</h1>' +
    '<p class="pulse">Richiesta inviata allo studio. Riceverai un\'email quando verrà approvata.</p>' +
    '<p>Questa pagina si aggiorna automaticamente…</p>' +
    '<script>setInterval(function(){fetch("/tools/_auth/poll?id=' + reqId +
    '").then(function(r){return r.json()}).then(function(j){if(j.status==="approved")' +
    'location.href=j.enter;if(j.status==="denied")location.href="/tools/_auth/login?denied=1";})' +
    '.catch(function(){});},4000);</script>' +
    '<p class="foot"><a href="/tools/_auth/login">← nuova richiesta</a></p>'
  ));
}

async function parseForm(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/x-www-form-urlencoded') && !ct.includes('multipart/form-data')) {
    return null;
  }
  const form = await request.formData();
  return {
    next: String(form.get('next') || '/tools/'),
    code: String(form.get('code') || ''),
    email: String(form.get('email') || '')
  };
}

async function handleLogin(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const data = await parseForm(request);
  if (!data) return new Response('Method not allowed', { status: 405 });

  let next = data.next;
  if (!next.startsWith('/tools')) next = '/tools/';

  if (!env.TOOLS_ACCESS_CODE) {
    return htmlResponse(loginHtml(next, 'Codice studio non configurato.', '', false, false), 503);
  }
  if (data.code !== env.TOOLS_ACCESS_CODE) {
    return htmlResponse(loginHtml(next, 'Codice non valido.', '', !!ownerEmail(env), true), 401);
  }

  const token = await authTokenFromCode(env);
  const secure = url.protocol === 'https:';
  return new Response(null, {
    status: 302,
    headers: { Location: next, 'Set-Cookie': setSessionCookie(token, secure) }
  });
}

async function handleRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = url.origin;
  const data = await parseForm(request);
  if (!data) return new Response('Method not allowed', { status: 405 });

  let next = data.next;
  if (!next.startsWith('/tools')) next = '/tools/';
  const email = normalizeEmail(data.email);
  if (!isValidEmail(email)) {
    return htmlResponse(loginHtml(next, 'Email non valida.', '', true, !!env.TOOLS_ACCESS_CODE), 400);
  }

  const owner = ownerEmail(env);
  if (!owner) {
    return htmlResponse(loginHtml(next, 'Approvazione non configurata (TOOLS_OWNER_EMAIL).', '', false, !!env.TOOLS_ACCESS_CODE), 503);
  }

  const ip = clientIp(request);
  if (!(await checkRateLimit(env, 'req-ip', ip))) {
    return htmlResponse(loginHtml(next, 'Troppe richieste. Riprova tra qualche minuto.', '', true, !!env.TOOLS_ACCESS_CODE), 429);
  }
  if (!(await checkRateLimit(env, 'req-email', email))) {
    return htmlResponse(loginHtml(next, 'Troppe richieste per questa email. Riprova più tardi.', '', true, !!env.TOOLS_ACCESS_CODE), 429);
  }

  const pending = await kvGet(env, 'pending:' + email);
  if (pending && pending.status === 'pending') {
    return htmlResponse(waitHtml(pending.id), 200);
  }

  if (email === owner) {
    const token = await sessionToken(env, email);
    const secure = url.protocol === 'https:';
    return new Response(null, {
      status: 302,
      headers: { Location: next, 'Set-Cookie': setSessionCookie(token, secure) }
    });
  }

  const reqId = randomId();
  await kvPut(env, 'req:' + reqId, {
    email: email,
    next: next,
    status: 'pending',
    created: Date.now()
  });
  await kvPut(env, 'pending:' + email, { id: reqId, status: 'pending' }, REQUEST_TTL);

  try {
    await notifyOwner(env, origin, reqId, email, next);
  } catch (e) {
    console.error('notifyOwner', e);
    return htmlResponse(loginHtml(next, 'Invio email fallito. Riprova o contatta lo studio.', '', true, !!env.TOOLS_ACCESS_CODE), 502);
  }

  if (env.TOOLS_AUTH_KV) {
    return htmlResponse(waitHtml(reqId), 200);
  }
  return htmlResponse(page('RICHIESTA INVIATA', (
    '<h1>RICHIESTA INVIATA</h1>' +
    '<p>Lo studio è stato notificato. Riceverai un\'email con il link quando l\'accesso sarà approvato.</p>' +
    '<p class="foot"><a href="/tools/_auth/login">← indietro</a></p>'
  )), 200);
}

async function handlePoll(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ status: 'error' }, { status: 400 });

  const row = await kvGet(env, 'req:' + id);
  if (!row) return Response.json({ status: 'expired' });

  if (row.status === 'approved' && row.ticket) {
    return Response.json({
      status: 'approved',
      enter: '/tools/_auth/enter?ticket=' + encodeURIComponent(row.ticket)
    });
  }
  if (row.status === 'denied') return Response.json({ status: 'denied' });
  return Response.json({ status: 'pending' });
}

async function handleDecide(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const token = url.searchParams.get('token');
  const payload = await verifyData(env, token);

  if (!payload || payload.kind !== 'owner' || !payload.id) {
    return htmlResponse(page('ERRORE', '<h1>LINK NON VALIDO</h1><p>Token scaduto o non valido.</p>'), 400);
  }

  const row = await kvGet(env, 'req:' + payload.id);
  if (!row) {
    return htmlResponse(page('ERRORE', '<h1>RICHIESTA SCADUTA</h1>'), 410);
  }
  if (row.status !== 'pending') {
    return htmlResponse(page('GIÀ GESTITA', '<h1>RICHIESTA GIÀ ELABORATA</h1><p>Questo link non è più valido.</p>'), 409);
  }

  if (action === 'deny') {
    row.status = 'denied';
    await kvPut(env, 'req:' + payload.id, row);
    await kvDelete(env, 'pending:' + row.email);
    try { await notifyVisitorDenied(env, row.email); } catch (e) {}
    return htmlResponse(page('NEGATO', (
      '<h1>ACCESSO NEGATO</h1>' +
      '<p>Richiesta di <b>' + row.email + '</b> rifiutata. L\'utente è stato notificato.</p>' +
      '<p class="foot"><a href="/tools/">→ tools</a></p>'
    )), 200);
  }

  if (action !== 'approve') {
    return htmlResponse(page('ERRORE', '<h1>AZIONE NON VALIDA</h1>'), 400);
  }

  const ticket = await signData(env, {
    kind: 'enter',
    id: payload.id,
    email: row.email,
    next: row.next,
    exp: Date.now() + REQUEST_TTL * 1000
  });
  row.status = 'approved';
  row.ticket = ticket;
  await kvPut(env, 'req:' + payload.id, row);
  await kvDelete(env, 'pending:' + row.email);

  try {
    await notifyVisitorApproved(env, url.origin, row.email, ticket);
  } catch (e) {
    console.error('notifyVisitorApproved', e);
  }

  const enterUrl = url.origin + '/tools/_auth/enter?ticket=' + encodeURIComponent(ticket);
  return htmlResponse(page('AUTORIZZATO', (
    '<h1>ACCESSO AUTORIZZATO</h1>' +
    '<p>Email inviata a <b>' + row.email + '</b> con il link di ingresso.</p>' +
    '<p><a href="' + enterUrl + '">Apri link visitatore →</a></p>'
  )), 200);
}

async function handleEnter(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const ticket = url.searchParams.get('ticket');
  const data = await verifyData(env, ticket);

  if (!data || data.kind !== 'enter' || !data.email) {
    return htmlResponse(page('ERRORE', '<h1>LINK NON VALIDO</h1><p>Richiedi un nuovo accesso.</p>'), 400);
  }

  const row = data.id ? await kvGet(env, 'req:' + data.id) : null;
  if (row && row.status === 'denied') {
    return htmlResponse(page('NEGATO', '<h1>ACCESSO NEGATO</h1>'), 403);
  }
  if (row && row.used) {
    return htmlResponse(page('ERRORE', '<h1>LINK GIÀ UTILIZZATO</h1><p>Richiedi un nuovo accesso.</p>'), 410);
  }
  if (row) {
    row.used = true;
    await kvPut(env, 'req:' + data.id, row, REQUEST_TTL);
    await kvDelete(env, 'pending:' + row.email);
  }

  const token = await sessionToken(env, data.email);
  const secure = url.protocol === 'https:';
  const dest = (row && row.next) || data.next || '/tools/';
  return new Response(null, {
    status: 302,
    headers: { Location: dest, 'Set-Cookie': setSessionCookie(token, secure) }
  });
}

async function handleStatus(context) {
  const { request, env } = context;
  const ok = await isAuthorized(request, env);
  return Response.json({
    authorized: ok,
    protected: needsProtection(env),
    cfAccess: hasCfAccess(request),
    mode: authMode(env, request),
    approval: !!(ownerEmail(env) || env.TOOLS_APPROVAL === '1')
  }, { headers: { 'Cache-Control': 'no-store' } });
}

function htmlResponse(html, status) {
  return new Response(html, {
    status: status || 200,
    headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith('/tools')) return next();

  const approvalOn = !!(ownerEmail(env) || env.TOOLS_APPROVAL === '1');
  const passcodeOn = !!env.TOOLS_ACCESS_CODE;

  if (path === '/tools/_auth/login') {
    if (request.method === 'POST') return handleLogin(context);
    if (request.method === 'GET') {
      const nextPath = url.searchParams.get('next') || '/tools/';
      const denied = url.searchParams.get('denied') === '1';
      const msg = denied ? 'La richiesta non è stata approvata.' : '';
      return htmlResponse(loginHtml(nextPath, msg, '', approvalOn, passcodeOn));
    }
    return new Response('Method not allowed', { status: 405 });
  }

  if (path === '/tools/_auth/request' && request.method === 'POST') {
    return handleRequest(context);
  }

  if (path === '/tools/_auth/poll' && request.method === 'GET') {
    return handlePoll(context);
  }

  if (path === '/tools/_auth/decide' && request.method === 'GET') {
    return handleDecide(context);
  }

  if (path === '/tools/_auth/enter' && request.method === 'GET') {
    return handleEnter(context);
  }

  if (path === '/tools/_auth/status') {
    return handleStatus(context);
  }

  if (isLocalHost(url.hostname)) return next();

  if (!needsProtection(env)) return next();

  if (await isAuthorized(request, env)) return next();

  const nextPath = path + url.search;
  return Response.redirect(
    new URL('/tools/_auth/login?next=' + encodeURIComponent(nextPath), url.origin).toString(),
    302
  );
}
