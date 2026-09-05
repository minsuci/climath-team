// firestore.rules 를 climath-team 프로젝트에 게시한다 — 콘솔에 붙여넣는 대신.
//
//   node tools/publish-rules.mjs          # 게시
//   node tools/publish-rules.mjs --dry    # 문법만 검사하고 게시는 안 한다
//
// 열쇠는 push-minutes 와 같은 서비스 계정 파일. Firebase Rules API 로 룰셋을 만들고
// `cloud.firestore` 릴리스를 그 룰셋으로 바꾼다. 서비스 계정에 Firebase 관리 권한이 없으면 403 이 온다 —
// 그때는 콘솔에 붙여넣는다.

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const DRY = process.argv.includes("--dry");
const SA_FILE = process.env.TEAM_SA_FILE || path.join(os.homedir(), ".climath", "team-sa.json");
const RULES = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "firestore.rules");

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
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(body).sign(sa.private_key);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: body + "." + b64url(sig) }).toString() });
  const j = await r.json();
  if (!r.ok || !j.access_token) { console.error("구글 토큰 발급 실패 (" + r.status + ")"); process.exit(1); }
  return j.access_token;
}

async function main() {
  const content = fs.readFileSync(RULES, "utf8");
  const sa = serviceAccount();
  const token = await accessToken(sa);
  const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const base = "https://firebaserules.googleapis.com/v1/projects/" + sa.project_id;
  const src = { source: { files: [{ name: "firestore.rules", content }] } };

  const t = await fetch(base + ":test", { method: "POST", headers: h, body: JSON.stringify(src) });
  const tj = await t.json().catch(() => ({}));
  if (!t.ok) {
    console.error("규칙 검사 실패 (" + t.status + "): " + ((tj.error || {}).message || ""));
    if (t.status === 403) {
      // 2026-09-05 실제로 이랬다. 이 서비스 계정은 Firestore 데이터 권한만 있고 규칙 게시 권한이 없다.
      console.error("\n이 서비스 계정에는 규칙 게시 권한이 없다. 콘솔에 붙여넣는다 —");
      console.error("  Firebase 콘솔 → " + sa.project_id + " → Firestore Database → 규칙 → firestore.rules 내용 붙여넣기 → 게시");
      console.error("  (스크립트로 하려면 구글 클라우드 IAM 에서 " + sa.client_email + " 에 «Firebase Rules 관리자» 역할을 준다)");
    }
    process.exit(1);
  }
  const issues = (tj.issues || []).filter((i) => i.severity === "ERROR");
  if (issues.length) { issues.forEach((i) => console.error("  " + i.severity + " " + i.description)); process.exit(1); }
  console.log("문법 검사 통과" + (tj.issues && tj.issues.length ? " (경고 " + tj.issues.length + ")" : ""));
  if (DRY) { console.log("--dry 라 게시하지 않았다."); return; }

  const r = await fetch(base + "/rulesets", { method: "POST", headers: h, body: JSON.stringify(src) });
  const rj = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("룰셋 만들기 실패 (" + r.status + "): " + ((rj.error || {}).message || "")); process.exit(1); }

  const rel = base + "/releases/cloud.firestore";
  const p = await fetch(rel, { method: "PATCH", headers: h,
    body: JSON.stringify({ release: { name: "projects/" + sa.project_id + "/releases/cloud.firestore", rulesetName: rj.name } }) });
  const pj = await p.json().catch(() => ({}));
  if (!p.ok) { console.error("릴리스 실패 (" + p.status + "): " + ((pj.error || {}).message || "") + "\n콘솔에 붙여넣어 게시한다."); process.exit(1); }
  console.log("게시됨 · " + rj.name.split("/").pop());
}
main().catch((e) => { console.error("터짐: " + e.message); process.exit(1); });
