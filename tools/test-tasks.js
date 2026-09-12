// 팀 할 일 — «내 것» 을 가리는 법과 «자기 체크».
//
// 2026-09-06 팀으로 쓰려고 넣은 것이다. 앱은 선생님을 **읽기만** 으로 들인다(test-ro.js).
// 그런데 팀 할 일은 «누가 끝냈나» 가 있어야 돌아간다 — 그래서 딱 한 자리,
// `marks/<자기 tid>` 만 선생님이 쓴다. 여기가 새는지, 남의 일을 떠안지는 않는지 본다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 프로토타입이 있는 가짜 Firestore — guardWrites 가 진짜처럼 가로챌 수 있어야 한다
const WROTE = [];
let FAIL_WRITE = false;
function DocumentReference(path) { this.path = path; }
DocumentReference.prototype.set = function (v) {
  if (FAIL_WRITE) return Promise.reject(new Error("규칙이 막았다"));
  WROTE.push({ path: this.path, v: v }); return Promise.resolve();
};
DocumentReference.prototype.update = function () { WROTE.push({ path: this.path }); return Promise.resolve(); };
DocumentReference.prototype.delete = function () { WROTE.push({ path: this.path }); return Promise.resolve(); };
DocumentReference.prototype.get = function () { return Promise.resolve({ exists: false }); };
function CollectionReference(name) { this.name = name; }
CollectionReference.prototype.doc = function (id) { return new DocumentReference(this.name + "/" + id); };
CollectionReference.prototype.get = function () { return Promise.resolve({ forEach() {} }); };
CollectionReference.prototype.add = function () { WROTE.push({ path: this.name }); return Promise.resolve(); };
function WriteBatch() {}
WriteBatch.prototype.commit = function () { return Promise.resolve(); };
const firestoreFn = function () { return { collection: (n) => new CollectionReference(n), batch: () => new WriteBatch() }; };
firestoreFn.DocumentReference = DocumentReference;
firestoreFn.CollectionReference = CollectionReference;
firestoreFn.WriteBatch = WriteBatch;

