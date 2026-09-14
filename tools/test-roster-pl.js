// 시트와 명단 대조 — 고PL(개진반) 칸 (2026-09-15).
//
// 마왕님: «통합명단에서 이승엽 개진반에 한 명 추가됐는데 왜 명단 대조를 해도 일치한다고 나오지?»
// 대조가 고1·예비고1 칸만 봐서 고PL 을 통째로 건너뛰었다 — 차이가 있어도 «같다».
//
// 고PL 칸에서 틀리기 쉬운 것:
//   - 칸 이름이 선생님끼리 겹친다(«고PL 일 (402호)» 이승엽·이창혁A) → 이름이 아니라 담임 줄로 맞춘다
//   - 한 선생님의 요일 칸 여럿이 반 하나다 → 칸마다 «퇴원»·«배정» 이 서면 안 된다
//   - 등원 요일 — 칸의 요일을 모아 앱 요일과 비교. 정규반 줄에는 days 를 절대 안 붙인다
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

const WROTE = [];
function DocumentReference(path) { this.path = path; }
DocumentReference.prototype.set = function (v) { WROTE.push({ path: this.path, v: v }); return Promise.resolve(); };
DocumentReference.prototype.update = function (v) {
  WROTE.push({ path: this.path, v: v });
  // 반 명단을 진짜처럼 고친다 — stSetDay 를 두 번 부르면 두 번째가 첫 번째 위에 얹혀야 한다
  const m = /^classes\/(.+)$/.exec(this.path);
  if (m && v.roster) vm.runInContext(`S.classes.filter(function(c){ return c.id === ${JSON.stringify(m[1])}; })[0].roster = ${JSON.stringify(v.roster)}`, ctx);
  return Promise.resolve();
};
DocumentReference.prototype.delete = function () { WROTE.push({ path: this.path, del: true }); return Promise.resolve(); };
DocumentReference.prototype.get = function () {
  const m = /^classes\/(.+)$/.exec(this.path);
  if (m) { const c = val("S.classes").filter((x) => x.id === m[1])[0]; if (c) return Promise.resolve({ exists: true, data: () => JSON.parse(JSON.stringify(c)) }); }
  return Promise.resolve({ exists: false, data: () => ({}) });
};
DocumentReference.prototype.onSnapshot = function () { return function () {}; };
function CollectionReference(name) { this.name = name; }
CollectionReference.prototype.doc = function (id) { return new DocumentReference(this.name + "/" + id); };
CollectionReference.prototype.get = function () { return Promise.resolve({ forEach() {} }); };
CollectionReference.prototype.add = function (v) { WROTE.push({ path: this.name, v: v }); return Promise.resolve({ id: "new" + WROTE.length }); };
CollectionReference.prototype.onSnapshot = function () { return function () {}; };
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
    getAttribute: () => "", setAttribute() {}, hasAttribute: () => false, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], onclick: null, oninput: null, focus() {}, closest: () => o, scrollTop: 0 };
  return o;
}
let SHEET = { meta: { tabs: [] }, values: [] };
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
vm.runInContext(`sheetsApi = function (b) { return SHEETS_FAKE(b); }`, Object.assign(ctx, {
  SHEETS_FAKE: (b) => (b.action === "meta" ? Promise.resolve(SHEET.meta) : Promise.resolve({ values: SHEET.values })),
}));
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const val = (e) => JSON.parse(vm.runInContext("JSON.stringify(" + e + ")", ctx) || "null");

