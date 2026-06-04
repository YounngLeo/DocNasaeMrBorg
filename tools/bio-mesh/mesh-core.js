/**
 * BIO_MESH v2 · campo scalare 3D · spettro FFT → scultura isosuperficie
 */

import { extractSurfaceNet } from './marching-cubes.js';

const TAU = Math.PI * 2;
const PHI = (1 + Math.sqrt(5)) * 0.5;

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }

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

export function fbm3(x, y, z, oct = 5) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += noise3(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.52;
    freq *= 2.05;
  }
  return sum / norm;
}

export function fftMagnitudes(samples) {
  const n = samples.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = samples[i];
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j], uIm = im[i + j];
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

export function analyzeAudioBufferFull(buffer, fftSize = 2048) {
  const ch = buffer.getChannelData(0);
  const hop = fftSize >> 1;
  const half = fftSize >> 1;
  const acc = new Float32Array(half);
  let windows = 0;
  for (let off = 0; off + fftSize < ch.length; off += hop) {
    const win = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const w = 0.5 * (1 - Math.cos(TAU * i / (fftSize - 1)));
      win[i] = ch[off + i] * w;
    }
    const mag = fftMagnitudes(win);
    for (let i = 0; i < half; i++) acc[i] += mag[i] * mag[i];
    windows++;
  }
  if (windows < 1) windows = 1;
  let max = 1e-9;
  for (let i = 0; i < half; i++) {
    acc[i] = Math.sqrt(acc[i] / windows);
    max = Math.max(max, acc[i]);
  }
  for (let i = 0; i < half; i++) acc[i] /= max;
  return acc;
}

export function spectrumFromAnalyser(analyser) {
  const data = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(data);
  const out = new Float32Array(data.length);
  let max = 1e-9;
  for (let i = 0; i < data.length; i++) {
    out[i] = Math.pow(10, data[i] / 20);
    max = Math.max(max, out[i]);
  }
  for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}

export function downsampleSpectrum(spec, targetBins) {
  const out = new Float32Array(targetBins);
  const n = spec.length;
  for (let b = 0; b < targetBins; b++) {
    const i0 = Math.floor((b / targetBins) * n);
    const i1 = Math.max(i0 + 1, Math.floor(((b + 1) / targetBins) * n));
    let s = 0;
    for (let i = i0; i < i1; i++) s += spec[i];
    out[b] = s / (i1 - i0);
  }
  let max = 1e-9;
  for (let i = 0; i < targetBins; i++) max = Math.max(max, out[i]);
  for (let i = 0; i < targetBins; i++) out[i] /= max;
  return out;
}

export function defaultParams() {
  return {
    resolution: 56,
    iso: 0.38,
    detail: 1.15,
    metaballGain: 1.05,
    noiseGain: 0.42,
    harmonicGain: 0.55,
    tubeGain: 0.48,
    cavityGain: 0.22,
    gain: 1.0,
    seed: 42,
    spectralBins: 180,
    forgeAmount: 1.0,
    time: 0,
  };
}

function binPosition(i, n, seed, scale) {
  const t = i / Math.max(1, n - 1);
  const theta = i * TAU / PHI + seed * 0.17;
  const phi = Math.acos(clamp(1 - 2 * t, -1, 1));
  const r = scale * (0.22 + 0.78 * Math.pow(t, 0.72));
  const wobble = fbm3(i * 0.07 + seed, t * 3.1, seed * 0.5, 3) * 0.14 * scale;
  return {
    x: Math.cos(theta) * Math.sin(phi) * (r + wobble),
    y: (t - 0.5) * scale * 1.35 + fbm3(seed, i * 0.11, t * 2, 2) * 0.12 * scale,
    z: Math.sin(theta) * Math.sin(phi) * (r + wobble)
  };
}

function addMetaball(field, nx, ny, nz, px, py, pz, radius, strength, origin, cellSize) {
  const ox = origin[0], oy = origin[1], oz = origin[2];
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor((px - radius - ox) / cellSize));
  const x1 = Math.min(nx - 1, Math.ceil((px + radius - ox) / cellSize));
  const y0 = Math.max(0, Math.floor((py - radius - oy) / cellSize));
  const y1 = Math.min(ny - 1, Math.ceil((py + radius - oy) / cellSize));
  const z0 = Math.max(0, Math.floor((pz - radius - oz) / cellSize));
  const z1 = Math.min(nz - 1, Math.ceil((pz + radius - oz) / cellSize));
  const idx = (x, y, z) => x + y * nx + z * nx * ny;
  for (let z = z0; z <= z1; z++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const wx = ox + x * cellSize;
        const wy = oy + y * cellSize;
        const wz = oz + z * cellSize;
        const dx = wx - px, dy = wy - py, dz = wz - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2 * 2.5) continue;
        field[idx(x, y, z)] += strength * Math.exp(-d2 / (r2 * 0.55 + 0.001));
      }
    }
  }
}

function addTube(field, nx, ny, nz, ax, ay, az, bx, by, bz, radius, strength, origin, cellSize, steps) {
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    addMetaball(field, nx, ny, nz,
      lerp(ax, bx, t), lerp(ay, by, t), lerp(az, bz, t),
      radius, strength * 0.55, origin, cellSize);
  }
}

export class ScalarField {
  constructor(resolution = 56) {
    this.setResolution(resolution);
    this.sculpt = null;
    this.origin = [-1, -1, -1];
    this.cellSize = 2 / (resolution - 1);
  }

