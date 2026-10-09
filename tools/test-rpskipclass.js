// 업무보고에서 학교결정 모의고사 반 빼기
// (2026-10-09 마왕님 «학교결정모의고사는 업무보고에서 빼»)
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(){return {doc:function(){return {get:function(){return Promise.resolve({exists:false});}};}};}};},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

run(`
  TODAY = "2026-10-09"; RP_START = "2026-09-14"; RP_SKIP_NAMES = []; RP_WORK_DOWS = {};
  S.teachers = [ { tid:"TO", name:"한민수", role:"owner", classIds:["c1", "m1", "m2"] },
                 { tid:"TM", name:"모의만", role:"teacher", classIds:["m1"] } ];
  S.classes = [ { id:"c1", name:"고1S", classDays:[1,5], roster:[ { id:"s1", pid:"p1", name:"가나", grade:"고1" } ] },
                { id:"m1", name:"학교결정 모의고사 (대치)", classDays:[5,6], roster:[ { id:"s2", pid:"p2", name:"다라", grade:"중3" } ] },
                { id:"m2", name:"학교결정모의고사(서초)", classDays:[6], roster:[ { id:"s3", pid:"p3", name:"마바", grade:"중3" } ] } ];
  S.tasks = []; S.marks = {}; S.events = []; S.rpLeave = {};
`);

ok("학결모 반은 거르는 반", run(`return rpSkipClass(S.classes[1]) && rpSkipClass(S.classes[2]) && !rpSkipClass(S.classes[0])`));
ok("학결모 반은 반 요일이어도 «수업 있음» 이 아니다", run(`return !rpMeets(S.classes[1], "2026-10-09") && !rpMeets(S.classes[2], "2026-10-10")`));
// 2026-10-09 금 · 10-10 토
ok("금요일 — 정규반만 보고 카드에", run(`return rpClassesOn("TO", "2026-10-09").map(function (c) { return c.id; }).join()`) === "c1");
ok("토요일 — 학결모만 있는 날은 보고 카드가 없다", run(`return rpClassesOn("TO", "2026-10-10").length`) === 0);
ok("학결모만 맡은 사람은 보고하는 날이 아니다", run(`return !rpExpected("TM", "2026-10-09") && !rpExpected("TM", "2026-10-10")`));
ok("정규반 수업 날은 그대로 보고하는 날", run(`return rpExpected("TO", "2026-10-09")`));
ok("주간 마지막 수업도 학결모 반은 안 잡는다", run(`return rpWeekLast(S.classes[1], "2026-10-09")`) === "");

console.log(T.join("\n"));
if (T.some((x) => x.startsWith("FAIL"))) process.exit(1);
