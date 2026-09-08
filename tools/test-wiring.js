// 부르는데 없는 함수가 있는지 본다.
//
// 2026-09-05에 «근거 자료» 로 갈아엎으면서 `loadSheetsAll` 을 지웠는데 `boot()` 이 계속 부르고 있었다.
// **문법 검사는 이걸 못 잡는다** — 부를 때가 되어야 터진다. 로그인이 통째로 막혀서
// 화면에 "loadSheetsAll is not defined" 만 떴다.
//
// 처음엔 소스를 훑어 «부르는데 없는 이름»을 찾으려 했는데, 정규식 리터럴 속 따옴표(`/[&<>"']/`)에
// 걸려 코드를 통째로 삼켰다. 파서를 흉내내는 것보다 **실제로 불러보는 것**이 정확하다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 화면을 흉내낸다. 진짜 DOM 이 아니라 «부르면 안 터지는가»만 본다.
function el() {
  const o = { innerHTML: "", outerHTML: "", textContent: "", value: "", disabled: false, hidden: false,
    scrollTop: 0, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    onclick: null, onchange: null, oninput: null, onkeydown: null,
    addEventListener() {}, removeEventListener() {}, focus() {}, setSelectionRange() {},
    getAttribute: () => "", setAttribute() {}, closest: () => o, remove() {},
    querySelector: () => o, querySelectorAll: () => [],
    insertAdjacentHTML() {}, scrollIntoView() {}, parentNode: { removeChild() {} } };
  return o;
}
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},
  firestore:()=>({collection:()=>({doc:()=>({get:()=>Promise.resolve({exists:false}),set:()=>Promise.resolve()}),
    get:()=>Promise.resolve({forEach(){}}),where:()=>({get:()=>Promise.resolve({forEach(){}})})})}),
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>EL(),querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){},scrollY:0};
// 브라우저는 replaceState 하면 location.hash 가 따라 바뀐다. 흉내도 그래야 —
// 안 그러면 «어느 페이지로 갔나»를 볼 수가 없다 (→ 흉내가 진짜보다 너그러우면 검사가 못 잡는다)
var location={hash:""},history={replaceState:function(a,b,u){ location.hash=String(u||""); }},
    localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
// ⚠ 없으면 «typeof MutationObserver !== "undefined"» 가 거짓이 되어 그 줄을 통째로 건너뛴다.
//   브라우저처럼 **대상이 없으면 터져야** 한다 — 2026-09-06에 그걸 놓쳐 앱이 하얗게 떴다.
var MutationObserver=function(){return{observe:function(t){
  if(!t) throw new TypeError("observe: 대상이 Node 가 아니다 (root 가 아직 없다)"); }};};
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number,
  Promise, RegExp, isNaN, parseInt, EL: el });
vm.runInContext(stub + "\n" + src, ctx);
const typeOf = (f) => vm.runInContext("typeof " + f, ctx);

// ---- 로그인 길 ----
// 여기가 하나라도 비면 앱이 통째로 안 열린다. 화면을 못 보고 죽으므로 눈으로는 늦게 안다.
["renderLogin", "boot", "renderShell", "loadCore", "renderAll", "loadSheetsAll", "loadTests",
 "loadExams", "loadScores", "loadMinutes", "showPage", "signOutAll", "authApi", "sheetsApi", "loadMinutes"]
  .forEach((f) => ok("로그인 길: " + f, typeOf(f) === "function", typeOf(f)));

// ---- 메뉴마다 그릴 함수가 있고, 불러도 안 터진다 ----
const RENDER = { cal: "renderCal", tasks: "renderTasks", done: "renderDone", minutes: "renderMinutes", dev: "renderDev", week: "renderWeek",
  students: "renderStudents", terms: "renderTerms", exams: "renderExams", scores: "renderScores", sheets: "renderSheets" };
const pages = JSON.parse(vm.runInContext("JSON.stringify(PAGES)", ctx));
ok("메뉴가 열하나다", pages.length === 11, String(pages.length));

