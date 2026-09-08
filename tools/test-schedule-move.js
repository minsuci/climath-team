// 찾아오기 서버가 정말 여기로 옮겨왔나 (2026-09-08).
//
// 옮기는 일은 «파일을 복사했다» 로 끝나지 않는다. 검사 겹수, 캐시 자리, 브라우저가 보내는 것,
// 떠난 자리의 표지까지 맞아야 한다. 하나라도 어긋나면 **조용히** 안 된다 —
// 옛 서버가 계속 답해 주거나(그럼 옮긴 줄 알지만 안 옮겨진 것), 캐시를 못 읽어 매번 학교를 다시 찾는다.
const fs = require("fs");
const TEAM = __dirname + "/..";
const CLASS = TEAM + "/../climath-class";
const sch = fs.readFileSync(TEAM + "/api/schedule.js", "utf8");
const goog = fs.readFileSync(TEAM + "/api/_google.js", "utf8");
const html = fs.readFileSync(TEAM + "/index.html", "utf8");

const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// ---- 본체가 왔나 ----
ok("찾아오기 본체가 여기 있다", /open\.neis\.go\.kr\/hub/.test(sch) && sch.split("\n").length > 800,
  String(sch.split("\n").length) + "줄");
ok("규칙 뭉치도 같이 왔다 (학교 이름·시험 말·그림 읽기)",
  /officialName/.test(sch) && /isExam/.test(sch) && /examFromImage/.test(sch) && /boardDocText/.test(sch));
ok("중계하던 옛 껍데기는 사라졌다", !/CLASS_SCHEDULE_URL/.test(sch) && !/climath-class\.vercel\.app\/api\/schedule/.test(sch));

// ---- 검사는 한 겹 ----
// 서버가 여기 있으니 팀 토큰 하나면 된다. 수업관리 앱 토큰을 계속 받으면
// «앱 로그인이 풀리면 학교 일정도 안 된다» 는 엉뚱한 매듭이 남는다.
ok("팀장만 쓸 수 있다", /claims\.role !== "owner"/.test(sch));
ok("수업관리 앱 토큰을 더 안 본다", !/classToken/.test(sch), (sch.match(/classToken/g) || []).join(","));
// ⚠ 로그인은 여전히 수업관리 앱 토큰을 받아 온다(그쪽 DB 를 브라우저가 직접 보므로). 그건 그대로 둔다.
//   여기서 보는 것은 «학교 일정 부를 때» 그것을 딸려 보내지 않는가다.
const fetchSch = /function fetchSchedule\([\s\S]*?\n}/.exec(html)[0];
ok("학교 일정을 부를 때 앱 토큰을 안 보낸다", !/classToken/.test(fetchSch), fetchSch.slice(0, 120).replace(/\n/g, " "));
ok("브라우저가 팀 토큰만 챙긴다", /fetchSchedule[\s\S]{0,400}idToken: await tu\.getIdToken\(\)/.test(html));

// ---- 캐시 자리 ----
// 팀 DB 에는 appConfig 가 없다. 그대로 두면 매번 나이스에서 학교를 다시 찾는다(요청 예산을 태운다).
ok("학교 코드 캐시가 팀 DB 자리로 왔다", /dash\/neisCodes/.test(sch));
ok("옛 자리를 안 본다", !/appConfig\/neisCodes/.test(sch));
ok("캐시를 읽고 쓴다", /getDoc\("dash\/neisCodes"\)/.test(sch) && /patchDoc\("dash\/neisCodes"/.test(sch));

// ---- 서버 도우미 ----
// 팀체크 서버에는 Firestore 도우미가 없었다(시트만 봤다). 같이 와야 캐시가 돈다.
ok("Firestore 도우미가 붙었다", /export async function getDoc/.test(goog) && /export async function patchDoc/.test(goog));
// ⚠ 학교를 넷씩 나란히 부른다. 통째로 덮으면 옆 요청이 넣은 학교가 지워진다
ok("patchDoc 이 칸 지정(updateMask)을 쓴다", /updateMask\.fieldPaths/.test(goog));
ok("도우미가 datastore 권한을 쓴다", /auth\/datastore/.test(goog));

// ---- 오래 걸리는 쪽이 여기다 ----
ok("maxDuration 을 준다", /export const maxDuration = 60/.test(sch));

// ---- 떠난 자리 ----
// 사본이 남아 있으면 «어느 쪽을 고치나» 가 다시 생긴다. 표지가 없으면 옛 파일을 고치고 아무 일도 안 일어난다.
if (fs.existsSync(CLASS + "/api/schedule.js")) {
  const old = fs.readFileSync(CLASS + "/api/schedule.js", "utf8");
  ok("떠난 자리에 «옮겨갔다» 표지가 있다", /팀체크로 \*\*옮겨갔다\*\*|팀체크로 옮겨갔다/.test(old.slice(0, 900)), old.slice(0, 60));
  ok("어디를 고쳐야 하는지 적혀 있다", /여기를 고치지 마라/.test(old.slice(0, 900)));
} else {
  ok("옛 사본은 지워졌다", true);
}

// ---- 열쇠 안내 ----
// 환경변수가 없으면 조용히 나빠진다. 코드에 그 사실이 적혀 있어야 다음 사람이 안다.
ok("필요한 환경변수를 머리말에 적었다", /NEIS_API_KEY/.test(sch.slice(0, 3000)) && /GEMINI_API_KEY/.test(sch.slice(0, 3000)));

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
