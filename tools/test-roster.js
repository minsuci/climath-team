// 명단 쓰기 로직을 가짜 Firestore로 돌려본다. 운영 DB를 건드리는 코드라 배포 전에 확인한다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

// 서버(가짜) — 반 문서는 여기 있고, 화면이 들고 있는 사본과 따로 논다
const SERVER = {
  students: { p1: { name: "김서진", school: "중대부고", grade: "고1", homeroom: "T1" },
              p2: { name: "임서윤", school: "경기고", grade: "고1", homeroom: "T1" } },
  classes: {
    c1: { name: "고1S", classDays: ["월", "금"], order: 1, roster: [
      { id: "r1", pid: "p1", name: "김서진", school: "중대부고", grade: "고1" },
      { id: "rx", name: "설민준", school: "봉은중", grade: "중3" },      // pid 없는 옛 항목
      { id: "rt", name: "한민수", teacher: true } ] },
    c2: { name: "고1T", classDays: ["월", "금"], order: 2, roster: [
      { id: "r2", pid: "p1", name: "김서진", school: "중대부고", grade: "고1" } ] } },
  dash: {},
};
const WRITES = [];
const cp = (x) => JSON.parse(JSON.stringify(x));
let nextId = 100;
function docApi(col, id) {
  return {
    get: () => Promise.resolve({ exists: !!SERVER[col][id], data: () => JSON.parse(JSON.stringify(SERVER[col][id] || {})) }),
    // 진짜 Firestore 는 보낸 값을 직렬화해 저장한다. 참조를 그대로 두면 화면 쪽 배열과
    // 서버 쪽 배열이 같은 것이 되어, 있지도 않은 버그가 보이거나 진짜 버그가 가려진다.
    set: (d, o) => { WRITES.push(["set", col, id, Object.keys(d).join(",")]); d = cp(d);
      SERVER[col][id] = (o && o.merge) ? Object.assign({}, SERVER[col][id], d) : d; return Promise.resolve(); },
    update: (d) => { WRITES.push(["update", col, id, Object.keys(d).join(",")]);
      SERVER[col][id] = Object.assign({}, SERVER[col][id], cp(d)); return Promise.resolve(); },
    delete: () => { WRITES.push(["delete", col, id]); delete SERVER[col][id]; return Promise.resolve(); },
  };
}
const stub = `
var firebase={initializeApp:()=>({}),firestore:()=>DB,auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net"));
var alert=function(){},confirm=()=>true;
`;
const ctx = vm.createContext({
  console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt,
  DB: { collection: (c) => ({ doc: (id) => docApi(c, id || ("gen" + (nextId++))),
        add: (d) => { const id = "gen" + (nextId++); WRITES.push(["add", c, id]); SERVER[c][id] = cp(d); return Promise.resolve({ id }); },
        get: () => Promise.resolve({ forEach() {} }), orderBy: () => ({ get: () => Promise.resolve({ forEach() {} }) }) }) },
});
vm.runInContext(stub + "\n" + src, ctx);

const setup = `
S.teachers=[{tid:"T1",name:"한민수",classIds:["c1","c2"]}];
S.classes=Object.keys(SRV.classes).map(function(id){ return Object.assign({id:id},JSON.parse(JSON.stringify(SRV.classes[id]))); });
S.students=Object.keys(SRV.students).map(function(id){ return Object.assign({pid:id},JSON.parse(JSON.stringify(SRV.students[id]))); });
S.byPid={}; S.students.forEach(function(x){S.byPid[x.pid]=x;});
S.notes={}; S.claims={tid:"T1"};
`;
ctx.SRV = SERVER;
vm.runInContext(setup, ctx);

const T = [];
function ok(name, cond, extra) { T.push((cond ? "  OK  " : "FAIL  ") + name + (extra ? "   " + extra : "")); }

