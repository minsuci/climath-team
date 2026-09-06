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
    { tid:"T1", name:"한민수",  classIds:["c1"] },
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
ok("담당 칩은 글자로 그대로 거른다", val("S.tasks.filter(function(t){ return taskMatchesWho(t,'김효상') }).length") === 1);
ok("아무것도 안 고르면 전부", val("S.tasks.filter(function(t){ return taskMatchesWho(t,'') }).length") === 4);

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

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})();