// ---- 시트 흉내: 실제 «26년 9월» 탭의 고PL 모양 (이름은 지어낸 것) ----
// 덩어리 0(월금): 정규 예비고1 A · 고PL 월(박리안) · 고PL 수A(이창혁A) · 고PL 금(박리안) · 고PL 일(이승엽) · 고PL 일(이창혁A, 이름이 겹친다) · 중PL
// 덩어리 1(화목): 고PL 토2부A(박리안) · 고PL 화C(한민수)
// 덩어리 2(다른 관): 고PL 월 — 안 본다
const GRID = [
  ["", "", "", "월금"],
  ["", "", "반", "예비고1\nA(401호)", "고PL 월\n(204호)", "고PL 수A\n(402호)", "고PL 금\n(204호)", "고PL 일\n(402호)", "고PL 일\n(402호)", "중PL 월A"],
  ["", "", "담임", "박준성", "박리안", "이창혁A", "박리안", "이승엽", "이창혁A", "권성기"],
  ["", "재원", "1", "김우찬9", "강지원9", "김민솔10", "강지원9", "김우찬9", "김민솔10", "김중등7"],
  ["", "", "2", "장윤호9", "박보민9", "", "", "장윤호9", "", ""],
  ["", "", "3", "", "", "", "", "N박재민9", "", ""],
  ["", "신입예정", "1"],
  ["", "퇴원", "", "", "", "", "이은새9"],
  [],
  ["", "", "", "화목"],
  ["", "", "반", "고PL 토2부A\n(204호)", "고PL 화C\n(201호)"],
  ["", "", "담임", "박리안", "한민수"],
  ["", "재원", "1", "박보민9", "N신학생10"],
  ["", "퇴원"],
  [],
  ["", "", "", "월금"],
  ["", "", "반", "고PL 월\n(301호)"],
  ["", "", "담임", "박리안"],
  ["", "재원", "1", "다른관9"],
  ["", "퇴원"],
];
const t = (name) => ({ id: "t", name, teacher: true, days: [] });
const setup = () => {
  WROTE.length = 0;
  run(`
    S.teamOk = true; S.ro = false;
    S.claims = { role:"owner", tid:"TH", name:"한민수" };
    S.teachers = [
      { tid:"TH", name:"한민수", classIds:["k4"], role:"owner" }, { tid:"TP", name:"박리안", classIds:["k3"] },
      { tid:"TL", name:"이승엽", classIds:["k1"] }, { tid:"TC", name:"이창혁A", classIds:["k2"] }, { tid:"TJ", name:"박준성", classIds:["c1"] } ];
    S.classes = [
      { id:"c1", name:"예비고1A 월금", classDays:[1,5], roster:[
        { id:"r1", pid:"pw", name:"김우찬", grade:"중3" }, { id:"r2", pid:"py", name:"장윤호", grade:"중3" } ] },
      { id:"k1", name:"개진반 이승엽", type:"individual", classDays:[], roster:[ ${JSON.stringify(t("이승엽"))},
        { id:"s1", pid:"pw", name:"김우찬", grade:"중3", days:[0] }, { id:"s2", pid:"py", name:"장윤호", grade:"중3", days:[0] } ] },
      { id:"k2", name:"개진반 이창혁A", type:"individual", classDays:[], roster:[ ${JSON.stringify(t("이창혁A"))},
        { id:"s3", pid:"pm", name:"김민솔", grade:"고1", days:[0,3] } ] },
      { id:"k3", name:"개진반 박리안", type:"individual", classDays:[], roster:[ ${JSON.stringify(t("박리안"))},
        { id:"s4", pid:"pk", name:"강지원", grade:"중3", days:[1,5] }, { id:"s5", pid:"pb", name:"박보민", grade:"중3", days:[1] },
        { id:"s6", pid:"ps", name:"이소율", grade:"중3", days:[1] } ] },
      // 선생님 줄이 없는 개진반 — 반 이름으로 선생님을 읽는다
      { id:"k4", name:"개진반 한민수", type:"individual", classDays:[], roster:[] }
    ];
    S.students = [
      { pid:"pw", name:"김우찬", grade:"중3" }, { pid:"py", name:"장윤호", grade:"중3" }, { pid:"pm", name:"김민솔", grade:"고1" },
      { pid:"pk", name:"강지원", grade:"중3" }, { pid:"pb", name:"박보민", grade:"중3" }, { pid:"ps", name:"이소율", grade:"중3" },
      { pid:"pj", name:"박재민", grade:"중3", homeroom:"TL" }      // 사람은 있는데 반 명단에 없다 — 실제로 이랬다
    ];
    S.byPid = {}; S.students.forEach(function (x) { S.byPid[x.pid] = x; });
    S.config = { sources: { roster: { id:"SHEET1", gid:"77" } }, rosterMap: {}, rosterIgnore: {} };
    S.marks = {}; S.tasks = []; S.tasksOpen = []; S.tasksLead = []; S.own = {}; S.newIds = []; S.newSeen = true; S.bellOpen = false;
    S.sheetCols = null; S.diff = null; S.diffErr = ""; S.diffSig = ""; S.diffN = 0; S.diffAt = 0; S.diffBusy = false; S.diffTab = ""; S.diffDoc = null; S.stDiffOpen = true;
  `);
  SHEET = { meta: { tabs: [{ title: "26년 9월", gid: 77 }] }, values: GRID };
};

