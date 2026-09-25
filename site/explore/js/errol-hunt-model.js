// Copyright (C) 2026 Toit contributors.
// Model behind explore/errol-hunt.html ("The lab notebook: rediscover Errol, then hunt the needles").
// Pure computation, no DOM: importable from node tests.
//
// Contents
//   * Faithful ports of the reference C code (github.com/marcandrysco/Errol, HEAD 5364de4, lib/errol.c):
//       errol1(v)       - errol1_dtoa: double-double path with a narrowed (and a widened) interval
//       errol2(v)       - errol2_dtoa: errol1 plus exact 128-bit integers for (2^53, 3.4e38)
//       errol3u(v)      - errol3u_dtoa: no narrowing, errol_fixed for [16, 2^53], errol_int above
//       errol3(v)       - errol3_dtoa: errol3u behind the 432-entry exception table (enum3.h)
//     The double-double operations reproduce the C floating-point sequence bit for bit
//     (JavaScript numbers are IEEE binary64 with round-to-nearest and no FMA contraction).
//   * A BigInt port of the offline search (test/proof.c proof_enum and the parameters of
//     test/main.c table_enum), instrumented so the page can draw every hop.
//   * An oracle built on Number.prototype.toExponential(), whose digit count the
//     ECMAScript spec requires to be minimal, plus an exact BigInt midpoint check.

// ---------------------------------------------------------------------------
// Bits

const buffer = new ArrayBuffer(8);
const f64 = new Float64Array(buffer);
const u64 = new BigUint64Array(buffer);

export function bitsOf(d) { f64[0] = d; return u64[0]; }
export function fromBits(b) { u64[0] = BigInt.asUintN(64, b); return f64[0]; }
export const hex64 = (d) => bitsOf(d).toString(16).padStart(16, "0");
export const fromHex = (h) => fromBits(BigInt("0x" + h));
export const fpnext = (d) => fromBits(bitsOf(d) + 1n);
export const fpprev = (d) => fromBits(bitsOf(d) - 1n);

export const DBL_MAX = 1.7976931348623157e308;
export const TWO53 = 9007199254740992; // 9.007199254740992e15
export const INT_LIMIT = 3.40282366920938e38; // the C constant, a little below 2^128

// Binary exponent e with 2^e <= d < 2^(e+1) (the page's "binade").
export function binadeOf(d) {
  const b = bitsOf(d);
  const ex = Number((b >> 52n) & 0x7ffn);
  if (ex !== 0) return ex - 1023;
  let m = b & ((1n << 52n) - 1n);
  let e = -1074;
  while (m > 1n) { m >>= 1n; e++; }
  return e;
}

// frexp exponent: d = f * 2^e with f in [0.5, 1).
function frexpExp(d) { return binadeOf(d) + 1; }

// ---------------------------------------------------------------------------
// Double-double ("HP") arithmetic, as in errol.c

export function normalize(h) { const v = h.val; h.val += h.off; h.off += v - h.val; }
export function mul10(h) {
  const v = h.val;
  h.val *= 10; h.off *= 10;
  let o = h.val; o -= v * 8; o -= v * 2;
  h.off -= o;
  normalize(h);
}
export function div10(h) {
  let v = h.val;
  h.val /= 10; h.off /= 10;
  v -= h.val * 8; v -= h.val * 2;
  h.off += v / 10;
  normalize(h);
}
const hiPart = (d) => fromBits(bitsOf(d) & 0xFFFFFFFFF8000000n);
export function hpProd(a, v) {
  const hi = hiPart(a.val), lo = a.val - hi, hi2 = hiPart(v), lo2 = v - hi2;
  const p = a.val * v;
  const e = ((hi * hi2 - p) + lo * hi2 + hi * lo2) + lo * lo2;
  return { val: p, off: a.off * v + e };
}

// lookup.h: entry i holds 10^(308-i) as (nearest double, nearest double to the residual).
// Rebuilt with BigInt; identical to the 600 entries of lookup.h (checked in the node test
// against spot values and by the bit-exact outputs).
const LOOKUP_LEN = 600;
const P10 = [];
function exactDecimalOfDouble(d) {
  const b = bitsOf(d);
  let e = Number((b >> 52n) & 0x7ffn);
  let m = b & ((1n << 52n) - 1n);
  if (e === 0) e = 1; else m |= 1n << 52n;
  e -= 1075;
  if (e >= 0) return [m << BigInt(e), 0];
  return [m * 5n ** BigInt(-e), -e];
}
export function lookup(i) {
  if (P10[i]) return P10[i];
  const k = 308 - i;
  const hi = Number("1e" + k);
  let lo;
  if (k >= 0) lo = Number(10n ** BigInt(k) - BigInt(hi));
  else {
    const [N, s] = exactDecimalOfDouble(hi);
    const num = 10n ** BigInt(s + k) - N;
    const neg = num < 0n;
    lo = Number((neg ? "-" : "") + (neg ? -num : num).toString() + "e-" + s);
  }
  return (P10[i] = { val: hi, off: lo });
}

const dchar = (d) => String.fromCharCode(48 + (d & 0xff)); // C: *buf++ = digit + '0'