function el() {
  const o = { innerHTML: "", textContent: "", value: "", disabled: false, hidden: false, scrollTop: 0, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, onclick: null,
    addEventListener() {}, focus() {}, getAttribute: () => "", hasAttribute: () => false, setAttribute() {},
    querySelector: () => o, querySelectorAll: () => [], closest: () => o };
  return o;
}
const stub = {
  firebase: { initializeApp: () => ({}), firestore: firestoreFn,
    auth: () => ({ onAuthStateChanged() {}, currentUser: null, signOut: () => Promise.resolve() }) },
  document: { querySelector: () => el(), querySelectorAll: () => [], addEventListener() {} },
  window: { addEventListener() {}, scrollTo() {}, scrollY: 0 },
  location: { hash: "" }, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {} },
  fetch: () => Promise.reject(new Error("no net")), alert() {}, confirm: () => true, prompt: () => null,
  console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt,
};
const ctx = vm.createContext(stub);
vm.runInContext(src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
// undefined 는 JSON 이 아니다 — 없는 칸을 볼 때마다 터지므로 null 로 받는다
const val = (expr) => JSON.parse(vm.runInContext("JSON.stringify(" + expr + ") || 'null'", ctx));

// 볼트 명단 그대로 — 고1은 한민수·이창혁A, 예비고1은 이현우·정찬준·박준성.
// 이창혁A 는 두 학년을 다 맡는다(여기가 늘 함정이다).
run(`
  S.teachers = [
    { tid:"T1", name:"한민수",  classIds:["c1"], role:"owner" },
    { tid:"T2", name:"이창혁A", classIds:["c1t","c0s"] },
    { tid:"T3", name:"이현우",  classIds:["c0s2"] },
    { tid:"T4", name:"정찬준",  classIds:["c0t"] },
    { tid:"T9", name:"새선생",  classIds:[] }   // 아직 반이 없는 사람
  ];
  S.classes = [
    { id:"c1",   name:"고1S (201호)" }, { id:"c1t", name:"고1T (402호)" },
    { id:"c0s",  name:"예비고1S 월금" }, { id:"c0s2", name:"예비고1S 화목" },
    { id:"c0t",  name:"예비고1T 화목" }
  ];
  S.claims = { tid:"T1", name:"한민수", role:"owner" }; S.ro = false;
  S.marks = {};
`);

// ---- 담당 글자가 누구를 가리키나 ----
const isFor = (who, name) => vm.runInContext(
  "taskIsFor({ id:'x', who:" + JSON.stringify(who) + " }, " + JSON.stringify(name) + ")", ctx);

ok("이름이 적혀 있으면 그 사람", isFor("한민수", "한민수"));
ok("여럿 중 하나여도 그 사람", isFor("한민수 · 김재헌 실장", "한민수"));
ok("남의 이름은 아니다", !isFor("이현우 · 정찬준", "한민수"));
ok("담당이 비면 아무도 아니다", !isFor("", "한민수"));
ok("«전원» 은 모두", isFor("전원", "한민수") && isFor("전원", "이현우"));
ok("«담임 전원» 은 반이 있는 사람", isFor("담임 전원", "한민수"));
ok("반이 없으면 «담임 전원» 이 아니다", !isFor("담임 전원", "새선생"), "반이 없으면 담임이 아니다");
ok("«고등부» 는 팀원 모두", isFor("고등부", "정찬준"));
ok("팀 밖 사람에게는 «고등부» 도 아니다", !isFor("고등부", "김효상"));

// ⚠ 여기가 진짜 함정이다 — 그냥 찾으면 «예비고1 담당» 안의 «고1 담당» 이 걸린다
ok("고1 선생님은 «예비고1 담당 강사» 가 아니다", !isFor("예비고1 담당 강사", "한민수"));
ok("예비고1 선생님은 «예비고1 담당 강사» 다", isFor("예비고1 담당 강사", "이현우"));
ok("두 학년을 맡으면 둘 다 걸린다",
  isFor("예비고1 담당 강사", "이창혁A") && isFor("고1 담당", "이창혁A"));
// «담임 전원» 안에 «전원» 이 들어 있다. 앞 글자를 안 보면 반 없는 사람까지 걸린다
ok("«담임 전원» 을 «전원» 으로 읽지 않는다", !isFor("담임 전원", "새선생"));
// 이름이 남의 이름에 묻혀 있는 경우 — «이창혁A» 와 «이창혁»
ok("긴 이름 속의 짧은 이름은 아니다", !isFor("이창혁A", "이창혁"), "명단 표기는 이창혁A 다");

// ---- 몇 명이 걸렸나 ----
run(`S.tasks = [
  { id:"a", text:"올케어 미작성 확인", who:"담임 전원", status:"open" },
  { id:"b", text:"이번 주 업무 정리",   who:"한민수",   status:"open" },
  { id:"c", text:"유튜브 촬영",        who:"예비고1 담당 강사", status:"open" },
  { id:"d", text:"편제표 서초",        who:"김효상",   status:"open" }
];`);
const tids = (id) => val("taskTids(S.tasks.filter(function(t){return t.id==='" + id + "'})[0])");
ok("«담임 전원» 은 반 있는 넷", tids("a").join(",") === "T1,T2,T3,T4", tids("a").join(","));
ok("이름 하나면 한 명", tids("b").join(",") === "T1");
ok("«예비고1 담당 강사» 는 셋", tids("c").join(",") === "T2,T3,T4", tids("c").join(","));
ok("팀 밖 사람 것은 아무도 안 걸린다", tids("d").length === 0);

// ---- 내 것 거르기 ----
ok("내 것 칩이 내 줄만 남긴다",
  val("S.tasks.filter(function(t){ return taskMatchesWho(t, MINE) }).map(function(t){return t.id})").join(",") === "a,b",
  val("S.tasks.filter(function(t){ return taskMatchesWho(t, MINE) }).map(function(t){return t.id})").join(","));
ok("이름이 적힌 줄은 그 사람 칩에", val("S.tasks.filter(function(t){ return taskMatchesWho(t,'김효상') }).length") === 1);
ok("아무것도 안 고르면 전부", val("S.tasks.filter(function(t){ return taskMatchesWho(t,'') }).length") === 4);

// ---- 담당 칩 (2026-09-08) ----
// 마왕님 말씀 — «전원은 그냥 각자 모두에게 들어가는 것으로, 고등부도 모두 들어가는 것으로».
// 예전에는 담당 글자를 그대로 찾아서, «전원» 으로 걸린 일이 아무의 칩에도 안 나왔다.
const chipHas = (who, id) => val("S.tasks.filter(function(t){ return taskMatchesWho(t," + JSON.stringify(who) + ") }).map(function(t){return t.id})").indexOf(id) >= 0;
run(`S.tasks = [
  { id:"p", text:"이름으로 걸린 것", who:"이현우",        status:"open" },
  { id:"q", text:"전원",           who:"전원",          status:"open" },
  { id:"r", text:"고등부",         who:"고등부",        status:"open" },
  { id:"u", text:"담임 전원",       who:"담임 전원",      status:"open" },
  { id:"v", text:"남의 것",         who:"정찬준",        status:"open" }
];`);
ok("이름으로 걸린 것은 그 사람 칩에", chipHas("이현우", "p"));
ok("«전원» 은 각자 모두에게 들어간다", chipHas("이현우", "q") && chipHas("정찬준", "q"));
ok("«고등부» 도 모두에게 들어간다", chipHas("이현우", "r") && chipHas("정찬준", "r"));
ok("«담임 전원» 은 반이 있는 사람에게만", chipHas("이현우", "u") && !chipHas("새선생", "u"));
ok("남의 이름으로 걸린 것은 안 들어간다", !chipHas("이현우", "v"));

// 칩에 세우는 사람은 다섯. 할 일에 적힌 담당 글자를 전부 세우면 스물넷이 되어 아무도 안 누른다.
ok("칩은 지정한 다섯 명뿐", val("whoChips()").join(",") === "이창혁A,이승엽,박준성,정찬준,이현우", val("whoChips()").join(","));
ok("회의록에서 굴러온 말은 칩이 안 된다", (() => {
  run(`S.tasks = S.tasks.concat([{ id:"w", text:"희망자", who:"희망자 · 해당 반 담당", status:"open" }])`);
  return val("whoChips()").join(",").indexOf("희망자") < 0;
})());
// 담당을 **적을 때** 뜨는 추천은 좁히지 않는다 — 칩에 없는 것도 골라야 한다
ok("적을 때 추천에는 «전원» 도 한민수도 있다",
  val("whoOptions()").indexOf("전원") >= 0 && val("whoOptions()").indexOf("한민수") >= 0,
  val("whoOptions()").join(","));

// 아래 시험들이 쓰는 목록으로 되돌린다
run(`S.tasks = [
  { id:"a", text:"올케어 미작성 확인", who:"담임 전원", status:"open" },
  { id:"b", text:"이번 주 업무 정리",   who:"한민수",   status:"open" },
  { id:"c", text:"유튜브 촬영",        who:"예비고1 담당 강사", status:"open" },
  { id:"d", text:"편제표 서초",        who:"김효상",   status:"open" }
];`);

// ---- 강사가 봐도 되는 할 일인가 ----
// **출처(어느 회의)가 아니라 담당(누가 하나)으로 가른다.**
// 간부회의에서 나와도 담당이 «전원» 이면 강사 일이고, 전체회의에서 나와도 팀장 혼자 것이면 아니다.
run(`S.tasks = S.tasks.concat([
  { id:"e", text:"한 달치 업무 계획",   who:"한민수", src:"간부", status:"open" },
  { id:"f", text:"생각나는 것 카톡에",  who:"전원",   src:"간부", status:"open" },
  { id:"g", text:"라이브클래스",       who:"한민수 · 이창혁B", src:"간부", status:"open" },
  { id:"h", text:"담당 아직 없음",      who:"",      src:"간부", status:"open" }
]);`);
const shared = (id) => vm.runInContext("taskShared(S.tasks.filter(function(t){return t.id==='" + id + "'})[0])", ctx);
ok("«전원» 은 공개 (간부회의에서 나왔어도)", shared("f"));
ok("«담임 전원» 도 공개", shared("a"));
ok("강사 이름이 들어간 것도 공개", shared("c"));
ok("팀장 혼자 것은 팀장만 (전체회의에서 나왔어도)", !shared("b"), "b = 이번 주 업무 정리 / 한민수");
ok("팀장 혼자 것은 팀장만 2", !shared("e"));
ok("담당이 비면 팀장만 (아직 아무에게도 안 시켰다)", !shared("h"));
ok("팀 밖 사람 것은 팀장만", !shared("d"), "d = 편제표 서초 / 김효상");
// ⚠ 이창혁B 는 중등관 사람이다. 우리 이창혁A 와 다르다 — 이름이 닮았다고 공개되면 안 된다
ok("이름이 닮은 팀 밖 사람에게 속지 않는다", !shared("g"), "이창혁B 는 우리 팀이 아니다");


(async () => {
  // ---- 자기 체크를 적는다 ----
  await run("return toggleMyMark('a')");
  ok("내 문서에 적는다", WROTE.length === 1 && WROTE[0].path === "marks/T1", JSON.stringify(WROTE));
  ok("표시한 날이 함께 적힌다", !!val("S.marks.T1.done.a") && val("S.marks.T1.done.a") === val("TODAY"));
  ok("누구인지도 적는다 (팀장이 이름으로 본다)", val("S.marks.T1.name") === "한민수");
  await run("return toggleMyMark('a')");
  ok("다시 누르면 지워진다", !val("S.marks.T1.done.a"), JSON.stringify(val("S.marks.T1")));

  // ⚠ 못 썼는데 화면만 바뀌면 «했다고 했는데 팀장에게는 안 보인다» 가 된다
  FAIL_WRITE = true;
  let msg = "";
  try { await run("return toggleMyMark('b')"); } catch (e) { msg = e.message; }
  FAIL_WRITE = false;
  ok("저장에 실패하면 되돌린다", msg === "규칙이 막았다" && !val("S.marks.T1 && S.marks.T1.done.b"),
    msg + " / " + JSON.stringify(val("S.marks.T1 || null")));

  // ---- 저장은 문서 둘로 갈린다 ----
  // ⚠ 한 문서 안의 배열은 규칙이 못 가른다. 화면에서만 거르면 선생님이 콘솔에서 통째로 읽는다.
  WROTE.length = 0;
  run("S.teamOk = true; S.ro = false;");
  await run("return saveTasks()");
  const paths = WROTE.map((w) => w.path);
  ok("공개분과 팀장 전용을 따로 쓴다", paths.join(",") === "dash/tasks,dash/tasksLead", paths.join(","));
  const openIds = (WROTE[0].v.items || []).map((t) => t.id);
  const leadIds = (WROTE[1].v.items || []).map((t) => t.id);
  ok("공개분에는 강사가 걸린 것만", openIds.sort().join(",") === "a,c,f", openIds.join(","));
  ok("팀장 전용에는 나머지", leadIds.sort().join(",") === "b,d,e,g,h", leadIds.join(","));
  ok("하나도 잃어버리지 않는다", openIds.length + leadIds.length === val("S.tasks.length"),
    openIds.length + "+" + leadIds.length + " vs " + val("S.tasks.length"));
  ok("같은 할 일이 양쪽에 들어가지 않는다", !openIds.some((x) => leadIds.indexOf(x) >= 0));

  // ---- 선생님 계정 ----
  // 읽기 계정은 모든 쓰기가 막힌다. 오직 «내 완료» 만 그 문을 지나간다.
  run(`S.claims = { tid:"T3", name:"이현우", role:"teacher" }; S.ro = true; S.marks = {};`);
  const tryW = async (code) => { try { await run(code); return "ok"; } catch (e) { return e.message; } };
  const RO_MSG = run("return RO_MSG");
  ok("선생님의 공용 목록 저장은 그대로 막힌다", (await tryW("return saveTasks()")) === RO_MSG || !val("S.teamOk"),
    await tryW("return saveTasks()"));
  ok("선생님도 자기 체크는 된다", (await tryW("return toggleMyMark('a')")) === "ok");
  ok("자기 문서에만 갔다", WROTE[WROTE.length - 1].path === "marks/T3", WROTE[WROTE.length - 1].path);
  // 문이 열린 채 남으면 그 뒤 아무 쓰기나 통과한다 — 그게 제일 무서운 실패다
  ok("체크가 끝나면 문이 다시 닫힌다", run("return RO_PASS") === false);
  ok("문이 닫혔으니 다른 쓰기는 여전히 막힌다",
    (await tryW("return tdb.collection('dash').doc('tasks').set({a:1})")) === RO_MSG);
  ok("남의 체크 문서도 앱에서는 못 쓴다",
    (await tryW("return tdb.collection('marks').doc('T1').set({done:{}})")) === RO_MSG);

  // ---- 줄에 그려지는 것 ----
  run(`S.marks = { T2:{ done:{ c:"2026-09-05" }, name:"이창혁A" }, T3:{ done:{ c:"2026-09-06" }, name:"이현우" } };`);
  const pill = (id) => run("return markPill(S.tasks.filter(function(t){return t.id==='" + id + "'})[0])");
  ok("여럿이 걸린 줄은 «몇/몇»", pill("c").indexOf(">2/3<") >= 0, pill("c"));
  ok("남은 사람을 말해 준다", pill("c").indexOf("남은 사람: 정찬준") >= 0, pill("c"));
  ok("아무도 안 한 줄은 0", pill("a").indexOf(">0/4<") >= 0, pill("a"));
  ok("혼자 하는 줄은 «몇/몇» 이 안 나온다", pill("b") === "", pill("b"));
  run(`S.marks.T1 = { done:{ b:"2026-09-06" }, name:"한민수" };`);
  ok("혼자 하는 줄은 다 하면 이름으로", pill("b").indexOf("✓ 한민수") >= 0, pill("b"));

  const btn = (id) => run("return myMarkBtn(S.tasks.filter(function(t){return t.id==='" + id + "'})[0])");
  ok("내 줄에는 단추가 있다", btn("c").indexOf("data-mk=\"c\"") >= 0, btn("c"));
  ok("이미 한 줄은 «내가 함»", btn("c").indexOf("내가 함") >= 0, btn("c"));
  ok("남의 줄에는 단추가 없다", btn("b") === "");
  // ⚠ 이 단추는 읽기 계정도 눌러야 한다. data-keep 이 없으면 applyReadOnly 가 «완료»·«✓» 를 보고 감춘다
  ok("읽기 계정에서도 안 감춰지게 표를 붙인다", btn("c").indexOf("data-keep") >= 0, btn("c"));
  run(`S.tasks.push({ id:"z", text:"끝난 것", who:"이현우", status:"done" });`);
  ok("팀장이 완료로 바꾼 줄에는 단추가 없다", btn("z") === "", btn("z"));

  // ---- 회의록에서 할 일 끌어오기 ----
  // 볼트 회의록의 «## 할 일» 표를 그대로 읽는다. 실제 회의록 생김새로 시험한다 —
  // 표 앞에 산문 한 줄이 있고, 다음 «## » 에서 끊겨야 한다.
  const MD = [
    "## 지난 회의에서 넘어온 것", "", "없음.", "",
    "## 할 일", "", "[[할 일 추적]]에 옮겼다.", "",
    "| 할 일 | 담당 | 기한 |",
    "|---|---|---|",
    "| 고등관 회의 진행 | 고등부 (한민수 진행) | 9/4 (목) |",
    "| 9월 CLT 실시 | 고등부 | 9월 |",
    "| 담당 없는 일 | | |",
    "",
    "## 정해야 할 것", "",
    "| 이건 할 일이 아니다 | 아무개 | 9/9 |",
  ].join("\n");
  run(`S.ro = false; S.minutes = [{ id:"2026-08-31 간부 전체회의", title:"2026-08-31 간부 전체회의", md:` +
      JSON.stringify(MD) + ` }]; S.config = { sources:{} }; S.tasks = [];`);

  const sec = run("return mdSection(S.minutes[0].md, '할 일')");
  ok("«## 할 일» 다음 제목에서 끊는다", sec.indexOf("고등관 회의") >= 0 && sec.indexOf("이건 할 일이 아니다") < 0, sec.slice(-60));
  ok("앞 절은 안 딸려온다", sec.indexOf("지난 회의") < 0);

  const rows0 = JSON.parse(vm.runInContext("JSON.stringify(minuteTasks(S.minutes[0]))", ctx));
  ok("표에서 세 줄을 읽는다", rows0.length === 3, JSON.stringify(rows0.map((r) => r.text)));
  ok("머리글·구분선·산문은 안 읽는다", !rows0.some((r) => /^-+$/.test(r.text) || r.text === "할 일" || r.text.indexOf("옮겼다") >= 0));
  ok("담당을 읽는다", rows0[0].who === "고등부 (한민수 진행)", rows0[0].who);
  ok("기한 글자를 날짜로", rows0[0].due === "2026-09-04", rows0[0].due + " / " + rows0[0].dueText);
  ok("못 읽는 기한은 글자를 그대로", rows0[1].due === "9월", rows0[1].due);
  ok("담당이 비어도 줄은 살린다", rows0[2].text === "담당 없는 일" && rows0[2].who === "");
  ok("어느 회의에서 왔는지 붙는다", rows0[0].from === "2026-08-31 간부 전체회의" && rows0[0].src.indexOf("간부") >= 0);

  const news = () => JSON.parse(vm.runInContext("JSON.stringify(newFromMinutes().map(function(r){return r.text}))", ctx));
  ok("아직 안 들어온 것이 셋", news().length === 3, news().join(","));
  run(`S.tasks = [{ id:"x", text:"9월 CLT 실시", who:"고등부", status:"open" }];`);
  ok("이미 있는 것은 빠진다", news().join(",") === "고등관 회의 진행,담당 없는 일", news().join(","));

  // ⚠ 선생님은 할 일을 못 쓴다. 이 기능은 통째로 팀장 것이다 —
  //   선생님 화면에 «넣기» 단추가 뜨면 눌러도 거절만 당한다.
  run("S.ro = true");
  ok("선생님에게는 아무것도 안 뜬다", news().length === 0);
  ok("선생님에게는 상자도 안 그린다", run("return fromMinutesBox()") === "");
  run("S.ro = false");
  // 회의록을 아직 안 받아왔으면 조용히 아무것도 안 한다
  run("S.__m = S.minutes; S.minutes = null;");
  ok("회의록이 없으면 빈 손", news().length === 0);
  run("S.minutes = S.__m;");

  // ---- 넣기 ----
  WROTE.length = 0;
  run("S.teamOk = true");
  await run("return addFromMinutes(newFromMinutes())");
  ok("목록에 들어간다", val("S.tasks.length") === 3, String(val("S.tasks.length")));
  ok("출처에 회의록 이름이 남는다",
    val("S.tasks.filter(function(t){return t.text==='고등관 회의 진행'})[0].src").indexOf("간부") >= 0);
  ok("넣으면 저장까지 간다", WROTE.some((w) => w.path === "dash/tasks"), WROTE.map((w) => w.path).join(","));
  ok("넣은 뒤에는 다시 안 올라온다", news().length === 0, news().join(","));

  // ---- 안 넣기 ----
  // ⚠ 기억해 두지 않으면 누를 때마다 도로 올라와서 결국 안내를 통째로 무시하게 된다.
  run(`S.tasks = []; S.config = { sources:{} };`);
  ok("지우면 도로 올라온다", news().length === 3);
  WROTE.length = 0;
  await run("return skipFromMinutes(['2026-08-31 간부 전체회의|담당 없는 일'])");
  ok("«안 넣기» 한 것은 빠진다", news().indexOf("담당 없는 일") < 0 && news().length === 2, news().join(","));
  ok("«안 넣기» 도 저장한다", WROTE.some((w) => w.path === "dash/config"), WROTE.map((w) => w.path).join(","));
  ok("남은 것은 그대로 올라온다", news().indexOf("고등관 회의 진행") >= 0);

  // ---- 각자 적는 할 일 (2026-09-07) ----
  //
  // 선생님도 **자기 할 일**은 직접 적는다. 남의 할 일을 만드는 것은 팀장뿐이다.
  // 문서를 사람마다 하나씩 두는 이유가 그것이다 — 공용 목록에 쓰기를 열면
  // 담당 칸에 아무 이름이나 적어 **남에게 일을 시킬 수 있다.**
  run(`S.claims = { tid:"T3", name:"이현우", role:"teacher" }; S.ro = true;
       S.own = {}; S.tasks = []; S.teamOk = true;`);
  WROTE.length = 0;
  await run(`return (function(){ S.tasks.push({ id:"m1", text:"내가 적은 것", who:"이현우",
    due:"2026-09-10", src:"직접 추가", status:"open", own:"T3" }); return saveTaskOf(S.tasks[0]); })()`);
  ok("선생님이 자기 할 일을 적는다", WROTE.length === 1, JSON.stringify(WROTE.map((w) => w.path)));
  ok("자기 문서에만 간다", WROTE[0].path === "myTasks/T3", WROTE[0].path);
  ok("문은 다시 닫힌다", run("return RO_PASS") === false);
  ok("공용 목록은 여전히 못 쓴다", (await tryW("return saveTasks()")) === RO_MSG);
  ok("남의 칸에는 못 쓴다", (await tryW("return saveOwnTasks('T2')")) === RO_MSG);

  // 담당은 문서 주인에서 다시 만든다 — 자기 칸에 남의 이름을 적어 둬도 소용없다
  run(`S.own = { T3: { name:"이현우", items:[{ id:"m2", text:"남에게 시키려는 것", who:"한민수", status:"open" }] } };
       S.tasks = ownTasks();`);
  ok("자기 칸에 남의 이름을 적어도 자기 것이 된다", val("S.tasks[0].who") === "이현우", val("S.tasks[0].who"));
  ok("어느 칸에서 왔는지 남는다", val("S.tasks[0].own") === "T3");

  // 저장할 때는 표식을 뗀다. 남겨 두면 문서 안에 화면용 값이 쌓인다
  WROTE.length = 0;
  await run("return saveOwnTasks('T3')");
  ok("저장한 것에는 own 표식이 없다", WROTE[0].v.items.every((x) => x.own === undefined), JSON.stringify(WROTE[0].v.items));

  // 손댈 수 있는 줄과 아닌 줄
  run(`S.tasks = [{ id:"m2", text:"내 것", who:"이현우", own:"T3", status:"open" },
                 { id:"s1", text:"팀장이 시킨 것", who:"이현우", status:"open" },
                 { id:"o1", text:"남이 적은 것", who:"정찬준", own:"T4", status:"open" }];`);
  const canEdit = (id) => run("return canEditTask(S.tasks.filter(function(t){return t.id==='" + id + "'})[0])");
  ok("내가 적은 줄은 내가 고친다", canEdit("m2") === true);
  ok("팀장이 시킨 줄은 못 고친다", canEdit("s1") === false);
  ok("남이 적은 줄도 못 고친다", canEdit("o1") === false);
  const row = (id) => run("return taskRow(S.tasks.filter(function(t){return t.id==='" + id + "'})[0])");
  // ⚠ data-keep 이 없으면 applyReadOnly 가 체크칸을 잠근다 — 적어 놓고 못 끄는 목록이 된다
  ok("내 줄의 닫기 칸은 안 잠긴다", row("m2").indexOf('cbox" data-keep') >= 0, row("m2").slice(0, 120));
  ok("내 줄에는 지우기가 있다", row("m2").indexOf('class="x"') >= 0);
  ok("못 고치는 줄에는 지우기가 없다", row("s1").indexOf('class="x"') < 0);
  // 「내 완료」 단추에는 data-keep 이 붙는 게 맞다 — 닫기 칸에만 없어야 한다
  ok("못 고치는 줄의 닫기 칸은 못 누른다", row("s1").indexOf('cbox" disabled') >= 0, row("s1").slice(0, 120));
  // ---- 닫기 칸은 ✕, 내 완료는 ✓ (2026-09-12) ----
  ok("체크칸이 아니라 ✕ 단추다", row("m2").indexOf("checkbox") < 0 && row("m2").indexOf('class="cbox') >= 0);
  ok("닫히기 전에는 빈 칸이다", row("m2").indexOf("✕") < 0, row("m2").slice(0, 120));
  ok("닫으면 ✕ 가 찍힌다",
    run(`var t = S.tasks.filter(function(x){return x.id==="m2";})[0]; var k = t.status; t.status = "done";
         var h = taskRow(t); t.status = k; return h;`).indexOf("✕") >= 0);
  ok("지우기는 ✕ 가 아니다 — 한 줄에 ✕ 가 둘이면 도로 헷갈린다", row("m2").indexOf(">×<") < 0);
  ok("⚠ 매주 하는 일은 닫기 칸을 못 누른다 (날짜마다 달력에서 체크한다)",
    run(`var t = S.tasks.filter(function(x){return x.id==="m2";})[0]; t.repeat = { dow:[0,3] };
         var h = taskRow(t); delete t.repeat; return h;`).indexOf('cbox" disabled') >= 0);
  ok("그래도 «내 완료» 단추는 남는다", row("s1").indexOf("data-mk=") >= 0);
  ok("내가 적은 줄에는 «내 완료» 가 없다 (체크칸으로 끝낸다)",
    run("return myMarkBtn(S.tasks[0])") === "", run("return myMarkBtn(S.tasks[0])"));

  // 팀장은 남의 것도 고친다 — 규칙이 owner 에게는 다 열려 있다
  run(`S.claims = { tid:"T1", name:"한민수", role:"owner" }; S.ro = false;`);
  ok("팀장은 남이 적은 줄도 고친다", canEdit("o1") === true);
  WROTE.length = 0;
  await run("return saveTaskOf(S.tasks.filter(function(t){return t.id==='o1'})[0])");
  ok("팀장이 고쳐도 그 사람 칸에 저장된다", WROTE[0].path === "myTasks/T4", WROTE[0].path);

  // ⚠ 공용 목록에 섞여 들어가면 같은 것이 두 군데 생긴다
  WROTE.length = 0;
  await run("return saveTasks()");
  const teamDoc = WROTE.filter((w) => w.path === "dash/tasks")[0];
  const leadDoc = WROTE.filter((w) => w.path === "dash/tasksLead")[0];
  const inTeam = JSON.stringify((teamDoc ? teamDoc.v.items : []).concat(leadDoc ? leadDoc.v.items : []));
  ok("각자 적은 것은 공용 목록에 안 들어간다", inTeam.indexOf("m2") < 0 && inTeam.indexOf("o1") < 0, inTeam.slice(0, 160));
  ok("팀장이 시킨 것은 그대로 들어간다", inTeam.indexOf("s1") >= 0);

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})();
