// 업무보고를 날마다 나스에 올린다 — 원장님께 올릴 문서(rpDigest)를 그대로 마크다운 파일로.
//
//   node tools/nas-daily-digest.mjs              # 지난 7일 중 아직 안 올린 날 (어제까지)
//   node tools/nas-daily-digest.mjs --date 2026-09-17
//   node tools/nas-daily-digest.mjs --dry        # 쓰지 않고 화면에만
//
// 왜 이게 있나 (2026-09-18 마왕님 «팀체크 앱에서 업무보고 받은걸 취합해서 매일 아침 9시마다 md파일로 나스에 올리자»):
//   팀장 «받은 보고» 화면에 «원장님께 올릴 문서»가 이미 있다. 그걸 **사람이 눌러 옮기지 않아도** 나스에 쌓이게 한다.
//
// 어디서 도나: **이 PC의 작업 스케줄러**(매일 09:00). 버셀 크론이 아닌 이유 —
//   ① 나스는 이 PC에 RaiDrive로 붙은 드라이브라 서버에서 못 쓴다 ② 버셀 Hobby 크론 두 칸은 수학시험 찾기가 쓰고 있다.
//   PC가 꺼져 있었으면 다음에 켤 때 돈다(작업 스케줄러 «놓친 작업 바로 실행»). 그래서 **하루만이 아니라 지난 7일을 훑는다.**
//
// 파일: <나스>\대치입시센터_간부\중, 고등관 AI업무공유\13_고등부팀장 한민수\제출 보고\YYYY-MM-DD_한민수_업무보고.md
//   날짜는 **보고한 날**이다(취합한 날이 아니라). 연·월 폴더 없이 한 폴더에 쌓는다 — 그 폴더 규칙이 그렇다.
//   ⚠ `YYYY-MM-DD_한민수.md` 는 주간보고가 쓰는 이름이라 꼬리를 붙였다. 겹치면 주간보고를 덮는다.
//   2026-09-20 옮김 — 마왕님 «나스 보고 폴더가 바뀌었으니까 … 매일 아침 돌아가는 업무보고 업로드도 여기에».
//   원장님이 9/18 간부 공유 폴더를 만들고 «보고서·자료는 사람별 제출 보고\ 에 올린다»(9/18 회의 결정 2)로 정했다.
//   옛 자리(클라이매쓰\AI업무\업무기록\YYYY\MM\_취합)에는 더 안 쓴다. 9/11~18 치는 원장님이 새 자리로 옮겨 두었다.
//   ⚠ 그 폴더의 **다른 사람 폴더 · 01_회의록 · 00_내 할 일 · 지시 이력은 쓰지 않는다**(폴더 CLAUDE.md). 여기는 «제출 보고» 만.
//
// ⚠ **«안 낸 사람» 은 출근 요일 기준이다.** 앱은 그 날 수업이 있었는지(수업관리 앱 DB)로 세는데,
//   이 스크립트의 열쇠(climath-team 서비스 계정)로는 수업관리 앱 DB를 못 읽는다(403).
//   그래서 담당 반이 있고 그 요일이 출근 요일(RP_WORK_DOWS)인데 보고가 없으면 «안 낸 사람» 으로 적는다.
//   아무도 안 낸 날은 쉬는 날로 보고 **파일을 만들지 않는다**(추석처럼 휴강인 날에 전원 «안 냄» 이 찍히지 않게).
//
// ⚠ 문서 모양은 index.html 의 rpDigest 를 **그대로 꺼내 돌린다**(아래 PICK). 여기서 다시 짜면 화면과 파일이 어긋난다.
//   index.html 에서 이름이 바뀌면 여기서 «못 찾았다» 로 멈춘다 — 조용히 옛 모양으로 가지 않는다.
//
// 이미 있는 파일: 이 스크립트가 쓴 것(맨 끝 표시 줄)이면 내용이 바뀌었을 때만 새로 쓴다 — 늦게 고친 보고가 따라온다.
//   **표시 줄이 없는 파일은 안 건드린다** — 사람이 손본 것이다.