// Shared prologue: scale v by a tabled power of ten so that mid lies in [1, 10).
function scale(val, trace) {
  let exp = Math.trunc(307 + frexpExp(val) * 0.30103);
  if (exp < 20) exp = 20; else if (exp >= LOOKUP_LEN) exp = LOOKUP_LEN - 1;
  const t = lookup(exp);
  const mid = hpProd(t, val);
  const lten = t.val;
  let ten = 1.0;
  if (trace) trace.push({ step: "scale", index: exp, power: 308 - exp, mid: { ...mid } });
  exp -= 307;
  while (mid.val > 10.0 || (mid.val === 10.0 && mid.off >= 0.0)) { exp++; div10(mid); ten /= 10.0; }
  while (mid.val < 1.0 || (mid.val === 1.0 && mid.off < 0.0)) { exp--; mul10(mid); ten *= 10.0; }
  return { mid, lten, ten, exp };
}

function hpDigit(h) {
  let d = Math.trunc(h.val) & 0xff; // (uint8_t) cast
  if (h.val === d && h.off < 0) d = (d - 1) & 0xff;
  return d;
}

// errol1_dtoa. Returns { digits, exp, opt } meaning 0.digits x 10^exp.
export const ERROL1_EPSILON = 8.77e-15;
export function errol1(val) {
  if (val === DBL_MAX) return { digits: "17976931348623157", exp: 309, opt: true, path: "special" };
  let { mid, lten, ten, exp } = scale(val);
  const up = fpnext(val) - val, down = fpprev(val) - val;
  const inhi = { val: mid.val, off: mid.off + up * lten * ten / (2.0 + ERROL1_EPSILON) };
  const inlo = { val: mid.val, off: mid.off + down * lten * ten / (2.0 + ERROL1_EPSILON) };
  const outhi = { val: mid.val, off: mid.off + up * lten * ten / (2.0 - ERROL1_EPSILON) };
  const outlo = { val: mid.val, off: mid.off + down * lten * ten / (2.0 - ERROL1_EPSILON) };
  normalize(inhi); normalize(inlo); normalize(outhi); normalize(outlo);
  while (inhi.val > 10.0 || (inhi.val === 10.0 && inhi.off >= 0.0)) { exp++; div10(inhi); div10(inlo); div10(outhi); div10(outlo); }
  while (inhi.val < 1.0 || (inhi.val === 1.0 && inhi.off < 0.0)) { exp--; mul10(inhi); mul10(inlo); mul10(outhi); mul10(outlo); }
  let opt = true;
  let digits = "";
  while (inhi.val !== 0.0 || inhi.off !== 0.0) {
    let hdig = hpDigit(inhi), ldig = hpDigit(inlo);
    if (ldig !== hdig) break;
    digits += dchar(hdig);
    inhi.val -= hdig; inlo.val -= ldig;
    mul10(inhi); mul10(inlo);
    hdig = hpDigit(outhi); ldig = hpDigit(outlo);
    if (ldig !== hdig) opt = false;
    outhi.val -= hdig; outlo.val -= ldig;
    mul10(outhi); mul10(outlo);
  }
  const mdig = (inhi.val + inlo.val) / 2.0 + 0.5;
  digits += dchar(Math.trunc(mdig));
  return { digits, exp, opt, path: "hp-narrow" };
}

// The double-double path of errol3u_dtoa (no narrowing). Optional trace for the setup figure.
export function errol3uHP(val, trace) {
  let { mid, lten, ten, exp } = scale(val, trace);
  const high = { val: mid.val, off: mid.off + (fpnext(val) - val) * lten * ten / 2.0 };
  const low = { val: mid.val, off: mid.off + (fpprev(val) - val) * lten * ten / 2.0 };
  normalize(high); normalize(low);
  while (high.val > 10.0 || (high.val === 10.0 && high.off >= 0.0)) { exp++; div10(high); div10(low); }
  while (high.val < 1.0 || (high.val === 1.0 && high.off < 0.0)) { exp--; mul10(high); mul10(low); }
  if (trace) trace.push({ step: "bounds", exp, mid: { ...mid }, high: { ...high }, low: { ...low } });
  let digits = "";
  for (;;) {
    const hdig = hpDigit(high), ldig = hpDigit(low);
    if (trace) trace.push({ step: "digit", high: { ...high }, low: { ...low }, hdig, ldig });
    if (ldig !== hdig) break;
    digits += dchar(hdig);
    high.val -= hdig; low.val -= ldig;
    mul10(high); mul10(low);
  }
  const tmp = (high.val + low.val) / 2.0;
  let mdig = Math.trunc(tmp + 0.5) & 0xff;
  if ((mdig - tmp) === 0.5 && (mdig & 1)) mdig--;
  if (trace) trace.push({ step: "last", tmp, mdig });
  digits += dchar(mdig);
  return { digits, exp, path: "hp" };
}

// fpeint: the power of two (next(v)-v)/2 etc. as an exact integer.
const fpeint = (d) => BigInt(d);

