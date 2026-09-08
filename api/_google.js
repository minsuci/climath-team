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


// ---------- Firestore REST (2026-09-08, 찾아오기 서버가 옮겨오며 함께 왔다) ----------
//
// 브라우저는 firebase-js-sdk 로 팀 DB 를 보지만 **서버에는 그게 없다.** 서비스 계정으로 REST 를 직접 부른다.
// 수업관리 앱의 같은 도우미를 그대로 가져왔다 — 그쪽에서 몇 달 돌아간 것이라 새로 짜지 않는다.
const FS_SCOPE = "https://www.googleapis.com/auth/datastore";
const docBase = () => "https://firestore.googleapis.com/v1/projects/" + serviceAccount().project_id +
  "/databases/(default)/documents";

// Firestore REST 는 값에 타입이 붙어 온다 ({stringValue:"..."}). 평범한 JS 값으로 되돌린다.
function fromValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(fields) {
  const out = {};
  for (const k of Object.keys(fields || {})) out[k] = fromValue(fields[k]);
  return out;
}
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  return { nullValue: null };
}
function toFields(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) out[k] = toValue(obj[k]);
  return out;
}
async function fsCall(path, init) {
  const t = await googleAccessToken(FS_SCOPE);
  const r = await fetch(path, { ...init,
    headers: { Authorization: "Bearer " + t, "Content-Type": "application/json", ...(init && init.headers) } });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error("Firestore: " + ((j && j.error && j.error.message) || r.status));
  return j;
}
// 문서 하나 읽기. 없으면 null. path 예: "dash/neisCodes"
export async function getDoc(path) {
  const j = await fsCall(docBase() + "/" + path, { method: "GET" });
  if (!j) return null;
  return { id: path.split("/").pop(), ...fromFields(j.fields || {}) };
}
// 문서 쓰기(부분 갱신). maskPaths 를 주면 그 경로만 바꾼다 —
// ⚠ 지도 안의 한 칸만 고칠 때 꼭 쓴다. 통째로 덮으면 같은 시간에 도는 다른 요청이 넣은 칸이 지워진다
//   (학교 넷을 나란히 부르므로 실제로 겹친다).
export async function patchDoc(path, data, maskPaths) {
  const mask = (maskPaths || Object.keys(data))
    .map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  await fsCall(docBase() + "/" + path + "?" + mask, { method: "PATCH", body: JSON.stringify({ fields: toFields(data) }) });
}
