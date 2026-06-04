/**
 * Surface nets · estrazione isosuperficie da campo scalare 3D
 * (alternativa leggera a marching cubes, adatta a sculture organiche)
 */

function lerp3(a, b, t) {
  return a + (b - a) * t;
}

function grad(field, nx, ny, nz, ix, iy, iz) {
  const sx = Math.max(0, Math.min(nx - 1, ix));
  const sy = Math.max(0, Math.min(ny - 1, iy));
  const sz = Math.max(0, Math.min(nz - 1, iz));
  const idx = (x, y, z) => x + y * nx + z * nx * ny;
  const dx = field[idx(Math.min(nx - 1, sx + 1), sy, sz)] - field[idx(Math.max(0, sx - 1), sy, sz)];
  const dy = field[idx(sx, Math.min(ny - 1, sy + 1), sz)] - field[idx(sx, Math.max(0, sy - 1), sz)];
  const dz = field[idx(sx, sy, Math.min(nz - 1, sz + 1))] - field[idx(sx, sy, Math.max(0, sz - 1))];
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
}

/** @returns {{ positions: Float32Array, normals: Float32Array, indices: Uint32Array }} */
export function extractSurfaceNet(field, nx, ny, nz, iso, origin, cellSize) {
  const ox = origin[0], oy = origin[1], oz = origin[2];
  const cs = cellSize;
  const idx = (x, y, z) => x + y * nx + z * nx * ny;
  const vertMap = new Map();
  const positions = [];
  const normals = [];
  const indices = [];

  function cornerPos(ix, iy, iz) {
    return [ox + ix * cs, oy + iy * cs, oz + iz * cs];
  }

  function edgeKey(ax, ay, az, bx, by, bz) {
    if (ax < bx || (ax === bx && ay < by) || (ax === bx && ay === by && az < bz)) {
      return `${ax},${ay},${az}|${bx},${by},${bz}`;
    }
    return `${bx},${by},${bz}|${ax},${ay},${az}`;
  }

  function edgeVertex(ax, ay, az, bx, by, bz, va, vb) {
    const key = edgeKey(ax, ay, az, bx, by, bz);
    if (vertMap.has(key)) return vertMap.get(key);
    const t = (iso - va) / (vb - va + 1e-8);
    const pa = cornerPos(ax, ay, az);
    const pb = cornerPos(bx, by, bz);
    const px = lerp3(pa[0], pb[0], t);
    const py = lerp3(pa[1], pb[1], t);
    const pz = lerp3(pa[2], pb[2], t);
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5;
    const mz = (az + bz) * 0.5;
    const [nxv, nyv, nzv] = grad(field, nx, ny, nz, mx | 0, my | 0, mz | 0);
    const vi = positions.length / 3;
    positions.push(px, py, pz);
    normals.push(nxv, nyv, nzv);
    vertMap.set(key, vi);
    return vi;
  }

  for (let z = 0; z < nz - 1; z++) {
    for (let y = 0; y < ny - 1; y++) {
      for (let x = 0; x < nx - 1; x++) {
        const v = [
          field[idx(x, y, z)], field[idx(x + 1, y, z)],
          field[idx(x + 1, y + 1, z)], field[idx(x, y + 1, z)],
          field[idx(x, y, z + 1)], field[idx(x + 1, y, z + 1)],
          field[idx(x + 1, y + 1, z + 1)], field[idx(x, y + 1, z + 1)]
        ];
        let mask = 0;
        for (let i = 0; i < 8; i++) if (v[i] >= iso) mask |= (1 << i);
        if (mask === 0 || mask === 255) continue;

        const ev = [];
        const edges = [
          [0, 1, x, y, z, x + 1, y, z], [1, 2, x + 1, y, z, x + 1, y + 1, z],
          [2, 3, x + 1, y + 1, z, x, y + 1, z], [3, 0, x, y + 1, z, x, y, z],
          [4, 5, x, y, z + 1, x + 1, y, z + 1], [5, 6, x + 1, y, z + 1, x + 1, y + 1, z + 1],
          [6, 7, x + 1, y + 1, z + 1, x, y + 1, z + 1], [7, 4, x, y + 1, z + 1, x, y, z + 1],
          [0, 4, x, y, z, x, y, z + 1], [1, 5, x + 1, y, z, x + 1, y, z + 1],
          [2, 6, x + 1, y + 1, z, x + 1, y + 1, z + 1], [3, 7, x, y + 1, z, x, y + 1, z + 1]
        ];
        for (const [ca, cb, ax, ay, az, bx, by, bz] of edges) {
          const aIn = v[ca] >= iso;
          const bIn = v[cb] >= iso;
          if (aIn === bIn) continue;
          ev.push(edgeVertex(ax, ay, az, bx, by, bz, v[ca], v[cb]));
        }
        if (ev.length < 3) continue;

        const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
        const [gnx, gny, gnz] = grad(field, nx, ny, nz, cx | 0, cy | 0, cz | 0);
        const pivot = [ox + cx * cs, oy + cy * cs, oz + cz * cs];
        ev.sort((a, b) => {
          const pa = [positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]];
          const pb = [positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]];
          const angA = Math.atan2(
            (pa[1] - pivot[1]) * gnx + (pa[2] - pivot[2]) * gny - (pa[0] - pivot[0]) * gnz,
            (pa[0] - pivot[0]) * gnx + (pa[1] - pivot[1]) * gny
          );
          const angB = Math.atan2(
            (pb[1] - pivot[1]) * gnx + (pb[2] - pivot[2]) * gny - (pb[0] - pivot[0]) * gnz,
            (pb[0] - pivot[0]) * gnx + (pb[1] - pivot[1]) * gny
          );
          return angA - angB;
        });
        for (let i = 1; i < ev.length - 1; i++) {
          indices.push(ev[0], ev[i], ev[i + 1]);
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices)
  };
}