// Integer part of errol2_dtoa (exact 128-bit midpoints, string compare).
function errol2Int(val) {
  let mid = BigInt(val);
  let low = mid - fpeint((fpnext(val) - val) / 2.0);
  let high = mid + fpeint((val - fpprev(val)) / 2.0);
  if (bitsOf(val) & 1n) high--; else low--;
  const hs = high.toString(), L = hs.length;
  const ls = low.toString().padStart(L, "0"), ms = mid.toString().padStart(L, "0");
  const hstr = hs + "5", lstr = ls + "5"; // sentinels at index 40 in the C buffers
  let i = 0, digits = "";
  do digits += hstr[i++]; while (i < hstr.length && hstr[i] === lstr[i]);
  const next = i + 1 < ms.length ? ms[i + 1] : "\0";
  digits += String.fromCharCode(ms.charCodeAt(i) + (next >= "5" ? 1 : 0));
  return { digits, exp: L, opt: true, path: "int2" };
}

export function errol2(val) {
  if (val <= 9.007199254740992e15 || val >= INT_LIMIT) return errol1(val);
  return errol2Int(val);
}

// errol_int (used by errol3u). Faithful, including its two known defects:
//  * the gaps are swapped (low uses the upper gap), visible at powers of two;
//  * a one-digit m64 writes p[-1] outside the buffer and leaves an empty string (issue #12).
function mismatch10(a, b) {
  const pow10 = 10000000000n;
  const af = a / pow10, bf = b / pow10;
  let i = 0;
  if (af !== bf) { i = 10; a = af; b = bf; }
  for (;; ++i) { a /= 10n; b /= 10n; if (a === b) return i; }
}
export function errolInt(val) {
  let mid = BigInt(val);
  let low = mid - fpeint((fpnext(val) - val) / 2.0);
  let high = mid + fpeint((val - fpprev(val)) / 2.0);
  if (bitsOf(val) & 1n) high--; else low--;
  const pow19 = 10n ** 19n;
  const U = (x) => BigInt.asUintN(64, x);
  let l64 = U(low % pow19), lf = U((low / pow19) % pow19);
  let h64 = U(high % pow19), hf = U((high / pow19) % pow19);
  if (lf !== hf) { l64 = lf; h64 = hf; mid = mid / (pow19 / 10n); }
  let mi = mismatch10(l64, h64);
  let x = 1n;
  for (let i = lf === hf ? 1 : 0; i < mi; i++) x = U(x * 10n);
  const m64 = U(mid / x);
  if (lf !== hf) mi += 19;
  const chars = m64.toString().split("");
  let p = chars.length - 1;
  let outOfBounds = false;
  if (mi !== 0) {
    if (p >= 1) chars[p - 1] = String.fromCharCode(chars[p - 1].charCodeAt(0) + (chars[p] >= "5" ? 1 : 0));
    else outOfBounds = true;
  } else ++p;
  return { digits: chars.slice(0, p).join(""), exp: p + mi, path: "int", outOfBounds };
}

// errol_fixed (used by errol3u for 16 <= v <= 2^53).
export function errolFixed(val) {
  const n = Math.trunc(val);
  let mid = val - n;
  let lo = ((fpprev(val) - n) + mid) / 2.0;
  let hi = ((fpnext(val) - n) + mid) / 2.0;
  const buf = String(BigInt(n)).split("").map((c) => c.charCodeAt(0));
  const exp = buf.length;
  if (mid !== 0.0) {
    while (mid !== 0.0) {
      lo *= 10.0; const ldig = Math.trunc(lo); lo -= ldig;
      mid *= 10.0; const mdig = Math.trunc(mid); mid -= mdig;
      hi *= 10.0; const hdig = Math.trunc(hi); hi -= hdig;
      buf.push(48 + mdig);
      if (hdig !== ldig || buf.length > 50) break;
    }
    if (mid > 0.5) buf[buf.length - 1]++;
    else if (mid === 0.5 && (buf[buf.length - 1] & 1)) buf[buf.length - 1]++;
  } else {
    while (buf.length && buf[buf.length - 1] === 48) buf.pop();
  }
  return { digits: String.fromCharCode(...buf), exp, path: "fixed" };
}

export function errol3u(val) {
  if (val > 9.007199254740992e15 && val < INT_LIMIT) return errolInt(val);
  if (val >= 16.0 && val <= 9.007199254740992e15) return errolFixed(val);
  return errol3uHP(val);
}

// ---------------------------------------------------------------------------
// The exception table enum3.h: the 432 bit patterns, sorted (the C file stores them in
// level order for a branch-free search; the set is the same).

