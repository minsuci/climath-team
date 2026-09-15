// 선생님이 **자기 출결 앱**에 찍은 출결을 받아 오는 통로 (2026-09-15, 이현우 선생님 앱부터).
//
// 이현우 선생님은 수업관리 앱이 아니라 본인이 만든 앱(Supabase)에 출결을 찍는다.
// 그 앱이 `daily-report` 함수를 열어 두었다 — GET, 헤더 `x-report-key`, `?date=` 또는 `?from=&to=`(최대 31일).
//   오는 것: { date, students: [{ name, attend: 출석|결석|미정, contacted, note, score }] }
//            구간이면 { from, to, days: [{ date, students }] }
//
// ⚠ 브라우저가 바로 못 부른다. 그쪽이 CORS 사전 요청(OPTIONS)에 401 을 준다.
//   그리고 **열쇠를 페이지에 두면 누구나 학생 이름·출결·점수를 뽑아 간다.** 그래서 서버를 거친다.
// ⚠ 열쇠는 환경변수가 아니라 팀 DB `secrets/attend_<tid>` 에 둔다 — { url, key, name }.
//   `secrets` 는 규칙에 일부러 안 적은 컬렉션이라 브라우저에서는 아무도 못 읽고(secrets/vapid 와 같다),
//   서비스 계정인 이 함수만 읽는다. 넣고 바꾸는 것은 `node tools/set-attend-feed.mjs`.
//   선생님이 더 붙어도 코드를 안 고친다 — 문서 하나를 더 넣으면 된다.
//
// 요청: POST { idToken, tid, date } 또는 { idToken, tid, from, to }
// 응답: { none: true }                       — 그 선생님은 연결된 앱이 없다
//       { source, days: [{ date, students }] } — 이름·출결·연락·메모·점수만. 열쇠·주소는 절대 안 나간다
//
// 누가 부르나: 팀장은 누구 것이든, 선생님은 **자기 것만**. 업무보고가 선생님끼리 서로 못 보는 것과 같은 선이다.

import { verifyIdToken, getDoc } from "./_google.js";

const ATTEND = ["출석", "결석", "미정"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 받습니다" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  body = body || {};

  try {
    const claims = await verifyIdToken(body.idToken);
    if (!claims || (claims.role !== "owner" && claims.role !== "teacher")) { res.status(403).json({ error: "선생님만 쓸 수 있습니다" }); return; }
    const tid = String(body.tid || "");
    if (!/^[\w-]{1,60}$/.test(tid)) { res.status(400).json({ error: "선생님이 이상합니다" }); return; }
    if (claims.role !== "owner" && claims.tid !== tid) { res.status(403).json({ error: "자기 출결만 받아 올 수 있습니다" }); return; }

    const qs = rangeQuery(body);
    if (!qs) { res.status(400).json({ error: "날짜가 이상합니다" }); return; }

    const feed = await getDoc("secrets/attend_" + tid);
    if (!feed || !feed.url || !feed.key || feed.off) { res.status(200).json({ none: true }); return; }

    let r;
    try {
      r = await fetch(feed.url + qs, { headers: { "x-report-key": feed.key }, signal: AbortSignal.timeout(10000) });
    } catch (e) {
      res.status(502).json({ error: "출결 앱이 답하지 않았다" }); return;
    }
    // ⚠ 그쪽 오류 본문을 그대로 넘기지 않는다 — 무엇이 섞여 올지 모른다. 번호만.
    if (!r.ok) { res.status(502).json({ error: "출결 앱이 거절했다 (" + r.status + ")" + (r.status === 401 ? " — 열쇠가 바뀌었을 수 있다" : "") }); return; }
    const j = await r.json().catch(() => null);
    if (!j) { res.status(502).json({ error: "출결 앱의 답을 못 읽었다" }); return; }

    res.status(200).json({ source: String(feed.name || ""), days: normDays(j) });
  } catch (e) {
    console.error("[attend]", e.message);
    res.status(500).json({ error: "서버 오류: " + e.message });
  }
}

// ?date= 하루, ?from=&to= 구간. 그쪽 한도가 31일이라 여기서도 막는다(넘기면 그쪽이 뭐라 할지 모른다).
export function rangeQuery(body) {
  if (body.date) return YMD.test(body.date) ? "?date=" + body.date : "";
  if (!YMD.test(body.from || "") || !YMD.test(body.to || "") || body.from > body.to) return "";
  const span = (Date.parse(body.to) - Date.parse(body.from)) / 86400000;
  return span <= 30 ? "?from=" + body.from + "&to=" + body.to : "";
}

// 하루짜리·구간짜리를 한 모양으로. 칸도 걸러서 **아는 것만** 넘긴다.
export function normDays(j) {
  const days = Array.isArray(j.days) ? j.days : [{ date: j.date, students: j.students }];
  return days.filter((d) => d && YMD.test(String(d.date || ""))).map((d) => ({
    date: d.date,
    students: (Array.isArray(d.students) ? d.students : []).filter((s) => s && String(s.name || "").trim()).map((s) => ({
      name: String(s.name).trim().slice(0, 40),
      // 모르는 값은 «미정» — 결석으로 읽으면 안 된다
      attend: ATTEND.indexOf(s.attend) >= 0 ? s.attend : "미정",
      contacted: s.contacted === true,
      note: String(s.note == null ? "" : s.note).trim().slice(0, 300),
      score: typeof s.score === "number" && isFinite(s.score) ? s.score : null,
    })),
  }));
}
