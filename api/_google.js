// climath-team 서비스 계정으로 (1) Firebase 커스텀 토큰 발급 (2) ID 토큰 검증 (3) 구글 API 토큰.
// firebase-admin을 안 쓴다 — 루트에 package.json이 생기면 Vercel 빌드 동작이 바뀌는데
// 이 앱은 빌드 없는 단일 HTML이 전제다. node 기본 crypto로 충분하다.
// (수업관리 앱 api/_google.js 에서 Firestore REST 부분을 뺀 것.)
//
// 환경변수: TEAM_SERVICE_ACCOUNT = climath-team 서비스 계정 JSON 전체를 한 줄로.
//   Firebase 콘솔 → climath-team → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성

import crypto from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const IDENTITY_AUD =
  "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

let _sa = null;
export function serviceAccount() {
  if (_sa) return _sa;
  const raw = process.env.TEAM_SERVICE_ACCOUNT;
  if (!raw) throw new Error("TEAM_SERVICE_ACCOUNT 환경변수가 없습니다 (Vercel → Settings → Environment Variables)");
  let j;
  try { j = JSON.parse(raw); }
  catch (e) { throw new Error("TEAM_SERVICE_ACCOUNT가 올바른 JSON이 아닙니다"); }
  // Vercel 환경변수에 넣을 때 줄바꿈이 \n 두 글자로 들어가는 경우가 많다
  if (j.private_key && j.private_key.indexOf("\\n") >= 0) j.private_key = j.private_key.replace(/\\n/g, "\n");
  if (!j.client_email || !j.private_key || !j.project_id) {
    throw new Error("서비스 계정 JSON에 client_email/private_key/project_id가 필요합니다");
  }
  _sa = j;
  return _sa;
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function signJwt(payload) {
  const sa = serviceAccount();
  const body = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64url(JSON.stringify(payload));
  const sig = crypto.createSign("RSA-SHA256").update(body).sign(sa.private_key);
  return body + "." + b64url(sig);
}

// (1) 커스텀 토큰 — 브라우저가 signInWithCustomToken()으로 받는다.
//     claims가 보안 규칙의 request.auth.token 이 된다. 1000바이트를 넘기지 말 것.
export function createCustomToken(uid, claims) {
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ iss: sa.client_email, sub: sa.client_email, aud: IDENTITY_AUD,
    iat: now, exp: now + 3600, uid: String(uid), claims: claims || {} });
}

// (2) 브라우저가 보낸 ID 토큰 검증. 구글 공개키로 서명·aud·iss·exp를 본다.
//     통과하면 claims, 아니면 null (던지지 않는다 — 호출부에서 403).
const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let _certs = null;
async function googleCerts() {
  if (_certs && Date.now() - _certs.at < 60 * 60 * 1000) return _certs.map;
  const r = await fetch(CERT_URL);
  if (!r.ok) throw new Error("구글 공개키를 못 받았습니다");
  _certs = { at: Date.now(), map: await r.json() };
  return _certs.map;
}
export async function verifyIdToken(idToken) {
  try {
    const sa = serviceAccount();
    const parts = String(idToken || "").split(".");
    if (parts.length !== 3) return null;
    const dec = (x) => JSON.parse(Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const header = dec(parts[0]), payload = dec(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return null;
    const cert = (await googleCerts())[header.kid];
    if (!cert) return null;
    const sig = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (!crypto.createVerify("RSA-SHA256").update(parts[0] + "." + parts[1]).verify(cert, sig)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== sa.project_id) return null;
    if (payload.iss !== "https://securetoken.google.com/" + sa.project_id) return null;
    if (!payload.exp || payload.exp < now) return null;
    return payload;
  } catch (e) { return null; }
}

// (3) 구글 API 접근 토큰. scope별로 캐시.
const _toks = {};
export async function googleAccessToken(scope) {
  const now = Math.floor(Date.now() / 1000);
  const t = _toks[scope];
  if (t && t.exp > now + 60) return t.value;
  const sa = serviceAccount();
  const assertion = signJwt({ iss: sa.client_email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("구글 토큰 발급 실패: " + (j.error_description || j.error || r.status));
  _toks[scope] = { value: j.access_token, exp: now + (j.expires_in || 3600) };
  return _toks[scope].value;
}
