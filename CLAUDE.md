# climath-team — 한민수의 대시보드

대치 클라이매쓰 고등부 교무팀장(한민수)이 **혼자** 쓰는 화면. 수업관리 앱(`climath-class`)과
**별개의 앱**이다. 저장소·Vercel·Firebase 프로젝트가 따로 있고, 앱 DB는 **읽기만** 한다.

```
repo/
├── index.html        # 대시보드 전체. 순수 JS, 빌드 없음
├── api/auth.js       # 로그인 — 수업관리 앱 /api/auth 에 PIN 확인을 맡기고 토큰 둘을 준다
├── api/sheets.js     # 구글시트 읽기 (서비스 계정, 읽기 전용)
├── api/_google.js    # 커스텀 토큰 발급 · ID 토큰 검증 · 구글 API 토큰
├── firestore.rules   # climath-team DB 규칙 — owner 만. 콘솔에 붙여넣어 게시
└── vercel.json       # icn1
```

- 배포: https://climath-team1.vercel.app — Vercel 프로젝트 `climath-team1` (GitHub `minsuci/climath-team` main → 자동 배포)
- Firebase: `climath-team` (Firestore 서울, Authentication은 커스텀 토큰만 — 익명 켜지 말 것)
- 환경변수: `TEAM_SERVICE_ACCOUNT` = climath-team 서비스 계정 JSON 한 줄. Production/Preview/Development 셋 다.
  선택: `CLASS_API_URL` (기본 `https://climath-class.vercel.app/api/auth`)

## 구조 — Firebase 프로젝트 둘

| | 프로젝트 | 무엇 | 쓰기 |
|---|---|---|---|
| `firebase.app()` 기본 | climath-class | teachers · classes · students · appConfig · exams · scores | **절대 안 쓴다** |
| `teamApp` | climath-team | `dash/tasks`(팀 할 일) · `dash/config`(연동 시트 목록) | 여기만 |

브라우저가 두 프로젝트에 따로 로그인한다. `/api/auth login` 이 `classToken`(수업관리 앱이 발급)과
`teamToken`(이 프로젝트 서비스 계정이 서명)을 함께 주고, 각각 `signInWithCustomToken` 한다.
**둘 다 첫 `onAuthStateChanged`를 준 뒤에만 `boot()`** — 한쪽만 복구된 순간 로그인 화면이 깜빡인다.

PIN 대조·시도 제한·선생님 명단은 수업관리 앱에만 있다. 이 앱은 그 서비스 계정 키를 갖지 않는다.
앱이 `role: "owner"` 라고 답할 때만 teamToken 을 발급한다.

## 함정

- 앱 데이터의 칸 이름은 수업관리 앱 CLAUDE.md 가 원본이다. 특히 학생 명단의 담임은 `students.homeroom`(tid),
  roster 의 `teacher` 는 "이 항목이 선생님"이라는 불리언. 앱이 칸을 바꾸면 여기가 조용히 빈다.
- 상자 일곱 개를 `render*()` 가 각각 innerHTML 로 다시 그린다. 상자를 통째로 다시 그리면 입력 포커스가
  날아가므로 시트 찾기 칸은 표만 다시 그린다(`renderSheetTable`).
- 성적은 반마다 `days` 문서를 모두 나열한 뒤 최근 14개 날짜만 `scores` 를 읽는다. 반이 늘면 느리다.
  앱 쪽에 `collectionGroup("scores")` 규칙을 열면 한 번에 되지만 그건 앱 규칙을 건드리는 일이라 안 했다.
- 시트 id 는 저장소에 적지 않는다(공개). 대시보드 안에서 주소를 붙여넣어 `dash/config` 에 둔다.
- 구글시트는 시트마다 서비스 계정 이메일을 **뷰어**로 공유해야 한다. 처음엔 구글 클라우드 콘솔에서
  climath-team 의 Google Sheets API 를 켜야 한다. `api/sheets.js` 의 `explain()` 이 그 링크를 돌려준다.
- 로컬에서 켜볼 수 없다. `/api` 가 Vercel 에만 있고 Firestore 는 로그인이 있어야 열린다.
  구문 검사: `node --check api/*.js`, index.html 은 `<script>` 를 뽑아 `new vm.Script()`.

## 볼트

작업 노트: `민수의 뇌/20 작업/한민수 대시보드.md` — 켜는 순서, 연동 후보 시트 목록.
