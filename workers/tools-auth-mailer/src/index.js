export default {
  async fetch(request, env) {
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

    const from = env.MAIL_FROM || env.TOOLS_MAIL_FROM;
    if (!from) return new Response('MAIL_FROM not set', { status: 500 });

    if (env.EMAIL && env.EMAIL.send) {
      const res = await env.EMAIL.send({ from, to, subject, html, text });
      return Response.json({ ok: true, via: 'email-service', id: res && res.messageId });
    }

    const mc = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: 'DoctNasa Tools' },
        subject,
        content: [{ type: 'text/html', value: html }]
      })
    });

    if (!mc.ok) {
      const err = await mc.text();
      return new Response(err, { status: 502 });
    }

    return Response.json({ ok: true, via: 'mailchannels' });
  }
};