const ENUM3_HEX =
  "001d243f646eaf51002d243f646eaf5100ab7aa3d73f665800bb7aa3d73f665800cb7aa3d73f665800f5d15b26b80e30" +
  "010b7aa3d73f6658011b7aa3d73f6658012b7aa3d73f66580180a0f3c55062c50180a0f3c55062c60190a0f3c55062c5" +
  "0190a0f3c55062c601f393b456eef17803719f08ccdccfe5037be9d5a60850b503dc25ba6a45de0205798e3445512a6e" +
  "05798e3445512a6f05898e3445512a6e05898e3445512a6f06afdadafcacdf8506bfdadafcacdf8506ceb7f2c53db97f" +
  "06cfdadafcacdf8506e8b03fd6894b6606f8b03fd6894b6607bfe89cf1bd76ac07c1707c0206878507cfe89cf1bd76ac" +
  "08567a3c8dc4bc9c08667a3c8dc4bc9c089c25584881552a08ac25584881552a08dfa7ebe304ee3d08dfa7ebe304ee3e" +
  "096822507db6a8fd097822507db6a8fd09e41934d77659be0b8f3d82e93562870c27b35936d56e270c27b35936d56e28" +
  "0c43165633977bc90c43165633977bca0c53165633977bc90c53165633977bca0c63165633977bc90c63165633977bca" +
  "0c7e9eddbbb259b40c8e9eddbbb259b40c9e9eddbbb259b40e104273b18918b00e104273b18918b10e204273b18918b0" +
  "0e204273b18918b10e304273b18918b00e304273b18918b10f1d16d6d4b896890fd6ba8608faa6a80fd6ba8608faa6a9" +
  "0fe6ba8608faa6a80fe6ba8608faa6a91006b100e18e5c171016b100e18e5c17104f48347c60a1be105f48347c60a1be" +
  "10a4139a6b17b22410b4139a6b17b22412cb91d317c8ebe913627383c5456c5e138fb24e492936f6139fb24e492936f6" +
  "13afb24e492936f613f93bb1e72a203314093bb1e72a20331466cc4fc92a0fa61476cc4fc92a0fa6148048cb468bc208" +
  "149048cb468bc20914a048cb468bc2091504c0b3a63c14441514c0b3a63c1444161ba6008389068a162ba6008389068a" +
  "168cfab1a09b49c4175090684f5fe997175090684f5fe998176090684f5fe997176090684f5fe99817e4116d591ef1fb" +
  "17f4116d591ef1fb1804116d591ef1fb18a710b7a2ef18b718cde996371c606018d99fccca44882a18dde996371c6060" +
  "199a2cf604c30d3f19aa2cf604c30d3f1b5ebddc6593c8571c513770474911bd1d1b1ad9101b1bfd1d2b1ad9101b1bfd" +
  "1d3b1ad9101b1bfd1e3035e7b51839221e4035e7b51839231e5035e7b51839231e6035e7b51839231e7035e7b5183923" +
  "1fd5a79c4e71d0281fe5a79c4e71d02820cc29bc6879dfcd20dc29bc6879dfcd20e8823a57adbef820ec29bc6879dfcd" +
  "2104dab846e19e252114dab846e19e252124dab846e19e25218ce77c2b3328fb220ce77c2b3328fb220ce77c2b3328fc" +
  "221ce77c2b3328fb221ce77c2b3328fc222ce77c2b3328fb222ce77c2b3328fc229197b290631476233f346f9ed36b89" +
  "240a28877a09a4e0240a28877a09a4e1243441ed79830181243441ed79830182244441ed79830181244441ed79830182" +
  "245441ed79830181245441ed79830182246441ed79830181246441ed79830182247441ed79830181247441ed79830182" +
  "248b23b50fc204db249b23b50fc204db24ab23b50fc204db2541e4ee41180c0a2633dc6227de91482643dc6227de9148" +
  "2653dc6227de9148277aacfcb88c92d6277aacfcb88c92d7278aacfcb88c92d6278aacfcb88c92d7279aacfcb88c92d6" +
  "279aacfcb88c92d7279b5cd8bbdd877027bbb4c6bd8601bd27cbb4c6bd8601bd289d52af46e5fa69289d52af46e5fa6a" +
  "28b04a616046e07428c04a616046e07428d04a616046e074297c2c31a31998ae2a3eeff57768f88c2a4eeff57768f88c" +
  "2b8e3a0aeed7be192bdec922478c04212beec922478c04212c2379f099a862272cc7c3fba45c12712cc7c3fba45c1272" +
  "2cf4f14348a4c5db2d04f14348a4c5db2d44f14348a4c5db2d44f14348a4c5dc2d54f14348a4c5db2d54f14348a4c5dc" +
  "2d5a8c931c19b77a2d64f14348a4c5db2d64f14348a4c5dc2d6a8c931c19b77a2efc1249e96b6d8d2f0c1249e96b6d8d" +
  "2f0f6b23cfe988072fa387cf9cb4ad4e2fe91b9de4d5cf313081eab25ad0fcf7308ddc7e975c5045308ddc7e975c5046" +
  "309ddc7e975c504530addc7e975c504530bddc7e975c50453149190e30e46c1d3150ed9bd6bfd0033159190e30e46c1d" +
  "317d2ec75df6ba2a318d2ec75df6ba2a321aedaa0fc32ac8322aedaa0fc32ac832448050091c3c2432548050091c3c24" +
  "328f5a18504dfaac329f5a18504dfaac3336dca59d03582033beef5e1f90ac3433ceef5e1f90ac3433deef5e1f90ac34" +
  "33eeef5e1f90ac3533feef5e1f90ac35340eef5e1f90ac35341eef5e1f90ac3534228f9edfbd3420342eef5e1f90ac35" +
  "34328f9edfbd3420343eef5e1f90ac35344eef5e1f90ac35345eef5e1f90ac35346eef5e1f90ac35347eef5e1f90ac35" +
  "35008621c419920835108621c419920835e0ac2e7f90b8a335ef1de1f7f14439361dde4a4ab13e09366b870de5d93270" +
  "367b870de5d93270368b870de5d93270375b20c2f4f8d49f375b20c2f4f8d4a037f25d342b1e33e53854faba79ea92ec" +
  "3854faba79ea92ed3864faba79ea92ec3864faba79ea92ed3a978cfcab31064c3a978cfcab31064d3aa78cfcab31064c" +
  "3aa78cfcab31064d47f52d02c7e14af7490cd230a7ff47c34919d9577de925d54929d9577de925d54931159a8bd8a240" +
  "4939d9577de925d549ccadd6dd730c9649dcadd6dd730c964a6bb6979ae39c494a7bb6979ae39c494b9a32ac316fb3ab" +
  "4b9a32ac316fb3ac4baa32ac316fb3ab4baa32ac316fb3ac4bba32ac316fb3ab4bba32ac316fb3ac4c85564fb098c955" +
  "4cef20b1a0d7f6264cff20b1a0d7f6264e2e2785c3a2a20a4e2e2785c3a2a20b4e3e2785c3a2a20a4e3e2785c3a2a20b" +
  "4e6454b1aef62c8d4e80fde34c9960864e90fde34c9960864ea9a2c2a34ac2f94ea9a2c2a34ac2fa4eb9a2c2a34ac2f9" +
  "4eb9a2c2a34ac2fa4ec9a2c2a34ac2f94ec9a2c2a34ac2fa4ed9a2c2a34ac2f94ed9a2c2a34ac2fa4f28750ea732fdae" +
  "4f38750ea732fdae503ca9bade45b94a504ca9bade45b94a513843e10734fa57514843e10734fa5751a3274280201a89" +
  "51b3274280201a8951e71760b3c0bc13521f6a5025e71a61522f6a5025e71a6152c6a47d4e7ec63355693ba3249a8511" +
  "55793ba3249a8511574fe0403124a00e575fe0403124a00e57763ae2caed452857863ae2caed452857d561def4a9ee32" +
  "57e561def4a9ee3257f561def4a9ee32580561def4a9ee31581561def4a9ee31582561def4a9ee31584561def4a9ee31" +
  "585561def4a9ee315935ede8cce3084559d0dd8f2788d6995b45ed1f039cebfe5b55ed1f039cebfe5b55ed1f039cebff" +
  "5beaf5b5378aa2e55bfaf5b5378aa2e55c0af5b5378aa2e55c1af5b5378aa2e55c4ef3052ef0a3615c6cf45d333da323" +
  "5e1780695036a6795e2780695036a6795e54ec8fd70420c75e64ec8fd70420c75e6b5e2f86026f055f9aeac2d1ea2695" +
  "5faaeac2d1ea26956009813653f62db7611260322d04d50b624be064a3fb2725625be064a3fb272564112a13daa46fe4" +
  "64212a13daa46fe464312a13daa46fe4671dcfee6690ffc6672dcfee6690ffc6673dcfee6690ffc6674dcfee6690ffc6" +
  "675dcfee6690ffc6677a77581053543b678a77581053543b6820ee7811241ad3682d3683fa3d1ee0699873e3758bc6b3" +
  "699cb490951e85156a6cc08102f0da5b6b3ef9beaa7aa5836b3ef9beaa7aa5846b4ef9beaa7aa5836b4ef9beaa7aa584" +
  "6b7896beb0c66eb96b7b86d8c3df7cd16bdf20938e7414bb6be6c9e14b7c22c46bef20938e7414bb6bf6c9e14b7c22c3" +
  "6bf6c9e14b7c22c46c06c9e14b7c22c36c06c9e14b7c22c46c16c9e14b7c22c36c16c9e14b7c22c46ce75d226331d03a" +
  "6cf75d226331d03a6d075d226331d03a6d175d226331d03a6d275d226331d03a6d4b9445072f43746d5a3bdac4f00f33" +
  "6d5b9445072f43746e4a2fbffdb7580c6e5a2fbffdb7580c6e927edd0dbb8c086e927edd0dbb8c096ee1c382c3819a0a" +
  "6ef1c382c3819a0a70f60cf8f38b046571060cf8f38b04657114390c68b888ce71160cf8f38b0465714fb4840532a9e5" +
  "71b1d7cb7eae05d9727fca36c06cf106728fca36c06cf10672eba10d818fdafd72fba10d818fdafd737a37935f3b71c9" +
  "738a37935f3b71c973972852443155ae739a37935f3b71c9754fe46e378bf132754fe46e378bf133755fe46e378bf132" +
  "755fe46e378bf133756fe46e378bf132756fe46e378bf13376603d7cb98edc5876603d7cb98edc5976703d7cb98edc58" +
  "76703d7cb98edc59782f7c6a9ad432a178447e17e7814ce778547e17e7814ce77856d2aa2fc5f2b57964066d88c7cab8" +
  "799d696737fe68c77ace779fddf216217ace779fddf216227ade779fddf216217ade779fddf216227bc3b063946e10ae" +
  "7bd3b063946e10ae7c0c283ffc61c87d7c1c283ffc61c87d7c31926c7a7122ba7c41926c7a7122ba7d0a85c6f7fba05d" +
  "7d1a85c6f7fba05d7d52a5daf9226f047d8220e1772428d77d9220e1772428d77da220e1772428d77db220e1772428d7" +
  "7df22815078cb97b7dfe5aceedf1c1f17e022815078cb97b7e122815078cb97b7e222815078cb97b7e8a9b45a91f1700" +
  "7e9a9b45a91f17007eb6202598194bee7ec490abad0577527ec6202598194bee7ee3c8eeb77b8d057ef3c8eeb77b8d05" +
  "7ef5bc471d5456c77f03c8eeb77b8d057f13c8eeb77b8d057f23c8eeb77b8d057f33c8eeb77b8d057f5594223f5654bf" +
  "7f6594223f5654bf7f9914e03c9260ee7fb82baa4ae611dc7fc82baa4ae611dc7fd82baa4ae611dc7fefffffffffffff";
