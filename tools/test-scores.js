// 시험 성적(중간·기말·모의) 다루는 로직을 확인한다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const TEAM = { tests: {}, testScores: {} };
const LOG = [];
const cp = (x) => JSON.parse(JSON.stringify(x));
function fakeDb(store) {
  return { collection: (c) => ({
    doc: (id) => ({
      set: (d, o) => { LOG.push("set:" + c + "/" + id); store[c] = store[c] || {};
        store[c][id] = (o && o.merge) ? Object.assign({}, store[c][id], cp(d)) : cp(d); return Promise.resolve(); },
      delete: () => { LOG.push("del:" + c + "/" + id); if (store[c]) delete store[c][id]; return Promise.resolve(); },
      get: () => Promise.resolve({ exists: !!(store[c] && store[c][id]), data: () => cp((store[c] || {})[id] || {}) }),
    }),
    add: (d) => { const id = "t" + (Object.keys(store[c] || {}).length + 1); store[c] = store[c] || {};
      store[c][id] = cp(d); LOG.push("add:" + c + "/" + id); return Promise.resolve({ id }); },
    get: () => Promise.resolve({ forEach(f) { Object.keys(store[c] || {}).forEach((id) => f({ id, data: () => cp(store[c][id]), ref: { delete: () => { delete store[c][id]; return Promise.resolve(); } } })); } }),
    where: (f, op, val) => ({ get: () => Promise.resolve({ forEach(fn) {
      Object.keys(store[c] || {}).filter((id) => store[c][id][f] === val)
        .forEach((id) => fn({ id, data: () => cp(store[c][id]), ref: { delete: () => { delete store[c][id]; return Promise.resolve(); } } })); } }) }),
  }) };
}
const stub = `
var firebase={initializeApp:function(cfg,name){return name?{team:1}:{};},
  firestore:function(app){ return app? TEAMDB : CLASSDB; },
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number,
  Promise, RegExp, isNaN, parseInt, TEAMDB: fakeDb(TEAM), CLASSDB: fakeDb({}) });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// 1. 붙여넣기 한 줄 읽기
const mid = `["raw","ach","grade","avg"]`, mock = `["raw","std","pct","grade"]`;
ok("중간고사 — 이름 원점수 등급 평균",
  run(`return JSON.stringify(parseScoreLine("김서진 88 2 71.4", ${mid}))`) ===
  '{"name":"김서진","vals":{"raw":"88","grade":"2","avg":"71.4"}}',
  run(`return JSON.stringify(parseScoreLine("김서진 88 2 71.4", ${mid}))`));
ok("성취도는 자리를 안 가린다",
  run(`return JSON.stringify(parseScoreLine("김서진 88 A 2 71.4", ${mid}).vals)`) ===
  '{"ach":"A","raw":"88","grade":"2","avg":"71.4"}',
  run(`return JSON.stringify(parseScoreLine("김서진 88 A 2 71.4", ${mid}).vals)`));
ok("소문자 성취도도 대문자로", run(`return parseScoreLine("김서진 88 b 3", ${mid}).vals.ach`) === "B");
ok("모의고사 — 원점수 표준점수 백분위 등급",
  run(`return JSON.stringify(parseScoreLine("임서윤 76 128 89 2", ${mock}).vals)`) ===
  '{"raw":"76","std":"128","pct":"89","grade":"2"}',
  run(`return JSON.stringify(parseScoreLine("임서윤 76 128 89 2", ${mock}).vals)`));
ok("- 는 빈 칸으로 건너뛴다",
  run(`return JSON.stringify(parseScoreLine("박준서 92 - 68.2", ${mid}).vals)`) ===
  '{"raw":"92","grade":"","avg":"68.2"}',
  run(`return JSON.stringify(parseScoreLine("박준서 92 - 68.2", ${mid}).vals)`));
ok("탭으로 나눈 것도 읽는다", run(`return parseScoreLine("김서진\\t88\\t2", ${mid}).vals.raw`) === "88");
ok("이름만 있으면 건너뛴다", run(`return parseScoreLine("김서진", ${mid})`) === null);
ok("빈 줄은 건너뛴다", run(`return parseScoreLine("   ", ${mid})`) === null);

// 2. 평균
ok("평균은 빈 칸을 뺀다", run(`return avgOf(["80","","90",null,"100"])`) === 90);
ok("평균은 숫자 아닌 것도 뺀다", run(`return avgOf(["80","가나","100"])`) === 90);
ok("전부 비면 평균 없음", run(`return avgOf(["","",null])`) === null);
ok("평균은 소수 첫째까지", run(`return avgOf(["80","85","91"])`) === 85.3, run(`return avgOf(["80","85","91"])`));

// 3. 등급 색
ok("1~2등급 초록", run(`return gradeTone(1)+","+gradeTone(2)`) === "green,green");
ok("3~4등급 파랑", run(`return gradeTone(3)+","+gradeTone(4)`) === "blue,blue");
ok("5~6등급 무채색", run(`return gradeTone(5)+","+gradeTone(6)`) === ",");
ok("7등급부터 빨강", run(`return gradeTone(7)+","+gradeTone(9)`) === "red,red");
ok("빈 등급은 색 없음", run(`return gradeTone("")`) === "");

// 4. 그 학년 학생만 · 반과 담임이 붙는다
run(`
  S.teachers=[{tid:"T1",name:"한민수",classIds:["c1"]}];
  S.students=[{pid:"p1",name:"김서진",grade:"고1",school:"중대부고",homeroom:"T1"},
              {pid:"p2",name:"임서윤",grade:"고1",school:"경기고",homeroom:"T1"},
              {pid:"p3",name:"설민준",grade:"중3",school:"봉은중",homeroom:""}];
  S.byPid={}; S.students.forEach(function(x){S.byPid[x.pid]=x;});
  S.classes=[{id:"c1",name:"고1S",roster:[{id:"r1",pid:"p1",name:"김서진"}]}];
