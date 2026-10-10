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
// ⚠ **할 일 칸에 적은 보고(marks/<tid>.reports[할일id] = { text, at })도 싣는다** (2026-10-08).
//   «보고받는 일»(할 일에 report:true)은 할 일 메뉴의 적는 칸으로 낸다 — 업무보고(dailyReports)와 **다른 자리**다.
//   10/6 디스쿨 채널 주소 다섯 개 중 둘만 업무보고에 있고 셋은 여기에만 있어서, 원장님 보고에 둘만 갔다.
//   그 날(at === 날짜) 적은 것을 그 선생님 «업무» 줄로 얹는다. 업무보고에 같은 할 일 줄이 있으면 새 줄을 만들지 않고
//   메모에 붙인다(같은 글이면 그대로). 업무보고를 안 낸 선생님은 끝에 따로 «할 일 칸에 적은 것만» 으로 싣는다.
//   at 은 **마지막으로 고친 날**이다(앱 saveReport). 늦게 고치면 고친 날 보고에 다시 뜬다.
//
// 이미 있는 파일: 이 스크립트가 쓴 것(맨 끝 표시 줄)이면 내용이 바뀌었을 때만 새로 쓴다 — 늦게 고친 보고가 따라온다.
//   **표시 줄이 없는 파일은 안 건드린다** — 사람이 손본 것이다.

import fs from "fs";
import path from "path";
import os from "os";
import vm from "vm";
import crypto from "crypto";
import { spawnSync } from "child_process";
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
  "RP_SKIP_NAMES", "rpSkip", "RP_WORK_DOWS", "rpOffDow", "RP_WEEK", "rpWeekSaid", "rpMoveText", "rpSummary", "rpDigest",
  // 퇴원 보고 세 입장 · 후속 (2026-10-06)
  "RP_WHY", "RP_FOLLOW", "rpWhyOf", "rpWhyText",
  // 쉬는 날(2026-10-03) — 앱과 같은 판정. 학원 달력(dash/calEvents)의 «안 쉼» 덮어쓰기까지 본다
  "HOLIDAYS", "holEvent", "evEnd", "ACADEMY_OFF_RE", "holBuiltin", "holidayOf", "rpDayOf", "rpWorkOf", "rpHolidayFor",
  // 출결현황(2026-10-10) — 그 날 그 반에 수업이 있었나 · 누가 나오는 날인가. 앱과 같은 판정
  "ymd", "addDays", "onlyDaysOf", "rpIndividual", "rpActiveOn", "RP_SKIP_CLASS_RE", "rpSkipClass", "rpMeets", "rpStudentsOn"];

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
  // 하루 휴무(연차 · 병가) — 앱의 rpLeaveOf 와 같은 문서. 없으면(404) 아무도 휴무가 아니다
  const lr = await fetch(BASE + "/dash/rpLeave", { headers: H });
  if (!lr.ok && lr.status !== 404) throw new Error("dash/rpLeave 를 못 읽었다 (" + lr.status + ")");
  const rpLeave = lr.ok ? (fields((await lr.json()).fields || {}).items || {}) : {};
  // 학원 달력 — 쉬는 날을 손으로 고친 것(«안 쉼» · 워크샵). 없으면 나라 공휴일(HOLIDAYS)만 본다
  const er = await fetch(BASE + "/dash/calEvents", { headers: H });
  if (!er.ok && er.status !== 404) throw new Error("dash/calEvents 를 못 읽었다 (" + er.status + ")");
  const events = er.ok ? (fields((await er.json()).fields || {}).items || []) : [];
  // 할 일 칸 보고 — marks/<tid>.reports. 할 일 글은 dash/tasks 에서(지워졌으면 앱처럼 «지워진 할 일»)
  const marks = {};
  await Promise.all(teachers.map(async (t) => {
    const r = await fetch(BASE + "/marks/" + t.tid, { headers: H });
    if (!r.ok && r.status !== 404) throw new Error(t.name + " 할 일 보고(marks)를 못 읽었다 (" + r.status + ")");
    marks[t.tid] = r.ok ? (fields((await r.json()).fields || {}).reports || {}) : {};
  }));
  const kr = await fetch(BASE + "/dash/tasks", { headers: H });
  if (!kr.ok && kr.status !== 404) throw new Error("dash/tasks 를 못 읽었다 (" + kr.status + ")");
  const tasks = kr.ok ? (fields((await kr.json()).fields || {}).items || []) : [];
  // 반 명단 사본 — 앱이 팀장 로그인 때 적는다(index.html saveRpRoster). 출결현황만 쓴다. 없으면 출결현황을 못 만든다
  const rr = await fetch(BASE + "/dash/rpRoster", { headers: H });
  if (!rr.ok && rr.status !== 404) throw new Error("dash/rpRoster 를 못 읽었다 (" + rr.status + ")");
  const rpRoster = rr.ok ? fields((await rr.json()).fields || {}) : null;
  return { teachers, reports, rpLeave, events, marks, tasks, rpRoster };
}

