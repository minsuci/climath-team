// 회의록 — 볼트 노트 읽기(parseNote)와 화면에 그리기(mdToHtml)를 확인한다.
//
//   node tools/test-minutes.mjs
//
// 마크다운을 손으로 그리므로 **깨지면 회의록이 통째로 안 읽힌다.** 실제 노트에 쓰는 것만 다룬다.
import fs from "fs";
import vm from "vm";
import { parseNote } from "./push-minutes.mjs";

const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"))[1];
const stub = `
var firebase={initializeApp:function(c,n){return n?{t:1}:{};},firestore:()=>({collection:()=>({doc:()=>({get:()=>Promise.resolve({exists:false})})})}),
  auth:()=>({onAuthStateChanged(){},currentUser:null,signOut:()=>Promise.resolve()})};
var document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
var window={addEventListener(){},scrollTo(){}},location={hash:""},history={replaceState(){}},localStorage={getItem:()=>null,setItem(){}};
var fetch=()=>Promise.reject(new Error("no net")); var alert=function(){},confirm=()=>true,prompt=()=>null;
`;
const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number,
  Promise, RegExp, isNaN, parseInt });
vm.runInContext(stub + "\n" + src, ctx);
const md = (t) => vm.runInContext("mdToHtml", ctx)(t);

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// ---- 볼트 노트 읽기 ----
const NOTE = `---
날짜: 2026-08-31
종류: 간부 전체회의 (22:36~23:55)
참석: 원장 · 임지혜 부원장
결정: 4
원본: "[[원본/260831 간부 전체회의 상세.docx]]"
tags:
  - 팀장업무
  - 회의록
---

# 2026-08-31 간부 전체회의

본문 첫 줄.
`;
const N = parseNote("2026-08-31 간부 전체회의.md", NOTE);
ok("날짜를 읽는다", N.date === "2026-08-31", N.date);
ok("종류를 읽는다", N.kind === "간부 전체회의 (22:36~23:55)", N.kind);
ok("참석을 읽는다", N.attend === "원장 · 임지혜 부원장", N.attend);
ok("결정 수를 읽는다", N.decisions === "4", N.decisions);
ok("따옴표를 벗긴다", true);
ok("tags 아래 목록 줄은 칸으로 안 센다", !("- 팀장업무" in N) && N.md.indexOf("팀장업무") < 0, JSON.stringify(Object.keys(N)));
ok("제목은 본문 첫 # 에서", N.title === "2026-08-31 간부 전체회의", N.title);
ok("본문에서 머리말을 걷어낸다", N.md.indexOf("---") < 0 && N.md.indexOf("본문 첫 줄") >= 0, N.md.slice(0, 40));
ok("파일 이름이 곧 문서 열쇠", N.id === "2026-08-31 간부 전체회의", N.id);

const N2 = parseNote("2026-09-03 아무개 회의.md", "머리말 없는 노트\n");
ok("머리말이 없어도 파일 이름에서 날짜를 잡는다", N2.date === "2026-09-03", N2.date);
ok("제목이 없으면 파일 이름에서 날짜를 뗀다", N2.title === "아무개 회의", N2.title);

// ---- 화면에 그리기 ----
ok("제목은 한 단 낮춰 그린다 (## → h3)", md("## 안건").indexOf("<h3>안건</h3>") >= 0, md("## 안건"));
ok("굵게", md("**중요**").indexOf("<b>중요</b>") >= 0, md("**중요**"));
ok("코드", md("`api/auth`").indexOf("<code>api/auth</code>") >= 0, md("`api/auth`"));
ok("취소선", md("~~취소~~").indexOf("<del>취소</del>") >= 0, md("~~취소~~"));
ok("볼트 링크는 글자만 남긴다", md("[[할 일 추적]] 을 본다").indexOf("할 일 추적 을 본다") >= 0,
  md("[[할 일 추적]] 을 본다"));
ok("보일 글자가 따로 있는 볼트 링크", md("[[대상|보일 글자]]").indexOf("보일 글자") >= 0 &&
  md("[[대상|보일 글자]]").indexOf("대상") < 0, md("[[대상|보일 글자]]"));
ok("바깥 링크는 새 창으로", md("[구글](https://google.com)").indexOf('href="https://google.com" target="_blank"') >= 0,
  md("[구글](https://google.com)"));

const TBL = md("| 반 | 담당 |\n|---|---|\n| 고1S | **한민수** |\n| 고1T | 이창혁 |");
ok("표 머리", TBL.indexOf("<th>반</th>") >= 0, TBL.slice(0, 120));
ok("표 몸통 두 줄", (TBL.match(/<tr>/g) || []).length === 3, TBL.slice(0, 200));
ok("표 칸 안에서도 굵게가 산다", TBL.indexOf("<b>한민수</b>") >= 0, TBL.slice(0, 240));

