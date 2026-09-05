// 나스 허브의 개발 기록을 대시보드로 올린다 — «개발 현황» 의 나스 쪽.
//
//   node tools/push-devlog.mjs            # 올린다
//   node tools/push-devlog.mjs --dry      # 무엇이 올라갈지 보기만 (열쇠 없이도 돈다)
//
// 나스(`클라이매쓰\AI업무`)에는 커밋 기록이 없다. 사람이 써 둔 것 둘을 읽는다.
//   개발노트/도구보고/날짜_이름_도구.md   → devtools/{파일이름}   파일 하나가 앱 하나. 머리말의 작성자·도구
//   업무기록/2026/날짜_이름.md            → devlog/{지문}         «- 개발 [앱 이름] 무엇을 했다» 꼴의 줄만
//
// 일지 전체를 올리지 않는다. 상담·행정이 섞여 있고 학생ID 가 적힌 줄이 대시보드로 따라온다.
// 표시된 줄만 올리는 것이 허브의 개인정보 규칙에 맞다.
//
// 열쇠는 push-minutes.mjs 와 같은 서비스 계정 파일이다. 저장소에는 안 들어간다.

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes("--dry");
const SA_FILE = process.env.TEAM_SA_FILE || path.join(os.homedir(), ".climath", "team-sa.json");

// 나스가 붙은 드라이브 글자는 PC 마다 다르다 (허브 문서는 Z:, 이 PC 는 RaiDrive 로 U:).
// NAS_HUB 로 못 박지 않았으면 차례로 찾아본다.
export function findHub() {
  if (process.env.NAS_HUB) return process.env.NAS_HUB;
  for (const d of ["Z", "U", "X", "Y", "W", "V"]) {
    const p = d + ":\\클라이매쓰\\AI업무";
    if (fs.existsSync(path.join(p, "00_시작.md"))) return p;
  }
  return "";
}

function frontmatter(text) {
  const t = text.replace(/^﻿/, "");
  const fm = {};
  let body = t;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t);
  if (m) {
    body = t.slice(m[0].length);
    m[1].split(/\r?\n/).forEach((line) => {
      const kv = /^([^:\s][^:]*):\s*(.*)$/.exec(line);
      if (kv) fm[kv[1].trim()] = kv[2].trim().replace(/^"(.*)"$/, "$1");
    });
  }
  return { fm, body };
}

// 도구보고 한 편 → 앱 하나. 파일 이름이 `날짜_이름_도구` 라 머리말이 비어도 거기서 읽는다.
export function parseToolReport(name, text) {
  const { fm, body } = frontmatter(text);
  const base = name.replace(/\.md$/, "");
  const parts = base.split("_");
  const h1 = /^#\s+(.+)$/m.exec(body);
  return {
    id: base,
    date: fm["작성"] || fm["날짜"] || (/^(\d{4}-\d{2}-\d{2})/.exec(base) || [])[1] || "",
    who: fm["작성자"] || parts[1] || "",
    app: fm["도구"] || parts.slice(2).join("_") || base,
    title: fm["제목"] || (h1 ? h1[1].trim() : ""),
    file: "개발노트/도구보고/" + name,
  };
}

// 일지에서 개발 줄만. `- 개발 [앱] 무엇` · `- 개발 «앱» 무엇` · 굵게 감싼 것도 받는다.
const DEV_LINE = /^\s*[-*]\s*\**개발\**\s*[\[«]\s*([^\]»]+?)\s*[\]»]\s*[:：\-—]?\s*(.+?)\s*$/;
export function parseLogLines(name, text) {
  const { fm, body } = frontmatter(text);
  const base = name.replace(/\.md$/, "").split("/").pop();   // 연도 폴더를 뗀 파일 이름
  const parts = base.split("_");
  const date = fm["날짜"] || (/^(\d{4}-\d{2}-\d{2})/.exec(base) || [])[1] || "";
  const who = fm["작성"] || fm["작성자"] || parts[1] || "";
  const out = [];
  body.split(/\r?\n/).forEach((line) => {
    const m = DEV_LINE.exec(line);
    if (!m) return;
    const app = m[1].trim(), msg = m[2].replace(/\*\*/g, "").trim();
    if (!msg) return;
    out.push({ id: sha(base + "|" + app + "|" + msg), date, who, app, msg, file: "업무기록/" + name });
  });
  return out;
}
const sha = (x) => crypto.createHash("sha1").update(x).digest("hex").slice(0, 16);

