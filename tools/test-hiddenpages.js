// 숨긴 메뉴 (2026-09-26 마왕님 «개발현황 앞으로2주 근거자료는 감추자 안쓰는기능임»)
// 원장님 9/18 «안 쓰는 기능은 지우지 말고 숨겨 보관» — 메뉴 줄에서만 빠지고 화면은 남는다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(){return {collection:function(){return {doc:function(){return {get:function(){return Promise.resolve({exists:false});}};}};}};},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var __ls = {};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:(k)=>__ls[k]||null,setItem(k,v){__ls[k]=v;}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, isNaN, parseInt });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

ok("숨긴 메뉴는 셋 — 개발 현황 · 앞으로 2주 · 근거 자료", run(`return HIDDEN_PAGES.join(",")`) === "dev,week,sheets");
ok("지우지 않았다 — 화면(PAGES)에는 그대로 있다", run(`return ["dev","week","sheets"].every(function (id) { return PAGES.some(function (p) { return p[0] === id; }); })`));
run(`S.ro = false;`);
ok("다른 화면의 단추로는 그대로 열린다 (근거 자료에서 등록 등)", run(`return isPage("sheets") && isPage("dev") && isPage("week")`));
run(`location.hash = "#dev";`);
ok("주소가 숨긴 메뉴여도 켤 때는 «할 일» 로", run(`return currentPage()`) === "tasks");
run(`location.hash = ""; localStorage.setItem("dash.page", "sheets");`);
ok("마지막에 본 것이 숨긴 메뉴여도 «할 일» 로", run(`return currentPage()`) === "tasks");
run(`localStorage.setItem("dash.page", "report");`);
ok("숨기지 않은 메뉴는 기억한 대로", run(`return currentPage()`) === "report");
ok("메뉴 단추는 hidden 으로 그리고, 팀장에게만 «⋯» 로 잠깐 보인다",
  /HIDDEN_PAGES\.indexOf\(p\[0\]\) >= 0 \? ' class="nav-hid" hidden' : ""/.test(src) && /\(S\.ro \? "" : '<button id="nav-more"/.test(src));
ok("메뉴 단추 연결은 data-page 가 있는 것만 («⋯» 가 showPage(null) 을 부르지 않게)", /\$\$\("\.nav button\[data-page\]"\)/.test(src));

T.forEach((l) => console.log(l));
const bad = T.filter((l) => l.startsWith("FAIL")).length;
console.log(bad ? "\n" + bad + "개 실패" : "\n모두 통과 (" + T.length + ")");
process.exit(bad ? 1 : 0);
