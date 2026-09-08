// 근거 자료 — 각 메뉴가 어느 시트에서 자료를 끌어오는지. 여기서 바꾸면 그 메뉴가 바로 그걸 쓴다.
// 주소를 못 읽거나 옛 자리를 못 읽으면 «시트에서 가져오기» 가 통째로 죽는다.
const fs = require("fs"), vm = require("vm");
const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync("index.html", "utf8"))[1];

const SAVED = [];
const teamDb = { collection: () => ({ doc: () => ({
  set: (d) => { SAVED.push(JSON.parse(JSON.stringify(d))); return Promise.resolve(); },
  get: () => Promise.resolve({ exists: false }) }) }) };
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:function(app){return app?TEAMDB:CLASSDB;},
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number,
  Promise, RegExp, isNaN, parseInt, TEAMDB: teamDb, CLASSDB: { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }) } });
vm.runInContext(stub + "\n" + src, ctx);
const run = (code) => vm.runInContext("(function(){" + code + "})()", ctx);
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// ---- 주소에서 시트 id 뽑기 ----
const ID = "1Zv0L3o3FXLCStzXpjNrOMxFEj-wrbUdhRiAc5JWH5Z4";
ok("주소창 주소 그대로", run(`return sheetIdFrom("https://docs.google.com/spreadsheets/d/${ID}/edit?usp=drivesdk")`) === ID);
ok("gid 가 붙어도", run(`return sheetIdFrom("https://docs.google.com/spreadsheets/d/${ID}/edit#gid=12345")`) === ID);
ok("id 만 줘도", run(`return sheetIdFrom("${ID}")`) === ID);
ok("앞뒤 공백은 지운다", run(`return sheetIdFrom("  ${ID}  ")`) === ID);
ok("주소가 아니면 빈 값", run(`return sheetIdFrom("성적 시트")`) === "");
ok("빈 칸도 빈 값", run(`return sheetIdFrom("")`) === "");

// ---- 어느 메뉴가 근거를 갖나 ----
const SRC = JSON.parse(run(`return JSON.stringify(SOURCES)`));
ok("메뉴마다 한 줄씩 있다", SRC.length >= 5, String(SRC.length));
// 2026-09-08 학생 명단 «대조용» 시트가 늘었다 — 명단의 근거지는 그대로 앱 DB 고, 이건 맞춰 보는 자료다
ok("시트로 대는 것은 시험 성적과 명단 대조용 둘", SRC.filter((x) => x.sheet).map((x) => x.key).sort().join(",") === "roster,scores",
  SRC.filter((x) => x.sheet).map((x) => x.menu).join(","));
ok("시트인 줄에는 열쇠가 있다", SRC.filter((x) => x.sheet).every((x) => x.key), JSON.stringify(SRC.filter((x) => x.sheet)));
ok("시트가 아닌 줄에도 «무엇을·어디서»가 적혀 있다",
  SRC.filter((x) => !x.sheet).every((x) => x.what && x.how), JSON.stringify(SRC.filter((x) => !x.sheet).map((x) => x.menu)));

// ---- 근거 읽기·쓰기 ----
run(`S.config = { sources: {} };`);
ok("아직 없으면 null", run(`return sourceOf("scores")`) === null);
// ⚠ 옛 자리(config.scoreSheet)에 있던 것도 읽어줘야 한다 — 안 그러면 이미 등록한 시트가 사라진 것처럼 보인다.
run(`S.config = { scoreSheet: { id: "OLD", url: "u" } };`);
ok("옛 자리에 있는 것도 읽어준다", run(`return sourceOf("scores").id`) === "OLD", run(`return JSON.stringify(sourceOf("scores"))`));
run(`S.config = { scoreSheet: { id: "OLD" }, sources: { scores: { id: "NEW" } } };`);
ok("새 자리가 있으면 그쪽이 이긴다", run(`return sourceOf("scores").id`) === "NEW");

