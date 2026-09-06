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
function DocumentReference() {}
DocumentReference.prototype.set = function () { CALLS.push("set"); return Promise.resolve("set-ok"); };
DocumentReference.prototype.update = function () { CALLS.push("update"); return Promise.resolve("update-ok"); };
DocumentReference.prototype.delete = function () { CALLS.push("delete"); return Promise.resolve("delete-ok"); };
DocumentReference.prototype.get = function () { return Promise.resolve({ exists: false }); };
function CollectionReference() {}
CollectionReference.prototype.add = function () { CALLS.push("add"); return Promise.resolve("add-ok"); };
CollectionReference.prototype.doc = function () { return new DocumentReference(); };
CollectionReference.prototype.get = function () { return Promise.resolve({ forEach() {} }); };
function WriteBatch() {}
WriteBatch.prototype.commit = function () { CALLS.push("commit"); return Promise.resolve("commit-ok"); };
const firestoreFn = function () { return { collection: () => new CollectionReference(), batch: () => new WriteBatch() }; };
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
const rootEl = el("div");
rootEl.querySelectorAll = (sel) => ELS.filter((e) => {
  if (sel === ".card button, .card a.mini") return e.tagName === "BUTTON" || (e.tagName === "A" && e.cls.indexOf("mini") >= 0);
  if (sel === ".card input, .card textarea") return e.tagName === "INPUT" || e.tagName === "TEXTAREA";
  return [];
});
let observed = false;
const stub = {
  firebase: { initializeApp: () => ({}), firestore: firestoreFn, auth: () => ({ onAuthStateChanged() {}, currentUser: null, signOut: () => Promise.resolve() }) },
  document: { querySelector: (s) => (s === "#root" ? rootEl : null), querySelectorAll: () => [], addEventListener() {} },
  window: { addEventListener() {}, scrollTo() {} }, location: { hash: "" }, history: { replaceState() {} },
  localStorage: { getItem: () => null, setItem() {} },
  // ⚠ 흉내는 브라우저보다 너그러우면 안 된다. 2026-09-06에 이 `observe(){}` 가
  //   **아무 것이나 받아 주는 바람에** root 가 undefined 인 채로 감시를 거는 줄을 놓쳤다.
  //   브라우저에서는 «parameter 1 is not of type 'Node'» 로 터지고 앱이 통째로 안 켜졌다.
  MutationObserver: function () {
    observed = true;
    return { observe(t) { if (!t) throw new TypeError("observe: 대상이 Node 가 아니다 (root 가 아직 없다)"); } };
  },
  fetch: () => Promise.reject(new Error("no net")), alert() {}, confirm: () => true, prompt: () => null,
  console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt,
};
const ctx = vm.createContext(stub);
vm.runInContext(src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);

(async () => {
  ok("화면 감시가 걸린다 (MutationObserver)", observed);

  // ---- 쓰기 가로채기 ----
  run("S.ro = false");
  const a = await run("return tdb.collection('dash').doc('x').set({a:1})");
  ok("관리자는 그대로 쓴다", a === "set-ok" && CALLS.length === 1, JSON.stringify(CALLS));

  run("S.ro = true");
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

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})();