// ---- 팀장만 보는 메뉴 ----
// 9/7 오전에는 회의록 메뉴를 통째로 감췄다가, 오후에 **회의록 하나하나로** 갈랐다
// (팀회의는 선생님도 본다). 9/8 부터 «완료 현황» 이 «owner» 표를 단 첫 메뉴다.
{
  const mine = (ro) => JSON.parse(vm.runInContext(
    "(function(){ var b=S.ro; S.ro=" + ro + "; var r=JSON.stringify(myPages().map(function(p){return p[0]})); S.ro=b; return r; })()", ctx));
  ok("팀장은 열하나를 다 본다", mine(false).length === 11, mine(false).join(","));
  ok("선생님에게는 «완료 현황» 이 안 보인다", mine(true).indexOf("done") < 0 && mine(true).length === 10, mine(true).join(","));
  ok("선생님도 회의록 메뉴는 있다 (안이 갈린다)", mine(true).indexOf("minutes") >= 0);
  ok("선생님이 주소에 #done 을 쳐도 안 열린다", (() => {
    const r = vm.runInContext(`(function(){ var b=S.ro; S.ro=true; var v=isPage("done"); S.ro=b; return v; })()`, ctx);
    return r === false;
  })());

  // 장치가 도는지 — 아무 메뉴에나 «owner» 를 달아 본다
  const hid = JSON.parse(vm.runInContext(`(function(){
    var b = S.ro, p = PAGES.filter(function(x){ return x[0] === "dev" })[0];
    S.ro = true; p[2] = "owner";
    var out = { pages: myPages().map(function(x){ return x[0] }), isP: isPage("dev") };
    showPage("dev"); out.landed = location.hash;
    p.length = 2; S.ro = b;
    return JSON.stringify(out);
  })()`, ctx));
  ok("«owner» 를 달면 선생님 목록에서 빠진다", hid.pages.indexOf("dev") < 0 && hid.pages.length === 9, hid.pages.join(","));
  ok("«owner» 를 단 페이지는 없는 페이지가 된다", !hid.isP);
  ok("주소로 직접 들어와도 할 일로 보낸다", hid.landed === "#tasks", hid.landed);
  const isP = (ro, id) => vm.runInContext(
    "(function(){ var b=S.ro; S.ro=" + ro + "; var r=isPage(" + JSON.stringify(id) + "); S.ro=b; return r; })()", ctx);
  ok("표를 뗀 뒤에는 도로 열린다", isP(true, "dev") && isP(true, "minutes") && isP(true, "tasks"));
}
pages.forEach((p) => {
  const f = RENDER[p[0]];
  ok("메뉴 «" + p[1] + "» 에 그릴 함수가 있다", !!f && typeOf(f) === "function", p[0]);
});

// 빈 상태로 한 번, 자료를 조금 넣고 한 번. 둘 다 안 터져야 한다 —
// 자료가 없을 때만 터지는 화면이 제일 흔하다(처음 열었을 때가 그렇다).
vm.runInContext(`S.claims = { tid: "T1", role: "owner" }; S.minutes = []; S.dev = [];`, ctx);
Object.values(RENDER).forEach((f) => {
  let err = "";
  try { vm.runInContext(f + "()", ctx); } catch (e) { err = e.message; }
  ok("빈 상태로 " + f + " 를 불러도 안 터진다", !err, err);
});

vm.runInContext(`
  S.teachers=[{tid:"T1",name:"한민수",classIds:["c1"]}];
  S.classes=[{id:"c1",name:"고1S",classDays:[1,5],roster:[{id:"r1",pid:"p1",name:"김서진",grade:"고1"}]},
             {id:"c2",name:"고1T",classDays:[2,4],roster:[{id:"r2",name:"박준서",grade:"고1",school:"경기고"}]}];   // 반이 둘이어야 참여표의 반 칩·못 읽은 반 배너가 그려진다
  S.examsDenied={ c2:true };
  S.students=[{pid:"p1",name:"김서진",grade:"고1",school:"중대부고",homeroom:"T1"}];
  S.byPid={p1:S.students[0]};
  S.term="2026 2학기 중간";
  S.schoolTerms={ k1:{term:"2026 2학기 중간",school:"중대부고",grade:"고1",start:"2026-09-21",end:"2026-09-22",math:"2026-09-22"} };
  S.exams={ c1:{ r1:{ sid:"r1", term:"2026 2학기 중간", school:"중대부고", grade:"고1",
                      start:"2026-09-21", end:"2026-09-22", math:"2026-09-22", days:[1,5] } } };
  S.tests=[{tid:"t1",kind:"mock",name:"9월 학평",grade:"고1",date:"2026-09-02"}];
  S.testPick="t1"; S.testScores={ p1:{ raw:"88", grade:"2" } };
  S.tasks=[{id:"a",text:"할 일",due:"2026-09-05",status:"open",grade:"고1"},
           {id:"b",text:"매주",repeat:{dow:[1,5]},doneOn:{},grade:""}];
  S.scores={ c1:[{date:"2026-09-01",sid:"r1",score:80}] };
  S.minutes=[{id:"m1",date:"2026-08-31",title:"간부 전체회의",kind:"간부",md:"# 제목\\n\\n- 하나\\n"}];
  S.minPick="m1";
  S.dev=[{cfg:{key:"team",app:"대시보드",who:"한민수",owner:"minsuci",repo:"climath-team",url:"https://x"},err:"",url:"https://github.com/minsuci/climath-team",
    commits:[{sha:"abc1234567",short:"abc1234",date:"2026-09-05",msg:"학생 PIN 초기화 단추 — 앱과 같은 것",author:"minsuci",url:"https://x",kind:"feat",app:"대시보드",who:"한민수",key:"team"}],
    deploy:{sha:"abc1234567",short:"abc1234",date:"2026-09-05"}},
    {cfg:{key:"class",app:"앱",who:"한민수",owner:"minsuci",repo:"climath-class"},err:"못 읽음",commits:[],deploy:null}];
  S.devEdit=true;
  S.config={ sources:{ scores:{ id:"ABC", url:"https://x", title:"성적 시트" } } };
`, ctx);
Object.values(RENDER).forEach((f) => {
  let err = "";
  try { vm.runInContext(f + "()", ctx); } catch (e) { err = e.message; }
  ok("자료를 넣고 " + f + " 를 불러도 안 터진다", !err, err);
});

