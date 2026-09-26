// 직보 2시·5시 · 직보 날짜별 모아 보기 (2026-09-26 마왕님)
// «시험 첫날이 바로 수학시험이면 전날 직보 5시에 시작이고, 첫날이 아니면 다른 시험 보고 일찍 올 수 있으니까 수학 직보가 2시.
//  2시 5시 직보 색깔 달리해» · «내신참여표에서 직보날짜별로 모아볼 수 있게»
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

// 수학이 첫날(9/30 시작 · 수학 9/30) → 전날 9/29 5시
const A = `{ start:"2026-09-30", end:"2026-10-06", math:"2026-09-30", prep:"2026-09-29" }`;
// 수학이 셋째 날(10/2) → 전날 10/1 은 시험 보는 날 → 2시
const B = `{ start:"2026-09-30", end:"2026-10-06", math:"2026-10-02", prep:"2026-10-01" }`;
ok("수학이 시험 첫날 → 직보 5시", run(`return prepHour(${A})`) === 17);
ok("수학이 첫날이 아니면 → 직보 2시", run(`return prepHour(${B})`) === 14);
ok("내신 시작이 비면 모른다(0)", run(`return prepHour({ math:"2026-10-02", prep:"2026-10-01" })`) === 0);
ok("수학시험이 비면 모른다(0)", run(`return prepHour({ start:"2026-09-30", prep:"2026-09-29" })`) === 0);
ok("손으로 고친 직보 날짜여도 시각은 수학·첫날로 정한다", run(`return prepHour({ start:"2026-09-30", math:"2026-10-02", prep:"2026-09-28" })`) === 14);
ok("띠 색이 다르다 — 5시 주황 · 2시 보라",
  run(`return markOf(${A}, "2026-09-29") === EXAM_MARKS.prep && markOf(${B}, "2026-10-01") === EXAM_MARKS.prep2 && EXAM_MARKS.prep.bg !== EXAM_MARKS.prep2.bg`));
ok("직보가 시험 기간 안이어도 «시» 가 아니라 «직» 으로 칠한다", run(`return markOf(${B}, "2026-10-01").t`) === "직");
ok("표의 직보 칸에 «2시»/«5시»", /2시<\/span>/.test(run(`return prepHourPill(${B})`)) && /5시<\/span>/.test(run(`return prepHourPill(${A})`)) &&
  /esc\(fmtMD\(v\.prep\)\) \+ " " \+ prepHourPill\(v\)/.test(src));
ok("범례에 둘 다 뜬다 (참여표 · 중3 내신관리 HTML)", /직보 5시/.test(run(`return EXAM_MARKS.prep.label`)) && /직보 2시/.test(run(`return EXAM_MARKS.prep2.label`)) &&
  /\["exam", "math", "prep", "prep2", "back"\]/.test(src));

// ---- 직보 날짜별 ----
run(`
  var C1 = { id:"c1", name:"고1S" }, C2 = { id:"c2", name:"고1T" };
  __done = [
    { cls:C1, st:{ id:"a", name:"나현" }, v: Object.assign({ school:"중동고" }, ${A}) },
    { cls:C2, st:{ id:"b", name:"가윤" }, v: Object.assign({ school:"휘문고" }, ${A}) },
    { cls:C1, st:{ id:"c", name:"다은" }, v: Object.assign({ school:"숙명여고" }, ${B}) },
    { cls:C2, st:{ id:"d", name:"라희" }, v: { school:"개포고", start:"2026-10-02", end:"2026-10-06", math:"2026-10-02", prep:"2026-10-01" } },
    { cls:C1, st:{ id:"e", name:"마루" }, v: { school:"경기고", start:"2026-10-05", end:"2026-10-08" } } ];
`);
const G = JSON.parse(run(`var g = prepGroups(__done); return JSON.stringify({ d: g.list.map(function (x) { return x.date + ":" +
  x.h17.map(function (y) { return y.st.name; }).join("") + "/" + x.h14.map(function (y) { return y.st.name; }).join(""); }), none: g.none.map(function (y) { return y.st.name; }) })`));
ok("직보 날짜순으로 묶고, 날마다 5시·2시로 가른다 (이름순)",
  JSON.stringify(G.d) === JSON.stringify(["2026-09-29:가윤나현/", "2026-10-01:라희/다은"]), JSON.stringify(G.d));
ok("같은 날 2시·5시가 섞일 수 있다 — 10/1 은 다은(2시, 첫날 9/30·수학 10/2) · 라희(5시, 첫날=수학 10/2)", G.d[1] === "2026-10-01:라희/다은");
ok("수학시험이 없는 사람은 «직보 없음» 으로 따로", JSON.stringify(G.none) === '["마루"]');
run(`TODAY = "2026-09-26";`);
const H = run(`return prepGroupsHtml(__done)`);
ok("화면 — 날짜 머리 · 2시/5시 줄 · 이름을 누르면 고치기", /9\/29\(화\)/.test(H) && />2시<\/span>/.test(H) && />5시<\/span>/.test(H) &&
  /data-fix="c1\|a"/.test(H) && /직보 없음 1명/.test(H), H.slice(0, 300));
ok("보기 칩 «날짜 띠 · 표» / «직보 날짜별»", /data-exview="prep">직보 날짜별/.test(src) && /S\.exView === "prep" \? prepGroupsHtml\(done\)/.test(src));

// ---- 날짜 띠 · 표에서 직보 순 정렬 (2026-09-26 «날짜 띠.표 에서도 직보순으로 정렬도 해줘») ----
const sortBy = (dir) => run(`S.exSort = { key: "prep", dir: "${dir}" }; var r = examSortRows(__done.concat([{ cls:__done[0].cls, st:{ id:"z", name:"바다" }, v:null }]), [], "");
  S.exSort = null; return r.map(function (x) { return x.st.name; }).join(",");`);
ok("직보 오름 — 날짜 순, 같은 날은 2시 → 5시, 직보 없음 · 안 낸 사람은 맨 아래", sortBy("asc") === "가윤,나현,다은,라희,마루,바다", sortBy("asc"));
ok("직보 내림 — 늦은 직보부터, 빈 칸은 그래도 맨 아래", sortBy("desc") === "라희,다은,가윤,나현,마루,바다", sortBy("desc"));
ok("정렬 칩과 표 머리에 «직보»", /\{ key: "prep", label: "직보" \}/.test(src) && /exSortTh\("prep", "직보"\)/.test(src));

T.forEach((l) => console.log(l));
const bad = T.filter((l) => l.startsWith("FAIL")).length;
console.log(bad ? "\n" + bad + "개 실패" : "\n모두 통과 (" + T.length + ")");
process.exit(bad ? 1 : 0);