function serviceAccount() {
  let raw = process.env.TEAM_SERVICE_ACCOUNT || "";
  if (!raw) {
    if (!fs.existsSync(SA_FILE)) {
      console.error("서비스 계정 열쇠를 못 찾았다: " + SA_FILE + "  (push-minutes.mjs 와 같은 자리)");
      process.exit(1);
    }
    raw = fs.readFileSync(SA_FILE, "utf8");
  }
  let j;
  try { j = JSON.parse(raw); } catch (e) { console.error("열쇠 파일이 올바른 JSON 이 아니다"); process.exit(1); }
  if (j.private_key && j.private_key.indexOf("\\n") >= 0) j.private_key = j.private_key.replace(/\\n/g, "\n");
  return j;
}
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(body).sign(sa.private_key);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: body + "." + b64url(sig) }).toString() });
  const j = await r.json();
  if (!r.ok || !j.access_token) { console.error("구글 토큰 발급 실패 (" + r.status + ")"); process.exit(1); }
  return j.access_token;
}
const toValue = (v) => typeof v === "number" ? { integerValue: String(v) } : { stringValue: String(v == null ? "" : v) };

function readDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !/^README/i.test(f)).sort();
}

async function main() {
  const hub = findHub();
  if (!hub) { console.error("나스 허브를 못 찾았다. RaiDrive 가 붙어 있는지 보거나 NAS_HUB=경로 로 알려준다."); process.exit(1); }
  console.log("허브: " + hub);

  const toolDir = path.join(hub, "개발노트", "도구보고");
  const tools = readDir(toolDir).map((f) => parseToolReport(f, fs.readFileSync(path.join(toolDir, f), "utf8")));

  const logRoot = path.join(hub, "업무기록");
  let logs = [];
  if (fs.existsSync(logRoot)) {
    fs.readdirSync(logRoot).filter((y) => /^\d{4}$/.test(y)).forEach((y) => {
      readDir(path.join(logRoot, y)).forEach((f) => {
        logs = logs.concat(parseLogLines(y + "/" + f, fs.readFileSync(path.join(logRoot, y, f), "utf8")));
      });
    });
  }

  console.log("\n도구보고 " + tools.length + "편");
  tools.forEach((t) => console.log("  " + t.date + "  " + t.who + "  " + t.app));
  console.log("\n일지 개발 줄 " + logs.length + "건");
  logs.forEach((l) => console.log("  " + l.date + "  " + l.who + "  [" + l.app + "] " + l.msg));
  if (DRY) { console.log("\n--dry 라 올리지 않았다."); return; }

  const sa = serviceAccount();
  const base = "https://firestore.googleapis.com/v1/projects/" + sa.project_id + "/databases/(default)/documents";
  const token = await accessToken(sa);
  const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const now = new Date().toISOString();

  async function put(col, id, obj) {
    const fields = {};
    Object.keys(obj).forEach((k) => { fields[k] = toValue(obj[k]); });
    fields.updated = toValue(now);
    const r = await fetch(base + "/" + col + "/" + encodeURIComponent(id), { method: "PATCH", headers: h, body: JSON.stringify({ fields }) });
    if (!r.ok) { const j = await r.json().catch(() => null); console.error("  ✗ " + col + "/" + id + " — " + (((j || {}).error || {}).message || r.status)); return false; }
    return true;
  }
  // 일지에서 지운 줄은 대시보드에서도 빠져야 한다. 올라가 있는 것 중 이번에 없는 것을 지운다.
  async function listIds(col) {
    const r = await fetch(base + "/" + col + "?pageSize=1000", { headers: h });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.documents || []).map((d) => decodeURIComponent(d.name.split("/").pop()));
  }

  let n = 0;
  for (const t of tools) if (await put("devtools", t.id, t)) n++;
  for (const l of logs) if (await put("devlog", l.id, l)) n++;

  let gone = 0;
  const keepT = new Set(tools.map((t) => t.id)), keepL = new Set(logs.map((l) => l.id));
  for (const id of await listIds("devtools")) if (!keepT.has(id)) { await fetch(base + "/devtools/" + encodeURIComponent(id), { method: "DELETE", headers: h }); gone++; }
  for (const id of await listIds("devlog")) if (!keepL.has(id)) { await fetch(base + "/devlog/" + encodeURIComponent(id), { method: "DELETE", headers: h }); gone++; }

  console.log("\n올림 " + n + "건" + (gone ? " · 지움 " + gone + "건" : "") + " · 대시보드 개발 현황에서 «다시 읽기».");
}

if (import.meta.url === "file:///" + process.argv[1].replace(/\\/g, "/").replace(/^\//, "")) {
  main().catch((e) => { console.error("터짐: " + e.message); process.exit(1); });
}
