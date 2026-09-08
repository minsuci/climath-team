// 근거 시트의 «반» 줄만 읽어 반 이름을 찍는다 — 학생 이름은 안 읽는다.
// 어느 열이 고등부인지 볼 때 쓴다. node tools/peek-roster-cols.mjs
import fs from "fs"; import os from "os"; import path from "path"; import crypto from "crypto";
const SA = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".climath", "team-sa.json"), "utf8"));
const b64 = (s) => Buffer.from(s).toString("base64url");
async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64(JSON.stringify({ iss: SA.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const jwt = body + "." + b64(crypto.createSign("RSA-SHA256").update(body).sign(SA.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  const j = await r.json(); if (!j.access_token) throw new Error("토큰 실패"); return j.access_token;
}
const id = "1zIve5-gJEha0p8d0QAcq5yBM5sGdUH546MJAkDaz98E", tab = "26년 9월 예상";
const st = await token("https://www.googleapis.com/auth/spreadsheets.readonly");
const r = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("'" + tab + "'!A1:BZ400")}`, { headers: { Authorization: "Bearer " + st } })).json();
const rows = r.values || [];
rows.forEach((row, i) => {
  if (String(row[2] || "").trim() !== "반") return;
  const day = rows[i - 1] || [];
  console.log("줄 " + (i + 1) + ":");
  for (let c = 3; c < row.length; c++) if (String(row[c] || "").trim()) console.log("  " + c + "\t" + JSON.stringify(String(day[c] || "").trim()) + "\t" + JSON.stringify(String(row[c]).trim()));
});

// 앱이 실제로 쓰는 열 — index.html 의 parseRosterSheet + highCols 를 그대로 돌려 본다 (이름은 안 찍는다)
import vm from "vm";
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"))[1];
const ctx = vm.createContext({ console, Date, Math, JSON, Object, Array, String, Number, RegExp, Promise, isNaN, parseInt,
  document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {} }, window: { addEventListener() {} },
  location: { hash: "" }, localStorage: { getItem: () => null, setItem() {} }, firebase: { initializeApp: () => ({}), firestore: Object.assign(() => ({ collection: () => ({}) }), {}), auth: () => ({ onAuthStateChanged() {} }) }, setTimeout, clearTimeout });
try { vm.runInContext(src, ctx); } catch (e) { /* 화면 없는 곳에서 터지는 것은 무시 — 함수만 있으면 된다 */ }
const cols = vm.runInContext("highCols(parseRosterSheet(ROWS))", Object.assign(ctx, { ROWS: rows }));
console.log("\n앱이 보는 고등부 열 (" + cols.length + "):");
cols.forEach((c) => console.log("  " + c.block + "\t" + JSON.stringify(c.day) + "\t" + c.label.replace(/\s+/g, " ") + "\t재원 " + c.students.length + " · 신입예정 " + c.joining.length + " · 퇴원 " + c.leaving.length));