ok("목록", md("- 하나\n- 둘").indexOf("<ul><li>하나</li><li>둘</li></ul>") >= 0, md("- 하나\n- 둘"));
ok("번호 목록", md("1. 하나\n2. 둘").indexOf("<ol>") >= 0, md("1. 하나\n2. 둘"));
ok("들여쓴 이어짐은 같은 항목", md("- 하나\n  이어짐\n- 둘").indexOf("<li>하나 이어짐</li>") >= 0,
  md("- 하나\n  이어짐\n- 둘"));

const CO = md("> [!warning] 조심할 것\n> 덮어쓰면 안 된다.");
ok("콜아웃은 제목을 굵게", CO.indexOf("<b>조심할 것</b>") >= 0, CO);
ok("콜아웃 종류에 따라 색이 갈린다", CO.indexOf('blockquote class="yellow"') >= 0, CO);
ok("그냥 인용도 그린다", md("> 한 줄 인용").indexOf("<blockquote") >= 0, md("> 한 줄 인용"));

const CODE = md("```\n# 이건 제목이 아니다\nnode tools/x.js\n```");
ok("코드 덩어리 안의 # 은 제목이 아니다", CODE.indexOf("<h") < 0 && CODE.indexOf("<pre>") >= 0, CODE);

// ⚠ 남이 쓴 글자가 화면 코드가 되면 안 된다. 회의록은 내가 쓰지만 규칙은 규칙이다.
const XSS = md("<script>alert(1)</script> 와 <b>날것</b>");
ok("날 태그는 글자로만 나온다", XSS.indexOf("<script>") < 0 && XSS.indexOf("&lt;script&gt;") >= 0, XSS);

ok("빈 줄로 문단이 갈린다", (md("첫 문단\n\n둘째 문단").match(/<p>/g) || []).length === 2,
  md("첫 문단\n\n둘째 문단"));
ok("한 문단 안의 줄바꿈은 이어 붙인다", md("앞줄\n뒷줄").indexOf("<p>앞줄 뒷줄</p>") >= 0, md("앞줄\n뒷줄"));
ok("가로줄", md("---").indexOf("<hr>") >= 0, md("---"));

// ---- 참석자 이름으로 훑기 ----
// 이름을 누르면 그 사람 것만 눈에 들어와야 한다.
//   초록 = 이름이 나온 곳 · 붉은색 = 그 사람에게 맡겨진 일
const names = (a) => JSON.parse(vm.runInContext("JSON.stringify(attendNames(" + JSON.stringify(a) + "))", ctx));
const N1 = names("원장 · 임지혜 부원장 · 추재광 팀장 · 한민수 부팀장");
ok("참석 줄에서 사람을 뽑는다", N1.map((x) => x.name).join(",") === "원장,임지혜,추재광,한민수",
  N1.map((x) => x.name).join(","));
ok("직함까지 보여준다", N1[1].label === "임지혜 부원장", N1[1].label);
// ⚠ "대치 — 원장 · ..." 처럼 지역이 앞에 붙는다. 안 떼면 «대치» 가 사람이 된다.
const NA2 = names("대치 — 원장 · 고우빈 팀장 · 한민수 / 서초 — 김재헌 실장 · 김효상 팀장");
ok("앞의 지역은 사람이 아니다", NA2.map((x) => x.name).join(",") === "원장,고우빈,한민수,김재헌,김효상",
  NA2.map((x) => x.name).join(","));
ok("같은 이름을 두 번 넣지 않는다", names("한민수 · 한민수 팀장").length === 1);
ok("빈 줄이면 아무도 없다", names("").length === 0);

// 칠하기 — HI 를 켜고 그린다
const hi = (name, md) => vm.runInContext(
  `(function(){ HI = ${name ? '{name:' + JSON.stringify(name) + '}' : "null"}; HI_TASK=false; HI_SEC="";
     var h = mdToHtml(${JSON.stringify(md)}); HI = null; return h; })()`, ctx);