export const ENUM3 = new Set(ENUM3_HEX.match(/.{16}/g));
export const inEnum3 = (d) => ENUM3.has(hex64(d));
export function errol3(val) {
  if (inEnum3(val)) return { digits: null, exp: null, path: "table" };
  return errol3u(val);
}

// ---------------------------------------------------------------------------
// Oracle

// Shortest digits of d as 0.digits x 10^exp. toExponential() without an argument must use
// as few digits as possible (ECMA-262 Number::toExponential), so the length is exact.
export function shortestOf(d) {
  const [mant, e] = d.toExponential().split("e");
  return { digits: mant.replace(".", ""), exp: Number(e) + 1 };
}
export const stripZeros = (s) => s.replace(/0+$/, "") || "0";
// 0.digits x 10^exp as text: plain notation for moderate exponents (like JavaScript), else d.ddde±x.
export const decimalText = (digits, exp) => {
  const s = stripZeros(digits);
  const e = exp - 1;
  if (e >= -7 && e < 21) {
    if (exp <= 0) return `0.${"0".repeat(-exp)}${s}`;
    if (exp >= s.length) return s + "0".repeat(exp - s.length);
    return `${s.slice(0, exp)}.${s.slice(exp)}`;
  }
  return s.length === 1 ? `${s}e${e < 0 ? "" : "+"}${e}` : `${s[0]}.${s.slice(1)}e${e < 0 ? "" : "+"}${e}`;
};

