// 학생 한눈에 (2026-09-15) — 학생 한 명 = 8:5 카드. 최근 8주 업무보고의 점수·출결·특이사항.
//
// 마왕님: «한 줄로 나타내지 말고 8:5 직사각형으로» · «위험신호는 차차 정하자».
// 틀리기 쉬운 것:
//   - 정규반·개진반 기록이 두 카드로 갈리는 것 (반마다 명단 번호가 다르다 → 학생 번호로 묶는다)
//   - 이름만으로 붙여 동명이인이 섞이는 것
//   - 점수 빈 칸을 0점으로 세는 것
//   - 선생님 계정이 남의 보고를 부르는 것 (규칙이 거절한다 — 메뉴째 안 보이고 읽지도 않는다)
//   - 한 선생님 보고를 못 읽었는데 카드가 조용히 «기록 없음» 인 것
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(){return {doc:function(){return {get:function(){return Promise.resolve({exists:false});}};}};}};},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var __BOX = { innerHTML: "", hidden: false, querySelector: function(){ return null; }, querySelectorAll: function(){ return []; } };
var document={querySelector:function(s){ return s === "#sec-board" ? __BOX : null; },querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const val = (e) => JSON.parse(vm.runInContext("JSON.stringify(" + e + ")", ctx) || "null");
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

const REPORTS = {
  TH: {
    "2026-09-14": { tid: "TH", date: "2026-09-14", submitted: 1, classes: [
      { cid: "c1", name: "고1S", students: [
        { sid: "r1", pid: "p1", name: "진유준", att: "출석", score: 80, note: "" },
        { sid: "r2", pid: "p2", name: "김서진", att: "결석", called: true, score: null, note: "" },
        { sid: "r9", pid: "", name: "옛줄", att: "지각", score: 55, note: "이름만 있는 옛 줄" } ] } ] },
    "2026-09-16": { tid: "TH", date: "2026-09-16", submitted: 1, classes: [
      { cid: "c1", name: "고1S", students: [
        { sid: "r1", pid: "p1", name: "진유준", att: "지각", score: 60, note: "숙제 안 해옴" },
        { sid: "r2", pid: "p2", name: "김서진", att: "결석", score: null, note: "" } ] } ] },
    "2026-09-17": { tid: "TH", date: "2026-09-17", submitted: 0, classes: [          // 안 낸 초안 — 안 센다
      { cid: "c1", name: "고1S", students: [ { sid: "r1", pid: "p1", name: "진유준", att: "결석", score: 5, note: "초안" } ] } ] }
  },
  TP: {
    "2026-09-15": { tid: "TP", date: "2026-09-15", submitted: 1, classes: [
      { cid: "k1", name: "개진반 박리안", students: [
        { sid: "s7", pid: "p1", name: "진유준", att: "출석", score: 0, note: "개진에서 집중 못 함" },       // 0점은 진짜 0점
        { sid: "s8", pid: "", name: "옛줄", att: "출석", score: null, note: "다른 반 동명이인" } ] } ] }
  }
};
const setup = () => run(`
  TODAY = "2026-09-18"; S.ro = false; S.claims = { role:"owner", tid:"TH", name:"한민수" };
  S.teachers = [ { tid:"TH", name:"한민수", classIds:["c1"] }, { tid:"TP", name:"박리안", classIds:["k1"] } ];
  S.classes = [
    { id:"c1", name:"고1S", classDays:[2,4], roster:[ { id:"r1", pid:"p1", name:"진유준" }, { id:"r2", pid:"p2", name:"김서진" }, { id:"r9", pid:"p3", name:"옛줄" } ] },
    { id:"k1", name:"개진반 박리안", type:"individual", classDays:[], roster:[ { id:"t", name:"박리안", teacher:true },
      { id:"s7", pid:"p1", name:"진유준", days:[2] }, { id:"s8", pid:"p4", name:"옛줄", days:[2] } ] } ];
  S.students = [ { pid:"p1", name:"진유준", grade:"고1", school:"보인고" }, { pid:"p2", name:"김서진", grade:"고1" },
    { pid:"p3", name:"옛줄", grade:"중3" }, { pid:"p4", name:"옛줄", grade:"고1" }, { pid:"p5", name:"새학생", grade:"고2" } ];
  S.byPid = {}; S.students.forEach(function (x) { S.byPid[x.pid] = x; });
  S.board = { from: "2026-07-24", reports: ${JSON.stringify(REPORTS)}, failed: [], at: 1 };
  S.boardLoading = false; S.boardErr = ""; S.bdCls = ""; S.bdQ = "";
`);

// ---- 메뉴 ----
setup();
ok("«학생 한눈에» 메뉴 — 팀장만", val(`PAGES.filter(function(p){ return p[0] === "board"; })[0]`)[2] === "owner");
ok("선생님에게는 메뉴가 없다", run(`S.ro = true; var r = isPage("board"); S.ro = false; return r;`) === false);
ok("학생 명단 바로 옆", (() => { const ids = val("PAGES").map((p) => p[0]); return ids.indexOf("board") === ids.indexOf("students") + 1; })());

// ---- 여는 순간에만 읽는다 ----
run(`__REAL_LOAD = loadBoard; S.minutes = []; __CALLS = 0; loadBoard = function () { __CALLS++; S.board = { from:"x", reports:{}, failed:[], at:1 }; return Promise.resolve(); };
     S.board = null; S.boardLoading = false;`);
run(`showPage("tasks")`);
ok("다른 메뉴를 열면 안 읽는다", val("__CALLS") === 0);
run(`showPage("board")`);
ok("학생 한눈에를 열면 읽는다", val("__CALLS") === 1);
run(`S.boardLoading = false; showPage("board")`);
ok("한 번 읽었으면 다시 열어도 안 읽는다", val("__CALLS") === 1);
run(`S.board = null; S.ro = true; showPage("board"); S.ro = false;`);
ok("선생님 계정은 주소로 들어와도 안 읽는다 (남의 보고를 부르면 규칙이 거절)", val("__CALLS") === 1);

// ---- 진짜 loadBoard: 선생님마다 부르고, 못 읽은 사람을 남긴다 ----
run("loadBoard = __REAL_LOAD");    // 흉내 낸 loadBoard 를 걷는다
setup();
run(`rpCol = function (tid) { return { where: function (f, op, v) { __FROM = v; return { get: function () {
        if (tid === "TP") return Promise.reject(new Error("denied"));
        return Promise.resolve({ forEach: function (cb) { cb({ id: "2026-09-14", data: function () { return { date: "2026-09-14", submitted: 1, classes: [] }; } }); } });
      } }; } }; };`);
(async () => {
  await run(`return loadBoard()`);
  ok("8주 전부터 읽는다", val("__FROM") === "2026-07-24", val("__FROM"));
  ok("읽은 선생님 보고가 들어온다", !!val("S.board.reports.TH")["2026-09-14"]);
  ok("못 읽은 선생님 이름이 남는다", JSON.stringify(val("S.board.failed")) === '["박리안"]', JSON.stringify(val("S.board.failed")));
  run("renderBoard()");
  ok("못 읽었으면 화면 맨 위에 빨갛게", /class="err">이 선생님 보고는 못 읽었다[^<]*박리안/.test(val("__BOX.innerHTML")));

  // ---- 기록 묶기 ----
  setup();
  const cards = val("boardCards()");
  const card = (pid) => cards.filter((c) => c.p.pid === pid)[0];
  const c1 = card("p1");
  ok("정규반·개진반 기록이 한 카드로 — 진유준 3건", c1.list.length === 3, JSON.stringify(c1.list.map((e) => e.date + e.cname)));
  ok("날짜순", c1.list.map((e) => e.date).join(",") === "2026-09-14,2026-09-15,2026-09-16");
  ok("안 낸 초안은 안 센다", !c1.list.some((e) => e.note === "초안"));
  ok("학생 번호 없는 옛 줄은 반+이름으로 — 고1S 옛줄(p3)은 고1S 것만", JSON.stringify(card("p3").list.map((e) => e.cid)) === '["c1"]', JSON.stringify(card("p3").list));
  ok("동명이인이 안 섞인다 — 개진반 옛줄(p4)은 개진반 것만", JSON.stringify(card("p4").list.map((e) => e.cid)) === '["k1"]');
  ok("기록 없는 학생도 카드는 있다", !!card("p5") && card("p5").list.length === 0);
  ok("학년 → 이름 순 (중3 먼저)", cards[0].p.grade === "중3" && cards[cards.length - 1].p.grade === "고2", cards.map((c) => c.p.name + c.p.grade).join(","));

  // ---- 카드 ----
  run("renderBoard()");
  const h = val("__BOX.innerHTML");
  const cardHtml = (pid) => { const i = h.indexOf('data-bd-pid="' + pid + '"'); const j = h.indexOf('<div class="bd-card', i + 1); return h.slice(i, j < 0 ? undefined : j); };
  ok("학생마다 카드 하나 — 다섯", (h.match(/class="bd-card/g) || []).length === 5);
  ok("CSS — 카드는 8:5", /\.bd-card \{[^}]*aspect-ratio: 8 \/ 5/.test(html));
  const k1 = cardHtml("p1");
  ok("이름·학년", /<span class="nm [^"]*">진유준<i>10<\/i><\/span>/.test(k1));
  ok("반들 — 고1S · 개진반 박리안", k1.indexOf("고1S · 개진반 박리안") >= 0);
  ok("점수 막대 셋 — 0점도 막대다 (빈 칸이 아니다)", (k1.split('class="bd-bars"')[1] || "").split("</span>")[0].match(/<i /g).length === 3);
  ok("마지막 점수 60 · 평균 47 (80·0·60)", /<b>60<\/b><span class="muted">평균 47<\/span>/.test(k1), (k1.match(/<b>\d+<\/b><span class="muted">평균 \d+/) || [""])[0]);
  const k2 = cardHtml("p2");
  ok("점수 빈 칸만 있으면 «기록 없음» — 0점으로 안 센다", /<span class="bd-k">점수<\/span><span class="muted">기록 없음/.test(k2));
  ok("출결 점 — 결석 둘 · 첫 결석은 연락함", /<span class="bd-dots"><i class="no called"[^>]*><\/i><i class="no"[^>]*><\/i><\/span><span class="red">결석 2<\/span>/.test(k2), (k2.match(/<span class="bd-dots">.*?<\/span>/) || [""])[0]);
  ok("출결 점 — 지각은 노랑", /<i class="late"/.test(k1) && /<i class=""/.test(k1));
  ok("특이사항 — 수와 가장 최근 것", /특이사항 2<\/span><span class="muted">9\/16\([^)]*\)<\/span> 숙제 안 해옴/.test(k1), (k1.match(/bd-note.*?<\/div>/) || [""])[0]);
  ok("특이사항 없으면 «없음»", /특이사항<\/span><span class="muted">없음/.test(k2));
  ok("기록 없는 학생 카드는 옅게", /<div class="bd-card quiet" data-bd-pid="p5">/.test(h));
  ok("반 없는 학생은 빨갛게 «반 없음»", /data-bd-pid="p5">[\s\S]*?<span class="red">반 없음/.test(h));
  ok("위험 신호 칸은 아직 없다 (차차 정한다)", h.indexOf("위험") < 0);
  ok("머리 — 학생 수 · 보고 수(낸 것만) · 시작 날짜", /학생 5명 · 보고 3건 · 7\/24\([^)]*\)부터/.test(h), (h.match(/학생 \d[^<]*/) || [""])[0]);
  ok("div 를 다 닫는다", (h.match(/<div/g) || []).length === (h.match(/<\/div>/g) || []).length);

  // ---- 거르기 ----
  run(`S.bdCls = "k1"; renderBoard()`);
  let hh = val("__BOX.innerHTML");
  ok("반으로 거른다 — 개진반 박리안은 둘", (hh.match(/class="bd-card/g) || []).length === 2 && /학생 2 \/ 5명/.test(hh));
  run(`S.bdCls = "_none"; renderBoard()`);
  hh = val("__BOX.innerHTML");
  ok("«반 없음» 으로 거른다", (hh.match(/class="bd-card/g) || []).length === 1 && hh.indexOf('data-bd-pid="p5"') >= 0);
  run(`S.bdCls = ""; S.bdQ = "보인고"; renderBoard()`);
  hh = val("__BOX.innerHTML");
  ok("학교로 찾는다", (hh.match(/class="bd-card/g) || []).length === 1 && hh.indexOf('data-bd-pid="p1"') >= 0);
  run(`S.bdQ = "없는사람"; renderBoard()`);
  ok("맞는 학생이 없으면 그렇게 적는다", val("__BOX.innerHTML").indexOf("맞는 학생이 없다") >= 0);

  // ---- 상태 ----
  run(`S.bdQ = ""; S.board = null; S.boardLoading = true; renderBoard()`);
  ok("읽는 중", val("__BOX.innerHTML").indexOf("업무보고를 읽는 중") >= 0);
  run(`S.boardLoading = false; S.boardErr = "끊김"; renderBoard()`);
  ok("못 읽었으면 적는다", /class="err">업무보고를 못 읽었다: 끊김/.test(val("__BOX.innerHTML")));
  run(`S.ro = true; renderBoard()`);
  ok("선생님 화면이면 비운다", val("__BOX.innerHTML") === "");

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log(T.join("\n")); console.log("\n도중에 터졌다:", e.stack); process.exit(1); });
