// 학교 학사일정에서 시험 기간 찾아오기 — **수업관리 앱의 /api/schedule 을 중계한다.**
//
// 그쪽에 이미 나이스 → 학교 홈페이지 → 게시판 첨부문서(→ AI로 날짜 뽑기)까지
// 네 단계 파이프라인이 있다. 여기서 다시 만들 이유가 없고, 만들면 두 벌이 갈린다
// (학교마다 시험을 부르는 말이 다른 규칙이 그쪽에 쌓여 있다).
//
// 왜 브라우저가 직접 안 부르나: 그쪽 엔드포인트에는 CORS 헤더가 없다.
// 앱 코드를 고치지 않기로 했으므로(대시보드는 앱을 안 건드린다) 서버끼리 부른다.
//
// 검사는 두 겹이다:
//   여기서   climath-team 토큰이 owner 인지  (이 대시보드를 쓸 사람인지)
//   저쪽에서 climath-class 토큰이 선생님인지 (그 앱의 자료를 볼 사람인지)
// 그래서 브라우저가 토큰 둘을 함께 보낸다.
//
// 요청: POST { idToken(team), classToken(class), school, from, to, kind }

import { verifyIdToken } from "./_google.js";

const CLASS_URL = process.env.CLASS_SCHEDULE_URL || "https://climath-class.vercel.app/api/schedule";

// 학교 하나가 나이스에 없으면 홈페이지 → 게시판 → 문서까지 뒤져서 20~30초씩 걸린다.
// 중계하는 쪽이 먼저 끊기면 저쪽이 다 해놓은 일이 버려진다.
export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 받습니다" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  body = body || {};

  try {
    const claims = await verifyIdToken(body.idToken);
    if (!claims || claims.role !== "owner") { res.status(403).json({ error: "관리자만 쓸 수 있습니다" }); return; }
    if (!body.classToken) { res.status(400).json({ error: "수업관리 앱 로그인이 풀렸습니다. 새로고침 해주세요" }); return; }

    const r = await fetch(CLASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: body.classToken,
        school: body.school, from: body.from, to: body.to, kind: body.kind || "",
      }),
    });
    let j = null;
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      res.status(r.status).json({ error: (j && j.error) || ("수업관리 앱이 " + r.status + " 로 답했습니다") });
      return;
    }
    res.status(200).json(j || {});
  } catch (e) {
    console.error("[schedule]", e);
    res.status(500).json({ error: "서버 오류: " + e.message });
  }
}
