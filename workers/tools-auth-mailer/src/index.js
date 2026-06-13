export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      return new Response('worker error: ' + msg, { status: 500 });
    }
  }
};

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/send') {
    return new Response('not found', { status: 404 });
  }

  const auth = request.headers.get('Authorization') || '';
  if (!env.MAILER_SECRET || auth !== 'Bearer ' + env.MAILER_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response('bad json', { status: 400 });
  }

  const to = body.to;
  const subject = body.subject;
  const html = body.html;
  const text = body.text || String(html || '').replace(/<[^>]+>/g, ' ');

  if (!to || !subject || !html) {
    return new Response('missing fields', { status: 400 });
  }

  const from = env.MAIL_FROM || env.TOOLS_MAIL_FROM || 'tools@doctnasamrborg.cc';

  if (env.EMAIL && env.EMAIL.send) {
    try {
      const res = await env.EMAIL.send({ from, to, subject, html, text });
      return Response.json({ ok: true, via: 'email-service', id: res && res.messageId });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (!env.RESEND_API_KEY) {
        return new Response('email-service: ' + msg, { status: 502 });
      }
    }
  }

  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, html, text })
    });
    if (!res.ok) {
      const err = await res.text();
      return new Response('resend: ' + err, { status: 502 });
    }
    const data = await res.json();
    return Response.json({ ok: true, via: 'resend', id: data && data.id });
  }

  return new Response('no email transport configured (EMAIL binding or RESEND_API_KEY)', { status: 503 });
}
