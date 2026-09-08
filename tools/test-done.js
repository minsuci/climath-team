// 완료 현황 (팀장만) — 강사들이 끝낸 것을 사람별로 모아 본다.
//
// 여기서 조용히 틀리면 **사람을 잘못 본다.** 한 사람의 숫자가 낮게 나오면 안 한 것으로 읽히고,
// 안 한 사람이 목록에서 빠지면 «아무 일도 없었다» 로 읽힌다. 둘 다 화면은 멀쩡하다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 지켜보기를 붙일 수 있는 가짜 — 콜백을 들고 있다가 시험에서 직접 한 번 돌린다
const SNAP = {};
function DocumentReference(path) { this.path = path; }
DocumentReference.prototype.onSnapshot = function (fn) { SNAP[this.path] = fn; return function () {}; };
DocumentReference.prototype.set = function () { return Promise.resolve(); };
DocumentReference.prototype.update = function () { return Promise.resolve(); };
DocumentReference.prototype.delete = function () { return Promise.resolve(); };
DocumentReference.prototype.get = function () { return Promise.resolve({ exists: false }); };
function CollectionReference(name) { this.name = name; }
CollectionReference.prototype.doc = function (id) { return new DocumentReference(this.name + "/" + id); };
CollectionReference.prototype.get = function () { return Promise.resolve({ forEach() {} }); };
CollectionReference.prototype.add = function () { return Promise.resolve(); };
CollectionReference.prototype.onSnapshot = function (fn) { SNAP[this.name] = fn; return function () {}; };
function WriteBatch() {}
WriteBatch.prototype.commit = function () { return Promise.resolve(); };
const firestoreFn = () => ({ collection: (n) => new CollectionReference(n), batch: () => new WriteBatch() });
firestoreFn.DocumentReference = DocumentReference;
firestoreFn.CollectionReference = CollectionReference;
firestoreFn.WriteBatch = WriteBatch;

