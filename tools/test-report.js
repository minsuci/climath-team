// 한 줄 보고 — 선생님이 적어 보내면 팀장의 «완료 현황» 에 글까지 뜬다.
//
// 여기가 조용히 틀리면 **보고가 안 간 줄 아무도 모른다.** 선생님 화면에는 적힌 것처럼 보이고
// 팀장 화면에는 아무것도 없다. 그래서 «못 썼으면 되돌린다» 와 «다른 칸을 안 지운다» 를 센다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 프로토타입이 있는 가짜 — guardWrites 가 진짜처럼 가로챌 수 있어야 한다
const DB = {}, WROTE = [];
let FAIL_WRITE = false;
function DocumentReference(path) { this.path = path; }
DocumentReference.prototype.set = function (v) {
  if (FAIL_WRITE) return Promise.reject(new Error("규칙이 막았다"));
  WROTE.push({ path: this.path, v: v });
  DB[this.path] = JSON.parse(JSON.stringify(v));   // 참조를 두면 화면 사본과 서버가 같아져 없는 버그가 보인다
  return Promise.resolve();
};
DocumentReference.prototype.update = function () { return Promise.resolve(); };
DocumentReference.prototype.delete = function () { return Promise.resolve(); };
DocumentReference.prototype.get = function () { return Promise.resolve({ exists: false }); };
DocumentReference.prototype.onSnapshot = function () { return function () {}; };
function CollectionReference(name) { this.name = name; }
CollectionReference.prototype.doc = function (id) { return new DocumentReference(this.name + "/" + id); };
CollectionReference.prototype.get = function () { return Promise.resolve({ forEach() {} }); };
CollectionReference.prototype.add = function () { return Promise.resolve(); };
CollectionReference.prototype.onSnapshot = function () { return function () {}; };
function WriteBatch() {}
WriteBatch.prototype.commit = function () { return Promise.resolve(); };
const firestoreFn = () => ({ collection: (n) => new CollectionReference(n), batch: () => new WriteBatch() });
firestoreFn.DocumentReference = DocumentReference;
firestoreFn.CollectionReference = CollectionReference;
firestoreFn.WriteBatch = WriteBatch;

