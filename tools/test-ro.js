// 읽기만 하는 계정 — 쓰기가 한 군데서 막히는가, 고치는 단추가 감춰지는가.
//
// 선생님이 들어오게 열면서(2026-09-05) 쓰는 자리를 하나씩 막지 않고 Firestore 쓰기 메서드를 가로챘다.
// 가로채기가 빠지면 선생님이 학생 명단을 지울 수 있다(앱 DB 는 그쪽 규칙이 선생님 쓰기를 허용한다).
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 진짜 SDK 처럼 프로토타입이 있는 가짜 Firestore
const CALLS = [];
const DOCS = {};    // 경로 -> 값. get 이 여기서 꺼낸다 ("t:" 는 팀 DB)
const SETS = [];    // 무엇을 어디에 썼나
function DocumentReference(path) { this.path = path || "?"; }
DocumentReference.prototype.set = function (d) { CALLS.push("set"); SETS.push({ path: this.path, data: d }); DOCS[this.path] = d; return Promise.resolve("set-ok"); };
DocumentReference.prototype.update = function () { CALLS.push("update"); return Promise.resolve("update-ok"); };
DocumentReference.prototype.delete = function () { CALLS.push("delete"); return Promise.resolve("delete-ok"); };
DocumentReference.prototype.get = function () {
  const d = DOCS[this.path];
  return Promise.resolve({ exists: d !== undefined, data: () => d });
};
const WHERE = [];
// 수업관리 앱 규칙 흉내. teachers 문서에는 PIN 이 있어서 그쪽 규칙이 남의 것을 막는다 —
// **문서 이름**을 보는 조건이라 목록 쿼리로는 증명이 안 되고, 선생님이 컬렉션을 통째로 부르면
// Firestore 가 목록을 통째로 거절한다. 흉내도 똑같이 거절해야 «로그인이 안 된다» 를 여기서 잡는다.
const CLASS_TEACHERS = [
  { id: "T1", name: "한민수", role: "owner", pin: "1234", classIds: ["c1"], time: 1 },
  { id: "T2", name: "이현우", role: "teacher", pin: "9999", classIds: ["c2"], time: 2 },
];
const denied = () => Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
function CollectionReference(name, team) { this.name = name || "?"; this.team = !!team; }
CollectionReference.prototype.list = function () {
  if (!this.team && this.name === "teachers" && vm.runInContext("S.ro", ctx)) return denied();
  if (!this.team && this.name === "teachers")
    return Promise.resolve({ forEach(cb) { CLASS_TEACHERS.forEach((t) => cb({ id: t.id, data: () => Object.assign({}, t, { id: undefined }) })); } });
  return Promise.resolve({ forEach() {} });
};
// ⚠ 흉내가 진짜보다 너그러우면 안 된다 — 조건을 안 적어도 되는 것처럼 보이면
//   규칙이 목록을 통째로 거절하는 것을 여기서 못 잡는다.
CollectionReference.prototype.where = function (f, op, v) {
  WHERE.push(f + " " + op + " " + v);
  return { get: () => Promise.resolve({ forEach() {} }) };
};
CollectionReference.prototype.orderBy = function () { return this; };
CollectionReference.prototype.add = function () { CALLS.push("add"); return Promise.resolve("add-ok"); };
CollectionReference.prototype.doc = function (id) { return new DocumentReference((this.team ? "t:" : "c:") + this.name + "/" + id); };
CollectionReference.prototype.get = function () { return this.list(); };
function WriteBatch() {}
WriteBatch.prototype.commit = function () { CALLS.push("commit"); return Promise.resolve("commit-ok"); };
const firestoreFn = function (app) {
  const team = !!app;
  return { collection: (n) => new CollectionReference(n, team), batch: () => new WriteBatch() };
};
firestoreFn.DocumentReference = DocumentReference;
firestoreFn.CollectionReference = CollectionReference;
firestoreFn.WriteBatch = WriteBatch;

