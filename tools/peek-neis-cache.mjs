// 팀 DB 의 학교 코드 캐시(dash/neisCodes)를 들여다본다.
// 찾아오기 서버가 여기로 옮겨온 뒤 **정말 돌았는지**를 보는 가장 확실한 자국이다 —
// 학교를 한 번 찾으면 그 결과가 여기 남는다. 비어 있으면 아직 한 번도 안 돈 것이다.
//
//   node tools/peek-neis-cache.mjs
import fs from "fs"; import os from "os"; import path from "path"; import crypto from "crypto";
const SA = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".climath", "team-sa.json"), "utf8"));
const b64 = (s) => Buffer.from(s).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const body = b64(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64(JSON.stringify({
  iss: SA.client_email, scope: "https://www.googleapis.com/auth/datastore",
  aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
const jwt = body + "." + b64(crypto.createSign("RSA-SHA256").update(body).sign(SA.private_key));
const tr = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) })).json();
if (!tr.access_token) { console.error("토큰 실패"); process.exit(1); }
const url = `https://firestore.googleapis.com/v1/projects/${SA.project_id}/databases/(default)/documents/dash/neisCodes`;
const r = await fetch(url, { headers: { Authorization: "Bearer " + tr.access_token } });
if (r.status === 404) { console.log("dash/neisCodes 없음 — 찾아오기가 아직 한 번도 안 돌았다"); process.exit(0); }
const j = await r.json();
const m = (((j.fields || {}).map || {}).mapValue || {}).fields || {};
const keys = Object.keys(m);
console.log("캐시된 학교 " + keys.length + "곳");
keys.forEach((k) => {
  const f = (m[k].mapValue || {}).fields || {};
  const g = (n) => (f[n] || {}).stringValue || (f[n] || {}).integerValue || "";
  console.log("  " + k + "\t" + (g("official") || "-") + "\t코드 " + (g("code") ? "있음" : "없음") +
    "\t홈페이지 " + (g("hmpg") ? "있음" : "-"));
});