// 화면 흉내 — 적는 칸에 손이 올라가 있는지(activeElement)까지 흉내내야 한다
const EL = {};
let ACTIVE = null;
function el(id) {
  const o = { id, tagName: "DIV", innerHTML: "", textContent: "", value: "", hidden: false, disabled: false,
    readOnly: false, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getAttribute: () => "", setAttribute() {}, hasAttribute: () => false, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], onclick: null, focus() {},
    contains: (x) => o._has === x, closest: () => o };
  return o;
}
const ctx = vm.createContext({
  console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt,
  firebase: { initializeApp: () => ({}), firestore: firestoreFn, auth: () => ({ onAuthStateChanged() {}, currentUser: null, signOut: () => Promise.resolve() }) },
  document: {
    querySelector: (s) => (EL[s] = EL[s] || el(s)),
    querySelectorAll: () => [], addEventListener() {},
    get activeElement() { return ACTIVE; },
  },
  window: { addEventListener() {}, scrollTo() {} }, location: { hash: "" }, history: { replaceState() {} },
  localStorage: { getItem: () => null, setItem() {} },
  MutationObserver: function () { return { observe() {} }; },
  fetch: () => Promise.reject(new Error("no net")), alert() {}, confirm: () => true, prompt: () => null,
});
vm.runInContext(src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const val = (e) => JSON.parse(vm.runInContext("JSON.stringify(" + e + ")", ctx) || "null");
const TODAY = val("TODAY");
const RO_MSG = run("return RO_MSG");

const TASKS = `[
  { id:"r1", text:"올케어 미작성 확인", who:"전원",   status:"open", report:true },
  { id:"r2", text:"CLT 실시",         who:"이현우", status:"open" },
  { id:"r3", text:"끝난 보고 일",      who:"이현우", status:"done", report:true, done:${JSON.stringify(TODAY)} }
]`;
const setup = (who) => {
  WROTE.length = 0; FAIL_WRITE = false; ACTIVE = null;
  Object.keys(DB).forEach((k) => delete DB[k]);
  run(`
    S.teamOk = true;
    S.claims = ${who === "owner" ? `{ role:"owner", tid:"T1", name:"한민수" }` : `{ role:"teacher", tid:"T3", name:"이현우" }`};
    S.ro = ${who === "owner" ? "false" : "true"};
    S.teachers = [
      { tid:"T1", name:"한민수",  classIds:["c1"], role:"owner" },
      { tid:"T2", name:"이창혁A", classIds:["c1"] },
      { tid:"T3", name:"이현우",  classIds:["c2"] }
    ];
    S.classes = [{ id:"c1", name:"고1S" }, { id:"c2", name:"예비고1S" }];
    S.tasksOpen = ${TASKS}; S.tasksLead = []; S.own = {};
    S.tasks = ${TASKS};
    S.marks = {};
    S.newIds = []; S.newSeen = true;
    TASKS_STALE = false;
  `);
};

(async () => {
  // ---- 적어 보내면 저장된다 ----
  setup();
  await run(`return saveReport("r1", "  1반·2반 다 돌렸습니다  ")`);
  ok("자기 문서에만 간다", WROTE[WROTE.length - 1].path === "marks/T3", WROTE[WROTE.length - 1].path);
  ok("앞뒤 빈칸은 떼고 적는다", (DB["marks/T3"].reports || {}).r1.text === "1반·2반 다 돌렸습니다",
    JSON.stringify(DB["marks/T3"].reports));
  ok("보낸 날이 남는다", DB["marks/T3"].reports.r1.at === TODAY);
  // 보고가 곧 완료다 — 따로 «내 완료» 를 누르게 하면 둘 중 하나를 빠뜨린다
  ok("보고하면 완료 표시도 같이 된다", !!(DB["marks/T3"].done || {}).r1, JSON.stringify(DB["marks/T3"].done));
  ok("이름도 남긴다 — 명단에서 빠진 사람도 누구인지 알아야 한다", DB["marks/T3"].name === "이현우");

  // ---- 다른 칸을 지우지 않는다 (set 은 문서를 통째로 갈아친다) ----
  setup();
  run(`S.marks = { T3: { name:"이현우", done:{ r2:"2026-09-01" }, seenTasks:["r1","r2"] } }`);
  await run(`return saveReport("r1", "했습니다")`);
  ok("먼저 있던 완료 표시가 남는다", (DB["marks/T3"].done || {}).r2 === "2026-09-01", JSON.stringify(DB["marks/T3"].done));
  ok("«어디까지 봤나» 도 남는다", (DB["marks/T3"].seenTasks || []).join(",") === "r1,r2", JSON.stringify(DB["marks/T3"].seenTasks));

  // ---- 지우면 완료도 내린다 ----
  setup();
  await run(`return saveReport("r1", "했습니다")`);
  await run(`return saveReport("r1", "   ")`);
  ok("빈 글을 보내면 보고가 지워진다", !((DB["marks/T3"].reports || {}).r1), JSON.stringify(DB["marks/T3"].reports));
  // 글 없는 «했음» 만 남으면 팀장은 무엇을 했는지 영영 모른다
  ok("완료 표시도 같이 내린다", !((DB["marks/T3"].done || {}).r1), JSON.stringify(DB["marks/T3"].done));

  // ---- 못 썼으면 되돌린다 ----
  setup();
  FAIL_WRITE = true;
  let msg = "";
  try { await run(`return saveReport("r1","안 갈 글")`); } catch (e) { msg = e.message; }
  ok("못 쓰면 알려준다", msg === "규칙이 막았다", msg);
  // ⚠ 화면에만 남기면 선생님은 보고했다고 믿고 팀장은 영영 못 본다
  ok("화면 사본도 되돌린다", !val('(S.marks["T3"]||{}).reports'), JSON.stringify(val('S.marks["T3"]')));

  // ---- 읽기 계정의 문 ----
  setup();
  await run(`return saveReport("r1","됩니다")`);
  ok("선생님도 보고는 된다", !!(DB["marks/T3"].reports || {}).r1);
  ok("보고가 끝나면 문이 다시 닫힌다", run("return RO_PASS") === false);
  const tryW = async (code) => { try { await run(code); return "ok"; } catch (e) { return e.message; } };
  ok("문이 닫혔으니 다른 쓰기는 여전히 막힌다",
    (await tryW(`return tdb.collection('dash').doc('tasks').set({a:1})`)) === RO_MSG);
  ok("남의 문서에는 못 쓴다", (await tryW(`return tdb.collection('marks').doc('T1').set({done:{}})`)) === RO_MSG);

  // ---- 적는 칸이 뜨는 자리 ----
  setup();
  const box = (id) => run(`return reportBox(S.tasks.filter(function(t){return t.id==="${id}"})[0])`);
  ok("보고받는 일이고 내 담당이면 칸이 뜬다", box("r1").indexOf("data-rep-in") >= 0);
  ok("보고 안 받는 일에는 안 뜬다", box("r2") === "");
  ok("이미 닫힌 일에는 안 뜬다", box("r3") === "");
  ok("빈 칸에는 «보고하고 완료»", box("r1").indexOf("보고하고 완료") >= 0);
  // 감추기(applyReadOnly)가 «완료» 글자를 보고 단추를 숨긴다 — data-keep 이 없으면 선생님 화면에서 사라진다
  ok("칸과 단추에 data-keep 이 붙는다", (box("r1").match(/data-keep/g) || []).length === 2, box("r1"));
  run(`S.marks = { T3: { name:"이현우", reports: { r1: { text:"다 돌렸습니다", at:${JSON.stringify(TODAY)} } } } }`);
  ok("이미 보낸 글이 칸에 들어 있다", box("r1").indexOf('value="다 돌렸습니다"') >= 0, box("r1"));
  ok("그때는 «고쳐 보내기»", box("r1").indexOf("고쳐 보내기") >= 0);
  ok("보낸 날도 보인다", box("r1").indexOf("보냄") >= 0);

  // 남의 일에는 안 뜬다
  setup();
  run(`S.tasks[0].who = "이창혁A"`);
  ok("내 담당이 아니면 칸이 없다", box("r1") === "");

  // ---- «내 완료» 단추는 자리를 내준다 ----
  setup();
  const mk = (id) => run(`return myMarkBtn(S.tasks.filter(function(t){return t.id==="${id}"})[0])`);
  ok("보고받는 일에는 «내 완료» 가 없다", mk("r1") === "", mk("r1"));
  ok("보통 일에는 그대로 있다", mk("r2").indexOf("내 완료") >= 0);

  // ---- 들어온 보고를 팀장이 본다 ----
  setup("owner");
  run(`S.marks = {
    T2: { name:"이창혁A", reports: { r1: { text:"고1 다 봤습니다", at:${JSON.stringify(TODAY)} } }, done:{ r1:${JSON.stringify(TODAY)} } },
    T3: { name:"이현우",  reports: { r1: { text:"예비고1 내일", at:${JSON.stringify(TODAY)} } }, done:{ r1:${JSON.stringify(TODAY)} } }
  }`);
  const seen = run(`return reportsSeen(S.tasks.filter(function(t){return t.id==="r1"})[0])`);
  ok("팀장 줄에 들어온 보고가 붙는다", seen.indexOf("고1 다 봤습니다") >= 0 && seen.indexOf("예비고1 내일") >= 0, seen);
  ok("누가 보냈는지 적힌다", seen.indexOf("이창혁A") >= 0 && seen.indexOf("이현우") >= 0);
  setup();
  run(`S.marks = { T2: { name:"이창혁A", reports: { r1: { text:"남의 보고", at:${JSON.stringify(TODAY)} } } } }`);
  ok("선생님에게는 남의 보고가 안 보인다", run(`return reportsSeen(S.tasks[0])`) === "");

  // ---- 줄에 그려지는 것 ----
  setup("owner");
  const row = (id) => run(`return taskRow(S.tasks.filter(function(t){return t.id==="${id}"})[0])`);
  ok("팀장 줄의 «보고» 표는 눌러서 켜고 끈다", row("r1").indexOf('class="pill rp') >= 0, row("r1").slice(0, 200));
  ok("안 켠 일에도 켤 자리가 있다", row("r2").indexOf('class="pill rp') >= 0);
  ok("줄이 div 를 다 닫는다", (row("r1").match(/<div/g) || []).length === (row("r1").match(/<\/div>/g) || []).length,
    (row("r1").match(/<div/g) || []).length + " vs " + (row("r1").match(/<\/div>/g) || []).length);
  setup();
  ok("선생님에게는 못 누르는 표로만 뜬다", row("r1").indexOf('class="pill rp') < 0 && row("r1").indexOf(">보고<") >= 0, row("r1").slice(0, 300));
  ok("보고 안 받는 일에는 표가 없다", row("r2").indexOf(">보고<") < 0);
  ok("선생님 줄도 div 를 다 닫는다", (row("r1").match(/<div/g) || []).length === (row("r1").match(/<\/div>/g) || []).length);

  // ---- 적는 중에는 다시 그리지 않는다 ----
  // [[입력 중에 다시 그리면 한 글자만 쳐진다]] — 남이 보고할 때마다 지켜보기가 다시 그리면
  // 내가 치던 글이 통째로 날아간다
  setup();
  {
    const sec = ctx.document.querySelector("#sec-tasks");
    const input = { tagName: "INPUT" };
    sec._has = input;
    ACTIVE = input;
    run("renderTasksSafe()");
    ok("적는 중에는 다시 안 그린다", run("return TASKS_STALE") === true);
    ACTIVE = null;
    run("renderTasksSafe()");
    ok("손을 떼면 그때 그린다", run("return TASKS_STALE") === false);
    ACTIVE = { tagName: "BUTTON" };
    sec._has = ACTIVE;
    run("TASKS_STALE = false; renderTasksSafe()");
    ok("단추에 손이 가 있는 것은 적는 중이 아니다", run("return TASKS_STALE") === false);
    ACTIVE = null; sec._has = null;
  }

  // ---- 끝낸 것은 아래로 (2026-09-08) ----
  // "할일에서 내 완료 클릭한거나 보고한거는 아래로 뜨게 만들어".
  // 상태는 팀장만 바꾸므로 «내 완료» 만으로는 줄이 그 자리에 있었다. 보는 사람이 끝낸 것은 열린 것 아래로.
  const order = () => (EL["#sec-tasks"].innerHTML.match(/data-id="([^"]+)"/g) || []).map((m) => m.slice(9, -1));
  const seps = () => (EL["#sec-tasks"].innerHTML.match(/class="tsep">([^<]*)</g) || []).map((m) => m.slice(13, -1));
  setup();
  run(`S.tasks = [
    { id:"s1", text:"먼저 할 것",  who:"이현우", status:"open", due:"2026-09-20" },
    { id:"s2", text:"이미 한 것",  who:"이현우", status:"open", due:"2026-09-01" },
    { id:"s3", text:"보고한 것",   who:"전원",   status:"open", due:"2026-09-02", report:true },
    { id:"s4", text:"남이 한 것",  who:"전원",   status:"open", due:"2026-09-03" }
  ]; S.tasksOpen = S.tasks;
  S.marks = {
    T3: { name:"이현우", done: { s2:TODAY, s3:TODAY }, reports: { s3: { text:"다 했습니다", at:TODAY } } },
    T2: { name:"이창혁A", done: { s4:TODAY } }
  };`);
  run("renderTasks()");
  ok("내가 끝낸 것은 기한이 빨라도 아래", order().join(",") === "s4,s1,s2,s3", order().join(","));
  ok("남이 끝낸 것은 내게는 아직 할 것", order().indexOf("s4") < order().indexOf("s2"));
  ok("가르는 줄이 하나 선다", seps().join("|") === "내가 끝낸 것", seps().join("|"));
  run("S.marks.T3 = {}; renderTasks()");
  ok("내 완료를 되돌리면 다시 올라온다", order().join(",") === "s2,s3,s4,s1", order().join(","));
  ok("끝낸 것이 없으면 가르는 줄도 없다", seps().length === 0, seps().join("|"));
  // 팀장에게는 «걸린 사람이 다 끝낸 것» 이 내려간다. 남은 사람이 있으면 위에 남는다
  setup("owner");
  run(`S.tasks = [
    { id:"o1", text:"둘 다 끝냄",   who:"이창혁A · 이현우", status:"open", due:"2026-09-01" },
    { id:"o2", text:"하나만 끝냄",  who:"이창혁A · 이현우", status:"open", due:"2026-09-02" },
    { id:"o3", text:"아직",         who:"이현우",         status:"open", due:"2026-09-03" },
    { id:"o4", text:"닫은 것",      who:"이현우",         status:"done", due:"2026-08-01" }
  ]; S.tasksOpen = S.tasks; S.showDone = true;
  S.marks = { T2: { done: { o1:TODAY, o2:TODAY } }, T3: { done: { o1:TODAY } } };`);
  run("renderTasks()");
  ok("팀장: 다 끝낸 것만 내려가고 닫은 것은 맨 아래", order().join(",") === "o2,o3,o1,o4", order().join(","));
  ok("팀장: 가르는 줄 둘", seps().join("|") === "내가 끝낸 것|팀장이 닫은 것", seps().join("|"));
  run("S.showDone = false");

  // ---- 완료 현황에 글까지 ----
  setup("owner");
  run(`S.marks = { T3: { name:"이현우",
    done: { r1:${JSON.stringify(TODAY)}, r2:${JSON.stringify(TODAY)} },
    reports: { r1: { text:"1반·2반 다 돌렸습니다", at:${JSON.stringify(TODAY)} } } } };
    S.doneRange = "all"; S.doneWho = "";`);
  {
    const rows = val("doneRows()");
    const mine = rows.filter((r) => r.name === "이현우")[0];
    const rep = mine.items.filter((x) => x.kind === "report")[0];
    ok("보고한 것은 «보고» 로 갈린다", !!rep, JSON.stringify(mine.items));
    ok("적어 보낸 글이 그대로 따라온다", rep.report === "1반·2반 다 돌렸습니다", rep.report);
    ok("글 없이 표시만 한 것은 «시킨 일»", mine.items.filter((x) => x.kind === "mark").length === 1,
      JSON.stringify(mine.items.map((x) => x.kind)));
    run("renderDone()");
    const html = EL["#sec-done"].innerHTML;
    ok("완료 현황에 글이 보인다", html.indexOf("1반·2반 다 돌렸습니다") >= 0);
    ok("완료 현황도 div 를 다 닫는다", (html.match(/<div/g) || []).length === (html.match(/<\/div>/g) || []).length,
      (html.match(/<div/g) || []).length + " vs " + (html.match(/<\/div>/g) || []).length);
  }

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})();