// 화면 흉내 — 단추·칸이 감춰지는지 볼 수 있을 만큼만
function el(tag, attrs) {
  const o = { tagName: tag, hidden: false, disabled: false, readOnly: false, textContent: "", attrs: attrs || {}, cls: [],
    classList: { contains: (c) => o.cls.indexOf(c) >= 0, add() {}, remove() {}, toggle() {} },
    getAttribute: (k) => (k in o.attrs ? o.attrs[k] : null), hasAttribute: (k) => k in o.attrs, setAttribute() {},
    innerHTML: "", style: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  return o;
}
const ELS = [];
const LG = {};              // 로그인 화면의 #lg-… 칸들
let loginCard = null;       // 로그인 카드가 화면에 있나 (있으면 감추기가 손대면 안 된다)
const rootEl = el("div");
rootEl.querySelector = (sel) => (sel === ".card.login" ? loginCard : null);
rootEl.querySelectorAll = (sel) => ELS.filter((e) => {
  if (sel === ".card button, .card a.mini") return e.tagName === "BUTTON" || (e.tagName === "A" && e.cls.indexOf("mini") >= 0);
  if (sel === ".card input, .card textarea") return e.tagName === "INPUT" || e.tagName === "TEXTAREA";
  return [];
});
let observed = false;
let FETCH = () => Promise.reject(new Error("no net"));   // 시험마다 갈아 끼운다
const stub = {
  firebase: { initializeApp: () => ({}), firestore: firestoreFn, auth: () => ({ onAuthStateChanged() {}, currentUser: null, signOut: () => Promise.resolve() }) },
  // 로그인 화면의 칸들은 있는 셈 친다 — renderLogin() 을 통째로 돌려 봐야 하기 때문이다
  document: { querySelector: (s) => (s === "#root" ? rootEl : (/^#lg-/.test(s) ? (LG[s] = LG[s] || el("DIV")) : null)), querySelectorAll: () => [], addEventListener() {} },
  window: { addEventListener() {}, scrollTo() {} }, location: { hash: "" }, history: { replaceState() {} },
  localStorage: { getItem: () => null, setItem() {} },
  // ⚠ 흉내는 브라우저보다 너그러우면 안 된다. 2026-09-06에 이 `observe(){}` 가
  //   **아무 것이나 받아 주는 바람에** root 가 undefined 인 채로 감시를 거는 줄을 놓쳤다.
  //   브라우저에서는 «parameter 1 is not of type 'Node'» 로 터지고 앱이 통째로 안 켜졌다.
  MutationObserver: function () {
    observed = true;
    return { observe(t) { if (!t) throw new TypeError("observe: 대상이 Node 가 아니다 (root 가 아직 없다)"); } };
  },
  fetch: (u, o) => FETCH(u, o), alert() {}, confirm: () => true, prompt: () => null,
  console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt,
};
const ctx = vm.createContext(stub);
vm.runInContext(src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
// 값은 JSON 으로 건너온다 — vm 안의 객체를 그대로 만지면 프로토타입이 달라 헷갈린다.
const val = (expr) => JSON.parse(vm.runInContext("JSON.stringify(" + expr + ")", ctx) || "null");

(async () => {
  ok("화면 감시가 걸린다 (MutationObserver)", observed);

  // ---- 쓰기 가로채기 ----
  run("S.ro = false");
  const a = await run("return tdb.collection('dash').doc('x').set({a:1})");
  ok("관리자는 그대로 쓴다", a === "set-ok" && CALLS.length === 1, JSON.stringify(CALLS));

  // 진짜 앱에서 S.ro 가 켜지는 순간에는 늘 claims 가 있다(boot 이 둘을 같이 정한다). 흉내도 그렇게 둔다.
  run("S.ro = true; S.claims = { role: 'teacher', tid: 'T2', name: '이현우' }");
  const tryW = async (code) => { try { await run(code); return "ok"; } catch (e) { return e.message; } };
  const msg = run("return RO_MSG");
  ok("읽기 계정의 set 은 거절", (await tryW("return tdb.collection('dash').doc('x').set({a:1})")) === msg);
  ok("update 도", (await tryW("return db.collection('students').doc('p').update({a:1})")) === msg);
  ok("delete 도", (await tryW("return db.collection('students').doc('p').delete()")) === msg);
  ok("add 도", (await tryW("return db.collection('x').add({})")) === msg);
  ok("batch commit 도", (await tryW("return db.batch().commit()")) === msg);
  ok("거절된 것은 SDK 까지 안 간다", CALLS.length === 1, JSON.stringify(CALLS));
  ok("서버로 가는 쓰기(PIN 초기화)도 거절", (await tryW("return stResetPin('김서진')")) === msg);
  // 실제 쓰기 함수 하나를 통째로 — 저장소 목록 저장
  ok("saveRepos 가 거절된다", (await tryW("return saveRepos([{key:'a',app:'x',who:'y',owner:'a',repo:'b'}])")) === msg);
  ok("읽기는 된다", (await tryW("return tdb.collection('minutes').get().then(function(){ return 'ok' })")) === "ok");

  // ---- 단추·칸 감추기 ----
  const mk = (tag, text, cls, attrs) => { const e = el(tag, attrs); e.textContent = text; e.cls = cls || []; ELS.push(e); return e; };
  const save = mk("BUTTON", "저장", ["btn"]);
  const del = mk("BUTTON", "빼기", ["mini"], { "data-ddel": "0" });
  const reload = mk("BUTTON", "다시 읽기", ["mini"]);
  const chip = mk("BUTTON", "고1", ["mini"], { "data-dwho": "고1" });
  const manage = mk("BUTTON", "저장소 관리", ["mini"]);
  const check = mk("BUTTON", "읽히나 확인", ["mini"]);
  const open = mk("A", "앱 열기", ["mini"]);
  const pin = mk("BUTTON", "PIN 초기화", ["mini"]);
  // «내 완료» — 읽기 계정도 눌러야 하는 단 하나의 단추.
  // data-keep 이 없으면 «완료»·«✓» 글자에 걸려 감춰지고, 선생님은 끝냈다는 표시를 할 데가 없어진다.
  const mine = mk("BUTTON", "✓ 내가 함 9/6", ["mini", "mk"], { "data-keep": "", "data-mk": "a" });
  const search = mk("INPUT", "", ["mini"], { type: "text", placeholder: "커밋에서 찾기" });
  const dateIn = mk("INPUT", "", [], { type: "date" });
  const chk = mk("INPUT", "", [], { type: "checkbox" });
  const memo = mk("TEXTAREA", "", []);
  run("applyReadOnly()");
  ok("저장 단추(.btn)는 감춘다", save.hidden);
  ok("빼기(data-ddel)는 감춘다", del.hidden);
  ok("«다시 읽기» 는 남는다", !reload.hidden);
  ok("거르기 칩은 남는다", !chip.hidden);
  ok("«저장소 관리» 는 감춘다", manage.hidden);
  ok("«읽히나 확인» 은 감춘다 (서버 쓰기)", check.hidden);
  ok("«앱 열기» 링크는 남는다 (a.mini 이지만 열기)", !open.hidden);
  ok("«PIN 초기화» 는 감춘다", pin.hidden);
  ok("«내 완료» 는 읽기 계정에도 남는다 (data-keep)", !mine.hidden);
  ok("찾기 칸은 남는다", !search.readOnly && !search.disabled);
  ok("날짜 칸은 읽기만", dateIn.readOnly);
  ok("체크박스는 못 누른다", chk.disabled);
  ok("메모 칸은 못 쓴다", memo.disabled);
  run("S.ro = false");
  const save2 = mk("BUTTON", "저장", ["btn"]);
  run("applyReadOnly()");
  ok("관리자면 아무것도 안 감춘다", !save2.hidden);

  // ---- 회의록은 누가 받아 오나 ----
  // 팀장은 전부, 선생님은 «공개: 팀» 인 것만. 조건을 빼면 규칙이 목록을 통째로 거절한다.
  WHERE.length = 0;
  run("S.ro = false"); await run("return loadMinutes()");
  ok("팀장은 조건 없이 다 받아온다", WHERE.length === 0, WHERE.join(" | "));
  run("S.ro = true"); await run("return loadMinutes()");
  ok("선생님은 open==true 만 받아온다", WHERE.join("") === "open == true", WHERE.join(" | "));
  run("S.ro = false");

  // ---- 로그인 화면에는 «들어가기» 가 남아야 한다 ----
  //
  // 2026-09-07: 선생님이 로그인에 실패하거나 로그아웃하면 S.ro 가 켜진 채로 로그인 화면이 그려졌다.
  // 감추기가 `.btn` 을 지우는데 «들어가기» 가 `.btn` 이다 — **다시 들어갈 방법이 없어졌다.**
  // 화면에 단추가 없으면 «안 된다» 도 아니고 «없다» 라 사람이 손쓸 데가 없다.
  const goBtn = mk("BUTTON", "들어가기", ["btn"]);
  loginCard = el("DIV");
  run("S.ro = true; S.claims = { role: 'teacher', tid: 'T2', name: '이현우' }");
  run("applyReadOnly()");
  ok("로그인 화면이면 «들어가기» 를 안 감춘다", !goBtn.hidden);
  loginCard = null;
  run("applyReadOnly()");
  ok("로그인 화면이 아니면 그대로 감춘다", goBtn.hidden);
  // 아무도 아닌 상태(로그아웃 직후)에도 손대지 않는다
  goBtn.hidden = false;
  run("S.claims = null");
  run("applyReadOnly()");
  ok("로그인 전이면 아무것도 안 감춘다", !goBtn.hidden);
  // renderLogin 이 앞 사람의 «읽기만» 을 내린다 — 두 겹 중 첫 겹
  run("S.ro = true; S.claims = { role: 'teacher' }; renderLogin('앞 사람이 막혔던 것')");
  ok("renderLogin 이 읽기 계정 상태를 내린다", val("S.ro") === false && val("S.claims") === null,
    JSON.stringify(val("S.ro")) + " / " + JSON.stringify(val("S.claims")));

  // ---- 선생님 명단은 어디서 오나 ----
  //
  // 2026-09-07: 선생님이 로그인하면 «Missing or insufficient permissions» 만 뜨고 못 들어왔다.
  // loadCore 의 맨 앞줄이 앱 DB 의 teachers 컬렉션을 통째로 부르는데, 그쪽 문서에는 PIN 이 있어
  // 규칙이 남의 것을 막는다. **팀 DB 규칙만 검증했기 때문에** 이걸 못 잡았다.
  // 여기서는 흉내가 그 규칙대로 거절한다 — 다시 부르면 이 시험이 먼저 터진다.
  run("S.ro = true");
  ok("흉내도 규칙처럼 거절한다 (선생님이 앱 teachers 목록을 부르면)",
    (await tryW("return db.collection('teachers').orderBy('time').get()")) === "Missing or insufficient permissions.");

  // 이것이 곧 «로그인이 되는가» 다 — boot 이 loadCore 를 부르고, 여기서 하나라도 거절당하면
  // 선생님은 로그인 화면에서 영어 한 줄만 본다. 사본이 아직 없어도 끝까지 가야 한다.
  run("S.ro = true; S.readErr = []");
  const bootErr = await tryW("return loadCore()");
  ok("선생님으로 loadCore 가 끝까지 간다", bootErr === "ok", bootErr);
  ok("못 읽은 것이 없다", val("S.readErr.length") === 0, JSON.stringify(val("S.readErr")));

  run("S.ro = false; S.teachers = []");
  SETS.length = 0;
  await run("return loadTeachers()");
  ok("팀장은 앱 DB 에서 읽는다", val("S.teachers.length") === 2, String(val("S.teachers.length")));
  const mirror = SETS.filter((s) => s.path === "t:dash/teachers")[0];
  ok("팀장이 사본을 팀 DB 에 남긴다", !!mirror, SETS.map((s) => s.path).join(",") || "안 썼다");
  // ⚠ 사본에 PIN 이 딸려 가면 선생님이 남의 PIN 을 통째로 읽는다 — 막으려던 것을 도로 여는 것이다.
  ok("사본에 PIN 이 안 딸려 간다", !!mirror && JSON.stringify(mirror.data).indexOf("9999") < 0,
    mirror ? JSON.stringify(mirror.data).slice(0, 120) : "");
  ok("사본에 담당 반은 남는다", !!mirror && JSON.stringify(mirror.data).indexOf("c2") >= 0);
  SETS.length = 0;
  await run("return loadTeachers()");
  ok("바뀐 게 없으면 다시 안 쓴다", !SETS.length, SETS.map((s) => s.path).join(","));

  run("S.ro = true; S.teachers = []");
  await run("return loadTeachers()");
  ok("선생님은 사본을 읽는다 (앱 DB 를 안 부른다)", val("S.teachers.length") === 2, String(val("S.teachers.length")));
  ok("선생님도 담당 반을 안다", val("S.teachers[1].classIds[0]") === "c2");

  // 사본이 아직 없을 때 — 못 들어오는 것보다 이름만이라도 낫다
  delete DOCS["t:dash/teachers"];
  FETCH = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ teachers: [
    { tid: "T1", name: "한민수", role: "owner", status: "active" },
    { tid: "T9", name: "아직 승인 전", role: "teacher", status: "pending" }] }) });
  run("S.teachers = []");
  await run("return loadTeachers()");
  ok("사본이 없으면 로그인 화면 목록으로 버틴다", val("S.teachers.length") === 1, String(val("S.teachers.length")));
  ok("승인 전 선생님은 빼고", val("S.teachers[0].name") === "한민수");

  FETCH = () => Promise.reject(new Error("no net"));
  run("S.ro = false");

  // ---- 규칙 파일 ----
  // 메뉴를 감추는 것은 «헷갈리지 말라»는 것이고, 진짜 문턱은 규칙이다.
  // 감추기만 하면 선생님이 브라우저 콘솔에서 minutes 를 그냥 읽는다.
  //
  // ⚠ Firestore 규칙은 **맞는 규칙이 하나라도 허용하면 허용**이다.
  //   `match /{document=**}` 로 다 열어두고 minutes 만 막는 것은 불가능하다 —
  //   그래서 컬렉션마다 따로 적는다. 그 줄이 돌아오면 회의록이 도로 열린다.
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const noComment = rules.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  ok("규칙에 «전부 열기» 줄이 없다", !/match\s*\/\{document=\*\*\}/.test(noComment),
    (noComment.match(/match\s*\/\{document=\*\*\}[^\n]*/) || [""])[0]);
  const minutes = /match\s*\/minutes\/\{[^}]*\}\s*\{([\s\S]*?)\n\s*\}/.exec(noComment);
  ok("회의록 규칙이 있다", !!minutes);
  const mb = minutes ? minutes[1] : "";
  // 팀장은 전부, 선생님은 «공개: 팀» 인 것만. 조건 없는 teacher 읽기가 한 줄이라도 있으면 간부회의가 열린다.
  const loose = mb.split("\n").filter((l) => /allow\s+read/.test(l) && /teacher/.test(l) && !/open/.test(l));
  ok("선생님 읽기에는 반드시 open 조건이 붙는다", !loose.length, loose.join(" | "));
  ok("팀장은 전부 읽는다", /allow\s+read:\s*if\s+role\(\)\s*==\s*"owner"/.test(mb), mb.trim().slice(0, 80));
  ok("쓰는 것은 팀장뿐이다", /allow\s+write:\s*if\s+role\(\)\s*==\s*"owner"/.test(mb));
  ["dash", "marks", "devtools", "devlog", "tests", "testScores"].forEach((c) => {
    ok("규칙에 " + c + " 가 있다 (없으면 아무도 못 읽는다)", new RegExp("match\\s*/" + c + "/").test(noComment));
  });
  // 팀장 전용 할 일. 한 문서 안의 배열은 규칙이 못 가르므로 문서를 나눴다 —
  // 이 조건이 빠지면 선생님이 콘솔에서 팀장 할 일을 통째로 읽는다.
  const dash = /match\s*\/dash\/\{doc\}\s*\{([\s\S]*?)\n\s*\}/.exec(noComment);
  ok("dash 규칙이 문서 이름을 본다", !!dash, "match /dash/{doc} 가 있어야 한다");
  ok("선생님은 tasksLead 를 못 읽는다",
    !!dash && /teacher/.test(dash[1]) && /doc\s*!=\s*"tasksLead"/.test(dash[1]), dash && dash[1].trim());
  // ⚠ `{doc=**}` 로 되돌리면 doc 이 Path 라 이름 비교가 무너진다
  ok("dash 는 재귀 와일드카드가 아니다", !/match\s*\/dash\/\{doc=\*\*\}/.test(noComment));

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  // 도중에 터지면 그때까지 센 것이 안 보인다 — 무엇까지 통과했는지가 곧 어디서 터졌는지다.
  console.log(T.join("\n"));
  console.log("\n시험이 도중에 터졌다: " + e.message);
  process.exit(1);
});
