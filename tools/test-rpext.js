// 선생님 자기 출결 앱 → 업무보고 (2026-09-15, 이현우 선생님 앱).
//
// 무대는 **실제 명단과 실제로 받은 이름**이다(9/15 실측). 그쪽 앱은 겹칠 때만 꼬리를 붙이고 소문자를 쓴다 —
//   이서현a ↔ 이서현A · 박시현 ↔ 박시현A · 이윤서 ↔ 이윤서B · 이서현 ↔ (이서현B 로 보이지만 팀체크엔 이서현이 셋)
// 제일 중요한 것은 **안 붙이는 것**이다. 남의 출결이 붙으면 아무도 모른다.
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
  TODAY = "2026-09-15"; RP_START = "2026-09-14";
  S.teachers = [ { tid:"H", name:"이현우", role:"teacher", classIds:["S","G"] } ];
  S.classes = [
    { id:"S", name:"예비고1S 월금", type:"regular", classDays:[1,5], roster:[
      { id:"s1", name:"이수민", pid:"P_sumin" }, { id:"s2", name:"손원준", pid:"P_wonjun" }, { id:"s3", name:"이서현A", pid:"P_seoA" },
      { id:"s4", name:"김규림", pid:"P_gyu" }, { id:"s5", name:"박시현A", pid:"P_sihyun" } ] },
    { id:"G", name:"개진반 이현우", type:"individual", classDays:[], roster:[
      { id:"g1", name:"권나희", pid:"P_nahee", days:[3] }, { id:"g2", name:"박시현A", pid:"P_sihyun", days:[3] },
      { id:"g3", name:"이서현", pid:"P_seo", days:[3] }, { id:"g4", name:"이수민", pid:"P_sumin", days:[3] },
      { id:"g5", name:"이서현B", pid:"P_seoB", days:[2,4] }, { id:"g6", name:"이윤서B", pid:"P_yoon", days:[2,4,6] },
      { id:"g7", name:"김시우B", pid:"P_siwoo", days:[2,4] }, { id:"g8", name:"남보석", pid:"P_bo", days:[6] } ] } ];
  S.tasks = []; S.marks = {}; S.events = []; S.reports = {};
  S.claims = { role:"teacher", tid:"H", name:"이현우" }; S.ro = true;
