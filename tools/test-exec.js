// 간부회의 준비 (팀장만) — 간부회의에 걸린 할 일과 지난 간부 회의록의 «정해야 할 것»·«다음 회의로» 를 한 화면에.
//
// 여기서 조용히 틀리면 **회의에 빈손으로 간다.** 간부 것이 아닌 줄이 섞이는 것보다
// 간부 것이 빠지는 것이 더 나쁘다 — 빠진 줄은 화면이 말해 주지 않는다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

const EL = {};
function el(id) {
  const o = { id, innerHTML: "", textContent: "", value: "", hidden: false, disabled: false, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getAttribute: (k) => o["_" + k] || "", setAttribute(k, v) { o["_" + k] = v; }, hasAttribute: () => false,
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], onclick: null,
    focus() {}, closest: () => o, scrollIntoView() { o.scrolled = true; } };
  return o;
}
const ctx = vm.createContext({
  console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt,
  firebase: { initializeApp: () => ({}), firestore: () => ({ collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }) }),
    auth: () => ({ onAuthStateChanged() {}, currentUser: null, signOut: () => Promise.resolve() }) },
  document: { querySelector: (s) => (EL[s] = EL[s] || el(s)), querySelectorAll: () => [], addEventListener() {} },
  window: { addEventListener() {}, scrollTo() {} },
  // 브라우저는 replaceState 하면 location.hash 가 따라 바뀐다. 흉내도 그래야 «어디로 갔나» 를 본다.
  location: { hash: "" }, history: { replaceState(a, b, u) { LOC.hash = String(u || ""); } },
  localStorage: { getItem: () => null, setItem() {} },
  MutationObserver: function () { return { observe() {} }; },
  fetch: () => Promise.reject(new Error("no net")), alert() {}, confirm: () => true, prompt: () => null,
});
const LOC = ctx.location;
vm.runInContext(src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const val = (e) => JSON.parse(vm.runInContext("JSON.stringify(" + e + ")", ctx) || "null");

// ---- 다음 회의는 언제인가 — 월 14:00 · 금 15:00 ----
// 2026-09-10 은 목요일. 그 주는 9/7(월) ~ 9/13(일).
const nx = (d) => val('nextExecMeeting("' + d + '")');
ok("목요일이면 이튿날 금요일", nx("2026-09-10").date === "2026-09-11" && nx("2026-09-10").time === "15:00" && nx("2026-09-10").days === 1, JSON.stringify(nx("2026-09-10")));
ok("금요일이면 오늘이다 — 아직 준비할 시간이 있다", nx("2026-09-11").date === "2026-09-11" && nx("2026-09-11").days === 0);
ok("토요일이면 다음 월요일 14:00", nx("2026-09-12").date === "2026-09-14" && nx("2026-09-12").time === "14:00");
ok("일요일도 다음 월요일", nx("2026-09-13").date === "2026-09-14");
ok("월요일이면 오늘", nx("2026-09-14").date === "2026-09-14" && nx("2026-09-14").days === 0);
ok("화요일이면 금요일", nx("2026-09-15").date === "2026-09-18");
ok("날짜가 아니면 null", val('nextExecMeeting("9월")') === null);

// ---- 어느 할 일이 간부회의 것인가 ----
run(`
  TODAY = "2026-09-10";
  S.claims = { tid: "T1", name: "한민수", role: "owner" }; S.ro = false;
  S.teachers = [{ tid: "T1", name: "한민수", role: "owner", classIds: [] }];
  S.minutes = [
    { id: "2026-09-07 간부회의", date: "2026-09-07", title: "2026-09-07 간부회의", kind: "간부회의 (녹음 97분)", open: false,
      md: "# 간부회의\\n\\n## 할 일\\n\\n| 할 일 | 담당 | 기한 |\\n|---|---|---|\\n| 근태 기준 | 한민수 | 이번 주 |\\n\\n## 정해야 할 것\\n\\n- 추석 휴강일이 24·25인지 26까지인지\\n- 저조자 판정 기준\\n\\n## 다음 회의로\\n\\n- 10월 개강 목표\\n" },
    { id: "2026-09-07 고등부 팀회의", date: "2026-09-07", title: "2026-09-07 고등부 팀회의", kind: "고등부 팀회의 (월 10:10)", open: true,
      md: "# 팀회의\\n\\n## 정해야 할 것\\n\\n- 팀회의 것 — 여기 나오면 안 된다\\n" },
    { id: "2026-08-31 간부 전체회의", date: "2026-08-31", title: "2026-08-31 간부 전체회의", kind: "간부 전체회의 (22:36~23:55)", open: false,
      md: "# 간부 전체회의\\n\\n## 다음 회의로\\n\\n- 옛 것 — 최근 것이 아니라 안 나온다\\n" },
    { id: "2026-08-31 데스크 전체회의", date: "2026-08-31", title: "2026-08-31 데스크 전체회의", kind: "데스크 전체회의", open: false, md: "" },
  ];
  S.tasks = [
    { id: "a", text: "근태 기준 만들어 공지", who: "한민수", due: "2026-09-08", status: "open", from: "2026-09-07 간부회의", src: "2026-09-07 간부회의" },
    { id: "b", text: "한 달 그림 보고", who: "한민수", due: "2026-09-11", status: "open", from: "2026-09-07 간부회의", src: "2026-09-07 간부회의" },
    { id: "c", text: "블루프린트 무료 배포", who: "원장 · 한민수", due: "2026-09-20", status: "open", from: "2026-08-31 간부 전체회의", src: "2026-08-31 간부 전체회의" },
    { id: "d", text: "이번 주 업무 정리", who: "간부 (한민수)", due: "", status: "open", src: "대시보드" },
    { id: "e", text: "볼트에서 붙여넣은 것", who: "한민수", due: "9월", dueText: "9월", status: "open", src: "간부 · 9/7" },
    { id: "f", text: "팀회의 것", who: "이창혁A", due: "2026-09-11", status: "open", from: "2026-09-07 고등부 팀회의", src: "2026-09-07 고등부 팀회의" },
    { id: "g", text: "데스크 것", who: "데스크", due: "2026-09-11", status: "open", from: "2026-08-31 데스크 전체회의", src: "2026-08-31 데스크 전체회의" },
    { id: "h", text: "끝낸 간부 일", who: "한민수", due: "2026-09-04", status: "done", done: "2026-09-07", from: "2026-08-31 간부 전체회의", src: "2026-08-31 간부 전체회의" },
    { id: "i", text: "내가 적은 것", who: "한민수", due: "2026-09-11", status: "open", own: "T1", src: "직접 추가" },
    { id: "j", text: "회의록이 아직 안 온 간부 것", who: "한민수", due: "2026-09-25", status: "open", from: "2026-09-14 간부회의", src: "2026-09-14 간부회의" },
  ];
`);
const ids = (e) => val(e).map((t) => t.id).join(",");
ok("간부 회의록에서 온 것은 들어간다", ids("execTasks()").indexOf("a") >= 0 && ids("execTasks()").indexOf("b") >= 0 && ids("execTasks()").indexOf("c") >= 0);
ok("담당이 «간부 (한민수)» 여도 들어간다", ids("execTasks()").indexOf("d") >= 0);
ok("볼트에서 붙여넣은 «간부 · 9/7» 도 들어간다", ids("execTasks()").indexOf("e") >= 0);
ok("팀회의에서 온 것은 안 들어간다", ids("execTasks()").indexOf("f") < 0);
// 데스크 회의록은 «공개: 간부»(팀장만 봄)이지만 간부회의가 아니다 — 남의 것이 우리 관에 닿는 것일 뿐
ok("데스크 회의에서 온 것은 안 들어간다", ids("execTasks()").indexOf("g") < 0);
ok("내가 적은 개인 할 일은 안 들어간다", ids("execTasks()").indexOf("i") < 0);
ok("끝낸 것도 모은다 (아래 «끝낸 것» 으로 간다)", ids("execTasks()").indexOf("h") >= 0);
ok("회의록이 아직 안 올라온 간부 것도 id 글자로 잡는다", ids("execTasks()").indexOf("j") >= 0);
ok("왜 들어왔는지 말한다", val('execWhy(S.tasks[0])') === "간부 회의록" && val('execWhy(S.tasks[3])') === "담당이 간부" && val('execWhy(S.tasks[4])') === "출처가 간부");
ok("아닌 것은 빈 글자", val('execWhy(S.tasks[5])') === "" && val('execWhy(S.tasks[8])') === "");

// ---- 다음 회의를 기준으로 가른다 (오늘 9/10 목 → 다음 회의 9/11 금) ----
const g = val("execSplit(execTasks(), nextExecMeeting(TODAY))");
const gid = (k) => g[k].map((t) => t.id).join(",");
ok("기한 지난 것", gid("late") === "a", gid("late"));
ok("이번 회의까지 — 회의 당일까지 포함", gid("now") === "b", gid("now"));
ok("그 뒤 — 기한순", gid("later") === "c,j", gid("later"));
ok("기한 없는 것 — 빈 것과 «9월» 같은 글자", gid("nodue") === "d,e", gid("nodue"));
ok("끝낸 것은 따로", gid("done") === "h", gid("done"));
ok("회의를 모르면 오늘까지가 «이번 회의까지»", val("execSplit(execTasks(), null)").now.length === 0 && val("execSplit(execTasks(), null)").later.map((t) => t.id).join(",") === "b,c,j");

// ---- 지난 간부회의에서 넘어오는 것 ----
const c = val("execCarry()");
ok("가장 최근 간부 회의록을 고른다 (팀회의는 더 새것이어도 아니다)", c.minute.id === "2026-09-07 간부회의", c.minute.id);
ok("«정해야 할 것» 을 그대로 든다", c.decide.indexOf("추석 휴강일") >= 0 && c.decide.indexOf("팀회의 것") < 0);
ok("«다음 회의로» 를 그대로 든다", c.next.indexOf("10월 개강 목표") >= 0 && c.next.indexOf("옛 것") < 0);
ok("항목 수를 센다", c.decideN === 2 && c.nextN === 1, c.decideN + "/" + c.nextN);
ok("간부 회의록이 없으면 null", (() => { run(`S._m = S.minutes; S.minutes = S.minutes.filter(function (m) { return !isExecMinute(m); });`); const r = val("execCarry()"); run(`S.minutes = S._m;`); return r === null; })());
ok("데스크 회의록은 간부 회의록이 아니다", val('isExecMinute(S.minutes[3])') === false && val('isExecMinute(S.minutes[0])') === true && val('isExecMinute(S.minutes[2])') === true);

// ---- 화면 ----
run(`renderExec();`);
const html = EL["#sec-exec"].innerHTML;
ok("팀장 화면에 그려진다", html.indexOf("간부회의 준비") >= 0);
ok("다음 회의를 머리에 적는다", html.indexOf("다음 회의 9/11(금) 15:00 · D-1") >= 0, html.slice(0, 160));
ok("숫자 상자 — 기한 지남 1 · 이번 회의까지 1 · 정해야 할 것 2 · 넘어오는 안건 1",
  /<b>1<\/b><span>기한 지남/.test(html) && /<b>1<\/b><span>이번 회의까지/.test(html) && /<b>2<\/b><span>정해야 할 것/.test(html) && /<b>1<\/b><span>넘어오는 안건/.test(html));
ok("팀회의·데스크 줄은 화면에 없다", html.indexOf("팀회의 것") < 0 && html.indexOf("데스크 것") < 0);
ok("«정해야 할 것» 본문이 뜬다", html.indexOf("추석 휴강일") >= 0);
ok("끝낸 것은 접혀 있다", html.indexOf("<details") >= 0 && html.indexOf("끝낸 간부 일") >= 0);
ok("출처가 여럿이면 출처 칩이 선다", html.indexOf('data-exfrom="2026-09-07 간부회의"') >= 0);
ok("div 를 다 닫는다", (html.match(/<div/g) || []).length === (html.match(/<\/div>/g) || []).length);
ok("메뉴 숫자는 지난 것 + 이번 회의까지", String(EL["#nb-exec"].textContent) === "2", String(EL["#nb-exec"].textContent));
// 출처 칩으로 거른다
run(`S.execFrom = "2026-08-31 간부 전체회의"; renderExec();`);
ok("출처 칩을 누르면 그 회의록 것만", EL["#sec-exec"].innerHTML.indexOf("한 달 그림 보고") < 0 && EL["#sec-exec"].innerHTML.indexOf("블루프린트") >= 0);
run(`S.execFrom = "";`);
// 선생님 계정
ok("선생님 계정으로는 그리지 않는다", (() => { run(`S.ro = true; EL_MARK = 1;`); EL["#sec-exec"].innerHTML = "지운다"; run(`renderExec();`); const r = EL["#sec-exec"].innerHTML === "지운다"; run(`S.ro = false;`); return r; })());
// 회의록이 아직 안 왔을 때
ok("회의록이 안 왔어도 할 일은 그린다", (() => { run(`S._m = S.minutes; S.minutes = null; S.minutesLoading = true; renderExec();`); const h = EL["#sec-exec"].innerHTML; run(`S.minutes = S._m; S.minutesLoading = false;`); return h.indexOf("근태 기준") >= 0 && h.indexOf("읽는 중") >= 0; })());
// 빈 상태
ok("할 일도 회의록도 없으면 안 터진다", (() => { run(`S._t = S.tasks; S._m = S.minutes; S.tasks = []; S.minutes = []; renderExec();`); const h = EL["#sec-exec"].innerHTML; run(`S.tasks = S._t; S.minutes = S._m;`); return h.indexOf("간부 회의록이 아직 없다") >= 0; })());
// 줄을 누르면 할 일로
ok("줄을 누르면 할 일 목록으로 가서 그 줄을 비춘다", (() => { run(`gotoTask("a");`); return LOC.hash === "#tasks" && EL['.task[data-id="a"]'].scrolled === true; })());

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