// 그 날 할 일 칸에 적은 보고 — [{ id, text(할 일), note(적은 글) }]
// «완료» 한 마디는 메모로 안 붙인다 — 상태가 이미 [완료] 다.
const BARE_DONE = /^[\s<«(]*(완료|완)[\s>»).!]*$/;
function taskReportsOn(data, tid, d) {
  const byId = {};
  (data.tasks || []).forEach((t) => { if (t && t.id) byId[t.id] = t; });
  const m = (data.marks || {})[tid] || {};
  return Object.keys(m).filter((id) => m[id] && m[id].at === d).map((id) => {
    const note = String(m[id].text || "").trim();
    return { id, text: byId[id] ? byId[id].text : "지워진 할 일", note: BARE_DONE.test(note) ? "" : note };
  });
}
// 업무보고의 할 일 줄에 얹는다. 같은 할 일이 있으면 메모에 붙이고(이미 들어 있으면 그대로), 없으면 [완료] 줄을 더한다.
function mergeTasks(tasks, extra) {
  const out = (tasks || []).map((t) => Object.assign({}, t));
  extra.forEach((x) => {
    const t = out.find((y) => y.id && y.id === x.id);
    if (!t) { out.push({ id: x.id, text: x.text, state: "done", note: x.note }); return; }
    const n = String(t.note || "").trim();
    if (!x.note || n.indexOf(x.note) >= 0) return;
    t.note = n ? n + " / " + x.note : x.note;
  });
  return out;
}

// ---- 문서 만들기 ----
function digestOf(data, d) {
  // 그 날 할 일 칸 보고를 업무보고 사본에 얹는다 — data.reports 는 다른 날도 쓰니 건드리지 않는다
  const reports = Object.assign({}, data.reports), only = [];
  data.teachers.forEach((t) => {
    const extra = taskReportsOn(data, t.tid, d);
    if (!extra.length) return;
    const rep = (reports[t.tid] || {})[d];
    if (rep && rep.submitted) reports[t.tid] = Object.assign({}, reports[t.tid], { [d]: Object.assign({}, rep, { tasks: mergeTasks(rep.tasks, extra) }) });
    else only.push({ tid: t.tid, tasks: mergeTasks([], extra) });
  });
  const S = { teachers: data.teachers, reports, rpLeave: data.rpLeave || {}, events: data.events || [] };
  const ctx = {
    S,
    teacherName: (tid) => { const t = S.teachers.find((x) => x.tid === tid); return t ? t.name : (tid ? "?" : ""); },
  };
  vm.createContext(ctx);
  vm.runInContext(appFns(), ctx);
  // 앱은 «그 날 수업이 있었나» 로 센다. 여기선 그걸 못 읽어서 **담당 반이 있고 출근 요일인가** 로 센다(맨 위 설명).
  ctx.rpExpected = (tid, day) => {
    const t = S.teachers.find((x) => x.tid === tid);
    const x = S.rpLeave[tid + "|" + day];
    return day >= ctx.RP_START && !ctx.rpSkip(tid) && !ctx.rpOffDow(tid, day) && !(x && !x.work) &&
      !ctx.rpHolidayFor(tid, day) &&                   // 쉬는 날은 «출근» 으로 적힌 사람만 (10/3 개천절 이현우)
      !!(t && (t.classIds || []).length);
  };
  const sm = ctx.rpSummary(d);
  if (!sm.got.length && !only.length) return null;    // 아무도 안 낸 날 = 쉬는 날로 본다 (할 일 칸 보고도 없을 때)
  let md = ctx.rpDigest(d).replace(" / 수업한 사람 ", " / 보고 대상 ");
  // 업무보고는 안 냈지만 할 일 칸에는 적은 사람 — 줄 모양은 rpDigest 의 «업무» 와 같다
  only.filter((x) => !ctx.rpSkip(x.tid)).forEach((x) => {
    md += "\n\n## " + ctx.teacherName(x.tid) + "\n\n업무 (업무보고는 안 냄 — 할 일 칸에 적은 것)\n" +
      x.tasks.map((t) => "- [" + (ctx.RP_STATE[t.state] || "—") + "] " + t.text + (t.note ? " — " + t.note : "")).join("\n");
  });
  md += "\n\n---\n\n*팀체크 업무보고에서 자동으로 옮겼다(매일 09:00). 할 일 칸에 그 날 적은 보고도 «업무» 에 같이 실었다. «보고 대상 · 안 낸 사람» 은 **출근 요일** 기준이라 그 날 수업이 없던 선생님이 섞일 수 있다.*\n" + MARK + "\n";
  return md;
}

