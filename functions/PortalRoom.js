/** @typedef {import("@cloudflare/workers-types").DurableObjectState} DurableObjectState */

export class PortalRoom {
  /** @param {DurableObjectState} state */
  constructor(state) {
    this.state = state;
  }

  /** @param {Request} request */
  async fetch(request) {
    const url = new URL(request.url);
    const peer = url.searchParams.get('peer') || ('anon-' + crypto.randomUUID().slice(0, 8));

    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({
        ok: true,
        service: 'cuore-portal-relay',
        room: url.searchParams.get('room') || null
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, [peer]);

    this.broadcast(JSON.stringify({ type: 'ws-join', peer: peer }), server);

    return new Response(null, { status: 101, webSocket: client });
  }

  /** @param {WebSocket} ws @param {string | ArrayBuffer} message */
  async webSocketMessage(ws, message) {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    this.broadcast(text, ws);
  }

  /** @param {WebSocket} ws */
  async webSocketClose(ws) {
    try { ws.close(1000, 'closed'); } catch (e) { /* noop */ }
  }

  /** @param {string} text @param {WebSocket} except */
  broadcast(text, except) {
    this.state.getWebSockets().forEach(function (ws) {
      if (ws === except) return;
      try { ws.send(text); } catch (e) { /* noop */ }
    });
  }
}
