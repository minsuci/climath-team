// 규칙이 실제로 걸렸는지 본다 — **막히는가**로.
//
//   node tools/check-rules.mjs
//
// 규칙은 커밋해도 안 걸린다. 콘솔에 붙여넣어 게시해야 걸리고, 커밋된 것과 실제 걸린 것이
// 어긋날 수 있다. **정상 사용자가 잘 되는지만 보면 반쪽이다** — 막혀야 할 것이 막히는지를 봐야 한다.
// (→ 볼트 「Firestore 보안 규칙 함정」)
//
// ⚠ 서비스 계정은 규칙을 통과해 버린다. 그래서 **선생님 계정 토큰을 만들어** 진짜로 불러 본다.
//   열쇠(팀 서비스 계정)로 커스텀 토큰에 서명하고, 웹 API 키로 ID 토큰과 바꾼 다음 Firestore REST 를 부른다.
//
// ⚠ 여기서 보는 것은 **팀 DB(climath-team) 규칙뿐이다.** 앱 DB(climath-class)는 규칙도 열쇠도 저쪽 것이라
//   이 열쇠로는 못 부른다. 2026-09-07 선생님 로그인이 통째로 막혔는데 막은 것은 앱 규칙이었고,
//   여기가 12건 다 통과하던 때였다. 앱 DB 쪽은 `tools/test-ro.js` 가
//   «선생님으로 loadCore() 가 끝까지 가는가» 로 지킨다. 둘 다 돌려야 반쪽이 아니다.
//
// ⚠ 자국을 안 남긴다. 읽기와 «실패해야 하는 쓰기»가 대부분이고,
//   딱 하나 성공하는 쓰기(선생님 자기 체크)는 **없던 문서면 지워서 되돌린다.**
//   이 하나를 굳이 시험하는 이유: 여기가 막히면 «내 완료» 단추가 조용히 안 먹는다.
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const SA_FILE = process.env.TEAM_SA_FILE || path.join(os.homedir(), ".climath", "team-sa.json");
const WEB_KEY = process.env.TEAM_WEB_KEY || "AIzaSyCbxX46XDur_qL91rjicKjqhpCY2Lqem88";  // index.html 에 공개된 것
const CLASS_API = process.env.CLASS_API_URL || "https://climath-class.vercel.app/api/auth";
const OPEN_MIN = process.env.OPEN_MINUTE || "2026-09-03 클라이매쓰 전체회의";   // 공개: 팀
const SHUT_MIN = process.env.SHUT_MINUTE || "2026-08-31 간부 전체회의";        // 공개: 간부

function serviceAccount() {
  if (!fs.existsSync(SA_FILE)) {
    console.error("서비스 계정 열쇠를 못 찾았다: " + SA_FILE);
    console.error("  push-minutes.mjs 와 같은 열쇠다. 그 안내대로 두면 된다.");
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(SA_FILE, "utf8"));
  if (j.private_key && j.private_key.indexOf("\\n") >= 0) j.private_key = j.private_key.replace(/\\n/g, "\n");
  return j;
}
const b64 = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// 우리 팀 선생님 둘을 고른다 — 하나는 «나», 하나는 «남». 남의 문서에 못 쓰는지를 봐야 한다.
async function twoTeachers() {
  const r = await fetch(CLASS_API, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "teachers" }) });
  const j = await r.json().catch(() => ({}));
  const list = (j.teachers || []).filter((t) => t.role === "teacher" && t.status === "active");
  if (list.length < 2) { console.error("선생님 명단을 못 받았다 (" + r.status + ")"); process.exit(1); }
  return [list[0], list[1]];
}

async function teacherToken(sa, t) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now, exp: now + 600, uid: "t_" + t.tid,
    claims: { role: "teacher", tid: t.tid, name: t.name },
  }));
  const tok = body + "." + b64(crypto.createSign("RSA-SHA256").update(body).sign(sa.private_key));
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + WEB_KEY, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tok, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) { console.error("선생님 토큰을 못 만들었다: " + JSON.stringify(j).slice(0, 200)); process.exit(1); }
  return j.idToken;
}

