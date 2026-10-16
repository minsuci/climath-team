// 선생님이 담당 학생의 빈 학교를 적는다 (2026-10-16 마왕님 «선생님들 학교 적을 수 있게»)
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];
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
  S.classes = [
    { id:"mine", name:"개진반 이현우", roster:[ { id:"r1", pid:"p1", name:"권나희" }, { id:"r2", pid:"p2", name:"권승규" }, { id:"r3", pid:"p3", name:"이미적음", school:"잠신중" } ] },
    { id:"other", name:"개진반 박리안", roster:[ { id:"r9", pid:"p2", name:"권승규" }, { id:"r8", pid:"p4", name:"남의학생" } ] },
  ];
  S.byPid = { p1:{ pid:"p1", name:"권나희", school:"" }, p2:{ pid:"p2", name:"권승규", school:"" },
              p3:{ pid:"p3", name:"이미적음", school:"잠신중" }, p4:{ pid:"p4", name:"남의학생", school:"" } };
  myClassIds = function () { return ["mine"]; };
  S.ro = true;
`);
ok("담당 반 학생, 학교 빈칸 → 적을 수 있다", run(`return canEditSchoolOf("p1")`) === true);
ok("남의 반에도 있어도 빈칸이면 적을 수 있다 (남의 반 줄은 사람 문서로 떨어진다)", run(`return canEditSchoolOf("p2")`) === true);
ok("이미 학교가 있으면 선생님은 못 바꾼다", run(`return canEditSchoolOf("p3")`) === false);
ok("담당 반이 아닌 학생은 못 적는다", run(`return canEditSchoolOf("p4")`) === false);
ok("남의 반 줄에만 학교가 적혀 있어도 못 적는다",
  run(`S.classes[1].roster[0].school = "여의도중"; var a = canEditSchoolOf("p2"); S.classes[1].roster[0].school = ""; return a;`) === false);
ok("끝난 줄(퇴원)만 있으면 못 적는다",
  run(`var r = S.classes[0].roster[0]; r.endDate = "2026-01-01"; var a = isEnded(r) ? canEditSchoolOf("p1") : "skip"; delete r.endDate; return a;`) !== true);
ok("팀장은 빈칸이면 누구든", run(`S.ro = false; var a = canEditSchoolOf("p4"); S.ro = true; return a;`) === true);
ok("표 칸: 빈칸이면 입력 칸(data-keep · 목록)", (function () {
  const h = run(`return schoolCell({ st: S.classes[0].roster[0], school: "" })`);
  return /data-stschool="p1"/.test(h) && /data-keep/.test(h) && /list="ex-schools-ro"/.test(h); })());
ok("표 칸: 적을 수 없으면 글자", run(`return schoolCell({ st: S.classes[1].roster[1], school: "" })`) === "");
ok("표 칸: 학교가 있으면 그대로", run(`return schoolCell({ st: S.classes[0].roster[2], school: "잠신중" })`) === "잠신중");

// 쓰기는 하나씩 passWrite 로 감싼다 — await 사이에서 RO_PASS 가 풀린다
const body = /async function saveSchoolRo[\s\S]*?\n}\r?\n/.exec(src)[0];
ok("사람 문서 · 반 명단 · 참여표 쓰기가 모두 passWrite 안", (body.match(/passWrite\(function/g) || []).length === 3);
ok("반 명단은 담당 반만 고친다 (앱 규칙 teaches)", /var mine = S\.ro \? myClassIds\(\)/.test(body));
ok("학교 일정이 있으면 참여표를 채운다 (이미 있는 건 안 덮는다)", /schedFor\(school, gradeOf\(r\)\)/.test(body) && /\(S\.exams\[c\.id\] \|\| \{\}\)\[r\.id\]/.test(body));
ok("변경 기록도 선생님 것이 남는다 (flushStudentLog passWrite)", /passWrite\(function \(\) \{ return ref\.set\(\{ items: items/.test(src));
ok("참여표 두 자리(안 냈다 · 냈는데 학교 빈칸) 다 schoolCell", (src.match(/schoolCell\(x\)/g) || []).length - (src.match(/function schoolCell\(x\)/g) || []).length === 2);
ok("목록(datalist)이 표 아래 한 번", (src.match(/datalist id="ex-schools-ro"/g) || []).length === 1);

console.log(T.join("\n"));
if (T.some((x) => x.startsWith("FAIL"))) process.exitCode = 1;