// "ok": reads back as d and is as short as possible. "long": reads back, but too long.
// "wrong": does not read back as d (or is not even a digit string).
export function judge(result, d) {
  const digits = result.digits;
  if (!digits || !/^[0-9]+$/.test(digits)) return "wrong";
  if (Number(`0.${digits}e${result.exp}`) !== d) return "wrong";
  return stripZeros(digits).length > shortestOf(d).digits.length ? "long" : "ok";
}

// Exact rounding interval edges of a positive double as BigInt fractions num / 2^sh.
export function midpointsOf(d) {
  const b = bitsOf(d);
  const ex = Number((b >> 52n) & 0x7ffn);
  let c = b & ((1n << 52n) - 1n), q;
  if (ex === 0) q = -1074; else { c |= 1n << 52n; q = ex - 1075; }
  // v = c * 2^q, work in units of 2^(q-2)
  const lowerGap = ex > 1 && c === 1n << 52n ? 1n : 2n; // power of two: the gap below is half
  return {
    c, q, even: (c & 1n) === 0n,
    lower: { num: 4n * c - lowerGap, shift: q - 2 },
    upper: { num: 4n * c + 2n, shift: q - 2 },
  };
}
const ratEqualsInt = (r, n) => (r.shift >= 0 ? (r.num << BigInt(r.shift)) === n : r.num === n << BigInt(-r.shift));

// Is the shortest decimal of d exactly one of its two midpoints? (Only meaningful when that
// decimal is an integer, which is the case the paper's theorem is about.)
export function shortestIsMidpoint(d) {
  const s = shortestOf(d);
  const k = s.exp - s.digits.length;
  if (k < 0) return null;
  const n = BigInt(s.digits) * 10n ** BigInt(k);
  const m = midpointsOf(d);
  if (ratEqualsInt(m.lower, n)) return { side: "lower", value: n };
  if (ratEqualsInt(m.upper, n)) return { side: "upper", value: n };
  return null;
}

// ---------------------------------------------------------------------------
// Random doubles, reproducible: the xorshift64 of the C experiment (seed 88172645463325252),
// one uniformly random 52-bit fraction per draw inside a fixed binade.

export const DEFAULT_SEED = 88172645463325252n;
export function makeRng(seed = DEFAULT_SEED) {
  let s = BigInt.asUintN(64, BigInt(seed)) || 1n;
  return () => {
    s ^= BigInt.asUintN(64, s << 13n);
    s ^= s >> 7n;
    s ^= BigInt.asUintN(64, s << 17n);
    return s;
  };
}
const FRAC = (1n << 52n) - 1n;
export const randomInBinade = (rng, e) => fromBits((BigInt(e + 1023) << 52n) | (rng() & FRAC));

export const VARIANTS = {
  errol1: { label: "Errol1", run: errol1 },
  errol2: { label: "Errol2", run: errol2 },
  errol3u: { label: "Errol3 without table", run: errol3u },
};
export const FIRST_BINADE = -1022, LAST_BINADE = 1023;