// ---- 예비고1 출결현황 (2026-10-10 원장님 #59 — 박솔 대리에게 넘긴다) ----
//
// 원장님 «예비고1 출결 현황이 박솔 대리에게 넘어가야 수강료 누락이 안 생긴다». 지금은 팀장이 업무보고로 보고
// 박솔 대리는 구글시트로 따로 체크한다 — 두 군데라 어긋난다. **기준은 선생님이 업무보고에 찍은 출결(att) 하나**로 한다.
//   ⚠ 학생 줄의 auto(수업관리 앱 출결)는 쓰지 않는다. 앱 체크인을 거의 안 해서 «결석» 이 대부분이다(10/9: 329칸 중 135칸이 att 와 다름).
//
// 언제: 이 스크립트가 09:00 에 돌 때 같이 본다.
//   · **주 1회** — 이번 주(월요일부터) 그 달 파일이 없으면 «그 달 누적»(어제까지)을 만든다. 월요일에 PC가 꺼져 있었으면 다음에 켤 때.
//   · **월 1회** — 그 달 2일부터, 지난달 «확정본» 이 없으면 만든다. 1일이 아니라 2일인 것은 말일 보고가 다음 날 아침 8시까지라서.
//   손으로: --att-month 2026-09 (그 달 끝까지, 지난달이면 확정본) · --att (이번 주 것이 있어도 다시)
// 파일: 제출 보고\YYYY-MM-DD_한민수_예비고1 출결현황(10월).xlsx · …(9월 확정).xlsx — 날짜는 만든 날(그 폴더 규칙).
//
// 무엇을: 예비고1 정규반 전원 + 개진반의 **중3** 학생. 반마다 «학생 × 수업일» 칸.
//   출·결·지·조 = 업무보고 그대로 · ? = 보고는 냈는데 그 학생 출결을 안 찍음 · 미보고 = 수업 날인데 그 반 보고가 없음
//   밖 = 업무보고를 안 받는 반·요일(원장님 개진반 · 중등관에 보고하는 요일) — 박솔 대리가 따로 챙길 칸
//   ⚠ 빈칸을 출석으로 읽으면 안 된다. 그래서 «?» 와 «미보고» 를 따로 찍는다.
// 요일·명단은 dash/rpRoster(앱이 팀장 로그인 때 적는 사본)에서. 그 날 보고에만 있고 명단에서 빠진 학생도 보고대로 싣는다.
const ATT_FORCE = ARGS.includes("--att");
const ATT_MONTH = ARGS.includes("--att-month") && /^\d{4}-\d{2}$/.test(ARGS[ARGS.indexOf("--att-month") + 1] || "") ? ARGS[ARGS.indexOf("--att-month") + 1] : "";
const ATT_MARK = { "출석": "출", "결석": "결", "지각": "지", "조퇴": "조" };
const ATT_PY = path.join(HERE, "att-xlsx.py");

