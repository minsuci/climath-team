// 새로 온 할 일 — 종에 숫자가 맞게 뜨는가, «어디까지 봤나»가 안 날아가는가.
//
// 조용히 틀리기 쉬운 자리다. 기준선을 안 적으면 처음 들어온 사람에게 지난 할 일이 전부 쏟아지고,
// marks 문서를 통째로 갈아치우면 다음에 열 때 또 전부 «새로 옴» 이 된다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 가짜 팀 DB — marks 문서를 실제로 들고 있는다 (set 이 통째로 갈아치우는 것까지 흉내)
const DB = {};
const WRITES = [];
function DocumentReference(path) { this.path = path; }
DocumentReference.prototype.set = function (d) {
  WRITES.push(this.path);
  DB[this.path] = JSON.parse(JSON.stringify(d));   // ⚠ 참조를 그대로 두면 화면 사본과 서버가 같은 것이 되어 없는 버그가 보인다
  return Promise.resolve();
};
DocumentReference.prototype.update = function () { return Promise.resolve(); };
DocumentReference.prototype.delete = function () { return Promise.resolve(); };
DocumentReference.prototype.get = function () {
  const d = DB[this.path];
  return Promise.resolve({ exists: d !== undefined, data: () => d });
};
function CollectionReference(name) { this.name = name; }
CollectionReference.prototype.doc = function (id) { return new DocumentReference(this.name + "/" + id); };
CollectionReference.prototype.get = function () { return Promise.resolve({ forEach() {} }); };
CollectionReference.prototype.where = function () { return { get: () => Promise.resolve({ forEach() {} }) }; };
CollectionReference.prototype.orderBy = function () { return this; };
CollectionReference.prototype.add = function () { return Promise.resolve(); };
function WriteBatch() {}
WriteBatch.prototype.commit = function () { return Promise.resolve(); };
const firestoreFn = () => ({ collection: (n) => new CollectionReference(n), batch: () => new WriteBatch() });
firestoreFn.DocumentReference = DocumentReference;
firestoreFn.CollectionReference = CollectionReference;
firestoreFn.WriteBatch = WriteBatch;

// 화면 흉내 — 종이 그린 HTML 을 잡아둘 만큼만
const EL = {};
function el(id) {
  const o = { id, innerHTML: "", textContent: "", hidden: false, disabled: false, readOnly: false, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getAttribute: () => "", hasAttribute: () => false, setAttribute() {}, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], onclick: null, focus() {}, closest: () => o };
  return o;
}
const PAGES_SEEN = [];
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

const TASKS = `[
  { id:"a1", text:"올케어 시간표 확인", who:"담임 전원", due:"2026-09-10", status:"open" },
  { id:"a2", text:"CLT 실시", who:"고등부", due:"", status:"open" },
  { id:"a3", text:"내 메모", who:"이현우", status:"open", own:"T2" },
  { id:"a4", text:"팀장 몫", who:"한민수", status:"open" }
]`;
const setup = (marks, who) => run(`
  S.teamOk = true;
  S.claims = ${who === "owner" ? `{ role:"owner", tid:"T1", name:"한민수" }` : `{ role:"teacher", tid:"T2", name:"이현우" }`};
  S.ro = ${who === "owner" ? "false" : "true"};
  S.teachers = [{tid:"T1",name:"한민수",role:"owner"},{tid:"T2",name:"이현우",role:"teacher"}];
  S.tasks = ${TASKS};
  S.tasksOpen = ${TASKS}.filter(function(t){ return !t.own; });
  S.tasksLead = []; S.own = {};
  S.marks = ${marks};
  S.newIds = []; S.newSeen = true; S.bellOpen = false;
  MY_NEW = {};
`);