(async () => {
  setup();
  const all = val(`parseRosterSheet(${JSON.stringify(GRID)})`);
  const high = val(`highCols(parseRosterSheet(${JSON.stringify(GRID)}))`);
  const lab = (c) => c.label.replace(/\s+/g, " ") + "/" + c.teacher;

  // ---- 어느 칸을 보나 ----
  ok("고PL 칸이 들어온다 — 덩어리 0·1 의 7칸", high.filter((c) => /^고PL/.test(c.key)).length === 7, high.map(lab).join(" | "));
  ok("정규반 칸도 그대로", high.some((c) => c.key === "예비고1A"));
  ok("중PL 은 안 본다", !high.some((c) => /^중PL/.test(c.key)));
  ok("셋째 덩어리(다른 관)의 고PL 은 안 본다", !high.some((c) => c.teacher === "박리안" && /301/.test(c.label)) && all.some((c) => /301/.test(c.label)));

  // ---- 칸의 요일 ----
  const day = (label) => val(`plDay({ label: ${JSON.stringify(label)} })`);
  ok("«고PL 월» 은 월(1)", day("고PL 월\n(204호)") === 1);
  ok("«고PL 수A» 는 수(3)", day("고PL 수A\n(402호)") === 3);
  ok("«고PL 토2부A» 는 토(6)", day("고PL 토2부A\n(204호)") === 6);
  ok("«고PL 일D» 는 일(0)", day("고PL 일D (401호)") === 0);
  ok("요일 글자가 없으면 -1", day("고PL\n(204호)") === -1 && day("고PL 오전") === -1);

  // ---- 칸 ↔ 개진반 ----
  let m = val(`matchSheetCols(highCols(parseRosterSheet(${JSON.stringify(GRID)})))`);
  const cidOf = (label, teacher) => (m.filter((x) => x.col.label.replace(/\s+/g, " ") === label && x.col.teacher === teacher)[0] || {}).cid;
  ok("담임 줄로 맞춘다 — «고PL 일» 이승엽 → 개진반 이승엽", cidOf("고PL 일 (402호)", "이승엽") === "k1");
  ok("같은 칸 이름이라도 이창혁A 는 개진반 이창혁A", cidOf("고PL 일 (402호)", "이창혁A") === "k2");
  ok("한 선생님의 요일 칸 여럿이 한 반으로 — 박리안 월·금·토2부A → k3",
    cidOf("고PL 월 (204호)", "박리안") === "k3" && cidOf("고PL 금 (204호)", "박리안") === "k3" && cidOf("고PL 토2부A (204호)", "박리안") === "k3");
  ok("선생님 줄이 없는 개진반은 반 이름으로 — 한민수", cidOf("고PL 화C (201호)", "한민수") === "k4");
  ok("정규반 칸은 예전처럼 이름으로", cidOf("예비고1 A(401호)", "박준성") === "c1");
  ok("손으로 정하는 열쇠에 담임이 붙는다 — 겹치는 두 «고PL 일» 이 다르다", (() => {
    const two = high.filter((c) => /^고PL일/.test(c.key)).map((c) => val(`colMapKey(${JSON.stringify(c)})`));
    return two.length === 2 && two[0] !== two[1];
  })());
  ok("정규반 열쇠는 그대로 (예전에 손으로 정한 것이 안 깨진다)", val(`colMapKey(${JSON.stringify(high.filter((c) => c.key === "예비고1A")[0])})`) === "예비고1 A(401호)|월금");
  run(`S.classes.push({ id:"k5", name:"개진반 이승엽 (2)", type:"individual", classDays:[], roster:[ { id:"t", name:"이승엽", teacher:true } ] })`);
  m = val(`matchSheetCols(highCols(parseRosterSheet(${JSON.stringify(GRID)})))`);
  ok("같은 선생님 개진반이 둘이면 손을 뗀다", cidOf("고PL 일 (402호)", "이승엽") === "");
  setup();
  run(`S.config.rosterMap[colMapKey(highCols(parseRosterSheet(${JSON.stringify(GRID)})).filter(function(c){ return c.teacher === "이승엽"; })[0])] = ""`);
  m = val(`matchSheetCols(highCols(parseRosterSheet(${JSON.stringify(GRID)})))`);
  ok("«앱에 없는 반» 으로 정해 두면 그 칸만 빠진다", cidOf("고PL 일 (402호)", "이승엽") === "" && cidOf("고PL 일 (402호)", "이창혁A") === "k2");

  // ---- 차이 ----
  setup();
  const D = () => val(`rosterDiff(highCols(parseRosterSheet(${JSON.stringify(GRID)})))`);
  let d = D();
  const find = (kind, name) => d.filter((x) => x.kind === kind && x.name === name)[0];
  const list = () => d.map((x) => x.kind + ":" + x.name + ":" + (x.to || x.from) + ":" + JSON.stringify(x.days || null)).join(" , ");
  ok("이번 일 — 박재민이 이승엽 개진반에 «배정» · 일", !!find("배정", "박재민") && find("배정", "박재민").to === "k1" && JSON.stringify(find("배정", "박재민").days) === "[0]", list());
  ok("시트에만 있고 사람도 없으면 «신입» · 화", !!find("신입", "신학생") && find("신입", "신학생").to === "k4" && JSON.stringify(find("신입", "신학생").days) === "[2]", list());
  ok("요일이 늘었으면 «요일» — 박보민 월 → 월·토", !!find("요일", "박보민") && JSON.stringify(find("요일", "박보민").was) === "[1]" && JSON.stringify(find("요일", "박보민").days) === "[1,6]", list());
  ok("앱 개진반에만 있으면 «퇴원» — 이소율", !!find("퇴원", "이소율") && find("퇴원", "이소율").from === "k3");
  ok("요일 칸 여럿에 걸친 학생은 한 번만 본다 — 강지원 월·금 은 같다", !d.some((x) => x.name === "강지원"), list());
  ok("겹치는 칸 이름에 안 섞인다 — 김민솔은 이승엽 반으로 안 간다", !d.some((x) => x.name === "김민솔"), list());
  ok("정규반·개진반 둘 다 듣는 학생은 조용하다 — 김우찬·장윤호", !d.some((x) => x.name === "김우찬" || x.name === "장윤호"), list());
  ok("차이는 딱 넷", d.length === 4, list());
  ok("퇴원 예고 칸의 학생은 차이가 아니다 — 이은새", !d.some((x) => x.name === "이은새"));
  ok("다른 관 고PL 학생은 차이가 아니다", !d.some((x) => x.name === "다른관"));

  // 요일이 줄었을 때 · 없을 때
  run(`S.classes[3].roster[1].days = [1,5,6]`);   // 강지원 앱 월·금·토, 시트 월·금
  d = D();
  ok("요일이 줄어도 «요일» — 강지원 월금토 → 월금", !!find("요일", "강지원") && JSON.stringify(find("요일", "강지원").days) === "[1,5]", list());
  run(`S.classes[3].roster[1].days = []`);
  d = D();
  ok("앱 요일이 비어 있어도 «요일» 로 짚는다", !!find("요일", "강지원") && JSON.stringify(find("요일", "강지원").was) === "[]");
  // 정규반으로 가는 줄에는 요일이 없다
  setup(); run(`S.classes[0].roster.pop()`);        // 장윤호를 정규반에서 뺀다 → 시트에는 있다 → 배정 c1
  d = D();
  ok("정규반으로 가는 «배정» 에는 요일이 안 붙는다", !!find("배정", "장윤호") && find("배정", "장윤호").to === "c1" && !("days" in find("배정", "장윤호")), JSON.stringify(find("배정", "장윤호")));
  ok("정규반은 «요일» 줄이 안 선다", !d.some((x) => x.kind === "요일" && x.to === "c1"));

  // 요일 글자를 못 읽은 칸
  setup();
  const NODAY = JSON.parse(JSON.stringify(GRID)); NODAY[1][4] = "고PL\n(204호)"; NODAY[1][6] = "고PL 오전\n(204호)";   // 박리안 월·금 칸의 요일이 사라졌다
  d = val(`rosterDiff(highCols(parseRosterSheet(${JSON.stringify(NODAY)})))`);
  ok("요일을 못 읽은 칸의 학생은 요일을 안 따진다 — 틀린 «요일» 줄보다 안 묻는 게 낫다", !d.some((x) => x.kind === "요일" && x.name === "강지원"), list());

  // 전반 — 개진반끼리
  setup(); run(`S.classes[2].roster.push({ id:"s9", pid:"pk", name:"강지원", grade:"중3", days:[3] }); S.classes[3].roster.splice(1, 1)`);
  d = D();
  ok("개진반끼리 옮기면 «전반» · 새 반의 시트 요일", !!find("전반", "강지원") && find("전반", "강지원").from === "k2" && find("전반", "강지원").to === "k3" && JSON.stringify(find("전반", "강지원").days) === "[1,5]", list());

  // ---- 무시 열쇠 ----
  setup();
  ok("«요일» 줄의 열쇠에는 요일이 들어간다 — 무시한 뒤 또 바뀌면 다시 묻는다",
    val(`diffKey({ kind:"요일", name:"박보민", to:"k3", days:[1,6] })`) !== val(`diffKey({ kind:"요일", name:"박보민", to:"k3", days:[1,3,6] })`));
  ok("다른 줄의 열쇠는 예전 그대로 (무시해 둔 것이 안 풀린다)", val(`diffKey({ kind:"배정", name:"박재민", to:"k1", days:[0] })`) === "배정|박재민||k1");

  // ---- 그린 것 ----
  setup();
  await run("return checkRosterSheet()");
  const box = run("return rosterDiffBox()");
  ok("머리에 «고등부 1반 · 개진 7칸»", box.indexOf("고등부 1반 · 개진 7칸") >= 0, (box.match(/고등부[^<]*/) || [""])[0]);
  ok("«4건 다르다»", box.indexOf("4건 다르다") >= 0);
  ok("배정 줄에 반과 요일 — «개진반 이승엽 · 일»", box.indexOf("개진반 이승엽 · 일") >= 0);
  ok("요일 줄에 전과 후 — «개진반 박리안 · 월 → 월토»", box.indexOf("개진반 박리안 · 월 → 월토") >= 0);
  ok("«요일» 줄에도 반영·무시 단추", (box.match(/data-diff-apply=/g) || []).length === 4);
  ok("대조만으로는 명단에 아무것도 안 쓴다", !WROTE.some((w) => /^classes\//.test(w.path) || w.path === "students"), JSON.stringify(WROTE.map((w) => w.path)));

  // ---- 반영 ----
  const it = (kind, name) => val("S.diff.items").filter((x) => x.kind === kind && x.name === name)[0];
  WROTE.length = 0;
  await run(`return applyDiffItem(${JSON.stringify(it("배정", "박재민"))})`);
  {
    const w = WROTE.filter((x) => x.path === "classes/k1" && x.v.roster).pop();
    const row = w && w.v.roster.filter((r) => r.pid === "pj")[0];
    ok("«배정» — 이승엽 개진반에 넣고 요일은 일", !!row && JSON.stringify(row.days) === "[0]", JSON.stringify(row));
    ok("다른 반은 안 건드린다", !WROTE.some((x) => /^classes\/(c1|k2|k3|k4)$/.test(x.path)));
  }
  WROTE.length = 0;
  await run(`return applyDiffItem(${JSON.stringify(it("신입", "신학생"))})`);
  {
    const made = WROTE.filter((x) => x.path === "students")[0];
    ok("«신입» — 사람을 만든다 · 담임은 그 개진반 선생님(9/14 결정)", !!made && made.v.name === "신학생" && made.v.grade === "고1" && made.v.homeroom === "TH", JSON.stringify(made && made.v));
    const w = WROTE.filter((x) => x.path === "classes/k4" && x.v.roster).pop();
    ok("«신입» — 한민수 개진반에 화요일로", !!w && w.v.roster.some((r) => r.name === "신학생" && JSON.stringify(r.days) === "[2]"), JSON.stringify(w && w.v));
  }
  WROTE.length = 0;
  await run(`return applyDiffItem(${JSON.stringify(it("요일", "박보민"))})`);
  {
    const rows = val(`S.classes.filter(function(c){ return c.id === "k3"; })[0].roster`);
    ok("«요일» — 박보민 월 → 월·토", JSON.stringify(rows.filter((r) => r.pid === "pb")[0].days) === "[1,6]", JSON.stringify(rows));
    ok("«요일» — 같은 반 다른 학생 요일은 그대로", JSON.stringify(rows.filter((r) => r.pid === "pk")[0].days) === "[1,5]");
    ok("«요일» — 바뀐 요일만 쓴다 (토 하나 → 한 번)", WROTE.filter((x) => x.path === "classes/k3" && x.v.roster).length === 1, String(WROTE.filter((x) => x.path === "classes/k3").length));
  }
  // 요일 둘이 동시에 바뀌면 둘 다 얹힌다 (두 번째 쓰기가 첫 번째를 덮지 않는다)
  setup(); run(`S.classes[3].roster[1].days = [3]`);   // 강지원 앱 수, 시트 월·금
  await run("return checkRosterSheet()");
  WROTE.length = 0;
  await run(`return applyDiffItem(${JSON.stringify(val("S.diff.items").filter((x) => x.kind === "요일" && x.name === "강지원")[0])})`);
  ok("«요일» 수 → 월·금 — 셋 다 반영된다", JSON.stringify(val(`S.classes[3].roster[1].days`)) === "[1,5]", JSON.stringify(val(`S.classes[3].roster[1]`)));
  // 정규반 배정에는 days 가 안 붙는다
  setup(); run(`S.classes[0].roster.pop()`);
  await run("return checkRosterSheet()");
  WROTE.length = 0;
  await run(`return applyDiffItem(${JSON.stringify(val("S.diff.items").filter((x) => x.kind === "배정" && x.name === "장윤호")[0])})`);
  {
    const w = WROTE.filter((x) => x.path === "classes/c1" && x.v.roster).pop();
    const row = w && w.v.roster.filter((r) => r.pid === "py")[0];
    ok("정규반 «배정» 줄에는 days 가 없다 — 참여표 회차가 안 틀어진다", !!row && !("days" in row), JSON.stringify(row));
  }
  // 반영하고 나면 같아진다
  setup();
  await run("return checkRosterSheet()");
  for (const x of val("S.diff.items")) await run(`return applyDiffItem(${JSON.stringify(x)})`);
  // 신입이 만든 사람이 S.students 에 들어갔으니 다시 셈한다
  run("applyRosterDiff()");
  ok("넷 다 반영하면 «같다»", val("S.diffN") === 0, JSON.stringify(val("S.diff.items")));

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log(T.join("\n")); console.log("\n도중에 터졌다:", e.stack); process.exit(1); });