function monthLast(m) { const [y, mo] = m.split("-").map(Number); return m + "-" + String(new Date(y, mo, 0).getDate()).padStart(2, "0"); }
function attCtx(data) {
  const S = { teachers: data.teachers, reports: data.reports, rpLeave: data.rpLeave || {}, events: data.events || [] };
  const ctx = { S, teacherName: (tid) => { const t = S.teachers.find((x) => x.tid === tid); return t ? t.name : ""; } };
  vm.createContext(ctx);
  vm.runInContext(appFns(), ctx);
  return ctx;
}
// 그 달 1일 ~ until 의 표. 수업관리 앱 판정(rpMeets · rpStudentsOn)을 사본 명단으로 그대로 돌린다.
function attendanceOf(data, month, until) {
  if (!data.rpRoster || !(data.rpRoster.classes || []).length)
    throw new Error("dash/rpRoster 가 비었다 — 팀체크에 팀장으로 한 번 로그인하면 적힌다");
  // 업무보고는 RP_START(9/14)부터다. 그 전 날을 «미보고» 로 찍으면 안 한 일로 읽힌다 — 표를 거기서 시작한다
  const ctx = attCtx(data), from = month + "-01" < ctx.RP_START ? ctx.RP_START : month + "-01";
  const last = until < monthLast(month) ? until : monthLast(month);
  const tname = (tid) => ctx.teacherName(tid);
  const out = { month, from, until: last, made: kstYmd(0), rosterAt: data.rpRoster.at || "", classes: [], moves: [] };
  const cids = {};
  (data.rpRoster.classes || []).forEach((c) => {
    cids[c.id] = 1;
    const regular = /^예비고1/.test(c.name);
    const want = (g) => regular || g === "중3";
    const tids = c.tids || [];
    const rows = {}, order = [], dates = [];
    const rowOf = (sid, pid, name, school, grade) => {
      const k = pid || sid || name;
      if (!rows[k]) { rows[k] = { pid, name, school: school || "", grade: grade || "", cells: {}, notes: [] }; order.push(k); }
      return rows[k];
    };
    for (let d = from; d <= last; d = ctx.addDays(d, 1)) {
      if (!ctx.rpMeets(c, d)) continue;
      // 그 반을 맡은 선생님 중 그 날 보고에 이 반을 적은 사람. 둘이 맡은 반은 먼저 찾은 쪽
      let rc = null, rtid = "";
      tids.forEach((tid) => { const r = (data.reports[tid] || {})[d]; const x = r && (r.classes || []).find((y) => y.cid === c.id); if (x && !rc) { rc = x; rtid = tid; } });
      const working = tids.filter((tid) => !ctx.rpSkip(tid) && !ctx.rpOffDow(tid, d) && !ctx.rpHolidayFor(tid, d));
      if (!rc && tids.length && tids.every((tid) => ctx.rpHolidayFor(tid, d))) continue;   // 학원 쉬는 날 — 수업이 없었다
      const expected = ctx.rpStudentsOn(c, d).filter((r) => want(r.grade));
      if (!rc && !expected.length) continue;
      dates.push(d);
      if (rc) {
        const bySid = {};
        (rc.students || []).forEach((s) => { bySid[s.sid] = s; });
        const seen = {};
        expected.forEach((r) => {
          const s = bySid[r.id]; seen[r.id] = 1;
          const row = rowOf(r.id, r.pid, r.name, r.school, r.grade);
          row.cells[d] = s ? (ATT_MARK[s.att] || "?") : "?";
          if (s && s.makeup) row.notes.push(d.slice(5) + " 보강 " + String(s.makeup).slice(5));
        });
        // 보고에는 있는데 지금 명단에 없는 학생(그 뒤에 빠졌다) — 정규반은 그대로, 개진반은 명단에서 학년을 찾을 때만
        (rc.students || []).forEach((s) => {
          if (seen[s.sid]) return;
          const r = (c.roster || []).find((x) => x.id === s.sid || (s.pid && x.pid === s.pid)) || {};
          if (!regular && r.grade !== "중3") return;
          const row = rowOf(s.sid, s.pid || r.pid || "", s.name || r.name, r.school, r.grade);
          row.cells[d] = ATT_MARK[s.att] || "?";
          if (s.makeup) row.notes.push(d.slice(5) + " 보강 " + String(s.makeup).slice(5));
        });
      } else {
        const mark = working.length ? "미보고" : "밖";
        expected.forEach((r) => { rowOf(r.id, r.pid, r.name, r.school, r.grade).cells[d] = mark; });
      }
    }
    if (!order.length) return;
    const list = order.map((k) => rows[k]).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
    list.forEach((row) => {
      const v = Object.values(row.cells);
      const n = (m) => v.filter((x) => x === m).length;
      row.sum = { held: v.filter((x) => x !== "밖").length, att: n("출") + n("지") + n("조"), abs: n("결"),
                  late: n("지") + n("조"), unknown: n("?") + n("미보고"), out: n("밖") };
    });
    out.classes.push({ id: c.id, name: c.name, teachers: tids.map(tname).join("·"), regular,
                       outside: tids.length > 0 && tids.every((tid) => ctx.rpSkip(tid)), dates, rows: list });
  });
  out.classes.sort((a, b) => (b.regular - a.regular) || a.name.localeCompare(b.name, "ko"));
  // 명단 변동 — 그 달 업무보고에 적힌 것 중 이 반들이 걸린 것
  data.teachers.forEach((t) => {
    Object.keys(data.reports[t.tid] || {}).sort().forEach((d) => {
      if (d < from || d > last) return;
      ((data.reports[t.tid][d] || {}).moves || []).forEach((m) => {
        if (!cids[m.fromCid] && !cids[m.toCid]) return;
        out.moves.push({ reported: d, teacher: t.name, kind: ctx.RP_MOVE[m.kind] || m.kind, name: m.name || "",
                         what: ctx.rpMoveText(m), date: m.date || "", note: m.note || "" });
      });
    });
  });
  return out;
}
function writeAttXlsx(obj, file) {
  const tmp = path.join(os.tmpdir(), "att-" + process.pid + ".json");
  fs.writeFileSync(tmp, JSON.stringify(obj), "utf8");
  const r = spawnSync(process.env.PYTHON || "python", [ATT_PY, tmp, file], { encoding: "utf8" });
  try { fs.unlinkSync(tmp); } catch (e) {}
  if (r.status !== 0) throw new Error("엑셀을 못 만들었다: " + ((r.stderr || r.error && r.error.message || "").trim().split("\n").pop()));
}
function attMonthName(m, final) { return Number(m.slice(5)) + "월" + (final ? " 확정" : ""); }
function attFileName(made, m, final) { return made + "_" + WHO + "_예비고1 출결현황(" + attMonthName(m, final) + ").xlsx"; }
function attHas(root, m, final, since) {
  if (!root) return false;
  const tail = "_" + WHO + "_예비고1 출결현황(" + attMonthName(m, final) + ").xlsx";
  return fs.readdirSync(root).some((f) => f.endsWith(tail) && (!since || f.slice(0, 10) >= since));
}
// 이번에 만들 것 — [{ month, until, final }]
function attJobs(root) {
  const today = kstYmd(0), yest = kstYmd(-1), thisM = today.slice(0, 7);
  if (ATT_MONTH) return [{ month: ATT_MONTH, until: ATT_MONTH < thisM ? monthLast(ATT_MONTH) : yest, final: ATT_MONTH < thisM }];
  const jobs = [];
  const pd = new Date(today + "T00:00:00Z"); pd.setUTCDate(0);
  const prevM = pd.toISOString().slice(0, 7);
  if (Number(today.slice(8)) >= 2 && !attHas(root, prevM, true)) jobs.push({ month: prevM, until: monthLast(prevM), final: true });
  const dow = new Date(today + "T00:00:00Z").getUTCDay(), monday = kstYmd(-((dow + 6) % 7));
  if (yest.slice(0, 7) === thisM && (ATT_FORCE || !attHas(root, thisM, false, monday))) jobs.push({ month: thisM, until: yest, final: false });
  return jobs;
}
async function runAttendance(root) {
  const jobs = attJobs(root);
  if (!jobs.length) return;
  for (const j of jobs) {
    const data = await load(j.month + "-01", j.until);
    const obj = attendanceOf(data, j.month, j.until);
    obj.final = j.final;
    if (DRY) { console.log("\n======== 출결현황 " + j.month + (j.final ? " 확정" : "") + " ~" + obj.until + "\n" +
      obj.classes.map((c) => c.name + " (" + c.teachers + ") 수업 " + c.dates.length + "일 · " + c.rows.length + "명" + (c.outside ? " · 업무보고 밖" : "")).join("\n") +
      "\n명단 변동 " + obj.moves.length + "건"); continue; }
    const file = path.join(root, attFileName(obj.made, j.month, j.final));
    writeAttXlsx(obj, file);
    log("올림: " + file);
  }
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
  if (ATT_MONTH) { await runAttendance(root); return; }   // 출결현황만 손으로 — 업무보고는 안 건드린다
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
  // 출결현황은 업무보고와 따로 실패한다 — 이게 막혀도 업무보고 파일은 이미 올라갔다
  if (!ONE) {
    try { await runAttendance(root); }
    catch (e) { log("출결현황 실패: " + e.message); process.exitCode = 1; }
  }
}

// 시험(tools/test-attendance.mjs)이 불러 쓸 때는 돌지 않는다
export { attendanceOf, attJobs };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => { log("실패: " + e.message); process.exit(1); });