const EL = {};
function el(id) {
  const o = { id, innerHTML: "", textContent: "", value: "", hidden: false, disabled: false, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getAttribute: (k) => o["_" + k] || "", setAttribute(k, v) { o["_" + k] = v; }, hasAttribute: () => false,
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], onclick: null,
    focus() {}, closest: () => o };
  return o;
}
const ctx = vm.createContext({
  console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt,
  firebase: { initializeApp: () => ({}), firestore: firestoreFn, auth: () => ({ onAuthStateChanged() {}, currentUser: null, signOut: () => Promise.resolve() }) },
  document: { querySelector: (s) => (EL[s] = EL[s] || el(s)), querySelectorAll: () => [], addEventListener() {} },
  window: { addEventListener() {}, scrollTo() {} }, location: { hash: "" }, history: { replaceState() {} },
  localStorage: { getItem: () => null, setItem() {} },
  MutationObserver: function () { return { observe() {} }; },
  fetch: () => Promise.reject(new Error("no net")), alert() {}, confirm: () => true, prompt: () => null,
});
vm.runInContext(src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const val = (e) => JSON.parse(vm.runInContext("JSON.stringify(" + e + ")", ctx) || "null");

// 날짜는 앱이 쓰는 것을 그대로 빌려 쓴다 — 여기서 따로 셈하면 시험이 앱과 다른 달력을 본다
const TODAY = val("TODAY");
const D = (n) => val('addDays(TODAY,' + n + ')');
const THISWEEK = val("weekStart(TODAY)");
const LASTWEEK = val('addDays(weekStart(TODAY),-7)');
const OLD = "2020-01-05";

const setup = () => run(`
  S.claims = { role:"owner", tid:"T1", name:"한민수" }; S.ro = false;
  S.teachers = [
    { tid:"T1", name:"한민수",  classIds:["c1"], role:"owner" },
    { tid:"T2", name:"이창혁A", classIds:["c1"] },
    { tid:"T3", name:"이현우",  classIds:["c2"] },
    { tid:"T4", name:"정찬준",  classIds:["c2"] },
    { tid:"T5", name:"박준성",  classIds:["c2"] },
    { tid:"T6", name:"이승엽",  classIds:["c2"] },
    { tid:"T7", name:"박리안",  classIds:[] }
  ];
  S.classes = [{ id:"c1", name:"고1S" }, { id:"c2", name:"예비고1S" }];
  S.tasksOpen = [
    { id:"a1", text:"올케어 확인",  who:"전원",     status:"open" },
    { id:"a2", text:"CLT 실시",    who:"이창혁A",  status:"open", due:${JSON.stringify(D(-3))} },
    { id:"a3", text:"교재 검수",    who:"이현우",   status:"done", done:${JSON.stringify(THISWEEK)} },
    { id:"a4", text:"팀장이 닫은 것", who:"정찬준", status:"done", done:${JSON.stringify(THISWEEK)} }
  ];
  S.tasksLead = []; S.own = {};
  S.tasks = S.tasksOpen.slice();
  S.marks = {
    T2: { name:"이창혁A", done: { a1: ${JSON.stringify(THISWEEK)} } },
    T3: { name:"이현우",  done: { a3: ${JSON.stringify(THISWEEK)}, "지워진것": ${JSON.stringify(THISWEEK)} } },
    T5: { name:"박준성",  done: { a1: ${JSON.stringify(LASTWEEK)} } },
    T6: { name:"이승엽",  done: { a1: ${JSON.stringify(OLD)} } }
  };
  S.doneRange = "week"; S.doneWho = "";
`);

const rowsBy = () => {
  const r = val("doneRows()");
  const m = {};
  r.forEach((x) => { m[x.name] = x; });
  return { list: r, by: m };
};

// ---- 기간 ----
setup();
ok("이번 주는 월요일부터", val("doneRange().from") === THISWEEK, val("doneRange().from"));
run(`S.doneRange = "last"`);
ok("지난 주는 그 전 이레", val("doneRange().from") === LASTWEEK && val("doneRange().to") === val('addDays(weekStart(TODAY),-1)'));
run(`S.doneRange = "month"`);
ok("이번 달은 1일부터", val("doneRange().from") === TODAY.slice(0, 7) + "-01", val("doneRange().from"));
run(`S.doneRange = "all"`);
ok("«전체» 는 자르지 않는다", val("doneRange().from") === "");
// ⚠ 옛 할 일에는 끝낸 날이 없다. 날짜로만 거르면 어느 기간에도 안 나와 통째로 사라진다
ok("«전체» 에서는 날짜 없는 것도 들어간다", val('inDoneRange("")') === true);
run(`S.doneRange = "week"`);
ok("기간을 고르면 날짜 없는 것은 빠진다", val('inDoneRange("")') === false);

// ---- 무엇을 세나 ----
setup();
{
  const { by } = rowsBy();
  ok("이번 주에 «내 완료» 를 누른 사람이 잡힌다", by["이창혁A"].items.length === 1, JSON.stringify(by["이창혁A"].items));
  ok("지난 주에 누른 것은 이번 주에 안 잡힌다", by["박준성"].items.length === 0);
  // ⚠ 지워진 할 일의 표시가 남아 있을 수 있다. 그 줄을 버리면 «한 것»이 조용히 줄어든다
  ok("지워진 할 일의 표시도 센다", by["이현우"].items.length === 2, JSON.stringify(by["이현우"].items.map((x) => x.text)));
  ok("지워진 줄이라고 알려준다", by["이현우"].items.filter((x) => x.gone).length === 1);
}
run(`S.doneRange = "last"`);
ok("지난 주로 바꾸면 그 사람이 나온다", rowsBy().by["박준성"].items.length === 1);
run(`S.doneRange = "all"`);
ok("«전체» 면 옛날 것도 나온다", rowsBy().by["이승엽"].items.length === 1);

// ---- 자기가 적고 자기가 끝낸 것 ----
setup();
run(`S.own = { T4: { name:"정찬준", items: [
  { id:"m1", text:"내 메모 끝냄", status:"done", done:${JSON.stringify(THISWEEK)} },
  { id:"m2", text:"내 메모 남음", status:"open" }
] } }; S.tasks = S.tasksOpen.concat(ownTasks());`);
{
  const { by } = rowsBy();
  ok("자기가 적고 끝낸 것도 센다", by["정찬준"].items.length === 1);
  ok("어느 쪽인지 남는다", by["정찬준"].items[0].kind === "own", by["정찬준"].items[0].kind);
  ok("아직 안 끝낸 내 메모는 «남은 일» 로 센다", by["정찬준"].left.left >= 1, JSON.stringify(by["정찬준"].left));
}

// ---- 0건인 사람도 세운다 ----
// 안 한 사람이 목록에서 사라지면 «아무도 안 했다» 가 «아무 일도 없었다» 처럼 보인다
setup();
{
  const { by, list } = rowsBy();
  ok("이번 주에 아무것도 안 한 사람도 목록에 있다", !!by["정찬준"] && by["정찬준"].items.length === 0);
  ok("담당 칩의 다섯이 다 선다", ["이창혁A", "이승엽", "박준성", "정찬준", "이현우"].every((n) => !!by[n]), list.map((x) => x.name).join(","));
  ok("칩에 없고 한 것도 없는 사람은 안 선다", !by["박리안"], list.map((x) => x.name).join(","));
  ok("많이 한 사람이 위로", list[0].items.length >= list[list.length - 1].items.length);
}

// ---- 남은 일 ----
setup();
{
  const { by } = rowsBy();
  // a1(전원)은 이창혁A 가 이미 눌렀다. a2 는 이창혁A 것이고 기한이 지났다
  ok("이미 표시한 일은 «남은 일» 이 아니다", by["이창혁A"].left.left === 1, JSON.stringify(by["이창혁A"].left));
  ok("기한 지난 것을 따로 센다", by["이창혁A"].left.late === 1, JSON.stringify(by["이창혁A"].left));
  ok("«전원» 은 아직 안 누른 사람에게 남아 있다", by["정찬준"].left.left >= 1, JSON.stringify(by["정찬준"].left));
  // 이현우 에게는 a1(전원)만 남는다. a3 는 그의 일이지만 끝났다 — 세면 2가 된다
  ok("끝난 할 일은 «남은 일» 에 안 들어간다", by["이현우"].left.left === 1, JSON.stringify(by["이현우"].left));
}

// ---- 아무도 안 누른 채 닫힌 것 ----
// 이걸 안 보여주면 사람별 숫자가 «아무도 안 했다» 로 읽힌다 — 실은 팀장이 닫은 것이다
setup();
ok("표시 없이 닫힌 것을 따로 모은다", val("doneQuiet().map(function(t){return t.id})").join(",") === "a4", val("doneQuiet().map(function(t){return t.id})").join(","));
ok("누군가 누른 것은 여기 안 들어간다", val("doneQuiet().map(function(t){return t.id})").indexOf("a3") < 0);
ok("그것은 사람별 숫자에도 안 들어간다", rowsBy().by["정찬준"].items.length === 0);

// ---- 그린 것 ----
setup();
run("renderDone()");
{
  const html = EL["#sec-done"].innerHTML;
  ok("사람 이름이 그려진다", html.indexOf("이창혁A") >= 0);
  ok("한 일이 그려진다", html.indexOf("올케어 확인") >= 0);
  ok("0건인 사람에게는 왜 비었는지 적는다", html.indexOf("이 기간에 끝냈다고 표시한 것이 없다") >= 0);
  ok("표시 없이 닫힌 것은 접어 둔다", html.indexOf("표시 없이 닫힌 팀 할 일") >= 0);
  ok("div 를 다 닫는다", (html.match(/<div/g) || []).length === (html.match(/<\/div>/g) || []).length,
    (html.match(/<div/g) || []).length + " vs " + (html.match(/<\/div>/g) || []).length);
  ok("기간 칩이 넷", (html.match(/data-dnr=/g) || []).length === 4);
  ok("사람 칩에 «모두» 가 있다", html.indexOf('data-dnw=""') >= 0);
}

// 한 사람만 골라 보기 — 사람 칸에만 <h3> 이 있다(접어 둔 상자는 dnp 를 같이 쓴다)
const heads = () => (EL["#sec-done"].innerHTML.match(/<h3>/g) || []).length;
run("renderDone()");
const allHeads = heads();
run(`S.doneWho = "T2"; renderDone()`);
ok("사람을 고르면 그 사람 칸만 남는다", heads() === 1, heads() + " / 모두일 때 " + allHeads);
ok("고른 사람이 맞다", EL["#sec-done"].innerHTML.indexOf("<h3>이창혁A") >= 0);
ok("칩은 그대로 다 남는다 — 고른 뒤에도 남을 고를 수 있어야 한다",
  (EL["#sec-done"].innerHTML.match(/data-dnw=/g) || []).length === allHeads + 1,
  String((EL["#sec-done"].innerHTML.match(/data-dnw=/g) || []).length));
run(`S.doneWho = ""; renderDone()`);
ok("«모두» 로 돌아오면 다시 다 보인다", heads() === allHeads, heads() + " vs " + allHeads);

// ---- 지켜보기 — 강사가 지금 누른 것이 그 자리에서 보인다 ----
// ⚠ 이걸 안 붙이면 완료 현황이 **로그인한 순간 그대로 멈춘다.** 화면은 멀쩡하고 숫자만 옛것이라,
//   팀장은 «이 사람 안 했네» 로 읽는다. 알림에서 이미 한 번 밟은 함정이다.
setup();
run("S.teamOk = true; watchTasks()");
ok("marks 를 지켜본다", typeof SNAP["marks"] === "function", Object.keys(SNAP).join(","));
{
  run("renderDone()");
  const before = (EL["#sec-done"].innerHTML.match(/<h3>정찬준<span class="pill green">/g) || []).length;
  vm.runInContext("SNAPFIRE()", Object.assign(ctx, { SNAPFIRE: () => SNAP["marks"]({
    forEach: (f) => {
      f({ id: "T4", data: () => ({ name: "정찬준", done: { a1: THISWEEK } }) });
    },
  }) }));
  const after = (EL["#sec-done"].innerHTML.match(/<h3>정찬준<span class="pill green">/g) || []).length;
  ok("강사가 방금 누른 것이 그 자리에서 뜬다", before === 0 && after === 1, before + " → " + after);
}

// ---- 자료가 없어도 안 터진다 ----
run(`S.tasks = []; S.tasksOpen = []; S.marks = {}; S.own = {}; S.doneWho = ""; S.doneRange = "week"`);
ok("아무것도 없어도 안 터진다", (() => { try { run("renderDone()"); return true; } catch (e) { return e.message; } })() === true);
ok("빈 화면에도 다섯은 선다", EL["#sec-done"].innerHTML.indexOf("이승엽") >= 0);

// ---- 선생님 화면에는 칸이 아예 없다 ----
{
  const real = ctx.document.querySelector;
  ctx.document.querySelector = () => null;
  let blew = "";
  try { run("renderDone()"); } catch (e) { blew = e.message; }
  ctx.document.querySelector = real;
  ok("그릴 칸이 없으면 조용히 넘어간다", !blew, blew);
}

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
