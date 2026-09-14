// 배치표 — 개진반은 요일 표 (2026-09-15).
//
// 마왕님: «개진반 안에서도 요일별로 정렬해보자. 월화수목금토일을 열로 두고 그 아래 학생을 둬봐».
// 틀리기 쉬운 것: 요일 여럿인 학생이 한 칸에만 뜨는 것 · 요일 빈 학생이 표에서 조용히 사라지는 것 ·
//                정규반까지 요일 표로 새는 것 · 일요일(0)이 맨 앞으로 오는 것.
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

const setup = () => run(`
  S.claims = { role:"owner", tid:"TH", name:"한민수" };
  S.teachers = [ { tid:"TH", name:"한민수", classIds:["c1","k2"] }, { tid:"TP", name:"박리안", classIds:["k1"] } ];
  S.classes = [
    { id:"c1", name:"고1S (201호)", classDays:[2,4], roster:[ { id:"r1", pid:"p1", name:"진유준", grade:"고1" } ] },
    { id:"k1", name:"개진반 박리안", type:"individual", classDays:[], roster:[ { id:"t", name:"박리안", teacher:true, days:[] },
      { id:"s1", pid:"p2", name:"하강지원", grade:"중3", days:[1,5,6] },
      { id:"s2", pid:"p3", name:"가박보민", grade:"중3", days:[6] },
      { id:"s3", pid:"p4", name:"나일요일", grade:"고1", days:[0] } ] },
    { id:"k2", name:"개진반 한민수", type:"individual", classDays:[], roster:[ { id:"t", name:"한민수", teacher:true, days:[] },
      { id:"s4", pid:"p1", name:"진유준", grade:"고1", days:[4] },
      { id:"s5", pid:"p5", name:"임지아", grade:"중3", days:[6] } ] }
  ];
  S.students = [ { pid:"p1", name:"진유준", grade:"고1", school:"보인고" }, { pid:"p2", name:"하강지원", grade:"중3" },
    { pid:"p3", name:"가박보민", grade:"중3" }, { pid:"p4", name:"나일요일", grade:"고1" }, { pid:"p5", name:"임지아", grade:"중3" } ];
  S.byPid = {}; S.students.forEach(function (x) { S.byPid[x.pid] = x; });
`);
// 표에서 한 반의 한 요일 칸에 든 학생 번호들
const cell = (h, cls, wk) => {
  const tb = /<table class="cgrid ind">([\s\S]*?)<\/table>/.exec(h); if (!tb) return null;
  const row = tb[1].split("<tr>").filter((r) => r.indexOf('<div class="cn">' + cls + "</div>") >= 0)[0]; if (!row) return null;
  const td = new RegExp('<td class="wk[^"]*" data-wk="' + wk + '">([\\s\\S]*?)</td>').exec(row); if (!td) return null;
  return (td[1].match(/data-open="([^"]+)"/g) || []).map((x) => x.slice(11, -1));
};