`);
ok("학년으로 거른다", run(`return testRoster("고1").length`) === 2);
ok("반 이름이 붙는다", run(`return testRoster("고1")[0].clsName`) === "고1S");
ok("담임 이름이 붙는다", run(`return testRoster("고1")[0].homeroom`) === "한민수");
ok("반 없는 학생도 빠지지 않는다", run(`return testRoster("고1")[1].clsName`) === "");

// 5. 저장 — 값이 전부 비면 문서를 지운다 (빈 껍데기가 응시로 세어지면 평균이 틀어진다)
vm.runInContext(`globalThis.__t1 = (async function(){
  S.testScores = {};
  await saveScore("T1","p1","김서진",{ raw:"88", grade:"2" });
  var made = !!TEAMDB_STORE.testScores["T1__p1"];
  await saveScore("T1","p1","김서진",{ raw:"", grade:"" });
  var gone = !TEAMDB_STORE.testScores["T1__p1"];
  var localGone = !S.testScores.p1;
  return [made, gone, localGone].join(",");
})();`, Object.assign(ctx, { TEAMDB_STORE: TEAM }));
ctx.__t1.then((r) => {
  ok("성적을 넣으면 문서가 생긴다", r.split(",")[0] === "true");
  ok("값을 다 지우면 문서도 지운다", r.split(",")[1] === "true");
  ok("화면 쪽도 같이 지운다", r.split(",")[2] === "true");

  // 6. 시험을 지우면 그 성적도 같이 지운다 (안 지우면 어디에도 안 보이는 성적이 남는다)
  return vm.runInContext(`(async function(){
    S.tests=[{tid:"T9",kind:"mock",name:"9월 학평",grade:"고1"}];
    await saveScore("T9","p1","김서진",{ raw:"76" });
    await saveScore("T9","p2","임서윤",{ raw:"81" });
    var before = Object.keys(TEAMDB_STORE.testScores).filter(function(k){return k.indexOf("T9__")===0;}).length;
    await deleteTest("T9");
    var after = Object.keys(TEAMDB_STORE.testScores).filter(function(k){return k.indexOf("T9__")===0;}).length;
    return before + "," + after + "," + S.tests.length;
  })()`, ctx);
}).then((r) => {
  const [before, after, left] = r.split(",");
  ok("시험을 지우면 성적도 같이 지운다", before === "2" && after === "0", r);
  ok("시험 목록에서도 빠진다", left === "0");

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
}).catch((e) => { console.error("터짐:", e); process.exit(1); });