// ---- $ 와 $$ 를 헷갈린 자리 ----
// 2026-09-05, 개발 현황의 저장소 목록이 저장이 안 됐다 — «$(...).forEach is not a function».
// `$` 는 하나만 찾고 목록은 `$$` 다. **문법 검사도, 화면 그리기 검사도 이걸 못 잡는다** —
// 단추를 눌러야 그 줄에 닿기 때문이다. 그래서 소스를 눈으로 훑는다.
{
  const hits = [];
  src.split("\n").forEach((ln, i) => {
    if (/^\s*\/\//.test(ln)) return;   // 주석에 적어둔 그 오류 문구까지 걸린다
    // $(...) 뒤에 «목록에만 있는 것»이 붙으면 $$ 를 쓸 자리다
    if (/(^|[^$\w.])\$\([^)]*\)\s*\.\s*(forEach|map|filter|some|every|length)\b/.test(ln))
      hits.push((i + 1) + "행: " + ln.trim().slice(0, 90));
  });
  ok("$ 를 목록처럼 쓴 자리가 없다 ($$ 여야 한다)", !hits.length, hits.join(" | "));
}

// ---- 같은 이름을 두 번 만든 자리 ----
// 2026-09-06, 팀 할 일에 markOf() 를 새로 만들었는데 내신 달력에 이미 같은 이름이 있었다.
// **나중 선언이 이긴다 — 조용히.** 문법 검사도 화면 그리기도 통과했고, 체크가 그냥 안 보였다.
// 4000행이 한 파일이라 이름이 겹치는 것은 눈으로 못 본다.
{
  const seen = {}, dup = [];
  src.split("\n").forEach((ln, i) => {
    const m = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(ln);
    if (!m) return;
    if (seen[m[1]]) dup.push(m[1] + " (" + seen[m[1]] + "행, " + (i + 1) + "행)");
    else seen[m[1]] = i + 1;
  });
  ok("같은 이름의 함수를 두 번 만들지 않았다", !dup.length, dup.join(" | "));
}

// ---- 자료가 오기 전에 그리는 자리 ----
// 2026-09-07, 개발 현황에서 박준성 선생님 앱이 «사라졌다».
// showPage("dev") 가 renderShell 안에서 도는데 그게 loadCore 보다 빨라서,
// loadDev 가 `dash/config` 없이 **코드 기본값(내 앱 둘)** 만 읽고 끝났다. S.dev 는 다시 안 읽는다.
// 기본값과 저장된 목록이 같던 동안에는 아무 표시도 없었다 — 셋째 줄이 들어와서야 드러났다.
{
  const dev = /async function loadDev\([\s\S]*?\n}/.exec(src);
  ok("loadDev 는 기본 자료(CORE_READY)를 기다린다", !!dev && /await\s+CORE_READY/.test(dev[0]));
  const boot = /async function boot\(\)[\s\S]*?\n}/.exec(src);
  const iSet = boot ? boot[0].indexOf("CORE_READY = loadCore()") : -1;
  const iShell = boot ? boot[0].indexOf("renderShell()") : -1;
  ok("boot 은 renderShell 앞에서 loadCore 를 걸어 둔다", iSet >= 0 && iShell >= 0 && iSet < iShell,
    iSet < 0 ? "CORE_READY 를 안 건다" : "");
}

// ---- CSS 변수는 정의된 것만 쓴다 ----
// 2026-09-08 종 상자가 color: var(--ink) 를 썼는데 --ink 는 어디에도 없었다. 브라우저는 조용히 무시하고
// 머리띠의 흰 글자색을 물려줘서 **흰 바탕에 흰 글자** — 종을 만든 날부터 제목이 안 보였다. 시험은 HTML 만 보고 색을 못 본다.
{
  const css = (/<style>([sS]*?)</style>/.exec(fs.readFileSync("index.html", "utf8")) || [])[1] || "";
  const used = {}; (css.match(/var(--[a-z0-9-]+)/g) || []).forEach((v) => { used[v.slice(4, -1)] = 1; });
  const defined = {}; (css.match(/--[a-z0-9-]+s*:/g) || []).forEach((v) => { defined[v.replace(/s*:$/, "")] = 1; });
  const missing = Object.keys(used).filter((k) => !defined[k]);
  ok("쓰는 CSS 변수는 전부 정의돼 있다", missing.length === 0, missing.join(","));
  ok("종 상자는 글자색을 되돌린다 (머리띠가 흰색을 물려준다)", /.bellboxs*{[^}]*color:s*var(--text)/.test(css));
}

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