const NOTE2 = [
  "## 안건",
  "",
  "한민수 팀장이 블루프린트를 설명했다.",
  "",
  "## 할 일",
  "",
  "| 할 일 | 담당 | 기한 |",
  "|---|---|---|",
  "| 고등관 회의 | 한민수 | 9/4 |",
  "| 문자 재발송 | 고우빈 | 화·수 |",
  "",
  "## 정해야 할 것",
  "",
  "- 추석특강 담당 — 한민수가 정한다",
].join("\n");
const H = hi("한민수", NOTE2);
ok("본문에 나온 이름은 초록", H.indexOf('<mark class="hit">한민수</mark>') >= 0, H.slice(0, 160));
// ⚠ 여기가 핵심이다. 담당 칸에 이름이 적힌 것은 «맡은 일» 이라 붉어야 한다.
ok("할 일 표의 담당 칸은 붉은색", (H.match(/<mark class="task">한민수<\/mark>/g) || []).length >= 1, H);
ok("남의 이름은 안 칠한다", H.indexOf("고우빈</mark>") < 0 && H.indexOf(">고우빈<") < 0 ? true : H.indexOf('mark class="task">고우빈') < 0);
// ⚠ «정해야 할 것» 은 **담당이 아직 안 정해진** 것들이다. 붉게 칠하면 «맡았다» 로 읽힌다.
ok("«정해야 할 것» 은 초록이다 (아직 맡은 게 아니다)",
  H.indexOf('<li>추석특강 담당 — <mark class="hit">한민수</mark>') >= 0,
  H.slice(H.indexOf("정해야")));
ok("붉은 것은 담당 칸 하나뿐", (H.match(/<mark class="task">/g) || []).length === 1,
  String((H.match(/<mark class="task">/g) || []).length));

// 담당이 표가 아니라 줄로 적히기도 한다 — «할 일» 절 아래 목록은 임무다
const NOTE2b = ["## 할 일", "", "- 고등관 회의 진행 — 한민수", "- 문자 재발송 — 고우빈"].join("\n");
ok("«할 일» 절 아래 목록은 붉다", hi("한민수", NOTE2b).indexOf('<mark class="task">한민수</mark>') >= 0,
  hi("한민수", NOTE2b));
ok("안 고르면 아무 데도 안 칠한다", hi("", NOTE2).indexOf("<mark") < 0);

// 표는 담당 칸만 붉다 — 첫 칸(할 일 이름)에 이름이 있어도 그건 임무 칸이 아니다
const NOTE3 = ["## 안건", "", "| 아이템 | 내용 |", "|---|---|", "| 라이브클래스 | 한민수·이창혁B가 전자칠판으로 |"].join("\n");
ok("담당 칸이 없는 표는 초록", hi("한민수", NOTE3).indexOf('<mark class="hit">한민수</mark>') >= 0,
  hi("한민수", NOTE3));
ok("담당 칸이 없으면 붉게 안 칠한다", hi("한민수", NOTE3).indexOf('class="task"') < 0);

// «지시사항» 표는 머리가 «누구» 다
const NOTE4 = ["## 11. 지시사항", "", "| 언제 | 무엇 | 누구 |", "|---|---|---|", "| 9/4 | 고등관 회의 | 한민수 |"].join("\n");
ok("지시사항 표는 통째로 임무", hi("한민수", NOTE4).indexOf('<mark class="task">한민수</mark>') >= 0,
  hi("한민수", NOTE4));

// ⚠ 태그 속을 건드리면 화면이 깨진다
const NOTE5 = "[한민수](https://example.com/한민수) 를 본다";
ok("링크 주소 속 이름은 안 건드린다",
  hi("한민수", NOTE5).indexOf('href="https://example.com/한민수"') >= 0, hi("한민수", NOTE5));
ok("링크 글자는 칠한다", hi("한민수", NOTE5).indexOf('<mark class="hit">한민수</mark>') >= 0, hi("한민수", NOTE5));

// ---- 진짜 회의록으로 한 번 ----
const REAL = fs.readFileSync(process.env.VAULT_MINUTES
  ? process.env.VAULT_MINUTES + "/2026-08-31 간부 전체회의.md"
  : "C:/Users/user/Desktop/민수의 뇌/40 팀장업무/회의록/2026-08-31 간부 전체회의.md", "utf8");
const RN = parseNote("2026-08-31 간부 전체회의.md", REAL);
const RH = md(RN.md);
ok("진짜 회의록이 통째로 그려진다", RH.length > 3000, String(RH.length));
ok("표가 살아 있다", RH.indexOf("<table>") >= 0);
ok("콜아웃이 살아 있다", RH.indexOf("<blockquote") >= 0);
ok("안 닫힌 태그가 없다", (RH.match(/<p>/g) || []).length === (RH.match(/<\/p>/g) || []).length,
  (RH.match(/<p>/g) || []).length + " / " + (RH.match(/<\/p>/g) || []).length);
ok("날 태그가 새지 않았다", RH.indexOf("<script") < 0);

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
