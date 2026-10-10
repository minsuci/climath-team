// 예비고1 출결현황 (2026-10-10 원장님 #59 — 박솔 대리에게 넘긴다)
// nas-daily-digest.mjs 의 attendanceOf 를 가짜 팀 DB 로 돌린다.
import { attendanceOf } from "./nas-daily-digest.mjs";

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

const teachers = [
  { tid: "TL", name: "이현우" }, { tid: "TP", name: "박준성" }, { tid: "TB", name: "박리안" },
];
// 10/1 목 · 10/2 금 · 10/3 토 · 10/5 월 · 10/9 금
const rpRoster = { at: "2026-10-10T00:00:00Z", classes: [
  { id: "c1", name: "예비고1S 월금", type: "regular", classDays: [1, 5], endDate: "", tids: ["TL"], roster: [
    { id: "s1", pid: "p1", name: "가나", grade: "중3", school: "대청중", days: [], onlyDays: [], startDate: "", endDate: "" },
    { id: "s2", pid: "p2", name: "다라", grade: "중3", school: "", days: [], onlyDays: [], startDate: "2026-10-05", endDate: "" } ] },
  { id: "g1", name: "개진반 이현우", type: "individual", classDays: [], endDate: "", tids: ["TL"], roster: [
    { id: "g11", pid: "p1", name: "가나", grade: "중3", school: "대청중", days: [4], onlyDays: [], startDate: "", endDate: "" },
    { id: "g12", pid: "p9", name: "고일", grade: "고1", school: "", days: [4], onlyDays: [], startDate: "", endDate: "" } ] },
  { id: "g2", name: "개진반 박준성", type: "individual", classDays: [], endDate: "", tids: ["TP"], roster: [
    { id: "g21", pid: "p3", name: "마바", grade: "중3", school: "", days: [6], onlyDays: [], startDate: "", endDate: "" } ] },
  { id: "g3", name: "개진반 박리안", type: "individual", classDays: [], endDate: "", tids: ["TB"], roster: [
    { id: "g31", pid: "p4", name: "사아", grade: "중3", school: "", days: [4], onlyDays: [], startDate: "", endDate: "" } ] },
] };
const st = (sid, name, att, extra) => Object.assign({ sid, name, att, auto: "결석" }, extra || {});
const reports = {
  TL: {
    "2026-10-01": { date: "2026-10-01", classes: [{ cid: "g1", students: [st("g11", "가나", "출석"), st("g12", "고일", "결석")] }],
                    moves: [{ kind: "add", name: "다라", toCid: "c1", toName: "예비고1S 월금", date: "2026-10-05" }] },
    "2026-10-02": { date: "2026-10-02", classes: [{ cid: "c1", students: [st("s1", "가나", "결석", { makeup: "2026-10-04" })] }] },
    "2026-10-05": { date: "2026-10-05", classes: [{ cid: "c1", students: [st("s1", "가나", "지각"), st("s2", "다라", "")] }] },
    // 10/9 금 — 보고 없음
  },
  TP: {}, TB: {},
};
const data = { teachers, reports, rpLeave: {}, events: [], rpRoster };
const o = attendanceOf(data, "2026-10", "2026-10-09");
const cls = (name) => o.classes.find((c) => c.name === name);
const row = (c, name) => (cls(c) || { rows: [] }).rows.find((r) => r.name === name);

ok("정규반이 개진반보다 먼저", o.classes[0].name === "예비고1S 월금", o.classes.map((c) => c.name).join());
ok("정규반 수업일 — 10/2 · 10/5 · 10/9 (월금)", cls("예비고1S 월금").dates.join() === "2026-10-02,2026-10-05,2026-10-09", cls("예비고1S 월금").dates.join());
const g = row("예비고1S 월금", "가나");
ok("가나 — 결 · 지 · 미보고", g.cells["2026-10-02"] === "결" && g.cells["2026-10-05"] === "지" && g.cells["2026-10-09"] === "미보고", JSON.stringify(g.cells));
ok("보강 메모", g.notes.join() === "10-02 보강 10-04", g.notes.join());
ok("합계 — 수업 3 · 출석 1(지각 포함) · 결석 1 · 확인 1", g.sum.held === 3 && g.sum.att === 1 && g.sum.abs === 1 && g.sum.unknown === 1, JSON.stringify(g.sum));
const d = row("예비고1S 월금", "다라");
ok("등록 전 날은 빈칸, 출결 안 찍은 날은 ?", !("2026-10-02" in d.cells) && d.cells["2026-10-05"] === "?" && d.cells["2026-10-09"] === "미보고", JSON.stringify(d.cells));
ok("개진반은 중3만 — 고1 학생은 안 싣는다", !row("개진반 이현우", "고일") && row("개진반 이현우", "가나").cells["2026-10-01"] === "출");
ok("중등관에 보고하는 요일(박준성 토)은 «밖»", row("개진반 박준성", "마바").cells["2026-10-03"] === "밖" && row("개진반 박준성", "마바").sum.held === 0);
ok("원장님 개진반은 «업무보고 밖» 반", cls("개진반 박리안").outside === true && row("개진반 박리안", "사아").cells["2026-10-01"] === "밖");
ok("명단 변동 — 학생 추가가 실린다", o.moves.length === 1 && o.moves[0].kind === "학생 추가" && o.moves[0].name === "다라" && o.moves[0].date === "2026-10-05", JSON.stringify(o.moves));
ok("까지 — 어제", o.until === "2026-10-09" && o.from === "2026-10-01");

// 학원 쉬는 날(추석)은 수업일에서 빠진다
const o2 = attendanceOf({ ...data, reports: { TL: {}, TP: {}, TB: {} } }, "2026-09", "2026-09-30");
ok("추석 연휴(9/25 금)는 수업일이 아니다", !cls.call(null, "x") && !o2.classes.find((c) => c.name === "예비고1S 월금").dates.includes("2026-09-25"),
   o2.classes.find((c) => c.name === "예비고1S 월금").dates.join());

let threw = "";
try { attendanceOf({ ...data, rpRoster: null }, "2026-10", "2026-10-09"); } catch (e) { threw = e.message; }
ok("명단 사본이 없으면 조용히 빈 표를 내지 않고 멈춘다", /rpRoster/.test(threw), threw);

T.forEach((l) => console.log(l));
const bad = T.filter((l) => l.startsWith("FAIL")).length;
console.log(bad ? "\n" + bad + "개 실패" : "\n모두 통과 (" + T.length + ")");
process.exit(bad ? 1 : 0);
