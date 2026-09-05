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
var location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
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
const RENDER = { cal: "renderCal", tasks: "renderTasks", minutes: "renderMinutes", dev: "renderDev", week: "renderWeek",
  students: "renderStudents", terms: "renderTerms", exams: "renderExams", scores: "renderScores", sheets: "renderSheets" };
const pages = JSON.parse(vm.runInContext("JSON.stringify(PAGES)", ctx));
ok("메뉴가 열이다", pages.length === 10, String(pages.length));
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
  S.classes=[{id:"c1",name:"고1S",classDays:[1,5],roster:[{id:"r1",pid:"p1",name:"김서진",grade:"고1"}]}];
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

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
