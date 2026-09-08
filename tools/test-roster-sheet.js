// 시트와 명단 대조 — 데스크의 «인원 현황» 시트를 읽어 앱 명단과 다른 곳만 팀장에게 보인다.
//
// 여기서 틀리면 **학생이 잘못 옮겨진다.** 이름을 잘못 읽으면 없는 사람이 «신입» 이 되고,
// 반을 잘못 맞추면 멀쩡한 반이 통째로 «퇴원» 이 되고, 동명이인을 섞으면 남의 기록에 붙는다.
// 그리고 이 화면은 **아무것도 저절로 바꾸면 안 된다** — 그것도 여기서 센다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

const WROTE = [];
function DocumentReference(path) { this.path = path; }
DocumentReference.prototype.set = function (v) { WROTE.push({ path: this.path, v: v }); return Promise.resolve(); };
DocumentReference.prototype.update = function (v) { WROTE.push({ path: this.path, v: v }); return Promise.resolve(); };
DocumentReference.prototype.delete = function () { WROTE.push({ path: this.path, del: true }); return Promise.resolve(); };
// 반 문서는 진짜처럼 돌려준다 — withFreshRoster 가 «방금 읽은 것 위에» 얹으므로, 빈 것을 주면 pastIds 가 안 적히는 척 보인다
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
const CALLS = [];
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
// 시트 API 흉내 — 무엇을 불렀는지 남긴다
vm.runInContext(`sheetsApi = function (b) { return SHEETS_FAKE(b); }`, Object.assign(ctx, {
  SHEETS_FAKE: (b) => { CALLS.push(b.action); return b.action === "meta" ? Promise.resolve(SHEET.meta) : Promise.resolve({ values: SHEET.values }); },
}));
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const val = (e) => JSON.parse(vm.runInContext("JSON.stringify(" + e + ")", ctx) || "null");
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---- 시트 흉내: 실제 «26년 9월 예상» 탭의 모양 그대로 (이름은 지어낸 것) ----
// 덩어리 하나: 인원줄·요일줄·반줄·담임줄·재원 1~4·신입예정 1~2·퇴원 — 그리고 오른쪽 FP 격자
const GRID = [
  [], [], [], [], [], [],
  ["", "", "", "3", "2", "2", "", "", "1"],                                            // 6 인원
  ["", "", "", "월금", "월금", "토", "", "강좌명"],                                       // 7 요일 (FP 쪽은 «강좌명» 글자)
  // FP 격자는 실제 시트처럼 머리글과 학생이 같은 열이다 (H열 = «강좌명»/«재원»/번호, I열부터 강좌)
  ["", "", "반", "고1S\n(201호)", "예비고1\nS(404호)", "고1 자사\n토1부(201호)", "", "", "강좌명", "(수)개별진도"],   // 8 반
  ["", "", "담임", "한민수", "이현우", "한민수", "", "", "강사", "이창혁A"],
  ["", "재원", "1", "김서진10", "이수민9", "진유준10", "", "재원", "1", "우서연8"],
  ["", "", "2", "임서윤10", "N최은우9", "", "", "", "2", "이규민8"],
  ["", "", "3", "김태윤10", "", "", "", "", "3"],
  ["", "", "4", "", "", "", "", "", "4"],
  ["", "신입예정", "1", "", "N박준호9"],
  ["", "", "2"],
  ["", "퇴원", "", "", "정하늘9"],
  [],
  // 둘째 덩어리 — 화목
  ["", "", "", "1"],
  ["", "", "", "화목"],
  ["", "", "반", "예비고1\nS(402호)"],
  ["", "", "담임", "정찬준"],
  ["", "재원", "1", "이수민9"],
  ["", "", "2", "오태윤9"],
  ["", "신입예정", "1"],
  ["", "퇴원"],
];
const CLASSES = [
  { id: "c1", name: "고1S (201호)" },
  { id: "c2", name: "예비고1S 월금" },
  { id: "c3", name: "예비고1S 화목" },
  { id: "c4", name: "고1 자사 토1부" },
  { id: "c5", name: "고1T (402호)" },        // 시트에 없는 앱 반
  { id: "c9", name: "옛날 반", endDate: "2020-01-01" },
];
const setup = (who) => {
  WROTE.length = 0; CALLS.length = 0;
  run(`
    S.teamOk = true;
    S.claims = ${who === "teacher" ? `{ role:"teacher", tid:"T3", name:"이현우" }` : `{ role:"owner", tid:"T1", name:"한민수" }`};
    S.ro = ${who === "teacher" ? "true" : "false"};
    S.teachers = [{ tid:"T1", name:"한민수", classIds:["c1"], role:"owner" }, { tid:"T3", name:"이현우", classIds:["c2"] }];
    S.classes = ${JSON.stringify(CLASSES)};
    S.students = [
      { pid:"p1", name:"김서진", grade:"고1" }, { pid:"p2", name:"임서윤", grade:"고1" }, { pid:"p3", name:"김태윤", grade:"고1" },
      { pid:"p4", name:"이수민", grade:"중3" }, { pid:"p5", name:"진유준", grade:"고1" },
      { pid:"p6", name:"오태윤", grade:"중3" },
      { pid:"p7", name:"박보민", grade:"고1" },        // 앱에만 있다 (고1S) → 퇴원
      { pid:"p8", name:"최은우", grade:"중3" }         // 사람은 있는데 반이 없다 → 배정
    ];
    S.byPid = {}; S.students.forEach(function (x) { S.byPid[x.pid] = x; });
    S.classes[0].roster = [{ id:"r1", pid:"p1", name:"김서진", grade:"고1" }, { id:"r2", pid:"p2", name:"임서윤", grade:"고1" },
                           { id:"r3", pid:"p3", name:"김태윤", grade:"고1" }, { id:"r7", pid:"p7", name:"박보민", grade:"고1" }];
    S.classes[1].roster = [{ id:"r4", pid:"p4", name:"이수민", grade:"중3" }];
    S.classes[2].roster = [{ id:"r6", pid:"p6", name:"오태윤", grade:"중3" }];   // 이수민은 시트에서 화목반에도 있다 → 배정
    S.classes[3].roster = [{ id:"r5", pid:"p5", name:"진유준", grade:"고1" }];
    S.config = { sources: { roster: { id:"SHEET1", gid:"77", url:"https://docs.google.com/spreadsheets/d/SHEET1/edit#gid=77" } }, rosterMap: {}, rosterIgnore: {} };
    S.marks = {}; S.tasks = []; S.tasksOpen = []; S.tasksLead = []; S.own = {};
    S.newIds = []; S.newSeen = true; S.bellOpen = false;
    S.sheetCols = null; S.diff = null; S.diffErr = ""; S.diffSig = ""; S.diffN = 0; S.diffAt = 0; S.diffBusy = false; S.diffTab = ""; S.diffDoc = null; S.stDiffOpen = true;
  `);
  SHEET = { meta: { title: "인원 현황", tabs: [{ title: "다른 탭", gid: 1 }, { title: "26년 9월 예상", gid: 77 }] }, values: GRID };
};

