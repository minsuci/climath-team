// 학생 한눈에 (2026-09-15) — 최근 8주 업무보고의 점수·출결·특이사항.
//
// 마왕님: «한 줄로 나타내지 말고 8:5 직사각형으로» · «위험신호는 차차 정하자» ·
//         «카드가 너무 커. 한 페이지에 모든 학생» → «3번»: 작은 카드를 화면에 맞추고, 위쪽 줄을 접고, 누르면 큰 카드.
// 틀리기 쉬운 것:
//   - 정규반·개진반 기록이 두 카드로 갈리는 것 (반마다 명단 번호가 다르다 → 학생 번호로 묶는다)
//   - 이름만으로 붙여 동명이인이 섞이는 것
//   - 점수 빈 칸을 0점으로 세는 것
//   - 선생님 계정이 남의 보고를 부르는 것 (규칙이 거절한다 — 메뉴째 안 보이고 읽지도 않는다)
//   - 한 선생님 보고를 못 읽었는데 카드가 조용히 «기록 없음» 인 것
//   - 선생님 명단이 차기 전에 읽어 «0건을 다 읽었다» 가 되는 것 (9/15 배포 직후 실제로 났다)
//   - 한 화면 맞춤이 너무 작아져 이름도 못 읽는 것 · 몇 명만 걸렀을 때 카드가 화면만 해지는 것
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(){return {doc:function(){return {get:function(){return Promise.resolve({exists:false});}};}};}};},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var __BOX = { innerHTML: "", hidden: false, querySelector: function(){ return null; }, querySelectorAll: function(){ return []; } };
var __BODY = { classList: { on: {}, toggle: function (c, v) { this.on[c] = !!v; }, contains: function (c) { return !!this.on[c]; } } };
var document={body:__BODY,querySelector:function(s){ return s === "#sec-board" ? __BOX : null; },querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){},innerHeight:800},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
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
  S.boardLoading = false; S.boardErr = ""; S.bdCls = ""; S.bdQ = ""; S.bdOpen = ""; __BOX.hidden = false;