// Sample `perBinade` doubles in every normal binade, e = -1022..1023, in order, with one rng
// (so the draws match the C harness). Returns per-binade tallies plus the failing inputs.
// Generator: yields after every binade so a page can spread the work over frames.
// `only` = [lo, hi] restricts the conversions (the generator still draws for every binade).
export function* randomExperiment(variant, perBinade, seed = DEFAULT_SEED, only = null) {
  const run = VARIANTS[variant].run;
  const rng = makeRng(seed);
  for (let e = FIRST_BINADE; e <= LAST_BINADE; e++) {
    if (only && (e < only[0] || e > only[1])) { for (let i = 0; i < perBinade; i++) rng(); continue; }
    const row = { e, n: perBinade, long: 0, wrong: 0, flagged: 0, failures: [] };
    for (let i = 0; i < perBinade; i++) {
      const d = randomInBinade(rng, e);
      const r = run(d);
      const verdict = judge(r, d);
      if (r.opt === false) row.flagged++;
      if (verdict !== "ok") {
        row[verdict]++;
        row.failures.push({ d, digits: r.digits, exp: r.exp, verdict, flagged: r.opt === false });
      }
    }
    yield row;
  }
}

// ---------------------------------------------------------------------------
// The offline search (test/proof.c), BigInt.
//
// Problem: given m_k = m0 + k*alpha (k = 0 .. 2^p - 1), a modulus tau and a threshold delta,
// list every k whose residue r_k (m_k mod tau, taken in (-tau/2, tau/2]) has |r_k| <= delta.
//
// 1. Records. up[] holds the shifts k*alpha whose residue in [0, tau) is smaller than for any
//    smaller k; down[] likewise for residues in (-tau, 0]. Each new record is the newest record
//    of one list plus an earlier record of the other list (Euclid / continued fractions).
// 2. Descent. From r_0, add the largest record of the opposite sign that does not overshoot
//    by more than |r| (|shift| <= 2|r|): the residue ping-pongs across 0, shrinking.
// 3. Fan-out. From the first hit, add every record shift that keeps |r| <= delta.

const babs = (x) => (x < 0n ? -x : x);
function firstSmaller(list, val) { // first entry with |v| < |val| (list sorted by decreasing |v|)
  let l = 0, h = list.length - 1;
  const b = babs(val);
  while (l <= h) {
    const m = (l + h) >> 1, a = babs(list[m].val);
    if (a > b) l = m + 1; else if (a < b) h = m - 1; else return m < list.length - 1 ? list[m + 1] : null;
  }
  return l < list.length ? list[l] : null;
}
function firstAtMost(list, val) { // first entry with |v| <= |val|
  let l = 0, h = list.length - 1;
  const b = babs(val);
  while (l <= h) {
    const m = (l + h) >> 1, a = babs(list[m].val);
    if (a > b) l = m + 1; else if (a < b) h = m - 1; else return list[m];
  }
  return l < list.length ? list[l] : null;
}
const mod = (a, b) => ((a % b) + b) % b;

export function proofEnum({ delta, m0, alpha, tau, p }) {
  const LIM = 1n << BigInt(p);
  const up = [{ idx: 1n, val: mod(alpha, tau) }];
  const down = [{ idx: 1n, val: mod(alpha, tau) - tau }];
  for (;;) {
    const U = up.at(-1), D = down.at(-1);
    let idx, t;
    if (U.idx <= D.idx) { const sh = firstSmaller(down, D.val - U.val); idx = U.idx + sh.idx; t = U.val + sh.val; }
    else { const sh = firstSmaller(up, U.val - D.val); idx = D.idx + sh.idx; t = D.val + sh.val; }
    if (t >= 0n) up.push({ idx, val: t });
    if (t <= 0n) down.push({ idx, val: t });
    if (idx >= LIM || t === 0n) break;
  }
  let idx = 0n;
  let v = mod(m0, tau);
  const t0 = v - tau;
  if (babs(t0) < babs(v)) v = t0;
  let shift = true;
  const path = [{ k: 0n, r: v }];
  for (;;) {
    if (babs(v) <= delta || idx >= LIM) break;
    shift = v < 0n ? firstAtMost(up, 2n * v) : firstAtMost(down, 2n * v);
    if (!shift) break;
    idx += shift.idx; v += shift.val;
    path.push({ k: idx, r: v, by: shift.idx });
  }
  const hits = [];
  if (idx < LIM && shift) {
    const set = [{ k: idx, r: v }];
    const seen = new Set([idx]);
    for (let i = 0; i < set.length; i++) {
      hits.push(set[i]);
      for (const L of [up, down]) {
        for (let j = L.length - 1; j >= 0; j--) {
          const k = set[i].k + L[j].idx;
          if (k >= LIM) continue;
          const w = set[i].r + L[j].val;
          if (babs(w) > delta) break;
          if (!seen.has(k)) { seen.add(k); set.push({ k, r: w }); }
        }
      }
    }
  }
  return { up, down, path, hits };
}