import fs from "fs";
import path from "path";
import os from "os";
import vm from "vm";
import crypto from "crypto";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SA_FILE = process.env.TEAM_SA_FILE || path.join(os.homedir(), ".climath", "team-sa.json");
const LOG = path.join(os.homedir(), ".climath", "nas-digest.log");
const ARGS = process.argv.slice(2);
const DRY = ARGS.includes("--dry");
const ONE = (ARGS[ARGS.indexOf("--date") + 1] || "").match(/^\d{4}-\d{2}-\d{2}$/) && ARGS.includes("--date") ? ARGS[ARGS.indexOf("--date") + 1] : "";
const LOOKBACK = 7;
const WHO = "한민수";
const MARK = "<!-- 팀체크 자동 취합 · nas-daily-digest -->";

function log(msg) {
  const line = new Date().toISOString() + "  " + msg;
  console.log(msg);
  try { fs.appendFileSync(LOG, line + "\n"); } catch (e) {}
}

// ---- index.html 에서 꺼내 쓰는 것 ----
const PICK = ["pad2", "DOW", "parseYmd", "fmtMD", "RP_START", "RP_STATE", "RP_MOVE", "rpScoreVal", "rpScoreAvg",
  "RP_SKIP_NAMES", "rpSkip", "RP_WORK_DOWS", "rpOffDow", "RP_WEEK", "rpWeekSaid", "rpMoveText", "rpSummary", "rpDigest"];

