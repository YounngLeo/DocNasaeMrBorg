import { PortalRoom } from './PortalRoom.js';

export { PortalRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/ws' && url.pathname !== '/portal/ws') {
      return Response.json({ ok: true, service: 'cuore-portal-relay', path: '/ws' });
    }
    const room = (url.searchParams.get('room') || '').trim().toUpperCase();
    if (!room || room.length < 2) {
      return new Response('room required', { status: 400 });
    }
    const id = env.PORTAL_ROOM.idFromName(room);
    return env.PORTAL_ROOM.get(id).fetch(request);
  }
};