setup();
let h = run("return classGridHtml()");
const ind = (/<table class="cgrid ind">[\s\S]*?<\/table>/.exec(h) || [""])[0];
ok("개진반은 요일 표 하나로 그린다", (h.match(/<table class="cgrid ind">/g) || []).length === 1);
ok("개진반 묶음 머리가 따로 선다", /<h3 class="gh"><span class="pill">개진반<\/span><span class="muted">2반 · 5명/.test(h), (h.match(/<h3 class="gh">.*?<\/h3>/g) || []).join(" | "));
ok("정규반은 예전 표 그대로 — 개진반이 정규반 표의 열로 안 샌다", (() => {
  const reg = h.split('<table class="cgrid">').slice(1).map((x) => x.split("</table>")[0]).join("");
  return reg.indexOf("고1S") >= 0 && reg.indexOf("개진반") < 0;
})());
ok("«그 밖» 묶음에 개진반이 안 섞인다", h.indexOf(">그 밖<") < 0);
const heads = (ind.match(/<th class="wk[^"]*" data-wk="[^"]+"><div class="cn">([^<]+)/g) || []).map((x) => x.replace(/.*>/, ""));
ok("열은 월화수목금토일 순 — 일요일이 맨 끝", heads.join("") === "월화수목금토일", heads.join(""));
ok("줄이 반 하나씩 — 박리안 · 한민수", /<div class="cn">개진반 박리안<\/div>/.test(ind) && /<div class="cn">개진반 한민수<\/div>/.test(ind));
ok("요일 여럿인 학생은 칸마다 뜬다 — 월·금·토", JSON.stringify([cell(h, "개진반 박리안", 1), cell(h, "개진반 박리안", 5)]) === '[["p2"],["p2"]]' && cell(h, "개진반 박리안", 6).indexOf("p2") >= 0);
ok("안 오는 요일 칸에는 없다", cell(h, "개진반 박리안", 2).length === 0 && cell(h, "개진반 박리안", 3).length === 0);
ok("일요일 학생은 일 칸에", JSON.stringify(cell(h, "개진반 박리안", 0)) === '["p4"]');
ok("칸 안은 이름순 — 가박보민 · 하강지원", JSON.stringify(cell(h, "개진반 박리안", 6)) === '["p3","p2"]', JSON.stringify(cell(h, "개진반 박리안", 6)));
ok("반마다 따로 — 한민수 반 토요일은 임지아만", JSON.stringify(cell(h, "개진반 한민수", 6)) === '["p5"]');
ok("머리의 요일 인원은 반을 합친 것 — 토 3명", /data-wk="6"><div class="cn">토<\/div><div class="cm"><span class="cnt">3<\/span>명/.test(ind));
ok("반 인원은 사람 수 — 박리안 3명 (칸 겹침 없이)", /개진반 박리안<\/div><div class="cm">박리안 · <span class="cnt">3<\/span>명/.test(ind));
ok("요일 빈 학생이 없으면 «요일 없음» 칸이 없다", ind.indexOf("요일 없음") < 0);
ok("내가 담당인 반 줄은 파랗게", /<th class="rn ik mine"><div class="cn">개진반 한민수/.test(ind) && /<th class="rn ik"><div class="cn">개진반 박리안/.test(ind));
ok("이름을 누르면 고치기 (data-open)", /<span class="nm [\w-]+" data-open="p2">하강지원<i>9<\/i><\/span>/.test(ind), (ind.match(/<span class="nm[^>]*data-open="p2"[^>]*>.*?<\/span>/) || [""])[0]);
ok("학교가 있으면 이름 옆에", /data-open="p1">진유준<i>10<\/i><\/span><span class="sch">보인고<\/span>/.test(ind));
ok("정규반·개진반 둘 다인 학생은 양쪽에 다 뜬다", /data-open="p1"/.test(h.split('<table class="cgrid ind">')[0]) && cell(h, "개진반 한민수", 4).indexOf("p1") >= 0);

// 요일 빈 학생
run(`S.classes[1].roster[2].days = []`);
h = run("return classGridHtml()");
ok("요일 빈 학생은 맨 끝 «요일 없음» 칸에", JSON.stringify(cell(h, "개진반 박리안", "none")) === '["p3"]', JSON.stringify(cell(h, "개진반 박리안", "none")));
ok("«요일 없음» 칸은 빨갛다 (머리·칸)", /<th class="wk none" data-wk="none"><div class="cn">요일 없음/.test(h) && /<td class="wk none" data-wk="none">[^<]*<div class="ii"/.test(h));
ok("요일 빈 학생이 없는 반의 «요일 없음» 칸은 빈 흰 칸", /<td class="wk" data-wk="none"><\/td>/.test(h));
ok("그 학생은 다른 요일 칸에는 없다", cell(h, "개진반 박리안", 6).indexOf("p3") < 0);

// 반이 끝난 학생은 안 뜬다 (rosterStudents 와 같다)
setup(); run(`S.classes[1].roster[1].endDate = "2000-01-01"`);
h = run("return classGridHtml()");
ok("그만둔 학생은 요일 칸에서도 빠진다", cell(h, "개진반 박리안", 1).length === 0, JSON.stringify(cell(h, "개진반 박리안", 1)));

// 개진반이 없으면 요일 표도 없다
setup(); run(`S.classes = S.classes.filter(function(c){ return c.type !== "individual"; })`);
h = run("return classGridHtml()");
ok("개진반이 없으면 요일 표도 없다", h.indexOf("cgrid ind") < 0);

// div 짝
setup(); h = run("return classGridHtml()");
ok("div 를 다 닫는다", (h.match(/<div/g) || []).length === (h.match(/<\/div>/g) || []).length);
ok("CSS — 요일 표 규칙이 있다", /table\.cgrid\.ind td\.wk \{/.test(html) && /table\.cgrid\.ind td\.wk\.none \{/.test(html));

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
