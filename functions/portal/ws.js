export { PortalRoom } from '../PortalRoom.js';

/** @param {import("@cloudflare/workers-types").EventContext} context */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const room = (url.searchParams.get('room') || '').trim().toUpperCase();

  if (!room || room.length < 2) {
    return new Response('room required', { status: 400 });
  }

  const id = context.env.PORTAL_ROOM.idFromName(room);
  const stub = context.env.PORTAL_ROOM.get(id);
  return stub.fetch(context.request);
}
