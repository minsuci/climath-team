// 학교결정 모의고사 반 가리기 — 학생 명단 · 내신 참여표
// (2026-10-10 마왕님 «내신참여표나 학생명단에서 그냥 안보이게 해두자»)
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

// 학교결정 모의고사 반은 팀체크에서 가린다 — 지우지 않는다 (2026-10-10 마왕님 «내신참여표나 학생명단에서 그냥 안보이게»)
run(`
  TODAY = "2026-10-10";
  S.teachers = [ { tid:"TO", name:"한민수", role:"owner", classIds:["c1", "m1"] } ];
  S.classes = [ { id:"c1", name:"예비고1S 월금", classDays:[1,5], roster:[ { id:"s1", pid:"p1", name:"가나", grade:"중3" } ] },
                { id:"m1", name:"학교결정 모의고사 (대치)", classDays:[6], roster:[ { id:"m11", pid:"p1", name:"가나", grade:"중3" },
                                                                                  { id:"m12", pid:"p2", name:"외부", grade:"중3", school:"진선여중" } ] } ];
  S.students = [ { pid:"p1", name:"가나", grade:"중3", school:"대청중" }, { pid:"p2", name:"외부", grade:"중3", school:"진선여중" },
                 { pid:"p3", name:"미배정", grade:"중3", school:"" } ];
  S.byPid = {}; S.students.forEach(function (x) { S.byPid[x.pid] = x; });
  S.exams = {}; S.tasks = []; S.events = [];
`);
ok("학결모 반은 가린 반", run(`return hiddenClass(S.classes[1]) && !hiddenClass(S.classes[0])`));
ok("반 목록(activeClasses)에서 빠진다", run(`return activeClasses().map(function (c) { return c.id; }).join()`) === "c1");
ok("그 반에만 있는 외부 응시생은 화면 목록에서 빠진다 — 반 미배정으로 안 쏟아진다",
   run(`return shownStudents().map(function (x) { return x.pid; }).join()`) === "p1,p3");
ok("두 반 다 다니는 학생은 남고, 반 표시는 정규반만", run(`return classesOfPid("p1").map(function (c) { return c.id; }).join()`) === "c1");
ok("내신 참여표 줄에 학결모 반이 없다", run(`return examRows().every(function (x) { return x.cls.id !== "m1"; }) && examRows().length === 1`));
ok("지울 때는 가린 반에서도 뺀다", run(`return liveClassesOfPid("p1").map(function (c) { return c.id; }).join()`) === "c1,m1");
ok("같은 사람 찾기는 전원 — 응시생이 등록하면 이어 붙인다", run(`return rpAddMatches({ name:"외부", school:"진선여중" }).length`) === 1);
ok("지우지 않는다 — 반 문서와 사람은 그대로", run(`return S.classes.length === 2 && S.students.length === 3 && S.classes[1].roster.length === 2`));

console.log(T.join("\n"));
if (T.some((x) => x.startsWith("FAIL"))) process.exit(1);