  setResolution(res) {
    this.res = res | 0;
    this.n = this.res;
    this.field = new Float32Array(this.n * this.n * this.n);
    this.sculpt = new Float32Array(this.field.length);
    this.cellSize = 2 / (this.n - 1);
    this.origin = [-1, -1, -1];
  }

  clearSculpt() {
    this.sculpt.fill(0);
  }

  sculptSphere(wx, wy, wz, radius, strength, subtract = false) {
    const ox = this.origin[0], oy = this.origin[1], oz = this.origin[2];
    const cs = this.cellSize;
    const nx = this.n, ny = this.n, nz = this.n;
    const x0 = Math.max(0, Math.floor((wx - radius - ox) / cs));
    const x1 = Math.min(nx - 1, Math.ceil((wx + radius - ox) / cs));
    const y0 = Math.max(0, Math.floor((wy - radius - oy) / cs));
    const y1 = Math.min(ny - 1, Math.ceil((wy + radius - oy) / cs));
    const z0 = Math.max(0, Math.floor((wz - radius - oz) / cs));
    const z1 = Math.min(nz - 1, Math.ceil((wz + radius - oz) / cs));
    const r2 = radius * radius;
    const idx = (x, y, z) => x + y * nx + z * nx * ny;
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = ox + x * cs;
          const py = oy + y * cs;
          const pz = oz + z * cs;
          const d2 = (px - wx) ** 2 + (py - wy) ** 2 + (pz - wz) ** 2;
          if (d2 > r2) continue;
          const t = 1 - d2 / r2;
          const w = t * t * strength;
          const i = idx(x, y, z);
          if (subtract) this.sculpt[i] -= w;
          else this.sculpt[i] += w;
        }
      }
    }
  }

  buildFromSpectrum(spectrum, params) {
    const p = params;
    const nx = this.n, ny = this.n, nz = this.n;
    const field = this.field;
    field.fill(0);
    const idx = (x, y, z) => x + y * nx + z * nx * ny;
    const bins = downsampleSpectrum(spectrum, p.spectralBins | 0);
    const n = bins.length;
    const origin = this.origin;
    const cs = this.cellSize;
    const seed = p.seed;
    const forge = clamp(p.forgeAmount, 0, 1);
    const activeBins = Math.max(3, Math.floor(n * forge));
    const scale = 0.92;
    const positions = [];

    for (let i = 0; i < activeBins; i++) {
      const e = Math.pow(bins[i] * p.gain, 1.35);
      const pos = binPosition(i, n, seed, scale);
      positions.push(pos);
      const rad = 0.04 + e * 0.11 * p.metaballGain * p.detail;
      const str = 0.15 + e * 0.85 * p.metaballGain;
      addMetaball(field, nx, ny, nz, pos.x, pos.y, pos.z, rad, str, origin, cs);
      if (i > 0 && p.tubeGain > 0) {
        const prev = positions[i - 1];
        const tubeR = 0.025 + ((e + bins[i - 1]) * 0.5) * 0.06 * p.tubeGain;
        addTube(field, nx, ny, nz,
          prev.x, prev.y, prev.z, pos.x, pos.y, pos.z,
          tubeR, str * p.tubeGain, origin, cs, 6);
      }
    }

    const bass = bins.slice(0, Math.floor(n * 0.12)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(n * 0.12));
    const mid = bins.slice(Math.floor(n * 0.12), Math.floor(n * 0.45)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(n * 0.33));
    const treble = bins.slice(Math.floor(n * 0.45)).reduce((a, b) => a + b, 0) / Math.max(1, n - Math.floor(n * 0.45));

    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const wx = origin[0] + x * cs;
          const wy = origin[1] + y * cs;
          const wz = origin[2] + z * cs;
          const r = Math.hypot(wx, wy * 0.85, wz);
          const forgeMask = clamp((forge * 1.35 - r * 0.55) * 2.2, 0, 1);
          if (forgeMask <= 0) continue;

          let harm = 0;
          for (let h = 0; h < 7; h++) {
            const freq = 0.8 + h * 1.6 + bass * 2;
            harm += Math.sin(wx * freq + seed + p.time * (0.4 + h * 0.08)) *
                    Math.cos(wy * (freq * 0.9) + p.time * 0.3) *
                    Math.sin(wz * (freq * 1.1) + h) * (0.12 / (h + 1));
          }
          harm *= p.harmonicGain * mid;

          const n1 = fbm3(wx * 2.1 + seed, wy * 2.0, wz * 2.2 + p.time * 0.15, 5);
          const n2 = fbm3(wx * 5.5, wy * 4.8, wz * 5.2, 4);
          const noiseVal = (n1 * 0.65 + n2 * 0.35) * p.noiseGain * (0.35 + treble * 0.65);
          const cavity = Math.exp(-r * r * (2.5 - bass * 1.2)) * p.cavityGain * treble;

          let v = field[idx(x, y, z)] + (harm + noiseVal) * forgeMask - cavity * forgeMask;
          v += this.sculpt[idx(x, y, z)];
          field[idx(x, y, z)] = v;
        }
      }
    }
  }

  extractMesh(iso) {
    return extractSurfaceNet(
      this.field, this.n, this.n, this.n,
      iso, this.origin, this.cellSize
    );
  }
}

export function neutralSpectrum(bins = 180) {
  const s = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    s[i] = 0.15 + 0.85 * Math.pow(Math.sin(i * 0.08) * 0.5 + 0.5, 1.6) * Math.exp(-i / bins * 0.8);
  }
  return s;
}
