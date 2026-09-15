// 선생님 출결 앱 연결을 넣고 · 보고 · 끈다 (2026-09-15).
//
//   node tools/set-attend-feed.mjs --list
//   node tools/set-attend-feed.mjs --tid <tid> --name 이현우 --url <주소> --key <열쇠>
//   node tools/set-attend-feed.mjs --tid <tid> --check [--date 2026-09-14]   # 저장된 연결로 한 번 불러 본다
//   node tools/set-attend-feed.mjs --tid <tid> --off                          # 끈다 (지우지 않는다)
//
// 팀 DB `secrets/attend_<tid>` = { url, key, name, off, updated }. `/api/attend` 가 이것을 읽는다.
// `secrets` 는 규칙에 없는 컬렉션이라 브라우저에서는 아무도 못 읽는다 — 서비스 계정만.
//
// ⚠ 이 파일은 열쇠를 화면에 찍지 않는다. --list 도 앞 네 글자만.
//   열쇠는 명령줄로 넘기면 셸 기록에 남는다 — 넣고 나서 받은 파일(attendance.md)과 함께 신경 쓸 것.

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const SA_FILE = process.env.TEAM_SA_FILE || path.join(os.homedir(), ".climath", "team-sa.json");
const A = process.argv.slice(2);
const arg = (k) => { const i = A.indexOf("--" + k); return i >= 0 ? A[i + 1] : undefined; };
const has = (k) => A.includes("--" + k);

function serviceAccount() {
  let raw = process.env.TEAM_SERVICE_ACCOUNT || "";
  if (!raw) {
    if (!fs.existsSync(SA_FILE)) { console.error("서비스 계정 열쇠를 못 찾았다: " + SA_FILE); process.exit(1); }
    raw = fs.readFileSync(SA_FILE, "utf8");
  }
  const j = JSON.parse(raw);
  if (j.private_key && j.private_key.indexOf("\\n") >= 0) j.private_key = j.private_key.replace(/\\n/g, "\n");
  return j;
}
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const assertion = body + "." + b64url(crypto.createSign("RSA-SHA256").update(body).sign(sa.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
  const j = await r.json();
  if (!r.ok || !j.access_token) { console.error("구글 토큰 발급 실패 (" + r.status + ")"); process.exit(1); }
  return j.access_token;
}

const sa = serviceAccount();
const tok = await accessToken(sa);
const BASE = "https://firestore.googleapis.com/v1/projects/" + sa.project_id + "/databases/(default)/documents";
const H = { Authorization: "Bearer " + tok, "Content-Type": "application/json" };
const str = (v) => (v && v.stringValue) || "";

if (has("list")) {
  const r = await fetch(BASE + "/secrets?pageSize=100", { headers: H });
  const j = await r.json();
  const rows = (j.documents || []).filter((d) => /\/attend_[^/]+$/.test(d.name));
  if (!rows.length) console.log("연결된 출결 앱이 없다");
  rows.forEach((d) => {
    const f = d.fields || {};
    console.log(d.name.split("/attend_").pop(), "·", str(f.name) || "(이름 없음)", "·", str(f.url), "· 열쇠", str(f.key).slice(0, 4) + "…",
      f.off && f.off.booleanValue ? "· 꺼짐" : "");
  });
  process.exit(0);
}

const tid = arg("tid");
if (!tid || !/^[\w-]{1,60}$/.test(tid)) { console.error("--tid 가 필요하다"); process.exit(1); }
const DOC = BASE + "/secrets/attend_" + tid;

if (has("check")) {
  const r = await fetch(DOC, { headers: H });
  if (r.status === 404) { console.error("이 선생님은 연결이 없다"); process.exit(1); }
  const f = (await r.json()).fields || {};
  const date = arg("date") || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const x = await fetch(str(f.url) + "?date=" + date, { headers: { "x-report-key": str(f.key) } });
  const j = await x.json().catch(() => null);
  console.log(date, "→", x.status, j && j.students ? j.students.length + "명: " + j.students.map((s) => s.name + " " + s.attend).join(", ") : "");
  process.exit(x.ok ? 0 : 1);
}

let data;
if (has("off")) data = { off: true };
else {
  const url = arg("url"), key = arg("key");
  if (!/^https:\/\/\S+$/.test(url || "") || !key) { console.error("--url(https) 과 --key 가 필요하다"); process.exit(1); }
  data = { url, key, name: arg("name") || "", off: false };
}
data.updated = Date.now();
const fields = {};
for (const [k, v] of Object.entries(data)) fields[k] = typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : { stringValue: v };
const mask = Object.keys(data).map((k) => "updateMask.fieldPaths=" + k).join("&");
const w = await fetch(DOC + "?" + mask, { method: "PATCH", headers: H, body: JSON.stringify({ fields }) });
if (!w.ok) { console.error("저장 실패 (" + w.status + ")"); process.exit(1); }
console.log(has("off") ? "껐다: " + tid : "넣었다: " + tid + (data.name ? " (" + data.name + ")" : "") + " — 확인은 --check");
