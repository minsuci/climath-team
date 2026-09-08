// 학생 명단 «대조용» 시트를 팀체크 근거 자료(dash/config.sources.roster)에 등록한다.
// 팀체크 화면의 «근거 자료» 메뉴에서도 같은 것을 할 수 있다 — 이건 브라우저 로그인 없이 하는 길이다.
//
//   node tools/register-roster-sheet.mjs "https://docs.google.com/spreadsheets/d/…/edit#gid=…"
//
// 열쇠: C:\Users\user\.climath\team-sa.json (push-minutes.mjs 와 같다). 시트는 그 서비스 계정에 뷰어로 공유돼 있어야 한다.
import fs from "fs"; import os from "os"; import path from "path"; import crypto from "crypto";

const url = process.argv[2] || "";
const id = (/\/d\/([A-Za-z0-9_-]{20,})/.exec(url) || [])[1];
const gid = (/[#&?]gid=(\d+)/.exec(url) || [])[1] || "";
if (!id) { console.error("시트 주소를 못 읽었다. 주소창의 주소를 그대로 넣는다."); process.exit(1); }

const SA_FILE = process.env.TEAM_SA_FILE || path.join(os.homedir(), ".climath", "team-sa.json");
const SA = JSON.parse(fs.readFileSync(SA_FILE, "utf8"));
const b64 = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64(JSON.stringify({ iss: SA.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const jwt = body + "." + b64(crypto.createSign("RSA-SHA256").update(body).sign(SA.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  const j = await r.json(); if (!j.access_token) throw new Error("토큰 실패: " + JSON.stringify(j));
  return j.access_token;
}

// 1) 읽히는지 먼저 본다 — 못 읽는 시트를 등록하면 화면에서 «못 읽었다» 만 뜬다
const st = await token("https://www.googleapis.com/auth/spreadsheets.readonly");
const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties(sheetId,title)`, { headers: { Authorization: "Bearer " + st } })).json();
if (meta.error) { console.error("시트를 못 읽는다:", meta.error.code, meta.error.message, "\n→ 시트를", SA.client_email, "에게 뷰어로 공유한다"); process.exit(1); }
const tabs = meta.sheets || [];
const tab = tabs.find((s) => String(s.properties.sheetId) === gid) || tabs[0];
console.log("시트:", meta.properties.title, "| 탭:", tab ? tab.properties.title : "(없음)", "| gid:", gid || "(첫 탭)");

// 2) dash/config.sources.roster 에 적는다 (다른 칸은 건드리지 않는다 — updateMask)
const ft = await token("https://www.googleapis.com/auth/datastore");
const now = Date.now();
const val = (v) => typeof v === "number" ? { integerValue: String(v) } : { stringValue: String(v) };
const doc = { fields: { sources: { mapValue: { fields: { roster: { mapValue: { fields: {
  id: val(id), url: val(url), gid: val(gid), title: val(meta.properties.title || ""), tabs: val(tabs.length), checked: val(now), updated: val(now),
} } } } } } } };
const r = await fetch(`https://firestore.googleapis.com/v1/projects/${SA.project_id}/databases/(default)/documents/dash/config?updateMask.fieldPaths=sources.roster`,
  { method: "PATCH", headers: { Authorization: "Bearer " + ft, "Content-Type": "application/json" }, body: JSON.stringify(doc) });
const j = await r.json();
if (!r.ok) { console.error("저장 실패:", r.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
console.log("등록했다 → dash/config.sources.roster");