vm.runInContext(`
globalThis.__run = async function () {
  var out = {};

  // 1. 이름을 고치면 두 반의 미러가 같이 바뀐다
  await stSave("p1", { name: "김서진A", school: "숙명여고" });
  out.srvName = SRV.students.p1.name;
  out.c1name = SRV.classes.c1.roster[0].name;
  out.c1school = SRV.classes.c1.roster[0].school;
  out.c2name = SRV.classes.c2.roster[0].name;
  out.otherUntouched = SRV.classes.c1.roster[1].name;   // 옛 항목은 안 건드려야
  out.teacherKept = SRV.classes.c1.roster[2].teacher;   // 선생님 항목도 남아야

  // 2. 다른 사람이 그 사이 반에 학생을 넣어도 안 지워진다 (fresh read)
  // 남이 넣은 학생은 사람 문서도 함께 있다 (없으면 그건 유령이고, 8번에서 따로 본다)
  SRV.students.p9 = { name:"남이넣은학생", school:"", grade:"", homeroom:"" };
  S.students.push({ pid:"p9", name:"남이넣은학생", school:"", grade:"", homeroom:"" });
  S.byPid.p9 = S.students[S.students.length-1];
  SRV.classes.c2.roster.push({ id:"rZ", pid:"p9", name:"남이넣은학생" });
  await stSave("p1", { grade: "고2" });
  out.strangerKept = SRV.classes.c2.roster.some(function(r){return r.pid==="p9";});
  out.gradeMirrored = SRV.classes.c2.roster.filter(function(r){return r.pid==="p1";})[0].grade;

  // 3. 반에 넣기 / 빼기, 두 번 넣어도 하나
  await stAssign("c1", S.byPid.p2);
  await stAssign("c1", S.byPid.p2);
  out.assigned = SRV.classes.c1.roster.filter(function(r){return r.pid==="p2";}).length;
  await stUnassign("c1","p2");
  out.unassigned = SRV.classes.c1.roster.filter(function(r){return r.pid==="p2";}).length;

  // 4. 어긋난 미러 찾기 → 맞추기
  SRV.classes.c1.roster[0].school = "엉뚱한고";
  S.classes.filter(function(c){return c.id==="c1";})[0].roster[0].school = "엉뚱한고";
  out.driftFound = rosterDrift().length;
  await fixDrift();
  out.driftFixed = SRV.classes.c1.roster[0].school;

  // 5. 반에만 있는 항목을 사람으로 만들어 잇기
  out.looseBefore = looseRosterRows().length;
  var lr = await linkLoose();
  out.linkMade = lr.made;
  out.linkedPid = !!SRV.classes.c1.roster[1].pid;
  out.newPerson = Object.keys(SRV.students).map(function(k){return SRV.students[k].name;}).indexOf("설민준")>=0;

  // 6. 새 학생 · 붙여넣기 파싱
  var np = await stCreate({name:"새학생",grade:"고3",school:"단대부고",homeroom:""});
  out.created = !!SRV.students[np.pid];
  out.bulk1 = JSON.stringify(parseBulkLine("김서진 고1 중대부고"));
  out.bulk2 = JSON.stringify(parseBulkLine("설민준\\t9\\t봉은중"));
  out.bulk3 = JSON.stringify(parseBulkLine("이름만"));
  out.bulkEmpty = parseBulkLine("   ");

  // 7. 지우기 — 반 명단에서도 빠진다 (유령을 안 남긴다)
  await stDelete("p1");
  out.personGone = !SRV.students.p1;
  out.rosterGone = SRV.classes.c1.roster.filter(function(r){return r.pid==="p1";}).length
                 + SRV.classes.c2.roster.filter(function(r){return r.pid==="p1";}).length;
  out.strangerStillThere = SRV.classes.c2.roster.some(function(r){return r.pid==="p9";});
  out.noOrphan = orphanRosterRows().length;

  // 8. 옛 판이 남긴 유령을 치운다
  SRV.classes.c1.roster.push({ id:"rGhost", pid:"pDead", name:"한성수", grade:"고2" });
  S.classes.filter(function(c){return c.id==="c1";})[0].roster.push({ id:"rGhost", pid:"pDead", name:"한성수", grade:"고2" });
  out.orphanFound = orphanRosterRows().length;
  out.orphanDump = orphanRosterRows().map(function(x){return x.r.name+"/"+x.cname+"/"+x.r.pid;}).join(" | ");
  out.orphanName = (orphanRosterRows()[0]||{}).r ? orphanRosterRows()[0].r.name : "";
  await removeOrphans();
  out.orphanCleared = orphanRosterRows().length;
  out.ghostGone = !SRV.classes.c1.roster.some(function(r){return r.id==="rGhost";});

  // 9. 뺐다 다시 넣으면 **옛 번호를 되쓴다**
  //    출결·과제·질문번호·참여표가 전부 이 번호로 달려 있어서, 새 번호를 만들면
  //    그 사람의 지난 기록이 통째로 끊긴다 (2026-09-04 실제로 세 명이 끊겨 있었다).
  //    앞 단계에서 사람을 지우므로 여기서 쓸 사람을 새로 만든다
  var pr = await stCreate({ name:"되쓰기시험", grade:"고1", school:"중대부고", homeroom:"" });
  await stAssign("c1", pr);
  var before = SRV.classes.c1.roster.filter(function(r){return r.pid===pr.pid;})[0].id;
  await stUnassign("c1", pr.pid);
  out.pastSaved = ((SRV.classes.c1.pastIds)||{})["pid:"+pr.pid];
  await stAssign("c1", pr);
  out.reused = SRV.classes.c1.roster.filter(function(r){return r.pid===pr.pid;})[0].id;
  out.reusedSame = out.reused === before;

  // 번호가 이미 쓰이고 있으면 되쓰지 않는다 (겹치면 두 사람이 한 칸을 쓴다)
  var taken = SRV.classes.c2.roster[0].id;        // c2 에서 이미 누가 쓰는 번호
  var pc = await stCreate({ name:"겹침시험", grade:"고1", school:"경기고", homeroom:"" });
  SRV.classes.c2.pastIds = {}; SRV.classes.c2.pastIds["pid:"+pc.pid] = taken;
  var c2 = S.classes.filter(function(c){return c.id==="c2";})[0];
  c2.pastIds = {}; c2.pastIds["pid:"+pc.pid] = taken;
  await stAssign("c2", pc);
  out.noClash = SRV.classes.c2.roster.filter(function(r){return r.pid===pc.pid;})[0].id !== taken;

  // pid 가 없는 사람은 이름으로 찾는다 (동명이인은 A·B·C 로 가른다)
  out.nameKey = rosterKey({ name:"설민준" }) === "name:설민준" && rosterKey({ pid:"p9", name:"x" }) === "pid:p9";
  return out;
};
`, ctx);

