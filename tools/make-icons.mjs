// 팀체크 아이콘을 만든다 — 홈 화면에 추가할 때 뜨는 그림.
//
// ⚠ 이 저장소에는 package.json 이 없다(단일 HTML 이 전제다). 그림 라이브러리를 못 쓰니
//   PNG 를 직접 찍는다. zlib 는 node 기본이라 압축은 공짜다.
// 색은 앱 머리띠와 같다 — 남색 바탕(--navy)에 주황 체크(--orange).
// 네 배로 그려서 줄여 담는다(수퍼샘플링). 안 그러면 곡선이 톱니가 된다.
import fs from "fs";
import zlib from "zlib";

const NAVY = [27, 42, 74];      // #1b2a4a
const ORANGE = [240, 138, 36];  // #f08a24

function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// rgba 는 폭*높이*4 바이트
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                                   // 필터 없음
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // 8bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// 점이 굵은 선분 위에 있나 — 체크 표시를 그리는 데 쓴다.
function onSeg(px, py, x1, y1, x2, y2, half) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx, qy = y1 + t * dy;
  return (px - qx) * (px - qx) + (py - qy) * (py - qy) <= half * half;
}

// maskable 아이콘은 안드로이드가 동그랗게 잘라낸다 — 가장자리 20% 는 비워 둔다.
// 그래서 바탕은 꽉 채우고(둥근 모서리는 pad 일 때만) 체크는 가운데로 모은다.
function draw(size, { round = true, inset = 0 } = {}) {
  const SS = 4, W = size * SS;
  const acc = new Float64Array(size * size * 4);
  const r = round ? W * 0.22 : 0;
  const cx = W / 2, cy = W / 2;
  const s = W * (1 - inset);                 // 체크가 쓰는 폭
  // 체크 세 점 (가운데 기준 비율)
  const ax = cx - s * 0.22, ay = cy + s * 0.02;
  const bx = cx - s * 0.06, by = cy + s * 0.18;
  const dx2 = cx + s * 0.24, dy2 = cy - s * 0.19;
  const half = s * 0.052;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      // 둥근 네모 안인가
      let inBg = true;
      if (r > 0) {
        const qx = Math.max(r - x, 0, x - (W - r)), qy = Math.max(r - y, 0, y - (W - r));
        inBg = qx * qx + qy * qy <= r * r;
      }
      if (!inBg) continue;
      const px = x + 0.5, py = y + 0.5;
      const isCheck = onSeg(px, py, ax, ay, bx, by, half) || onSeg(px, py, bx, by, dx2, dy2, half);
      const col = isCheck ? ORANGE : NAVY;
      const o = ((y / SS) | 0) * size * 4 + ((x / SS) | 0) * 4;
      acc[o] += col[0]; acc[o + 1] += col[1]; acc[o + 2] += col[2]; acc[o + 3] += 255;
    }
  }
  const n = SS * SS, out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = acc[i * 4 + 3] / n;
    // 알파가 섞인 칸은 색도 그만큼만 쌓였다 — 되돌려 놓는다
    const k = acc[i * 4 + 3] || 1;
    out[i * 4] = Math.round(acc[i * 4] * 255 / k);
    out[i * 4 + 1] = Math.round(acc[i * 4 + 1] * 255 / k);
    out[i * 4 + 2] = Math.round(acc[i * 4 + 2] * 255 / k);
    out[i * 4 + 3] = Math.round(a);
  }
  return png(size, size, out);
}

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const root = here + "../";
const made = [];
for (const [name, size, opt] of [
  ["icon-192.png", 192, { round: true }],
  ["icon-512.png", 512, { round: true }],
  // 아이폰 홈 화면 아이콘은 iOS 가 알아서 둥글게 깎는다. 네모로 꽉 채워 준다.
  ["apple-touch-icon.png", 180, { round: false }],
  // 안드로이드 maskable — 동그랗게 잘려도 체크가 안 잘리게 안쪽으로 모은다
  ["icon-mask.png", 512, { round: false, inset: 0.3 }],
]) {
  fs.writeFileSync(root + name, draw(size, opt));
  made.push(name + " " + fs.statSync(root + name).size + "B");
}
console.log(made.join("\n"));