`);
const R = (x) => "{name:" + JSON.stringify(x[0]) + ",attend:" + JSON.stringify(x[1]) + ",contacted:" + !!x[2] + ",note:" + JSON.stringify(x[3] || "") + ",score:" + (x[4] == null ? "null" : x[4]) + "}";
const apply = (d, rows, pre) => JSON.parse(run(`var r = rpDraft("H","${d}",${pre ? JSON.stringify(pre) : "null"});
  rpApplyExt(r, { source:"이현우", students:[${rows.map(R).join(",")}] }, rpMyRoster("H","${d}"));
  return JSON.stringify(r);`));
const stu = (rep, cid, sid) => rep.classes.filter((c) => c.cid === cid)[0].students.filter((s) => s.sid === sid)[0];

// ---- 9/14(월) — 실제로 받은 것 ----
const mon = apply("2026-09-14", [["김규림", "미정"], ["박시현", "미정"], ["손원준", "결석", true, "학원·시험 · 9/19 보강"], ["이서현a", "결석", true, "개인사정 · 9/15 보강"], ["이수민", "미정"]]);
ok("이서현a → 이서현A (대소문자만 다르다)", stu(mon, "S", "s3").att === "결석" && stu(mon, "S", "s3").called === true, JSON.stringify(stu(mon, "S", "s3")));
ok("결석 + 연락함 + 메모가 특이사항으로", stu(mon, "S", "s2").att === "결석" && stu(mon, "S", "s2").called && stu(mon, "S", "s2").note === "학원·시험 · 9/19 보강");
ok("⚠ «미정» 은 결석으로 안 적는다 (비워 둔다)", stu(mon, "S", "s1").att === "" && stu(mon, "S", "s4").att === "");
ok("박시현 → 박시현A (꼬리 없는 이름, 내 반에 박시현이 한 사람)", mon.ext.left.length === 0, JSON.stringify(mon.ext.left));
ok("반 머리에 쓸 받은 수", mon.classes[0].extRead === true && mon.classes[0].extN === 5);

// ---- 9/15(화) — 이서현은 셋이라 안 붙인다 · 남보석은 보강 ----
const tue = apply("2026-09-15", [["남보석", "출석", false, "9/12 결석분 보강"], ["이서현", "출석"], ["이윤서", "출석"]]);
ok("이윤서 → 이윤서B", stu(tue, "G", "g6").att === "출석");
ok("⚠ 이서현(꼬리 없음)은 이서현B 에 **안 붙인다** — 팀체크에 이서현이 셋", stu(tue, "G", "g5").att === "", JSON.stringify(stu(tue, "G", "g5")));
const seo = tue.ext.left.filter((l) => l.row.name === "이서현")[0];
ok("안 붙인 이유를 짚는다 — 이 날 명단의 비슷한 이름과 함께", seo && /이서현B/.test(seo.why), seo && seo.why);
const bo = tue.ext.left.filter((l) => l.row.name === "남보석")[0];
ok("그 날 명단에 없는 학생은 «보강?» 으로 남긴다 (억지로 안 넣는다)", bo && /보강/.test(bo.why), bo && bo.why);

// ---- 9/9(수) — 이서현a 가 왔는데 수요일 명단엔 «이서현» 뿐 ----
const wed = apply("2026-09-09", [["박시현", "출석"], ["이서현a", "결석", true, "개인사정 · 9/10 보강"], ["이수민", "출석"]]);
ok("⚠ 이서현a 를 수요일 «이서현» 에 **안 붙인다** (A 와 꼬리 없음은 다른 사람이다)", stu(wed, "G", "g3").att === "", JSON.stringify(stu(wed, "G", "g3")));
ok("  └ 표에 안 붙은 것으로 뜬다", wed.ext.left.some((l) => l.row.name === "이서현a"));
ok("박시현A 는 개진반(수)에 붙는다", stu(wed, "G", "g2").att === "출석");

// ---- 모르는 이름 ----
const odd = apply("2026-09-14", [["홍길동", "출석"]]);
ok("팀체크 명단에 없는 이름은 그렇다고 적는다", odd.ext.left[0] && /명단에 없는/.test(odd.ext.left[0].why), JSON.stringify(odd.ext.left));

// ---- 선생님이 고른 것은 안 덮는다 ----
const kept = apply("2026-09-14", [["손원준", "결석", false, "앱 메모"]],
  { classes: [{ cid: "S", students: [{ sid: "s2", att: "지각", auto: "", note: "버스" }] }] });
ok("⚠ 선생님이 고른 지각은 그대로", stu(kept, "S", "s2").att === "지각" && stu(kept, "S", "s2").auto === "결석");
ok("⚠ 적어 둔 특이사항은 그대로", stu(kept, "S", "s2").note === "버스");
const same = apply("2026-09-14", [["손원준", "출석"]], { classes: [{ cid: "S", students: [{ sid: "s2", att: "결석", auto: "결석" }] }] });
ok("손 안 댄 값(앱이 채운 그대로)은 새로 받은 것을 따른다", stu(same, "S", "s2").att === "출석");
const call = apply("2026-09-14", [["손원준", "출석", false]], { classes: [{ cid: "S", students: [{ sid: "s2", att: "결석", auto: "", called: true }] }] });
ok("연락함은 켜기만 한다 — 선생님이 켠 것을 안 끈다", stu(call, "S", "s2").called === true);

// ---- 점수 ----
const sc = apply("2026-09-14", [["김규림", "출석", false, "", 85]]);
ok("점수가 오면 점수 칸에 (앱 점수와 같은 규칙)", stu(sc, "S", "s4").score === "85" && stu(sc, "S", "s4").autoScore === 85);

// ---- 못 읽었을 때 · 연결 없을 때 ----
ok("못 읽으면 판은 그대로, 띠만", run(`var r = rpDraft("H","2026-09-14",null); rpApplyExt(r, { err:"출결 앱이 답하지 않았다" }, []);
  return !r.classes[0].extRead && /못 읽었다/.test(rpExtNote(r));`) === true);
ok("연결이 없으면 아무 것도 안 한다", run(`var r = rpDraft("H","2026-09-14",null); rpApplyExt(r, null, []); return r.ext === null && rpExtNote(r) === "" && !r.classes[0].extRead;`) === true);
ok("다 붙었으면 띠가 없다", run(`var r = rpDraft("H","2026-09-14",null); rpApplyExt(r, { students:[{name:"손원준",attend:"출석"}] }, rpMyRoster("H","2026-09-14")); return rpExtNote(r);`) === "");
ok("⚠ 저장 모양에 받은 흔적(ext·extRead·autoNote)이 안 섞인다", run(`var r = rpDraft("H","2026-09-14",null);
  rpApplyExt(r, { students:[{name:"손원준",attend:"결석",note:"x"}] }, rpMyRoster("H","2026-09-14"));
  var j = JSON.stringify(rpClean(r)); return !/"ext"|"extRead"|"extN"|"autoNote"/.test(j);`) === true);

// ---- 화면 — 흐름이 이어졌나 ----
const html = fs.readFileSync("index.html", "utf8");
ok("판을 열 때 출결 앱도 같이 읽는다", /Promise\.all\(\[rpLoadApp\(me, d\), rpLoadExt\(me, d\)\]\)/.test(html));
ok("⚠ 출결 앱이 읽혔으면 수업관리 앱 출석을 버린다 (안 버리면 전원 결석)", /if \(ext && !ext\.err\) Object\.keys\(app\)\.forEach\(function \(cid\) \{ app\[cid\]\.att = null; \}\)/.test(html));
ok("수업 제목 밑에 띠", /<h3 class="rp-h">수업<\/h3>' \+ rpExtNote\(rep\)/.test(html));

// ---- 서버 ----
const asrc = fs.readFileSync(__dirname + "/../api/attend.js", "utf8");
const sctx = vm.createContext({ Date, JSON, String, Array, Number, isFinite });
vm.runInContext(asrc.replace(/^import .*;$/gm, "").replace(/^export default /gm, "").replace(/^export (function )/gm, "$1"), sctx);
const sv = (c) => vm.runInContext(c, sctx);
ok("서버: 하루", sv(`rangeQuery({date:"2026-09-14"})`) === "?date=2026-09-14");
ok("서버: 구간 31일까지", sv(`rangeQuery({from:"2026-09-01",to:"2026-10-01"})`) === "?from=2026-09-01&to=2026-10-01");
ok("서버: 32일은 거절", sv(`rangeQuery({from:"2026-09-01",to:"2026-10-02"})`) === "");
ok("서버: 이상한 날짜는 거절 (주소에 끼워 넣기 막기)", sv(`rangeQuery({date:"2026-09-14&x=1"})`) === "");
const nd = JSON.parse(sv(`JSON.stringify(normDays({date:"2026-09-14",students:[{name:" 김규림 ",attend:"??",contacted:"yes",note:null,score:"90"},{name:""}]}))`));
ok("서버: 모르는 출결은 «미정» · 연락은 true 일 때만 · 점수는 숫자일 때만 · 빈 이름은 버린다",
  nd.length === 1 && nd[0].students.length === 1 && nd[0].students[0].name === "김규림" && nd[0].students[0].attend === "미정" &&
  nd[0].students[0].contacted === false && nd[0].students[0].note === "" && nd[0].students[0].score === null, JSON.stringify(nd));
ok("서버: 구간 모양도 같은 모양으로", JSON.parse(sv(`JSON.stringify(normDays({from:"a",to:"b",days:[{date:"2026-09-13",students:[]}]}))`))[0].date === "2026-09-13");
ok("서버: 선생님은 자기 것만", /claims\.role !== "owner" && claims\.tid !== tid/.test(asrc));
ok("서버: 열쇠는 응답에 안 싣는다", !/json\(\{[^}]*feed\.key/.test(asrc) && !/json\(\{[^}]*feed\.url/.test(asrc));
const rules = fs.readFileSync("firestore.rules", "utf8");
ok("⚠ 규칙에 secrets 가 없다 (브라우저에서 열쇠를 못 읽는다)", !/match \/secrets/.test(rules));

// ---- 반 단위 진도·과제 · 주의 (2026-09-22 박준성T «진도나 숙제도 채워졌으면 좋겠다 · 특이사항도») ----
const nd2 = JSON.parse(sv(`JSON.stringify(normDays({date:"2026-09-14",students:[{name:"김규림",attend:"출석",note:"과제 3주째 안 함",warn:true},{name:"이수민",attend:"출석",warn:"yes"}],
  classes:[{name:" 예비고1S 월금 ",progress:"공통수학1 2단원 p.40까지",homework:"쎈 B 1~20"},{name:"빈 것"},null]}))`));
ok("서버: 반 진도·과제를 넘긴다 (빈 줄은 버린다)", nd2[0].classes.length === 1 && nd2[0].classes[0].name === "예비고1S 월금" &&
  nd2[0].classes[0].progress === "공통수학1 2단원 p.40까지" && nd2[0].classes[0].homework === "쎈 B 1~20", JSON.stringify(nd2[0].classes));
ok("서버: 주의는 true 일 때만", nd2[0].students[0].warn === true && nd2[0].students[1].warn === false);
ok("서버: 옛 규격(반 없음)도 그대로 — classes 는 빈 배열", JSON.stringify(nd[0].classes) === "[]");
const applyX = (d, rows, classes, pre) => JSON.parse(run(`var r = rpDraft("H","${d}",${pre ? JSON.stringify(pre) : "null"});
  rpApplyExt(r, { source:"이현우", students:${JSON.stringify(rows)}, classes:${JSON.stringify(classes)} }, rpMyRoster("H","${d}"));
  return JSON.stringify(r);`));
const W = [{ name:"김규림", attend:"출석", contacted:false, note:"과제 3주째 안 함", score:null, warn:true }];
const x1 = applyX("2026-09-14", W, [{ name:"예비고1S 월금", progress:"2단원 p.40까지", homework:"쎈 B 1~20" }]);
const cS = x1.classes.filter((c) => c.cid === "S")[0];
ok("반 이름이 같으면 그 반에 진도·과제", cS.progress === "2단원 p.40까지" && cS.homework === "쎈 B 1~20", JSON.stringify([cS.progress, cS.homework]));
ok("특이사항이 채워지고, 보낸 «주의» 가 켜진다", stu(x1, "S", "s4").note === "과제 3주째 안 함" && stu(x1, "S", "s4").warn === true);
const x2 = applyX("2026-09-14", W, [{ name:"A반", progress:"3단원" }]);
ok("그 날 반이 하나고 온 것도 하나면 이름이 달라도 붙는다", x2.classes.filter((c) => c.cid === "S")[0].progress === "3단원");
const pre = { classes:[{ cid:"S", progress:"내가 적은 진도", homework:"", students:[{ sid:"s4", att:"출석", note:"내가 적은 메모", warn:false }] }] };
const x3 = applyX("2026-09-14", W, [{ name:"예비고1S 월금", progress:"앱 진도", homework:"앱 과제" }], pre);
const c3 = x3.classes.filter((c) => c.cid === "S")[0];
ok("선생님이 적은 진도는 안 덮고, 빈 과제만 채운다", c3.progress === "내가 적은 진도" && c3.homework === "앱 과제", JSON.stringify([c3.progress, c3.homework]));
ok("선생님이 적은 특이사항·끈 주의는 안 건드린다", stu(x3, "S", "s4").note === "내가 적은 메모" && stu(x3, "S", "s4").warn === false);
// 반이 둘인 날(수 9/16: 개진반만 → 하나. 화 9/15 는 개진반 하나) — 둘인 날을 만들어 본다
run(`S.classes[1].roster.push({ id:"g9", name:"김규림", pid:"P_gyu", days:[1] });`);
const x4 = applyX("2026-09-14", W, [{ name:"모르는 반", progress:"4단원" }]);
ok("반이 둘인 날 이름이 안 맞으면 안 붙이고 띠에 남긴다",
  x4.classes.every((c) => c.progress !== "4단원") && x4.ext.left.some((l) => /모르는 반 진도·과제/.test(l.row.name) && /어느 반인지 몰라/.test(l.why)), JSON.stringify(x4.ext.left));
run(`S.classes[1].roster.pop();`);

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
