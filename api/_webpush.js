// 표준 웹 푸시(RFC 8291 aes128gcm + RFC 8292 VAPID) — 라이브러리 없이 node 기본 crypto 로.
//
// 왜 FCM 을 안 쓰나:
//  1. 이 저장소에는 **package.json 이 없다**(단일 HTML 이 전제라 빌드가 없다). npm 을 들이면 그 전제가 깨진다.
//  2. FCM 을 쓰면 파이어베이스 콘솔에서 «웹 푸시 인증서» 를 사람이 만들어 붙여야 한다.
//     여기서는 열쇠를 서버가 스스로 만들어 Firestore 에 넣어 둔다 — 손댈 곳이 없다.
//  3. 아이폰·안드로이드 모두 결국 이 표준으로 받는다. FCM 도 속은 이것이다.
//
// ⚠ 아이폰은 **홈 화면에 추가한 뒤 그 아이콘으로 연 것**만 구독할 수 있다(iOS 16.4+, 애플 제약).
//   사파리 탭에서는 구독 자체가 안 만들어진다. 서버 잘못이 아니다.
import crypto from "crypto";

const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

// HKDF — 웹푸시는 늘 «한 번만 늘리는» 꼴이라 짧게 적는다.
const hmac = (key, msg) => crypto.createHmac("sha256", key).update(msg).digest();
function hkdf(salt, ikm, info, len) {
  return hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).slice(0, len);
}

// 열쇠 한 쌍을 만든다. JWK 로 들고 다니는 이유 —
// 서명(JWT)에는 키 객체가, 열쇠 나눔(ECDH)에는 날것 32바이트가 필요한데 JWK 하나면 둘 다 나온다.
export function newVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]);
  return { pub: b64u(pub), d: jwk.d, x: jwk.x, y: jwk.y };
}

// 보낼 곳(푸시 회사)에 내가 누구인지 밝히는 쪽지. 열두 시간짜리다.
function vapidHeader(keys, endpoint, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", x: keys.x, y: keys.y, d: keys.d },
                                        format: "jwk" });
  // ⚠ ES256 서명은 **날것 R||S 64바이트**여야 한다. node 의 기본은 DER 이라 그대로 보내면 거절당한다.
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key, dsaEncoding: "ieee-p1363" });
  return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + keys.pub;
}

// 알맹이를 받는 사람만 열 수 있게 잠근다(RFC 8291).
// 푸시 회사는 이걸 못 읽는다 — 브라우저 안에서만 풀린다.
// fixed 는 **시험용**이다 — 규격(RFC 8291 §5)의 값을 그대로 넣어 결과가 같은지 본다.
// 실제로 보낼 때는 넘기지 않는다. 매번 새 열쇠와 새 소금이라야 안전하다.
export function encrypt(plaintext, p256dh, auth, fixed) {
  const ua = unb64u(p256dh);          // 받는 쪽 공개키 65바이트
  const authSecret = unb64u(auth);    // 받는 쪽 비밀 16바이트
  const ec = crypto.createECDH("prime256v1");
  if (fixed && fixed.priv) ec.setPrivateKey(unb64u(fixed.priv)); else ec.generateKeys();
  const as = ec.getPublicKey();       // 이번 한 번만 쓰는 공개키
  const shared = ec.computeSecret(ua);

  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), ua, as]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));

  const salt = fixed && fixed.salt ? unb64u(fixed.salt) : crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 는 «여기가 마지막 덩어리» 라는 표시다. 빼먹으면 브라우저가 조용히 버린다.
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(plaintext, "utf8"), Buffer.from([2])])),
                              c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(4096, 16);  // 덩어리 크기
  head[20] = as.length;          // 65
  return Buffer.concat([head, as, body]);
}

// 하나 보낸다. 돌려주는 것은 { ok } 또는 { gone:true }(구독이 죽었다) 또는 { error }.
export async function sendOne(sub, payload, keys, subject) {
  if (!sub || !sub.endpoint || !sub.p256dh || !sub.auth) return { error: "구독 정보가 모자랍니다" };
  let body;
  try { body = encrypt(JSON.stringify(payload), sub.p256dh, sub.auth); }
  catch (e) { return { error: "암호화 실패: " + e.message }; }
  let r;
  try {
    r = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidHeader(keys, sub.endpoint, subject),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high",
      },
      body,
    });
  } catch (e) { return { error: "보내지 못했습니다: " + e.message }; }
  // 404·410 은 «이 구독은 이제 없다» 는 뜻이다. 지워야 다음에 안 붙든다.
  if (r.status === 404 || r.status === 410) return { gone: true };
  if (!r.ok) return { error: "푸시 회사가 " + r.status + " 로 답했습니다: " + (await r.text().catch(() => "")).slice(0, 200) };
  return { ok: true };
}
