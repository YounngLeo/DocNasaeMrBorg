/**
 * BIO_MESH · spettro audio → polysuperfici biomorfiche
 * analisi FFT log-spaced · deformazione sferica parametrica · linee di contorno
 */

const TAU = Math.PI * 2;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);
  const x0 = lerp(lerp(n000, n100, ux), lerp(n010, n110, ux), uy);
  const x1 = lerp(lerp(n001, n101, ux), lerp(n011, n111, ux), uy);
  return lerp(x0, x1, uz) * 2 - 1;
}

function fbm3(x, y, z, oct = 4) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += noise3(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

/** Radix-2 FFT magnitudes (real input, power-of-two length). */
function fftMagnitudes(samples) {
  const n = samples.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = samples[i];
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
  const half = n >> 1;
  const mag = new Float32Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  return mag;
}

function logBandRanges(sampleRate, fftSize, bandCount) {
  const nyquist = sampleRate * 0.5;
  const minF = 30;
  const ranges = [];
  for (let b = 0; b < bandCount; b++) {
    const t0 = b / bandCount;
    const t1 = (b + 1) / bandCount;
    const f0 = minF * Math.pow(nyquist / minF, t0);
    const f1 = minF * Math.pow(nyquist / minF, t1);
    const i0 = Math.max(1, Math.floor((f0 / nyquist) * halfBin(fftSize)));
    const i1 = Math.max(i0 + 1, Math.ceil((f1 / nyquist) * halfBin(fftSize)));
    ranges.push({ f0, f1, i0, i1 });
  }
  return ranges;
}

function halfBin(fftSize) { return fftSize >> 1; }

/** Analizza buffer audio → energia per banda (N polysuperfici) + profilo interno 8 tap. */
export function analyzeAudioBuffer(buffer, bandCount, fftSize = 2048) {
  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const ranges = logBandRanges(sr, fftSize, bandCount);
  const bands = new Float32Array(bandCount);
  const profiles = Array.from({ length: bandCount }, () => new Float32Array(8));
  const hop = fftSize >> 1;
  let windows = 0;

  for (let off = 0; off + fftSize < ch.length; off += hop) {
    const win = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const w = 0.5 * (1 - Math.cos(TAU * i / (fftSize - 1)));
      win[i] = ch[off + i] * w;
    }
    const mag = fftMagnitudes(win);
    windows++;
    for (let b = 0; b < bandCount; b++) {
      const { i0, i1 } = ranges[b];
      let e = 0;
      for (let i = i0; i < i1; i++) e += mag[i] * mag[i];
      bands[b] += e;
      const span = i1 - i0;
      for (let s = 0; s < 8; s++) {
        const a = i0 + Math.floor((span * s) / 8);
        const c = i0 + Math.floor((span * (s + 1)) / 8);
        let se = 0;
        for (let i = a; i < c; i++) se += mag[i] * mag[i];
        profiles[b][s] += se;
      }
    }
  }

  if (windows < 1) windows = 1;
  let maxB = 1e-9;
  for (let b = 0; b < bandCount; b++) {
    bands[b] = Math.sqrt(bands[b] / windows);
    maxB = Math.max(maxB, bands[b]);
    let maxP = 1e-9;
    for (let s = 0; s < 8; s++) maxP = Math.max(maxP, profiles[b][s]);
    for (let s = 0; s < 8; s++) profiles[b][s] = Math.sqrt(profiles[b][s] / windows) / maxP;
  }
  for (let b = 0; b < bandCount; b++) bands[b] /= maxB;

  return { bands, profiles, ranges };
}

/** Mappa AnalyserNode frequency data → bande normalizzate. */
export function bandsFromAnalyser(analyser, bandCount) {
  const data = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(data);
  const sr = analyser.context.sampleRate;
  const fftSize = analyser.fftSize;
  const ranges = logBandRanges(sr, fftSize, bandCount);
  const bands = new Float32Array(bandCount);
  const profiles = Array.from({ length: bandCount }, () => new Float32Array(8));
  let maxB = -120;

  for (let b = 0; b < bandCount; b++) {
    const { i0, i1 } = ranges[b];
    let e = 0, n = 0;
    for (let i = i0; i < i1; i++) {
      const db = data[i];
      const lin = Math.pow(10, db / 20);
      e += lin * lin;
      n++;
    }
    bands[b] = n ? Math.sqrt(e / n) : 0;
    maxB = Math.max(maxB, bands[b]);
    const span = i1 - i0;
    for (let s = 0; s < 8; s++) {
      const a = i0 + Math.floor((span * s) / 8);
      const c = i0 + Math.floor((span * (s + 1)) / 8);
      let se = 0, sn = 0;
      for (let i = a; i < c; i++) {
        const lin = Math.pow(10, data[i] / 20);
        se += lin * lin;
        sn++;
      }
      profiles[b][s] = sn ? Math.sqrt(se / sn) : 0;
    }
  }
  for (let b = 0; b < bandCount; b++) {
    bands[b] = maxB > 1e-9 ? bands[b] / maxB : 0;
    let maxP = 1e-9;
    for (let s = 0; s < 8; s++) maxP = Math.max(maxP, profiles[b][s]);
    for (let s = 0; s < 8; s++) profiles[b][s] /= maxP;
  }
  return { bands, profiles };
}

export function defaultParams() {
  return {
    count: 6,
    cols: 2,
    spacing: 2.35,
    radius: 0.72,
    noise: 0.38,
    bulge: 0.55,
    pinch: 0.42,
    tunnel: 0.28,
    lobes: 3.5,
    stretch: 0.35,
    gain: 1.0,
    seed: 42,
    uSeg: 36,
    vSeg: 28,
    contourU: 14,
    contourV: 10,
  };
}

