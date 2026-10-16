// Compact vector storage (plan 17 §4): a 1-byte tag + payload in a BSON binary instead of an array of doubles.
//   0x01 float32 LE (4 bytes/dim)   0x02 int8 with a float32 scale (1 byte/dim)
import { KG } from '../services/kg/config.js';

const F32 = 1, I8 = 2;

const bytesOf = (x) => (Buffer.isBuffer(x) ? x : x?.buffer && x.sub_type !== undefined ? Buffer.from(x.buffer) : null); // Buffer | BSON Binary

/** numbers → Buffer (float32 by default, int8 when KG.EMBED_STORAGE = 'int8'). Buffers/Binaries pass through. */
export function toBinary(v, storage = KG.EMBED_STORAGE) {
  if (v == null) return v;
  const raw = bytesOf(v);
  if (raw) return raw;
  if (storage === 'int8') {
    const scale = Math.max(...Array.from(v, Math.abs)) / 127 || 1;
    const out = Buffer.alloc(5 + v.length);
    out[0] = I8;
    out.writeFloatLE(scale, 1);
    for (let i = 0; i < v.length; i++) out.writeInt8(Math.round(v[i] / scale), 5 + i);
    return out;
  }
  const out = Buffer.alloc(1 + 4 * v.length);
  out[0] = F32;
  for (let i = 0; i < v.length; i++) out.writeFloatLE(v[i], 1 + 4 * i);
  return out;
}

/** Buffer | BSON Binary | number[] → Float32Array (arrays pass through as-is). */
export function fromBinary(x) {
  const raw = bytesOf(x);
  if (!raw) return x;
  if (raw[0] === I8) {
    const scale = raw.readFloatLE(1);
    return Float32Array.from({ length: raw.length - 5 }, (_, i) => raw.readInt8(5 + i) * scale);
  }
  return Float32Array.from({ length: (raw.length - 1) / 4 }, (_, i) => raw.readFloatLE(1 + 4 * i));
}