const T = [];
const say = (want, name, pass, detail) =>
  T.push((pass ? "  OK  " : "FAIL  ") + (want ? "열림 " : "막힘 ") + name + (detail ? "   " + detail : ""));

async function main() {
  const sa = serviceAccount();
  const [me, other] = await twoTeachers();
  const idToken = await teacherToken(sa, me);
  const H = { Authorization: "Bearer " + idToken, "Content-Type": "application/json" };
  const BASE = "https://firestore.googleapis.com/v1/projects/" + sa.project_id + "/databases/(default)/documents";
  const enc = encodeURIComponent;
  console.log("선생님 «" + me.name + "» 로 불러 본다. (남의 문서는 «" + other.name + "» 것)\n");

  const read = async (p) => (await fetch(BASE + "/" + p, { headers: H })).status;
  const query = async (b) => (await fetch(BASE + ":runQuery", { method: "POST", headers: H, body: JSON.stringify(b) })).status;
  const write = async (p, fields) =>
    (await fetch(BASE + "/" + p, { method: "PATCH", headers: H, body: JSON.stringify({ fields }) })).status;
  const gone = (s) => s === 403 || s === 404;   // 없는 문서도 «못 본다»로 친다

  // ---- 회의록 ----
  say(true,  "팀 공개 회의록을 읽는다", (await read("minutes/" + enc(OPEN_MIN))) === 200, OPEN_MIN);
  say(false, "간부회의록은 못 읽는다", gone(await read("minutes/" + enc(SHUT_MIN))), SHUT_MIN);
  say(true,  "open==true 목록 쿼리는 통과", (await query({ structuredQuery: { from: [{ collectionId: "minutes" }],
    where: { fieldFilter: { field: { fieldPath: "open" }, op: "EQUAL", value: { booleanValue: true } } } } })) === 200);
  // ⚠ 이게 열리면 조건 없이 간부회의록까지 긁힌다
  say(false, "조건 없는 회의록 목록은 거절", (await query({ structuredQuery: { from: [{ collectionId: "minutes" }] } })) === 403);

  // ---- 할 일 ----
  say(true,  "팀 할 일 공개분을 읽는다", (await read("dash/tasks")) === 200);
  say(false, "팀장 전용 할 일은 못 읽는다", gone(await read("dash/tasksLead")));
  say(true,  "근거 자료(dash/config)는 읽는다", (await read("dash/config")) === 200);

  // ---- 쓰기 ----
  say(false, "공용 할 일에는 못 쓴다", (await write("dash/tasks", { updated: { integerValue: "1" } })) === 403);
  say(false, "회의록에도 못 쓴다", (await write("minutes/" + enc(OPEN_MIN), { title: { stringValue: "x" } })) === 403);
  say(false, "남의 «내 완료» 문서에는 못 쓴다", (await write("marks/" + other.tid, { name: { stringValue: "x" } })) === 403);

  // 딱 하나 열려 있어야 하는 쓰기 — 자기 체크. 없던 문서면 지워서 되돌린다.
  const had = (await read("marks/" + me.tid)) === 200;
  const w = await write("marks/" + me.tid,
    { name: { stringValue: me.name }, done: { mapValue: { fields: {} } }, updated: { integerValue: String(Date.now()) } });
  say(true, "자기 «내 완료» 문서에는 쓴다", w === 200, "HTTP " + w);
  if (!had && w === 200) {
    const d = await fetch(BASE + "/marks/" + me.tid, { method: "DELETE", headers: H });
    T.push((d.status === 200 ? "  ·   " : "FAIL  ") + "되돌렸다 (없던 문서를 지웠다)   HTTP " + d.status);
  }

  // ---- 규칙에 안 적은 것은 닫혀 있어야 한다 ----
  say(false, "규칙에 없는 컬렉션은 아무도 못 읽는다", (await read("students/anything")) === 403);

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n어긋난 것 " + bad + "건 — firestore.rules 를 콘솔에 다시 게시했는지 본다"
                  : "\n규칙이 제대로 걸렸다 (" + T.filter((x) => x.startsWith("  OK")).length + "건)");
  process.exit(bad ? 1 : 0);
}
main();
