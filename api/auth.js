// 대시보드 로그인.
//
// PIN은 여기서 대조하지 않는다. 수업관리 앱의 /api/auth 에 그대로 넘겨 확인받는다 —
// 그래야 PIN·시도 제한·선생님 명단이 한 곳(수업관리 앱)에만 있고, 이 앱은 그 서비스 계정 키를
// 복사해 들고 있을 필요가 없다. 앱이 "관리자(owner)"라고 답할 때만 통과시킨다.
//
// 통과하면 토큰 둘을 준다:
//   classToken — 수업관리 앱이 발급한 것. 그 DB를 (그쪽 규칙대로) 읽는 데 쓴다
//   teamToken  — 이 프로젝트(climath-team) 서비스 계정으로 서명. 대시보드 DB에 쓴다
//
// 요청: POST { action: "teachers" }        → 로그인 화면 목록 (앱에 그대로 중계)
//       POST { action: "login", tid, pin }

import { createCustomToken } from "./_google.js";

const CLASS_API = process.env.CLASS_API_URL || "https://climath-class.vercel.app/api/auth";

async function classApi(body) {
  const r = await fetch(CLASS_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, j: j || {} };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 받습니다" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  body = body || {};

  try {
    if (body.action === "teachers") {
      const r = await classApi({ action: "teachers" });
      if (!r.ok) { res.status(r.status).json({ error: r.j.error || "수업관리 앱이 응답하지 않습니다" }); return; }
      res.status(200).json({ teachers: r.j.teachers || [] });
      return;
    }
    if (body.action === "login") {
      const tid = String(body.tid || ""), pin = String(body.pin || "");
      if (!tid || !pin) { res.status(400).json({ error: "입력이 부족합니다" }); return; }
      const r = await classApi({ action: "login", kind: "teacher", tid, pin });
      if (!r.ok) { res.status(r.status).json({ error: r.j.error || ("로그인 실패 (" + r.status + ")") }); return; }
      // 2026-09-05 — 선생님도 들어온다(«전부, 읽기만»). 역할은 앱이 답한 그대로 토큰에 싣는다.
      // 팀 DB 규칙이 role 로 읽기·쓰기를 가르고, 화면은 owner 가 아니면 쓰기를 막는다.
      const role = r.j.role === "owner" ? "owner" : r.j.role === "teacher" ? "teacher" : "";
      if (!role) { res.status(403).json({ error: "선생님 계정만 들어올 수 있습니다" }); return; }
      const teamToken = createCustomToken("t_" + tid, { role, tid, name: String(r.j.name || "") });
      res.status(200).json({ classToken: r.j.token, teamToken, tid, name: r.j.name, role });
      return;
    }
    res.status(400).json({ error: "알 수 없는 요청입니다" });
  } catch (e) {
    console.error("[auth]", e);
    res.status(500).json({ error: "서버 오류: " + e.message });
  }
}