// Parameters of one binade [2^e, 2^(e+1)), exactly as in test/main.c table_enum.
// Small binades (e <= 4): non-integer midpoints, scaled by a power of ten, residue mod 2^n.
// Large binades (e >= 128): integer midpoints divided by 2^n, residue mod 5^n.
export function binadeParams(e) {
  const D = 17, P = 52;
  if (e <= 4) {
    const p = e >= -1022 ? P : e + 1074;
    const n = Math.floor((-e + p + 1) * Math.log10(5) + (p + 1) * Math.log10(2)) - D + 2;
    const t0 = 5n ** BigInt(-e + p + 1 - n), t1 = 2n ** BigInt(P - 1);
    return { e, p, n, kind: "small", modBase: 2, factor: 79,
      delta: t0 * 79n, alpha: t0 * 2n * t1, tau: 2n ** BigInt(n) * t1, m0: (2n ** BigInt(p + 1) * t0 + t0) * t1 };
  }
  const p = P;
  const n = Math.floor((e + 1) * Math.log10(2)) - D + 2;
  const ex = e - 2 * p - n;
  return { e, p, n, kind: "large", modBase: 5, factor: 179,
    delta: (ex > 0 ? 2n ** BigInt(ex) : 1n) * 179n, alpha: 2n ** BigInt(e - p - n), tau: 5n ** BigInt(n),
    m0: 2n ** BigInt(e - n) + 2n ** BigInt(e - p - n - 1) };
}
export const searchedBinade = (e) => (e >= -1074 && e <= 4) || (e >= 128 && e <= 1023);
export function searchedBinades() {
  const list = [];
  for (let e = -1074; e <= 4; e++) list.push(e);
  for (let e = 128; e <= 1023; e++) list.push(e);
  return list;
}

// Candidate k -> the double 2^e + k*2^(e-52), computed like the C (ldexp + add, which rounds
// onto the subnormal grid below 2^-1022).
export function doubleAt(e, k) {
  if (e >= -1022) return fromBits((BigInt(e + 1023) << 52n) | k);
  const sh = BigInt(e + 1074), s = 52n - sh;
  let q = k >> s;
  const r = k & ((1n << s) - 1n), h = 1n << (s - 1n);
  if (r > h || (r === h && (q & 1n))) q++;
  return fromBits((1n << sh) + q);
}

// Search one binade and test both neighbours of every suspect midpoint with errol3u.
export function huntBinade(e) {
  const params = binadeParams(e);
  const res = proofEnum(params);
  const LIM52 = 1n << 52n;
  const inputs = [];
  const seen = new Set();
  for (const h of res.hits) {
    for (const k of [h.k, h.k + 1n]) {
      if (k >= LIM52) continue;
      const d = doubleAt(e, k);
      const key = hex64(d);
      if (seen.has(key)) continue;
      seen.add(key);
      const r = errol3u(d);
      inputs.push({ d, k, hit: h, r, verdict: judge(r, d), inTable: ENUM3.has(key) });
    }
  }
  return { params, ...res, inputs };
}

// Toy format of the page: 5 significant bits in [1024, 2048), so values 1024 + 64j and
// midpoints 1056 + 64k. "Short" = two significant digits = multiple of 100. Error budget 4.
// Divide everything by 4 (every midpoint and every multiple of 100 is a multiple of 4):
// midpoints 264 + 16k on a clock of 25 ticks, budget 1.
export const TOY = { m0: 264n, alpha: 16n, tau: 25n, delta: 1n, p: 4 };
export function toyTable() {
  const rows = [];
  for (let k = 0; k < 16; k++) {
    const m = 1056 + 64 * k;
    const near = Math.round(m / 100) * 100;
    let r = mod(BigInt(264 + 16 * k), 25n);
    if (r > 12n) r -= 25n;
    rows.push({ k, m, nearest: near, dist: m - near, residue: Number(r) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The whole table, as test/main.c --enum3 builds it: every searched binade, both neighbours
// of every suspect midpoint, then DBL_MIN and DBL_MAX by hand. Yields once per binade.
export function* rebuildTable() {
  const seen = new Set();
  const list = searchedBinades();
  let mids = 0, inputs = 0;
  const fails = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const h = huntBinade(e);
    mids += h.hits.length;
    const fresh = [];
    for (const x of h.inputs) {
      const key = hex64(x.d);
      if (seen.has(key)) continue;
      seen.add(key);
      inputs++;
      if (x.verdict !== "ok") { const f = { hex: key, d: x.d, verdict: x.verdict, inTable: x.inTable, e }; fails.push(f); fresh.push(f); }
    }
    yield { done: false, index: i + 1, total: list.length, e, mids, inputs, fresh, hops: h.path.length - 1 };
  }
  const extra = [];
  for (const d of [2.2250738585072014e-308, DBL_MAX]) {
    const verdict = judge(errol3u(d), d);
    if (verdict !== "ok") { const f = { hex: hex64(d), d, verdict, inTable: inEnum3(d), e: binadeOf(d), manual: true }; fails.push(f); extra.push(f); }
  }
  const found = new Set(fails.map((f) => f.hex));
  yield { done: true, index: list.length, total: list.length, mids, inputs, fresh: extra, fails,
    missingFromTable: fails.filter((f) => !f.inTable).map((f) => f.hex),
    tableNotFound: [...ENUM3].filter((h) => !found.has(h)) };
}

// Worker mode: `new Worker(<this module>, { type: "module" })`, then post { cmd: "rebuild" }.
if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = (event) => {
    if (!event.data || event.data.cmd !== "rebuild") return;
    let batch = [], last = 0;
    for (const step of rebuildTable()) {
      const slim = { ...step, fresh: step.fresh.map(({ d, ...rest }) => rest) };
      if (step.done) slim.fails = step.fails.map(({ d, ...rest }) => rest);
      batch.push(slim);
      const now = Date.now();
      if (step.done || now - last > 100) { globalThis.postMessage(batch); batch = []; last = now; }
    }
  };
}