// 맨 앞줄에서 시작하는 `function 이름(` 또는 `var 이름 =` 을 찾아 괄호가 닫힐 때까지 자른다.
// 문자열·정규식 속 괄호는 PICK 에 든 것들에 없다 — 들어오면 아래 컴파일 검사가 잡는다.
function cut(src, name) {
  const re = new RegExp("^(function " + name + "\\(|var " + name + " =)", "m");
  const m = re.exec(src);
  if (!m) throw new Error("index.html 에서 «" + name + "» 을 못 찾았다");
  let i = m.index, depth = 0, seen = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{" || ch === "[" || ch === "(") { depth++; seen = true; }
    else if (ch === "}" || ch === "]" || ch === ")") depth--;
    else if (ch === "\n" && seen && depth === 0) break;
    else if (ch === ";" && depth === 0) { i++; break; }
  }
  return src.slice(m.index, i);
}
function appFns() {
  const html = fs.readFileSync(path.join(HERE, "..", "index.html"), "utf8");
  const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  return PICK.map((n) => cut(src, n)).join("\n");
}

// ---- 팀 DB (읽기만) ----
function serviceAccount() {
  if (!fs.existsSync(SA_FILE)) throw new Error("서비스 계정 열쇠가 없다: " + SA_FILE);
  const j = JSON.parse(fs.readFileSync(SA_FILE, "utf8"));
  if (j.private_key && j.private_key.indexOf("\\n") >= 0) j.private_key = j.private_key.replace(/\\n/g, "\n");
  return j;
}
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function token(sa) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const assertion = body + "." + b64url(crypto.createSign("RSA-SHA256").update(body).sign(sa.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("구글 토큰 발급 실패 (" + r.status + ")");
  return j.access_token;
}
// Firestore REST 값 → 보통 값
function plain(v) {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
  if ("mapValue" in v) return fields(v.mapValue.fields || {});
  return null;
}
function fields(f) { const o = {}; for (const k in f) o[k] = plain(f[k]); return o; }

async function load(from, to) {
  const sa = serviceAccount(), tk = await token(sa);
  const BASE = "https://firestore.googleapis.com/v1/projects/" + sa.project_id + "/databases/(default)/documents";
  const H = { Authorization: "Bearer " + tk };
  const tr = await fetch(BASE + "/dash/teachers", { headers: H });
  if (!tr.ok) throw new Error("dash/teachers 를 못 읽었다 (" + tr.status + ")");
  const teachers = (fields((await tr.json()).fields || {}).items || [])
    .filter((t) => t.tid && t.name && t.status !== "ended");
  const reports = {};
  await Promise.all(teachers.map(async (t) => {
    reports[t.tid] = {};
    const q = { structuredQuery: { from: [{ collectionId: "days" }], where: { compositeFilter: { op: "AND", filters: [
      { fieldFilter: { field: { fieldPath: "date" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: from } } },
      { fieldFilter: { field: { fieldPath: "date" }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: to } } }] } } } };
    const r = await fetch(BASE + "/dailyReports/" + t.tid + ":runQuery", {
      method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(q) });
    if (!r.ok) throw new Error(t.name + " 보고를 못 읽었다 (" + r.status + ")");
    (await r.json()).forEach((row) => { if (row.document) { const d = fields(row.document.fields); reports[t.tid][d.date] = d; } });
  }));
  return { teachers, reports };
}

// ---- 문서 만들기 ----
function digestOf(data, d) {
  const S = { teachers: data.teachers, reports: data.reports };
  const ctx = {
    S,
    teacherName: (tid) => { const t = S.teachers.find((x) => x.tid === tid); return t ? t.name : (tid ? "?" : ""); },
  };
  vm.createContext(ctx);
  vm.runInContext(appFns(), ctx);
  // 앱은 «그 날 수업이 있었나» 로 센다. 여기선 그걸 못 읽어서 **담당 반이 있고 출근 요일인가** 로 센다(맨 위 설명).
  ctx.rpExpected = (tid, day) => {
    const t = S.teachers.find((x) => x.tid === tid);
    return day >= ctx.RP_START && !ctx.rpSkip(tid) && !ctx.rpOffDow(tid, day) && !!(t && (t.classIds || []).length);
  };
  const sm = ctx.rpSummary(d);
  if (!sm.got.length) return null;                     // 아무도 안 낸 날 = 쉬는 날로 본다
  let md = ctx.rpDigest(d).replace(" / 수업한 사람 ", " / 보고 대상 ");
  md += "\n\n---\n\n*팀체크 업무보고에서 자동으로 옮겼다(매일 09:00). «보고 대상 · 안 낸 사람» 은 **출근 요일** 기준이라 그 날 수업이 없던 선생님이 섞일 수 있다.*\n" + MARK + "\n";
  return md;
}

// ---- 나스 ----
// 드라이브 문자는 RaiDrive 가 붙는 순서로 바뀐다(9/20엔 Y:). 문자가 아니라 폴더로 찾는다.
const SUBMIT_DIR = "대치입시센터_간부\\중, 고등관 AI업무공유\\13_고등부팀장 " + WHO + "\\제출 보고";
function nasRoot() {
  if (process.env.NAS_SUBMIT) return process.env.NAS_SUBMIT;
  for (const L of "YUXZDEFGHIJKLMNOPQRSTVW") {
    const p = L + ":\\" + SUBMIT_DIR;
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  return "";
}
function kstYmd(offsetDays) {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 864e5);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const root = nasRoot();
  if (!root && !DRY) throw new Error("나스 «제출 보고» 폴더를 못 찾았다 (RaiDrive 연결 확인): " + SUBMIT_DIR);
  const days = [];
  if (ONE) days.push(ONE);
  else for (let i = LOOKBACK; i >= 1; i--) days.push(kstYmd(-i));   // 오늘은 안 한다 — 보고가 아직 들어오는 중이다
  const data = await load(days[0], days[days.length - 1]);
  let wrote = 0, same = 0, skip = 0;
  for (const d of days) {
    const md = digestOf(data, d);
    if (!md) { skip++; continue; }
    if (DRY) { console.log("\n======== " + d + "\n" + md); continue; }
    const dir = root;
    const file = path.join(dir, d + "_" + WHO + "_업무보고.md");
    if (fs.existsSync(file)) {
      const old = fs.readFileSync(file, "utf8");
      if (old.indexOf(MARK) < 0) { log("건드리지 않음(사람이 고친 파일): " + file); continue; }
      if (old === md) { same++; continue; }
    }
    fs.writeFileSync(file, md, "utf8");
    wrote++;
    log("올림: " + file);
  }
  log("끝 — 올림 " + wrote + " · 그대로 " + same + " · 보고 없는 날 " + skip + (DRY ? " (dry)" : ""));
}

main().catch((e) => { log("실패: " + e.message); process.exit(1); });