// ---- 시험 성적이 그 근거를 그대로 쓴다 ----
run(`S.config = { sources: { scores: { id: "ABC", url: "https://x", title: "성적 시트" } } };`);
ok("시험 성적이 등록된 근거를 읽는다", run(`return scoreSheet().id`) === "ABC", run(`return JSON.stringify(scoreSheet())`));
ok("근거가 없으면 시험 성적도 없다고 본다",
  run(`S.config = { sources: {} }; return scoreSheet()`) === null);

// ---- 설명은 물음표 안에 (2026-09-08) ----
// "자질구레한 설명들 다 빼고 맨 아래 물음표 아이콘 만들어서 거기에 넣어"
run(`S.config = { sources: { scores: { id:"ABC", url:"https://x", title:"성적 시트" } } }; S.saEmail = "team@x.iam.gserviceaccount.com"; S.srcHelp = false;`);
const rows = () => SRC.map((x) => run("return srcRowHtml(SOURCES[" + SRC.indexOf(x) + "])")).join("");
{
  const all = rows(), help0 = run("return srcHelpHtml()");
  ok("줄에는 «어떻게 쓰나» 가 없다", !SRC.some((x) => all.indexOf(x.how.slice(0, 20)) >= 0),
    SRC.filter((x) => all.indexOf(x.how.slice(0, 20)) >= 0).map((x) => x.menu).join(","));
  ok("메뉴 이름과 «무엇을» 은 그대로 보인다", SRC.every((x) => all.indexOf(x.menu) >= 0 && all.indexOf(x.what) >= 0));
  ok("연결됨·단추도 그대로", all.indexOf("연결됨") >= 0 && all.indexOf("data-scheck=") >= 0);
  ok("접혀 있으면 물음표만 있고 글은 없다",
    /data-shelp/.test(help0) && help0.indexOf("hbody") < 0 && help0.indexOf("뷰어") < 0, help0);
  ok("물음표는 감추기가 안 지운다 (data-keep)", /data-keep/.test(help0), help0);
  run("S.srcHelp = true");
  const help1 = run("return srcHelpHtml()");
  ok("펼치면 줄마다의 설명이 다 들어 있다", SRC.every((x) => help1.indexOf(x.how.slice(0, 20)) >= 0),
    SRC.filter((x) => help1.indexOf(x.how.slice(0, 20)) < 0).map((x) => x.menu).join(","));
  ok("서비스 계정 안내도 여기로 왔다", /뷰어/.test(help1) && /team@x\.iam/.test(help1));
  ok("펼친 물음표에 표가 난다", /class="hq on"/.test(help1));
  ok("계정을 아직 모르면 그렇게 적는다",
    /이 앱의 서비스 계정/.test(run(`S.saEmail = ""; return srcHelpHtml()`)));
  run("S.srcHelp = false; S.saEmail = ''");
}

// ⚠ 비동기 시험은 **맨 마지막에** 건다. await 로 양보하는 사이에
//   뒤의 동기 줄이 S.config 를 갈아치워서, 있지도 않은 버그가 보인다(2026-09-05에 헛짚었다).
vm.runInContext(`globalThis.__t = (async function(){
  S.config = { sources: {} };
  await saveSource("scores", { id: "${ID}", url: "https://x" });
  var a = sourceOf("scores").id;
  var wrote = SAVED_REF.length && SAVED_REF[SAVED_REF.length-1].sources.scores.id;
  await saveSource("scores", null);
  var b = sourceOf("scores");
  return [a, wrote, b === null].join("|");
})();`, Object.assign(ctx, { SAVED_REF: SAVED }));

ctx.__t.then((r) => {
  const [a, wrote, cleared] = r.split("|");
  ok("근거를 저장하면 그 자리에 들어간다", a === ID, a);
  ok("DB에도 같은 값이 간다", wrote === ID, wrote);
  ok("연결을 끊으면 없어진다", cleared === "true");

  console.log(T.join("\n"));
  const bad = T.filter((x) => x.startsWith("FAIL")).length;
  console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
  process.exit(bad ? 1 : 0);
}).catch((e) => { console.error("터짐:", e); process.exit(1); });