(async () => {
  // ---- 종이 세는 대상 ----
  setup("{}");
  ok("각자 적은 할 일(own)은 종이 안 센다", JSON.stringify(val("bellIds()")) === '["a1","a2","a4"]', JSON.stringify(val("bellIds()")));

  // ---- 처음 들어온 사람 ----
  setup("{}");
  run("initNewTasks()");
  await new Promise((r) => setTimeout(r, 0));
  ok("처음이면 지난 할 일이 쏟아지지 않는다", val("S.newIds").length === 0 && val("S.newSeen") === true);
  ok("대신 기준선을 적어 둔다", JSON.stringify(DB["marks/T2"].seenTasks) === '["a1","a2","a4"]', JSON.stringify(DB["marks/T2"]));

  // ---- 그 뒤에 늘어난 것만 ----
  setup(`{ T2: { done:{}, seenTasks:["a1","a2"] } }`);
  run("initNewTasks()");
  ok("본 뒤에 늘어난 것만 «새로 옴»", JSON.stringify(val("S.newIds")) === '["a4"]', JSON.stringify(val("S.newIds")));
  ok("종에 숫자가 뜬다", val("S.newSeen") === false);
  ok("그 줄만 새것으로 표시된다", run(`return isNewTask({id:"a4"}) && !isNewTask({id:"a1"})`) === true);
  ok("id 가 없는 줄은 새것이 아니다", run(`return isNewTask({text:"x"})`) === false);

  // ---- 할 일 화면을 열면 본 것으로 ----
  WRITES.length = 0;
  run("markTasksSeen()");
  await new Promise((r) => setTimeout(r, 0));
  ok("화면을 열면 종이 꺼진다", val("S.newSeen") === true);
  ok("«새로 옴» 표는 그 판까지 남는다 — 안 그러면 무엇이 새것이었는지 못 본다", JSON.stringify(val("S.newIds")) === '["a4"]');
  ok("본 것으로 적는다", JSON.stringify(DB["marks/T2"].seenTasks) === '["a1","a2","a4"]');
  WRITES.length = 0;
  run("markTasksSeen()");
  ok("이미 본 뒤에는 다시 안 적는다", WRITES.length === 0);

  // ---- 지워진 할 일 id 를 이고 가지 않는다 ----
  setup(`{ T2: { done:{}, seenTasks:["a1","a2","a4","없어진것","또없어진것"] } }`);
  run("initNewTasks(); S.newSeen = false; markTasksSeen()");
  await new Promise((r) => setTimeout(r, 0));
  ok("지금 있는 것만 적는다 (지워진 id 는 뺀다)", JSON.stringify(DB["marks/T2"].seenTasks) === '["a1","a2","a4"]', JSON.stringify(DB["marks/T2"].seenTasks));

  // ---- «내 완료» 가 «어디까지 봤나» 를 지우면 안 된다 (set 은 문서를 통째로 갈아친다) ----
  setup(`{ T2: { done:{}, seenTasks:["a1","a2","a4"] } }`);
  DB["marks/T2"] = { done: {}, seenTasks: ["a1", "a2", "a4"] };
  await run(`return toggleMyMark("a1")`);
  ok("«내 완료» 를 눌러도 seenTasks 가 남는다", JSON.stringify((DB["marks/T2"] || {}).seenTasks) === '["a1","a2","a4"]', JSON.stringify(DB["marks/T2"]));
  ok("완료 표시는 들어갔다", !!(DB["marks/T2"].done || {}).a1);
  run("initNewTasks()");
  ok("그래서 다음에 열어도 전부 «새로 옴» 이 되지 않는다", val("S.newIds").length === 0);

  // ---- 그린 것 ----
  setup(`{ T2: { done:{}, seenTasks:["a1","a2"] } }`);
  run("initNewTasks(); S.bellOpen = true; renderBell()");
  const html = EL["#bell-wrap"].innerHTML;
  ok("종에 숫자가 붙는다", html.indexOf('class="bn"') >= 0 && html.indexOf(">1<") >= 0, html.slice(0, 100));
  ok("펼치면 무엇이 왔는지 나온다", html.indexOf("팀장 몫") >= 0);
  ok("내 것이면 «내 것» 이 붙는다", run(`
    S.tasks[3].who = "이현우"; renderBell();
    return document.querySelector("#bell-wrap").innerHTML.indexOf("내 것") >= 0;
  `) === true);
  ok("종 상자도 div 를 다 닫는다", (html.match(/<div/g) || []).length === (html.match(/<\/div>/g) || []).length);
  run("S.newSeen = true; renderBell()");
  ok("본 뒤에는 숫자가 사라진다", EL["#bell-wrap"].innerHTML.indexOf('class="bn"') < 0);

  // ---- 내가 넣은 줄은 내 종을 안 울린다 (2026-09-08) ----
  // 팀 할 일은 팀장만 넣는다. 이걸 안 빼면 팀장이 할 일을 넣을 때마다 자기 종이 울린다.
  setup(`{ T1: { done:{}, seenTasks:["a1","a2","a3","a4"] } }`, "owner");
  const mineId = run(`return newTaskId()`);
  run(`S.tasks.push({ id:"${mineId}", text:"방금 내가 넣은 것", who:"전원", status:"open" }); initNewTasks()`);
  ok("내가 넣은 줄은 내 종을 안 울린다", val("S.newIds").length === 0 && val("S.newSeen") === true, JSON.stringify(val("S.newIds")));
  ok("그래도 본 것으로는 적어 둔다 — 다음에 열 때 새것이 되면 안 된다", val("seenIds()").indexOf(mineId) >= 0);
  run(`S.tasks.push({ id:"b9", text:"남이 넣은 것", who:"전원", status:"open" }); initNewTasks()`);
  ok("남이 넣은 줄은 울린다", JSON.stringify(val("S.newIds")) === '["b9"]', JSON.stringify(val("S.newIds")));

  // ---- 남의 개인 메모: 팀장은 보고 선생님은 안 본다 ----
  setup(`{ T1: { done:{}, seenTasks:["a1","a2","a4"] } }`, "owner");
  run("initNewTasks()");
  ok("팀장은 남이 자기 앞으로 적은 할 일도 «새로 옴» 으로 본다", JSON.stringify(val("S.newIds")) === '["a3"]', JSON.stringify(val("S.newIds")));
  setup(`{ T2: { done:{}, seenTasks:["a1","a2","a4"] } }`);
  run("initNewTasks()");
  ok("선생님에게는 남의 개인 메모가 안 울린다", val("S.newIds").length === 0, JSON.stringify(val("S.newIds")));
  ok("선생님이 적어 두는 목록에도 남의 개인 메모는 안 들어간다", val("seenIds()").indexOf("a3") < 0);

  // ---- 지켜보기 — 다시 열지 않아도 뜬다 ----
  setup(`{ T2: { done:{}, seenTasks:["a1","a2","a4"] } }`);
  run("initNewTasks()");
  ok("지켜보기 전에는 새것이 없다", val("S.newIds").length === 0);
  run(`rebuildTasks("open", S.tasksOpen.concat([{ id:"c7", text:"팀장이 방금 넣음", who:"전원", status:"open" }]))`);
  ok("문서가 바뀌면 그 자리에서 종이 울린다", JSON.stringify(val("S.newIds")) === '["c7"]', JSON.stringify(val("S.newIds")));
  ok("세 곳을 다시 합친다 (공개분·팀장분·각자분)", val("S.tasks").length === 4, String(val("S.tasks").length));
  run(`rebuildTasks("own", { T2: { name:"이현우", items:[{ id:"d1", text:"내 메모 둘", status:"open" }] } })`);
  ok("각자 적은 것도 목록에 합쳐진다", val("S.tasks").filter((t) => t.id === "d1").length === 1);
  ok("그런데 내 메모라 종은 그대로", JSON.stringify(val("S.newIds")) === '["c7"]');

  // ---- 그릴 자리가 없을 때 (로그아웃하는 사이에 스냅샷이 오면) ----
  setup(`{ T2: { done:{}, seenTasks:["a1"] } }`);
  const realQS = ctx.document.querySelector;
  ctx.document.querySelector = () => null;          // 화면이 사라진 셈
  let blew = "";
  try { run(`rebuildTasks("open", S.tasksOpen)`); } catch (e) { blew = e.message; }
  ctx.document.querySelector = realQS;
  ok("화면이 없어도 안 터진다", !blew, blew);

  // ---- 지켜보기를 못 붙이는 자리에서도 안 터진다 ----
  setup("{}");
  ok("onSnapshot 이 없으면 조용히 넘어간다", (() => { try { run("watchTasks(); stopWatch(); return 1"); return true; } catch (e) { return e.message; } })() === true);

  // ---- 팀 DB 가 막혀 있으면 조용히 넘어간다 ----
  setup("{}");
  run("S.teamOk = false");
  WRITES.length = 0;
  run("initNewTasks()");
  await new Promise((r) => setTimeout(r, 0));
  ok("규칙이 막혀 있으면 적으려 들지 않는다", WRITES.length === 0);

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})();
