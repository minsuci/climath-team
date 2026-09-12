// 개별진도반 — 학생마다 등원 요일이 다르다 (2026-09-12)
//
// 정규반은 **반**이 요일을 들고, 개진반은 **학생**이 든다. 이 둘을 섞으면 조용히 틀린다:
//   · 개진반 학생에게 요일을 안 주면 어느 날 업무보고에도 안 뜬다 (반에는 있으니 티가 안 난다)
//   · 정규반 줄에 days 를 얹으면 참여표가 반 요일 대신 그걸 봐서 그 학생만 회차가 달라진다
// 둘 다 «화면에 아무 일도 안 일어나는» 실패라 시험으로만 잡힌다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const SERVER = {
  students: { p1: { name: "엄태경", school: "중대부고", grade: "고1", homeroom: "T1" },
              p2: { name: "공하빈", school: "경신고", grade: "고1", homeroom: "T1" },
              p3: { name: "김서진", school: "숙명여고", grade: "고1", homeroom: "T2" } },
  classes: {
    c1: { name: "고1S", type: "regular", classDays: [2, 4], roster: [
      { id: "r1", pid: "p3", name: "김서진", school: "숙명여고", grade: "고1" } ] },
    k1: { name: "개진반 한민수", type: "individual", classDays: [], books: [], roster: [
      { id: "t1", name: "한민수", teacher: true, days: [] },
      { id: "i1", pid: "p1", name: "엄태경", school: "중대부고", grade: "고1", days: [2, 4] },
      { id: "i2", pid: "p2", name: "공하빈", school: "경신고", grade: "고1" } ] } },
  teachers: { T1: { name: "한민수", classIds: ["c1", "k1"] }, T2: { name: "이현우", classIds: [] },
              T3: { name: "김재헌", status: "pending", classIds: [] } },
  appConfig: {}, dash: {},
};
const WRITES = [];
const cp = (x) => JSON.parse(JSON.stringify(x));
let nextId = 100;
function docApi(col, id) {
  return {
    get: () => Promise.resolve({ exists: !!SERVER[col][id], data: () => cp(SERVER[col][id] || {}) }),
    set: (d, o) => { WRITES.push(["set", col, id]); d = cp(d);
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
ctx.SRV = SERVER;
vm.runInContext(`
TODAY = "2026-09-14";
S.teachers = Object.keys(SRV.teachers).map(function (tid) { return Object.assign({ tid: tid }, JSON.parse(JSON.stringify(SRV.teachers[tid]))); });
S.classes = Object.keys(SRV.classes).map(function (id) { return Object.assign({ id: id }, JSON.parse(JSON.stringify(SRV.classes[id]))); });
S.students = Object.keys(SRV.students).map(function (id) { return Object.assign({ pid: id }, JSON.parse(JSON.stringify(SRV.students[id]))); });
S.byPid = {}; S.students.forEach(function (x) { S.byPid[x.pid] = x; });
S.notes = {}; S.claims = { tid: "T1" };
`, ctx);

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));
const g = (code) => vm.runInContext("(function(){ return (" + code + "); })()", ctx);

// ---- 요일 표기 ----
ok("요일을 순서대로 붙여 읽는다", g(`dayLabel([4,2])`) === "화목", g(`dayLabel([4,2])`));
ok("요일이 없으면 빈 글", g(`dayLabel([])`) === "" && g(`dayLabel(null)`) === "");
ok("일요일은 0 이다", g(`dayLabel([0,6])`) === "일토", g(`dayLabel([0,6])`));

// ---- 요일이 빈 줄을 찾아낸다 ----
// 이것이 이 기능의 핵심 안전장치다. 반에는 들어 있으니 배치표에는 멀쩡히 보이는데
// 업무보고에는 영영 안 뜬다 — 실제로 공하빈 학생이 그 상태로 있었다.
ok("요일 빈 개진반 학생을 잡는다", g(`noDayRows().map(function(x){return x.r.name;}).join(",")`) === "공하빈",
   g(`noDayRows().map(function(x){return x.r.name;}).join(",")`));
ok("명단의 선생님 줄은 안 센다", g(`noDayRows().every(function(x){return !x.r.teacher;})`));
ok("정규반은 요일이 없어도 안 센다 (반이 요일을 든다)",
   g(`noDayRows().every(function(x){return x.c.id !== "c1";})`));
vm.runInContext(`__save = JSON.parse(JSON.stringify(S.classes));`, ctx);
vm.runInContext(`S.classes.filter(function(c){return c.id==="k1";})[0].roster[2].endDate = "2026-09-01";`, ctx);
ok("그만둔 학생은 안 센다", g(`noDayRows().length`) === 0, String(g(`noDayRows().length`)));
vm.runInContext(`S.classes = JSON.parse(JSON.stringify(__save));`, ctx);
vm.runInContext(`S.classes.filter(function(c){return c.id==="k1";})[0].endDate = "2026-09-01";`, ctx);
ok("끝난 반은 안 센다", g(`noDayRows().length`) === 0, String(g(`noDayRows().length`)));
vm.runInContext(`S.classes = JSON.parse(JSON.stringify(__save));`, ctx);

// ---- 개진반이 없는 선생님 ----
ok("개진반 없는 선생님을 고른다", g(`teachersWithoutIndiv().map(function(t){return t.name;}).join(",")`) === "이현우",
   g(`teachersWithoutIndiv().map(function(t){return t.name;}).join(",")`));
ok("아직 안 들어온 선생님(pending)은 빼고 센다",
   g(`teachersWithoutIndiv().every(function(t){return t.tid !== "T3";})`));

// ---- 화면 ----
const pick = (pid) => g(`dayPickHtml(S.classes.filter(function(c){return c.id==="k1";})[0], "${pid}")`);
ok("요일이 있으면 무슨 요일인지 적는다", /화목/.test(pick("p1")) && !/red/.test(pick("p1")), pick("p1").slice(0, 80));
ok("요일이 비면 빨갛게 짚는다", /red/.test(pick("p2")) && /업무보고에도 안 뜬다/.test(pick("p2")));
ok("고른 요일만 켜져 있다", (pick("p1").match(/mini on/g) || []).length === 2,
   String((pick("p1").match(/mini on/g) || []).length));
const gs = (cid, pid, sch) => g(`gridSub({ c: S.classes.filter(function(c){return c.id==="${cid}";})[0] },
   (S.classes.filter(function(c){return c.id==="${cid}";})[0].roster.filter(function(r){return r.pid==="${pid}";})[0] || {}), "${sch}")`);
ok("배치표 — 개진반은 이름 밑에 요일", gs("k1", "p1", "중대부고") === '<span class="sch">화목</span>', gs("k1", "p1", "중대부고"));
ok("배치표 — 요일이 비면 「요일 없음」", /red/.test(gs("k1", "p2", "경신고")) && /요일 없음/.test(gs("k1", "p2", "경신고")));
ok("배치표 — 정규반은 그대로 학교", gs("c1", "p3", "숙명여고") === '<span class="sch">숙명여고</span>', gs("c1", "p3", "숙명여고"));
ok("한꺼번에 넣기 — 정규반을 고르면 요일 칸이 안 뜬다",
   g(`(function(){ S.bulkCls="c1"; return bulkDaysHtml(); })()`) === "");
ok("한꺼번에 넣기 — 개진반을 고르면 요일 칸이 뜬다",
   /data-bd/.test(g(`(function(){ S.bulkCls="k1"; S.bulkDays=[]; return bulkDaysHtml(); })()`)));
ok("한꺼번에 넣기 — 요일을 안 고르면 빨갛게 짚는다",
   /red/.test(g(`(function(){ S.bulkCls="k1"; S.bulkDays=[]; return bulkDaysHtml(); })()`)));
ok("만들기 상자는 개진반 없는 선생님을 단추로 보여 준다",
   /data-mkind="T2"/.test(g(`indivMakeHtml()`)) && !/data-mkind="T1"/.test(g(`indivMakeHtml()`)));
ok("만들기 상자가 요일 빈 학생 수를 같이 보여 준다", /요일없음 1/.test(g(`indivMakeHtml()`)));

// ---- 쓰기 ----
vm.runInContext(`
globalThis.__run = async function () {
  var out = {};
  var K = function () { return SRV.classes.k1.roster; };
  var row = function (pid) { return K().filter(function (r) { return r.pid === pid; })[0] || {}; };

  // 요일 하나만 건드린다. 그 사이 수업관리 앱에서 다른 요일을 넣었어도 살아남아야 한다.
  SRV.classes.k1.roster[1].days = [2, 4, 6];        // 앱에서 토요일이 붙었다
  await stSetDay("k1", "p1", 1, true);
  out.kept = row("p1").days.join("");
  await stSetDay("k1", "p1", 6, false);
  out.removed = row("p1").days.join("");

  // 요일이 비어 있던 학생에게 처음 요일을 준다
  await stSetDay("k1", "p2", 3, true);
  out.first = row("p2").days.join("");
  out.noneLeft = noDayRows().length;

  // 반에 없는 학생의 요일은 못 바꾼다 — 조용히 넘어가면 «눌렀는데 왜 그대로지» 가 된다
  try { await stSetDay("k1", "p3", 1, true); out.strangerErr = ""; }
  catch (e) { out.strangerErr = e.message; }

  // 반에 넣을 때 요일을 같이 준다 (한꺼번에 넣기)
  await stAssign("k1", S.byPid.p3, [1, 5]);
  out.assignedDays = row("p3").days.join("");

  // ⚠ 정규반에는 days 를 얹지 않는다. 얹으면 참여표가 반 요일 대신 그걸 봐서
  //    그 학생만 회차가 달라지고, 그대로 수강료가 된다.
  await stAssign("c1", S.byPid.p1, [1, 5]);
  out.regularHasDays = "days" in (SRV.classes.c1.roster.filter(function (r) { return r.pid === "p1"; })[0] || {});

  // 선생님별 개진반 만들기
  var nm = await makeIndivClass("T2");
  var made = Object.keys(SRV.classes).filter(function (id) { return SRV.classes[id].name === nm; })[0];
  out.madeName = nm;
  out.madeShape = Object.keys(SRV.classes[made]).sort().join(",");
  out.madeType = SRV.classes[made].type;
  out.madeDays = JSON.stringify(SRV.classes[made].classDays);
  out.madeTeacherRow = SRV.classes[made].roster.length === 1 && SRV.classes[made].roster[0].teacher === true;
  out.madeInCharge = (SRV.teachers.T2.classIds || []).indexOf(made) >= 0;
  out.madeGone = teachersWithoutIndiv().length;
  try { await makeIndivClass("T2"); out.dupErr = ""; } catch (e) { out.dupErr = e.message; }
  return out;
};
`, ctx);

vm.runInContext(`globalThis.__p = __run();`, ctx);
ctx.__p.then((out) => {
  ok("다른 요일은 안 건드린다 (앱에서 붙은 토요일이 남는다)", out.kept === "1246", out.kept);
  ok("요일을 빼면 그것만 빠진다", out.removed === "124", out.removed);
  ok("비어 있던 학생에게 첫 요일을 준다", out.first === "3", out.first);
  ok("요일을 주면 「요일 없음」 목록에서 사라진다", out.noneLeft === 0, String(out.noneLeft));
  ok("반에 없는 학생의 요일은 못 바꾼다 (조용히 넘어가지 않는다)",
     /반에 넣어/.test(out.strangerErr), out.strangerErr);
  ok("반에 넣으면서 요일을 같이 준다", out.assignedDays === "15", out.assignedDays);
  ok("⚠ 정규반 줄에는 days 를 안 얹는다 (참여표 회차가 틀어진다)", out.regularHasDays === false);
  ok("선생님 이름으로 개진반을 만든다", out.madeName === "개진반 이현우", out.madeName);
  ok("있던 개진반과 같은 모양으로 만든다",
     out.madeShape === "books,classDays,createdBy,name,roster,time,type", out.madeShape);
  ok("개진반은 type 이 individual 이고 반 요일이 없다",
     out.madeType === "individual" && out.madeDays === "[]", out.madeType + " " + out.madeDays);
  ok("선생님 줄 하나로 시작한다", out.madeTeacherRow === true);
  ok("만들면 그 선생님 담당 반에 들어간다 (안 넣으면 보고에 안 뜬다)", out.madeInCharge === true);
  ok("만들고 나면 「없는 선생님」에서 빠진다", out.madeGone === 0, String(out.madeGone));
  ok("같은 반을 두 번 못 만든다", /이미 있다/.test(out.dupErr), out.dupErr);

  // ---- 업무보고가 그 요일 학생만 골라 내는가 ----
  // 마왕님이 요구한 것이 정확히 이것이다: "그 해당요일 업무보고에 해당 요일 개진반 등원학생들이 잘 골라져 나와야해"
  const on = (d) => g(`rpStudentsOn(S.classes.filter(function(c){return c.id==="k1";})[0], "${d}").map(function(r){return r.name;}).join(",")`);
  vm.runInContext(`S.classes = JSON.parse(JSON.stringify(__save));`, ctx);   // 무대를 처음으로 되돌린다
  ok("화요일 보고에는 화목 학생이 나온다", on("2026-09-15") === "엄태경", on("2026-09-15"));
  ok("목요일 보고에도 나온다", on("2026-09-17") === "엄태경", on("2026-09-17"));
  ok("월요일 보고에는 아무도 안 나온다", on("2026-09-14") === "", on("2026-09-14"));
  ok("⚠ 요일이 빈 학생은 이레 내내 한 번도 안 나온다",
     ["2026-09-13","2026-09-14","2026-09-15","2026-09-16","2026-09-17","2026-09-18","2026-09-19"]
       .every((d) => on(d).indexOf("공하빈") < 0));
  ok("요일을 주면 그 날부터 나온다",
     (function () {
       vm.runInContext(`S.classes.filter(function(c){return c.id==="k1";})[0].roster[2].days=[1,3];`, ctx);
       return on("2026-09-14") === "공하빈" && on("2026-09-16") === "공하빈";
     })(), on("2026-09-14"));
  ok("같은 반에 요일이 다른 학생이 섞여 있어도 각자 날에 나온다",
     on("2026-09-15") === "엄태경" && on("2026-09-16") === "공하빈");
  ok("개진반은 오는 학생이 하나도 없는 날엔 수업 자체가 없다",
     g(`rpMeets(S.classes.filter(function(c){return c.id==="k1";})[0], "2026-09-19")`) === false);
  ok("담당 선생님의 그 날 반 목록에 개진반이 뜬다",
     g(`rpClassesOn("T1","2026-09-15").map(function(c){return c.name;}).join(",")`).indexOf("개진반 한민수") >= 0,
     g(`rpClassesOn("T1","2026-09-15").map(function(c){return c.name;}).join(",")`));

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
}).catch((e) => { console.error("터짐:", e); process.exit(1); });