function gridPos(index, count, cols, spacing) {
  const rows = Math.ceil(count / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: (col - (cols - 1) * 0.5) * spacing,
    y: ((rows - 1) * 0.5 - row) * spacing * 0.92,
    z: 0,
  };
}

function deformPoint(theta, phi, idx, band, profile, p) {
  const seed = p.seed + idx * 19.17;
  let nx = Math.cos(phi) * Math.cos(theta);
  let ny = Math.sin(phi);
  let nz = Math.cos(phi) * Math.sin(theta);

  const n1 = fbm3(nx * 1.4 + seed, ny * 1.4, nz * 1.4, 4);
  const n2 = fbm3(nx * 3.1 + seed * 0.3, ny * 2.7, nz * 3.3, 3);

  const bass = band * p.gain;
  const mid = profile[3] * p.gain;
  const treble = profile[6] * p.gain;
  const detail = profile[1] * 0.6 + profile[5] * 0.4;

  const lobePhase = theta * p.lobes + phi * (1.2 + detail) + seed;
  const pinchAmt = 1 - p.pinch * (0.35 + treble * 0.65) * (0.55 + 0.45 * Math.abs(Math.sin(lobePhase)));
  const tunnel = p.tunnel * (0.25 + mid * 0.75) * (0.5 + 0.5 * Math.sin(phi * (2 + idx * 0.17) + seed));
  const bulge = p.bulge * (0.2 + bass * 0.8) + p.noise * (n1 * 0.65 + n2 * 0.35);

  nx *= 1 + p.stretch * (bass - 0.35) * 0.9;
  ny *= 1 + p.stretch * (mid - 0.35) * 1.1;
  nz *= 1 + p.stretch * (treble - 0.35) * 0.8;

  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;

  let r = p.radius * (1 + bulge) * pinchAmt;
  r -= tunnel * Math.abs(Math.sin(theta * 0.5 + seed)) * (0.35 + 0.65 * Math.abs(nz));
  r += detail * p.noise * 0.12 * n2;

  return [nx * r, ny * r, nz * r];
}

/** Genera vertici/indici per una polysuperficie. */
export function buildPolysurfaceGeometry(idx, band, profile, params) {
  const pos = gridPos(idx, params.count, params.cols, params.spacing);
  const uSeg = params.uSeg | 0;
  const vSeg = params.vSeg | 0;
  const verts = [];
  const indices = [];

  for (let vi = 0; vi <= vSeg; vi++) {
    const v = vi / vSeg;
    const phi = (v - 0.5) * Math.PI;
    for (let ui = 0; ui <= uSeg; ui++) {
      const u = ui / uSeg;
      const theta = u * TAU;
      const [lx, ly, lz] = deformPoint(theta, phi, idx, band, profile, params);
      verts.push(pos.x + lx, pos.y + ly, pos.z + lz);
    }
  }

  const row = uSeg + 1;
  for (let vi = 0; vi < vSeg; vi++) {
    for (let ui = 0; ui < uSeg; ui++) {
      const a = vi * row + ui;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return { verts, indices, position: pos };
}

/** Linee di contorno stile disegno tecnico (meridiani + paralleli). */
export function buildContourLines(idx, band, profile, params) {
  const pos = gridPos(idx, params.count, params.cols, params.spacing);
  const lines = [];
  const cu = params.contourU | 0;
  const cv = params.contourV | 0;

  for (let i = 0; i <= cu; i++) {
    const u = i / cu;
    const theta = u * TAU;
    const seg = [];
    for (let j = 0; j <= cv; j++) {
      const v = j / cv;
      const phi = (v - 0.5) * Math.PI;
      const [x, y, z] = deformPoint(theta, phi, idx, band, profile, params);
      seg.push(pos.x + x, pos.y + y, pos.z + z);
    }
    lines.push(seg);
  }
  for (let j = 1; j < cv; j++) {
    const v = j / cv;
    const phi = (v - 0.5) * Math.PI;
    const seg = [];
    for (let i = 0; i <= cu; i++) {
      const u = i / cu;
      const theta = u * TAU;
      const [x, y, z] = deformPoint(theta, phi, idx, band, profile, params);
      seg.push(pos.x + x, pos.y + y, pos.z + z);
    }
    lines.push(seg);
  }
  return lines;
}

export function buildSceneData(bands, profiles, params) {
  const count = params.count | 0;
  const allVerts = [];
  const allIdx = [];
  const contours = [];
  let vOff = 0;

  for (let i = 0; i < count; i++) {
    const band = bands[i] ?? 0.35;
    const profile = profiles[i] ?? new Float32Array(8);
    const { verts, indices } = buildPolysurfaceGeometry(i, band, profile, params);
    for (let k = 0; k < indices.length; k++) allIdx.push(indices[k] + vOff);
    for (let k = 0; k < verts.length; k++) allVerts.push(verts[k]);
    vOff += verts.length / 3;
    contours.push(...buildContourLines(i, band, profile, params));
  }

  return { allVerts, allIdx, contours };
}

export function neutralBands(count) {
  const bands = new Float32Array(count);
  const profiles = Array.from({ length: count }, (_, i) => {
    const p = new Float32Array(8);
    for (let s = 0; s < 8; s++) p[s] = 0.35 + 0.15 * Math.sin(i * 0.9 + s * 0.7);
    return p;
  });
  for (let i = 0; i < count; i++) bands[i] = 0.35 + 0.25 * Math.sin(i * 1.1);
  return { bands, profiles };
}