vm.runInContext("globalThis.__p = __run();", ctx);
ctx.__p.then((o) => {
  ok("이름·학교 고치면 students 문서에 반영", o.srvName === "김서진A");
  ok("반 하나 미러 갱신", o.c1name === "김서진A" && o.c1school === "숙명여고");
  ok("반 둘 다 갱신", o.c2name === "김서진A");
  ok("pid 없는 옛 항목은 안 건드림", o.otherUntouched === "설민준");
  ok("선생님 항목 남음", o.teacherKept === true);
  ok("남이 그 사이 넣은 학생 안 지워짐", o.strangerKept === true);
  ok("학년도 미러됨", o.gradeMirrored === "고2");
  ok("반에 넣기 — 두 번 눌러도 하나", o.assigned === 1);
  ok("반에서 빼기", o.unassigned === 0);
  ok("어긋난 미러 찾음", o.driftFound === 1);
  ok("어긋난 미러 맞춤", o.driftFixed === "숙명여고");
  ok("반에만 있는 항목 찾음", o.looseBefore === 1, "(선생님 항목 제외)");
  ok("사람 만들어 이음", o.linkMade === 1 && o.linkedPid && o.newPerson);
  ok("새 학생 만들기", o.created === true);
  ok("붙여넣기 — 공백 구분", o.bulk1 === '{"name":"김서진","grade":"고1","school":"중대부고","homeroom":""}', o.bulk1);
  ok("붙여넣기 — 탭·숫자 학년", o.bulk2 === '{"name":"설민준","grade":"중3","school":"봉은중","homeroom":""}', o.bulk2);
  ok("붙여넣기 — 이름만", o.bulk3 === '{"name":"이름만","grade":"","school":"","homeroom":""}', o.bulk3);
  ok("붙여넣기 — 빈 줄 무시", o.bulkEmpty === null);
  ok("지우기 — 사람 사라짐", o.personGone === true);
  ok("지우기 — 반 명단에서도 빠짐 (유령 안 남김)", o.rosterGone === 0);
  ok("지우기 — 남의 학생은 그대로", o.strangerStillThere === true);
  ok("지우기 뒤 유령 없음", o.noOrphan === 0);
  ok("옛 유령을 찾음", o.orphanFound === 1 && o.orphanName === "한성수", o.orphanDump);
  ok("유령을 반 명단에서 뺌", o.orphanCleared === 0 && o.ghostGone === true);
  ok("뺄 때 옛 번호를 적어둔다", !!o.pastSaved, o.pastSaved);
  ok("다시 넣으면 옛 번호를 되쓴다   (기록이 안 끊긴다)", o.reusedSame === true, o.reused);
  ok("이미 쓰는 번호면 되쓰지 않는다", o.noClash === true);
  ok("pid 없으면 이름으로 찾는다", o.nameKey === true);
// ---- 학생 PIN 초기화 ----
// 수업관리 앱의 `/api/auth` 를 브라우저에서 바로 부른다. **새 비번을 정해주지 않고**
// 초기 PIN 으로 되돌린다 — 선생님이 정한 비번은 그것대로 남의 손을 거친 비번이 된다.
const CALLS = [];
vm.runInContext(`
  fetch = function (url, opt) {
    CALLS_REF.push({ url: url, body: JSON.parse(opt.body) });
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true, pin: "1234", classes: ["고1S"] }); } });
  };
  firebase.auth = function () { return { currentUser: { getIdToken: function () { return Promise.resolve("CLASSTOKEN"); } } }; };
`, Object.assign(ctx, { CALLS_REF: CALLS }));

vm.runInContext(`globalThis.__pin = stResetPin("김서진");`, ctx);
ctx.__pin.then((r) => {
  const c = CALLS[0] || {};
  ok("수업관리 앱 쪽으로 부른다", String(c.url).indexOf("climath-class.vercel.app/api/auth") >= 0, String(c.url));
  ok("resetStudentPin 을 부른다", c.body && c.body.action === "resetStudentPin", JSON.stringify(c.body));
  ok("이름을 넘긴다", c.body && c.body.name === "김서진");
  // ⚠ class 토큰을 넘겨야 한다. team 토큰으로는 그쪽이 아무것도 안 해준다.
  ok("수업관리 앱 토큰을 넘긴다", c.body && c.body.idToken === "CLASSTOKEN", c.body && c.body.idToken);
  ok("초기 PIN 을 돌려받는다", r.pin === "1234", JSON.stringify(r));
  ok("새 비번을 이쪽에서 정하지 않는다", !("newPin" in (c.body || {})) && !("pin" in (c.body || {})),
    JSON.stringify(c.body));

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
}).catch((e) => { console.error("터짐:", e); process.exit(1); });
}).catch((e) => { console.error("터짐:", e); process.exit(1); });