`);
const full = (pid) => val(`boardCardHtml(boardCards().filter(function (x) { return x.p.pid === "${pid}"; })[0])`);
const mini = (pid) => val(`boardMiniHtml(boardCards().filter(function (x) { return x.p.pid === "${pid}"; })[0])`);

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

// ⚠ 9/15 배포 직후 실제로 난 것 — 주소 #board 로 바로 열면 선생님 명단보다 먼저 읽기가 돌아 «0건을 다 읽었다» 가 됐다
run(`__CALLS = 0; S.board = null; S.boardLoading = false; S.boardErr = ""; __T = S.teachers; S.teachers = [];
     __BOX.hidden = false; showPage("board");`);
ok("선생님 명단이 비었으면 안 읽는다 — 빈 것을 «다 읽었다» 로 적지 않는다", val("__CALLS") === 0 && val("S.board") === null);
run(`renderBoard()`);
ok("그 사이 화면은 «기다리는 중» (기록 없음 카드가 아니다)", val("__BOX.innerHTML").indexOf("선생님 명단을 기다리는 중") >= 0 && val("__BOX.innerHTML").indexOf("bd-mini") < 0);
run(`S.teachers = __T; renderBoard();`);
ok("명단이 오고 다시 그릴 때 읽는다 (renderAll → renderBoard)", val("__CALLS") === 1);
run(`S.board = null; S.boardLoading = false; __BOX.hidden = true; renderBoard(); __BOX.hidden = false;`);
ok("메뉴가 안 떠 있으면 다시 그려도 안 읽는다", val("__CALLS") === 1);
run(`loadBoard = function () { __CALLS++; return Promise.reject(new Error("끊김")); }; S.board = null; S.boardLoading = false; S.boardErr = ""; renderBoard();`);

// ---- 진짜 loadBoard: 선생님마다 부르고, 못 읽은 사람을 남긴다 ----
run("loadBoard = __REAL_LOAD");    // 흉내 낸 loadBoard 를 걷는다
setup();
run(`rpCol = function (tid) { return { where: function (f, op, v) { __FROM = v; return { get: function () {
        if (tid === "TP") return Promise.reject(new Error("denied"));
        return Promise.resolve({ forEach: function (cb) { cb({ id: "2026-09-14", data: function () { return { date: "2026-09-14", submitted: 1, classes: [] }; } }); } });
      } }; } }; };`);
(async () => {
  // 위에서 실패하는 읽기를 걸어 두었다 — 실패는 적히고, 다시 그려도 저절로 또 부르지 않는다(끝없이 돌면 안 된다)
  await new Promise((r) => setTimeout(r, 0));
  ok("못 읽으면 오류가 적힌다", val("S.boardErr") === "끊김" && val("S.boardLoading") === false, val("S.boardErr"));
  // setup() 이 그 사이 카드 자료를 채웠다(실패는 그 뒤 마이크로태스크에서 적혔다) — 못 읽은 상태로 되돌린다
  run(`S.board = null; __FAILS = __CALLS; __KEEP = loadBoard; loadBoard = function () { __CALLS++; return Promise.reject(new Error("끊김")); }; renderBoard(); renderBoard();`);
  ok("실패한 뒤 다시 그려도 저절로 또 안 부른다", val("__CALLS") === val("__FAILS"), val("__CALLS") + " vs " + val("__FAILS"));
  ok("대신 «다시 읽기» 단추가 있다", /class="err">업무보고를 못 읽었다: 끊김 <button class="mini" data-bd-reload>다시 읽기/.test(val("__BOX.innerHTML")), val("__BOX.innerHTML").slice(0, 300));
  run(`loadBoard = __KEEP; S.boardErr = ""; __BOX.hidden = false;`);

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

  // ---- 큰 카드 (누르면 뜨는 것) ----
  const k1 = full("p1"), k2 = full("p2"), k5 = full("p5");
  ok("CSS — 큰 카드는 8:5", /\.bd-card \{[^}]*aspect-ratio: 8 \/ 5/.test(html));
  ok("이름·학년", /<span class="nm [^"]*">진유준<i>10<\/i><\/span>/.test(k1));
  ok("반들 — 고1S · 개진반 박리안", k1.indexOf("고1S · 개진반 박리안") >= 0);
  ok("점수 막대 셋 — 0점도 막대다 (빈 칸이 아니다)", (k1.split('class="bd-bars"')[1] || "").split("</span>")[0].match(/<i /g).length === 3);
  ok("마지막 점수 60 · 평균 47 (80·0·60)", /<b>60<\/b><span class="muted">평균 47<\/span>/.test(k1), (k1.match(/<b>\d+<\/b><span class="muted">평균 \d+/) || [""])[0]);
  ok("점수 빈 칸만 있으면 «기록 없음» — 0점으로 안 센다", /<span class="bd-k">점수<\/span><span class="muted">기록 없음/.test(k2));
  ok("출결 점 — 결석 둘 · 첫 결석은 연락함", /<span class="bd-dots"><i class="no called"[^>]*><\/i><i class="no"[^>]*><\/i><\/span><span class="red">결석 2<\/span>/.test(k2), (k2.match(/<span class="bd-dots">.*?<\/span>/) || [""])[0]);
  ok("출결 점 — 지각은 노랑", /<i class="late"/.test(k1) && /<i class=""/.test(k1));
  ok("특이사항 — 수와 가장 최근 것", /특이사항 2<\/span><span class="muted">9\/16\([^)]*\)<\/span> 숙제 안 해옴/.test(k1), (k1.match(/bd-note.*?<\/div>/) || [""])[0]);
  ok("특이사항 없으면 «없음»", /특이사항<\/span><span class="muted">없음/.test(k2));
  ok("기록 없는 학생 큰 카드는 옅게", /<div class="bd-card quiet" data-bd-pid="p5">/.test(k5));
  ok("반 없는 학생은 빨갛게 «반 없음»", /<span class="red">반 없음/.test(k5));

  // ---- 작은 카드 (9/15 «3번») ----
  const m1 = mini("p1"), m2 = mini("p2"), m5 = mini("p5");
  ok("CSS — 작은 카드도 8:5", /\.bd-mini \{[^}]*aspect-ratio: 8 \/ 5/.test(html));
  ok("작은 카드 — 이름·학년", /<span class="nm [^"]*">진유준<i>10<\/i><\/span>/.test(m1));
  ok("작은 카드 — 마지막 점수 «60점»", /<span class="sc">60점<\/span>/.test(m1));
  ok("작은 카드 — 특이사항이 있으면 점", /<i class="nt" title="특이사항 2">/.test(m1) && m2.indexOf('class="nt"') < 0);
  ok("작은 카드 — 결석 수 «결2» · 점수 빈 칸이면 점수 없음", /<span class="ab">결2<\/span>/.test(m2) && m2.indexOf('class="sc"') < 0);
  ok("작은 카드 — 결석 없으면 «결» 표시 없음", m1.indexOf('class="ab"') < 0);
  ok("작은 카드 — 큰 카드와 같은 수 (결석 2 · 60점)", /결석 2/.test(k2) && /<b>60<\/b>/.test(k1));
  ok("작은 카드 — 기록 없으면 옅게", /<div class="bd-mini quiet" data-bd-open="p5"/.test(m5));
  ok("작은 카드 — 올리면 반 이름 (title)", /title="진유준 · 고1S · 개진반 박리안"/.test(m1) && /title="새학생 · 반 없음"/.test(m5));

  run("renderBoard()");
  const h = val("__BOX.innerHTML");
  // 9/15 «학생명단처럼 반별로» — 고1S 셋 · 개진반 박리안 둘 · 반 미배정 하나. 두 반 듣는 진유준은 두 블록에 다 뜬다
  ok("반 블록마다 작은 카드 — 3 + 2 + 1", (h.match(/class="bd-mini/g) || []).length === 6 && h.indexOf('class="bd-card') < 0, String((h.match(/class="bd-mini/g) || []).length));
  ok("위험 신호 칸은 아직 없다 (차차 정한다)", h.indexOf("위험") < 0);
  ok("머리 — 학생 수 · 보고 수(낸 것만) · 시작 날짜", /학생 5명 · 보고 3건 · 7\/24\([^)]*\)부터/.test(h), (h.match(/학생 \d[^<]*/) || [""])[0]);
  ok("제목과 거르기가 한 줄 (bd-head)", /<div class="bd-head"><h2>학생 한눈에[\s\S]*?<div class="bd-bar">/.test(h));
  ok("div 를 다 닫는다", (h.match(/<div/g) || []).length === (h.match(/<\/div>/g) || []).length);

  // ---- 누르면 큰 카드 ----
  run(`S.bdOpen = "p1"; renderBoard()`);
  let ho = val("__BOX.innerHTML");
  ok("누른 학생의 큰 카드가 가운데 뜬다", /<div class="bd-pop" data-bd-pop><div class="bd-popin"><button class="mini bd-x" data-bd-close>닫기<\/button><div class="bd-card" data-bd-pid="p1">/.test(ho));
  ok("큰 카드는 하나", (ho.match(/class="bd-card/g) || []).length === 1);
  ok("뜬 상태에서도 div 짝이 맞다", (ho.match(/<div/g) || []).length === (ho.match(/<\/div>/g) || []).length);
  run(`S.bdCls = "_none"; renderBoard()`);
  ok("걸러서 안 보이는 학생이어도 열어 둔 카드는 그대로", /data-bd-pid="p1"/.test(val("__BOX.innerHTML")));
  run(`S.bdCls = ""; S.bdOpen = "없는번호"; renderBoard()`);
  ok("없는 학생 번호면 안 뜬다 (안 터진다)", val("__BOX.innerHTML").indexOf("bd-pop") < 0);
  run(`S.bdOpen = ""; renderBoard()`);
  ok("닫으면 없다", val("__BOX.innerHTML").indexOf("bd-pop") < 0);

  // ---- 반별로 묶기 (9/15 «학생명단처럼 반별로») ----
  setup(); run("renderBoard()");
  const hg = val("__BOX.innerHTML");
  const heads = (hg.match(/<h3 class="gh">.*?<\/h3>/g) || []).map((x) => x.replace(/<[^>]+>/g, ""));
  ok("묶음 줄 순서 — 고1 · 개진반 · 반 미배정 (배치표와 같다)", JSON.stringify(heads) === JSON.stringify(["고11반 · 3명", "개진반1반 · 2명", "반 미배정1명"]), JSON.stringify(heads));
  const block = (cid) => { const i = hg.indexOf('data-cid="' + cid + '"'); const j = hg.indexOf('<div class="bd-cb', i + 1); return hg.slice(i, j < 0 ? hg.indexOf('<h3', i) : j); };
  const opens = (b) => (b.match(/data-bd-open="([^"]+)"/g) || []).map((x) => x.slice(14, -1));
  ok("고1S 블록 — 이름순 (김서진 · 옛줄 · 진유준)", JSON.stringify(opens(block("c1"))) === '["p2","p3","p1"]', JSON.stringify(opens(block("c1"))));
  ok("개진반 블록 — 그 반 학생만 (옛줄 p4 · 진유준)", JSON.stringify(opens(block("k1"))) === '["p4","p1"]', JSON.stringify(opens(block("k1"))));
  ok("반 블록 머리 — 반 이름 · 담당 · 인원", /<div class="bd-ch" title="고1S · 한민수"><b>고1S<\/b><span class="muted">한민수 · 3명<\/span>/.test(hg));
  ok("반 블록 머리는 두 줄 — 좁은 블록에서 반 이름이 «고…» 로 안 잘린다 (9/15 실제 화면)", /\.bd-ch \{[^}]*flex-direction: column/.test(html));
  ok("내가 담당인 반 블록은 파랗게", /<div class="bd-cb mine" data-k="1" data-cid="c1">/.test(hg) && /<div class="bd-cb" data-k="1" data-cid="k1">/.test(hg));
  ok("반 미배정은 빨간 머리 · 반 수 없이", /<span class="pill red">반 미배정<\/span><span class="muted">1명/.test(hg) && opens(block("_none")).join() === "p5");
  ok("묶음 머리 인원은 겹침 없이 (고1 3명)", heads[0] === "고11반 · 3명");
  // 한 열에 8장
  run(`for (var i = 0; i < 9; i++) { S.students.push({ pid:"z" + i, name:"학생" + String.fromCharCode(44032 + i), grade:"고1" });
         S.classes[0].roster.push({ id:"zz" + i, pid:"z" + i, name:"학생" + String.fromCharCode(44032 + i) }); }
       S.byPid = {}; S.students.forEach(function (x) { S.byPid[x.pid] = x; }); renderBoard();`);
  const h12 = val("__BOX.innerHTML");
  ok("한 반 12명이면 두 열 — 한 열 8장 (data-k 2 · --r 8)", /<div class="bd-cb mine" data-k="2" data-cid="c1">[\s\S]*?<div class="bd-cg" style="--k:2;--r:8">/.test(h12));
  ok("CSS — 블록 안은 열부터 채운다 (위→아래)", /\.bd-cg \{[^}]*grid-auto-flow: column/.test(html) && /\.bd-cg \{[^}]*repeat\(var\(--k, 1\), var\(--bw/.test(html));
  ok("CSS — 반 블록 줄은 넘치면 접힌다", /\.bd-row-cls \{[^}]*flex-wrap: wrap/.test(html));

  // ---- 카드 너비 ----
  const colW = (rows, W) => val(`boardColW(${JSON.stringify(rows)}, ${W})`);
  ok("개진반 줄(열 2·3·1·1·1·2·1) · 1870px — 카드 155", colW([[2, 3, 1, 1, 1, 2, 1]], 1870) === 155, String(colW([[2, 3, 1, 1, 1, 2, 1]], 1870)));
  ok("가장 빽빽한 줄에 맞춘다", colW([[1, 1], [2, 3, 1, 1, 1, 2, 1]], 1870) === 155);
  ok("반 하나뿐이면 180 에서 멈춘다", colW([[1]], 1870) === 180);
  ok("좁으면 84 밑으로는 안 간다 — 줄이 접힌다", colW([[2, 3, 1, 1, 1, 2, 1]], 500) === 84);
  ok("줄이 없으면 안 터진다", colW([], 1000) === 180);

  // ---- 위쪽 줄 접기 ----
  setup();
  run(`showPage("board")`);
  ok("학생 한눈에를 열면 위쪽 줄을 접는다 (body.bd-full)", val("__BODY.classList.on")["bd-full"] === true);
  run(`showPage("tasks")`);
  ok("다른 메뉴로 가면 편다", val("__BODY.classList.on")["bd-full"] === false);
  ok("CSS — 접으면 알림 띠를 감추고 너비 제한을 푼다", /body\.bd-full #banner \{ display: none; \}/.test(html) && /body\.bd-full \.wrap \{ max-width: none;/.test(html));
  ok("CSS — 접으면 메뉴 단추가 작아진다", /body\.bd-full \.nav button \{[^}]*font-size: 12px/.test(html));

  // ---- 거르기 ----
  setup();
  run(`S.bdCls = "k1"; renderBoard()`);
  let hh = val("__BOX.innerHTML");
  ok("반으로 거른다 — 개진반 박리안 블록만 · 둘", (hh.match(/class="bd-mini/g) || []).length === 2 && /학생 2 \/ 5명/.test(hh) && (hh.match(/class="bd-cb/g) || []).length === 1 && hh.indexOf('data-cid="k1"') >= 0);
  run(`S.bdCls = "_none"; renderBoard()`);
  hh = val("__BOX.innerHTML");
  ok("«반 없음» 으로 거른다", (hh.match(/class="bd-mini/g) || []).length === 1 && hh.indexOf('data-bd-open="p5"') >= 0);
  run(`S.bdCls = ""; S.bdQ = "보인고"; renderBoard()`);
  hh = val("__BOX.innerHTML");
  ok("학교로 찾는다 — 한 명이 두 반 블록에 · 학생 수는 1", (hh.match(/data-bd-open="p1"/g) || []).length === 2 && (hh.match(/class="bd-mini/g) || []).length === 2 && /학생 1 \/ 5명/.test(hh));
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