(async () => {
  // ---- 칸 하나 읽기 ----
  const nm = (c) => val(`parseSheetName(${JSON.stringify(c)})`);
  ok("«이름+학년숫자» 를 가른다", JSON.stringify(nm("김서진10")) === JSON.stringify({ name: "김서진", grade: "고1", isNew: false, raw: "김서진10" }), JSON.stringify(nm("김서진10")));
  ok("9 는 중3", nm("이수민9").grade === "중3");
  ok("앞의 N 은 신입 표시다 — 이름에 안 들어간다", nm("N최은우9").name === "최은우" && nm("N최은우9").isNew === true);
  ok("뒤의 a·A 는 동명이인 표시 — 이름의 일부다 (앱도 그렇게 가른다)", nm("김지완A8").name === "김지완A" && nm("김준우b7").name === "김준우b");
  ok("학년이 없어도 이름은 읽는다", nm("선범").name === "선범" && nm("선범").grade === "");
  ok("«재원»·«신입예정»·«퇴원» 같은 구역 말은 이름이 아니다", nm("재원") === null && nm("신입예정") === null && nm("퇴원") === null);
  ok("숫자·시간·빈칸은 이름이 아니다", nm("6") === null && nm("17-22") === null && nm("") === null && nm(null) === null);
  ok("모르는 학년 숫자는 학년을 비운다", nm("홍길동99").grade === "");

  // ---- 반 이름 열쇠 ----
  const key = (v) => val(`normClassKey(${JSON.stringify(v)})`);
  ok("줄바꿈·호수·빈칸을 뗀다", key("고1S\n(201호)") === "고1S" && key("고1S (201호)") === "고1S");
  ok("소문자도 같다", key("고1s") === "고1S");
  ok("끝의 «반» 을 뗀다", key("예비고1S반") === "예비고1S");
  ok("가운데 빈칸도 뗀다", key("예비고1\nS(404호)") === "예비고1S" && key("고1 자사\n토1부(201호)") === "고1자사토1부");
  ok("요일 꼬리를 뗀다", val(`stripDays("예비고1S화목")`) === "예비고1S" && val(`stripDays("고1S")`) === "고1S");

  // ---- 시트 통째로 읽기 ----
  setup();
  const cols = val(`parseRosterSheet(${JSON.stringify(GRID)})`);
  ok("반 열을 다 찾는다 (FP 격자까지)", cols.length === 5, cols.map((c) => c.label.replace(/\n/g, " ")).join(" | "));
  ok("«강좌명» 은 반이 아니다", !cols.some((c) => c.label === "강좌명"));
  const c1 = cols[0];
  ok("반 이름·요일·담임을 읽는다", c1.label === "고1S\n(201호)" && c1.day === "월금" && c1.teacher === "한민수", JSON.stringify([c1.label, c1.day, c1.teacher]));
  ok("재원만 학생이다", c1.students.map((p) => p.name).join(",") === "김서진,임서윤,김태윤", c1.students.map((p) => p.name).join(","));
  const c2 = cols[1];
  ok("신입예정은 따로 (예고)", c2.joining.map((p) => p.name).join(",") === "박준호", JSON.stringify(c2.joining));
  ok("퇴원 줄도 따로 (예고)", c2.leaving.map((p) => p.name).join(",") === "정하늘", JSON.stringify(c2.leaving));
  ok("빈 줄 뒤 둘째 덩어리도 읽는다", cols[4].label === "예비고1\nS(402호)" && cols[4].day === "화목" && cols[4].students.length === 2, JSON.stringify(cols[4]));
  ok("FP 격자의 «재원» 글자를 학생으로 안 읽는다", !cols.some((c) => c.students.some((p) => p.name === "재원")));

  // ---- 시트 열 ↔ 앱 반 ----
  setup();
  const M = () => val(`matchSheetCols(parseRosterSheet(${JSON.stringify(GRID)}))`);
  let m = M();
  const cidOf = (label) => (m.filter((x) => x.col.label === label)[0] || {}).cid;
  ok("호수가 있어도 «고1S» 로 맞춘다", cidOf("고1S\n(201호)") === "c1", cidOf("고1S\n(201호)"));
  ok("요일까지 붙여 «예비고1S 월금» 을 맞춘다", cidOf("예비고1\nS(404호)") === "c2", cidOf("예비고1\nS(404호)"));
  ok("같은 반 이름이라도 화목은 화목 반으로", cidOf("예비고1\nS(402호)") === "c3", cidOf("예비고1\nS(402호)"));
  ok("빈칸이 달라도 맞춘다", cidOf("고1 자사\n토1부(201호)") === "c4");
  ok("앱에 없는 열은 안 맞춘다", cidOf("(수)개별진도") === "");
  // 둘 다 맞으면 안 맞춘 것으로 — 팀장이 고른다
  run(`S.classes.push({ id:"c1b", name:"고1S 화목" })`);
  m = M();
  ok("둘 이상 맞으면 손을 뗀다", (() => { const x = m.filter((q) => q.col.label === "고1S\n(201호)")[0]; return x.cid === "" && x.hits.length === 2; })(),
    JSON.stringify(m.filter((q) => q.col.label === "고1S\n(201호)")[0]));
  run(`S.config.rosterMap = {}; S.config.rosterMap[colMapKey(parseRosterSheet(${JSON.stringify(GRID)})[0])] = "c1"`);
  m = M();
  ok("손으로 정한 것이 먼저다", cidOf("고1S\n(201호)") === "c1" && m[0].manual === true);
  run(`S.config.rosterMap[colMapKey(parseRosterSheet(${JSON.stringify(GRID)})[0])] = ""`);
  m = M();
  ok("«앱에 없는 반» 으로 정한 것도 기억한다", cidOf("고1S\n(201호)") === "" && m[0].manual === true);
  ok("종강한 반은 후보가 아니다", !m.some((x) => x.hits.indexOf("c9") >= 0 || x.cid === "c9"));

  // ---- 차이 ----
  setup();
  const D = () => val(`rosterDiff(parseRosterSheet(${JSON.stringify(GRID)}))`);
  let d = D();
  const find = (kind, name) => d.filter((x) => x.kind === kind && x.name === name)[0];
  ok("같은 사람은 안 나온다", !d.some((x) => x.name === "김서진" || x.name === "진유준"), d.map((x) => x.kind + ":" + x.name).join(","));
  ok("앱에만 있으면 «퇴원» — 반에서 빼기다", !!find("퇴원", "박보민") && find("퇴원", "박보민").from === "c1" && find("퇴원", "박보민").pid === "p7", JSON.stringify(find("퇴원", "박보민")));
  ok("사람은 있는데 반이 없으면 «배정»", !!find("배정", "최은우") && find("배정", "최은우").to === "c2" && find("배정", "최은우").pid === "p8", JSON.stringify(d));
  ok("한 사람이 시트에서 반 하나 더 있으면 «배정» (전반이 아니다)", !!find("배정", "이수민") && find("배정", "이수민").to === "c3");
  ok("시트에만 있고 앱에도 없으면 «신입» — 학년을 같이 넘긴다", (() => {
    // 화목 반의 오태윤은 둘 다 있다. 신입은 아직 없다 — 하나 만들어 본다
    return true;
  })());
  run(`S.classes[2].roster = []`);                       // 오태윤을 앱에서 지우면 → 시트에만 있다. 사람 문서(p6)는 있다 → 배정
  d = D();
  ok("사람 문서가 있으면 신입이 아니라 배정", !!find("배정", "오태윤"));
  run(`S.students = S.students.filter(function (x) { return x.pid !== "p6"; })`);
  d = D();
  ok("사람 문서도 없으면 «신입»", !!find("신입", "오태윤") && find("신입", "오태윤").grade === "중3" && find("신입", "오태윤").to === "c3", JSON.stringify(find("신입", "오태윤")));
  // 전반
  setup();
  run(`S.classes[0].roster.push({ id:"r9", pid:"p5", name:"진유준", grade:"고1" }); S.classes[3].roster = []`);   // 앱: 진유준이 고1S. 시트: 자사반
  d = D();
  ok("앱은 이 반, 시트는 저 반이면 «전반»", !!find("전반", "진유준") && find("전반", "진유준").from === "c1" && find("전반", "진유준").to === "c4", JSON.stringify(find("전반", "진유준")));
  ok("전반은 한 줄이다 — 퇴원+신입 둘로 안 갈린다", d.filter((x) => x.name === "진유준").length === 1);
  // 동명이인
  setup();
  run(`S.students.push({ pid:"p9", name:"김서진", grade:"중3" }); S.classes[1].roster.push({ id:"r8", pid:"p9", name:"김서진", grade:"중3" })`);
  d = D();
  ok("같은 이름이 앱에 둘이면 «확인» — 아무 데도 안 붙인다", !!find("확인", "김서진") && !d.some((x) => x.name === "김서진" && x.kind !== "확인"), JSON.stringify(d.filter((x) => x.name === "김서진")));
  // 시트에 없는 앱 반은 할 말이 없다
  setup();
  run(`S.classes[4].roster = [{ id:"r10", pid:"p2", name:"임서윤", grade:"고1" }]`);   // 고1T 는 시트에 없다
  d = D();
  ok("시트에 없는 앱 반의 학생은 «퇴원» 이 아니다", !d.some((x) => x.from === "c5"), JSON.stringify(d));

  // ---- 지문 · 무시 ----
  setup();
  run("S.sheetCols = parseRosterSheet(" + JSON.stringify(GRID) + "); applyRosterDiff()");
  const sig1 = val("S.diffSig"), n1 = val("S.diffN");
  ok("차이가 있으면 지문이 생긴다", !!sig1 && n1 === 3, sig1 + " / " + n1);
  ok("줄 순서가 달라도 지문은 같다", val(`sigOf(["a|x","b|y"])`) === val(`sigOf(["b|y","a|x"])`));
  ok("한 줄이 바뀌면 지문이 바뀐다", val(`sigOf(["a|x","b|y"])`) !== val(`sigOf(["a|x","b|z"])`));
  await run(`return ignoreDiffItem(S.diff.items[0])`);
  run("applyRosterDiff()");
  ok("무시하면 줄이 빠지고 지문이 바뀐다", val("S.diffN") === n1 - 1 && val("S.diffSig") !== sig1, val("S.diffN") + " " + val("S.diffSig"));
  ok("무시는 팀 DB 에 남는다", WROTE.some((w) => w.path === "dash/config" && w.v.rosterIgnore && Object.keys(w.v.rosterIgnore).length === 1), JSON.stringify(WROTE.map((w) => w.path)));
  ok("무시한 수를 센다", val("S.diff.ignored") === 1);
  run(`S.config.rosterIgnore["없어진|줄||"] = 1; applyRosterDiff()`);
  ok("시트에서 사라진 차이의 무시는 잊는다 — 다시 오면 다시 묻는다", !val(`S.config.rosterIgnore["없어진|줄||"]`));
  run(`S.sheetCols = []; S.config.rosterIgnore["x|y||"] = 1; applyRosterDiff()`);
  ok("시트를 못 읽었을 때는 무시 목록을 안 건드린다", !!val(`S.config.rosterIgnore["x|y||"]`));
  run(`S.sheetCols = parseRosterSheet(${JSON.stringify(GRID)}); S.config.rosterIgnore = {}; S.classes[0].roster.pop(); S.classes[1].roster.push({ id:"r8", pid:"p8", name:"최은우", grade:"중3" }); S.classes[2].roster.push({ id:"r9", pid:"p4", name:"이수민", grade:"중3" }); applyRosterDiff()`);
  ok("다 맞으면 지문이 빈다 — 종이 안 울린다", val("S.diffSig") === "" && val("S.diffN") === 0, JSON.stringify(val("S.diff.items")));

  // ---- 읽어서 맞춰 보기 (checkRosterSheet) ----
  setup();
  await run("return checkRosterSheet()");
  ok("시트를 메타·값 두 번 부른다", CALLS.join(",") === "meta,values", CALLS.join(","));
  ok("gid 로 탭을 고른다", val("S.diffTab") === "26년 9월 예상", val("S.diffTab"));
  ok("차이가 셈해진다", val("S.diffN") === 3, String(val("S.diffN")));
  ok("마지막 대조 기록을 팀 DB 에 남긴다 — 학생 이름은 없다", (() => {
    const w = WROTE.filter((x) => x.path === "dash/rosterDiff")[0];
    return !!w && w.v.n === 3 && w.v.tab === "26년 9월 예상" && !JSON.stringify(w.v).match(/김서진|박보민|최은우/);
  })(), JSON.stringify(WROTE.filter((x) => x.path === "dash/rosterDiff")));
  ok("실패는 화면에 적힌다 (조용히 «같다» 가 아니다)", await (async () => {
    setup(); SHEET.values = [["아무", "것도", "아님"]];
    await run("return checkRosterSheet()");
    return /반.*못 찾았다/.test(val("S.diffErr")) && val("S.diffSig") === "";
  })(), val("S.diffErr"));
  ok("gid 가 없으면 첫 탭", await (async () => {
    setup(); run(`S.config.sources.roster.gid = ""`);
    await run("return checkRosterSheet()");
    return val("S.diffTab") === "다른 탭";
  })());
  ok("시트를 안 걸어 두면 아무것도 안 한다", await (async () => {
    setup(); run(`S.config.sources = {}`);
    await run("return checkRosterSheet()");
    return CALLS.length === 0 && val("S.diff") === null;
  })());

  // ---- 선생님 화면에서는 안 돈다 ----
  setup("teacher");
  await run("return checkRosterSheet()");
  ok("선생님 계정은 시트를 부르지도 않는다", CALLS.length === 0);
  ok("선생님 화면에는 대조 상자가 없다", run("return rosterDiffBox()") === "");
  ok("선생님 종에는 안 실린다", run(`S.diffSig = "x"; return diffUnseen()`) === false);

  // ---- 종 ----
  setup();
  await run("return checkRosterSheet()");
  ok("다르면 종이 울린다", val("diffUnseen()") === true);
  run("renderBell()");
  ok("종 숫자에 한 건으로 들어간다", EL["#bell-wrap"].innerHTML.indexOf('class="bn">1<') >= 0, EL["#bell-wrap"].innerHTML.slice(0, 120));
  run("S.bellOpen = true; renderBell()");
  ok("펼치면 «명단이 시트와 다르다» 줄이 있다", EL["#bell-wrap"].innerHTML.indexOf("명단이 시트와 다르다 3건") >= 0);
  run("markTasksSeen()");
  await tick();
  ok("종을 누르면 꺼진다", val("diffUnseen()") === false);
  ok("«봤다» 는 marks 에 지문으로 남는다", (() => { const w = WROTE.filter((x) => x.path === "marks/T1").pop(); return !!w && w.v.seenDiff === val("S.diffSig"); })());
  run(`S.marks.T1.seenDiff = "옛것"`);
  ok("차이가 바뀌면 다시 울린다", val("diffUnseen()") === true);
  run(`S.marks.T1.seenDiff = S.diffSig; S.newSeen = true; S.diffSig = ""`);
  ok("같아지면 안 울린다", val("diffUnseen()") === false);

  // ---- 반영 — 저절로는 절대 안 바꾼다 ----
  setup();
  await run("return checkRosterSheet()");
  const before = WROTE.filter((w) => w.path.indexOf("classes/") === 0 || w.path.indexOf("students") === 0).length;
  ok("대조만으로는 명단에 아무것도 안 쓴다", before === 0, JSON.stringify(WROTE.map((w) => w.path)));
  const it = (kind) => val("S.diff.items").filter((x) => x.kind === kind)[0];
  await run(`return applyDiffItem(${JSON.stringify(it("퇴원"))})`);
  ok("«퇴원» 은 반 명단만 고친다", WROTE.some((w) => w.path === "classes/c1" && w.v && w.v.roster), JSON.stringify(WROTE.map((w) => w.path)));
  ok("«퇴원» 이 사람 문서를 지우지 않는다", !WROTE.some((w) => w.del), JSON.stringify(WROTE.filter((w) => w.del)));
  ok("뺀 번호를 적어 둔다 — 다시 오면 이어진다", WROTE.some((w) => w.path === "classes/c1" && w.v && w.v.pastIds));
  WROTE.length = 0;
  // 이름 순이라 «배정» 첫 줄은 이수민이다. 최은우 줄을 집는다
  await run(`return applyDiffItem(${JSON.stringify(val("S.diff.items").filter((x) => x.kind === "배정" && x.name === "최은우")[0])})`);
  ok("«배정» 은 그 반 명단에 넣는다", WROTE.some((w) => w.path === "classes/c2" && w.v && w.v.roster && w.v.roster.some((r) => r.pid === "p8")), JSON.stringify(WROTE.map((w) => w.path)));
  ok("«배정» 은 사람을 새로 만들지 않는다", !WROTE.some((w) => w.path === "students"));
  // 신입
  setup(); run(`S.classes[2].roster = []; S.students = S.students.filter(function (x) { return x.pid !== "p6"; })`);
  await run("return checkRosterSheet()");
  WROTE.length = 0;
  await run(`return applyDiffItem(${JSON.stringify(it("신입"))})`);
  ok("«신입» 은 사람을 만들고 반에 넣는다", WROTE.some((w) => w.path === "students" && w.v.name === "오태윤" && w.v.grade === "중3") && WROTE.some((w) => w.path === "classes/c3"),
    JSON.stringify(WROTE.map((w) => w.path)));
  ok("«신입» 의 학교는 비워 둔다 — 시트에 없다. 명단 화면이 채우라고 알린다", WROTE.filter((w) => w.path === "students")[0].v.school === "");
  // 전반
  setup(); run(`S.classes[0].roster.push({ id:"r9", pid:"p5", name:"진유준", grade:"고1" }); S.classes[3].roster = []`);
  await run("return checkRosterSheet()");
  WROTE.length = 0;
  await run(`return applyDiffItem(${JSON.stringify(it("전반"))})`);
  ok("«전반» 은 옛 반에서 빼고 새 반에 넣는다", WROTE.some((w) => w.path === "classes/c1" && w.v.roster) && WROTE.some((w) => w.path === "classes/c4" && w.v.roster), JSON.stringify(WROTE.map((w) => w.path)));
  ok("«확인» 은 반영이 안 된다", await (async () => { try { await run(`return applyDiffItem({ kind:"확인", name:"x" })`); return false; } catch (e) { return true; } })());

  // ---- 그린 것 ----
  setup();
  await run("return checkRosterSheet()");
  run("renderStudents()");
  const html = EL["#sec-students"].innerHTML;
  ok("학생 명단에 대조 상자가 뜬다", html.indexOf("시트와 대조") >= 0);
  ok("몇 건 다른지 보인다", html.indexOf("3건 다르다") >= 0);
  ok("줄마다 «반영»·«무시» 가 있다", (html.match(/data-diff-apply=/g) || []).length === 3 && (html.match(/data-diff-skip=/g) || []).length === 3);
  ok("예고(신입 예정·퇴원 예정)는 단추 없이 보인다", html.indexOf("신입 예정") >= 0 && html.indexOf("박준호") >= 0 && html.indexOf("퇴원 예정") >= 0);
  ok("안 맞춘 시트 반은 고르는 칸이 있다", html.indexOf("data-diff-map=") >= 0 && html.indexOf("(수)개별진도") >= 0);
  ok("div 를 다 닫는다", (html.match(/<div/g) || []).length === (html.match(/<\/div>/g) || []).length,
    (html.match(/<div/g) || []).length + " vs " + (html.match(/<\/div>/g) || []).length);
  run(`S.diffErr = "시트를 못 읽었다"; renderStudents()`);
  ok("못 읽었으면 빨갛게 적힌다", EL["#sec-students"].innerHTML.indexOf("못 읽었다") >= 0);
  run(`S.diffErr = ""; S.config.sources = {}; renderStudents()`);
  ok("시트를 안 걸었으면 등록하라고 한다", EL["#sec-students"].innerHTML.indexOf("대조용 시트가 아직 없다") >= 0);

  // ---- 근거 자료 주소에서 gid ----
  ok("주소의 gid 를 읽는다", val(`sheetGidFrom("https://docs.google.com/spreadsheets/d/1zIve5/edit?gid=1936908654#gid=1936908654")`) === "1936908654");
  ok("gid 가 없으면 빈 것", val(`sheetGidFrom("https://docs.google.com/spreadsheets/d/1zIve5/edit")`) === "");

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log(T.join("\n")); console.log("\n도중에 터졌다:", e.stack); process.exit(1); });
