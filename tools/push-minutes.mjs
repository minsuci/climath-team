// 볼트의 회의록을 대시보드로 올린다.
//
//   node tools/push-minutes.mjs            # 바뀐 것만
//   node tools/push-minutes.mjs --all      # 전부 다시
//   node tools/push-minutes.mjs --dry      # 무엇이 올라갈지 보기만
//
// 볼트(`민수의 뇌/40 팀장업무/회의록/*.md`)가 원본이다. 이 스크립트는 **읽어서 올리기만** 한다 —
// 대시보드에서 고치는 길은 없다. 고칠 곳이 둘이면 어느 쪽이 맞는지 알 수 없다.
//
// 열쇠는 climath-team 서비스 계정 JSON이다. 브라우저 로그인이 없는 자리에서 쓰므로
// **파일로 둔다.** 저장소에는 절대 안 들어간다(.gitignore).
//   기본 자리 : C:\Users\user\.climath\team-sa.json
//   바꾸려면  : TEAM_SA_FILE=경로  또는  TEAM_SERVICE_ACCOUNT=JSON한줄
//
// ⚠ 이 파일은 열쇠를 화면에 찍지 않는다. 오류 메시지에도 안 넣는다.

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const VAULT = process.env.VAULT_MINUTES ||
  path.join(os.homedir(), "Desktop", "민수의 뇌", "40 팀장업무", "회의록");
const SA_FILE = process.env.TEAM_SA_FILE || path.join(os.homedir(), ".climath", "team-sa.json");
const ARGS = process.argv.slice(2);
const ALL = ARGS.includes("--all");
const DRY = ARGS.includes("--dry");

function serviceAccount() {
  let raw = process.env.TEAM_SERVICE_ACCOUNT || "";
  if (!raw) {
    if (!fs.existsSync(SA_FILE)) {
      console.error("서비스 계정 열쇠를 못 찾았다: " + SA_FILE);
      console.error("");
      console.error("  Firebase 콘솔 → climath-team → 프로젝트 설정 → 서비스 계정 →");
      console.error("  «새 비공개 키 생성» 으로 받은 JSON 을 그 자리에 두면 된다.");
      console.error("  (저장소에는 안 들어간다. 다른 자리에 두려면 TEAM_SA_FILE 로 알려준다)");
      process.exit(1);
    }
    raw = fs.readFileSync(SA_FILE, "utf8");
  }
  let j;
  try { j = JSON.parse(raw); } catch (e) { console.error("열쇠 파일이 올바른 JSON 이 아니다"); process.exit(1); }
  if (j.private_key && j.private_key.indexOf("\\n") >= 0) j.private_key = j.private_key.replace(/\\n/g, "\n");
  if (!j.client_email || !j.private_key || !j.project_id) { console.error("열쇠 파일에 client_email/private_key/project_id 가 있어야 한다"); process.exit(1); }
  return j;
}
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(body).sign(sa.private_key);
  const assertion = body + "." + b64url(sig);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
  const j = await r.json();
  if (!r.ok || !j.access_token) { console.error("구글 토큰 발급 실패 (" + r.status + ")"); process.exit(1); }
  return j.access_token;
}
// Firestore REST 는 값에 타입을 붙인다
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { stringValue: String(v) };
}

// ---- 볼트 노트 읽기 ----
// 프런트매터(--- 사이)에서 날짜·종류·참석·결정을 뽑고, 본문은 그대로 올린다.
export function parseNote(name, text) {
  const t = text.replace(/^\uFEFF/, "");
  let fm = {}, body = t;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t);
  if (m) {
    body = t.slice(m[0].length);
    m[1].split(/\r?\n/).forEach((line) => {
      const kv = /^([^:\s][^:]*):\s*(.*)$/.exec(line);
      if (!kv) return;                                  // 목록 줄(tags 아래 " - x")은 건너뛴다
      fm[kv[1].trim()] = kv[2].trim().replace(/^"(.*)"$/, "$1");
    });
  }
  // 제목은 본문 첫 «# 제목». 없으면 파일 이름에서 날짜를 뗀 것.
  const h1 = /^#\s+(.+)$/m.exec(body);
  const base = name.replace(/\.md$/, "");
  const title = h1 ? h1[1].trim() : base.replace(/^\d{4}-\d{2}-\d{2}\s*/, "");
  const date = fm["날짜"] || (/^(\d{4}-\d{2}-\d{2})/.exec(base) || [])[1] || "";
  return {
    id: base, date, title,
    kind: fm["종류"] || "", attend: fm["참석"] || "", decisions: fm["결정"] || "",
    md: body.trim(),
  };
}
const sha = (x) => crypto.createHash("sha1").update(x).digest("hex").slice(0, 16);

async function main() {
  if (!fs.existsSync(VAULT)) { console.error("회의록 폴더를 못 찾았다: " + VAULT); process.exit(1); }
  const files = fs.readdirSync(VAULT).filter((f) => f.endsWith(".md")).sort();
  if (!files.length) { console.log("올릴 회의록이 없다."); return; }

  // 먼저 읽는다. --dry 는 열쇠 없이도 돌아야 **무엇이 올라갈지**를 확인할 수 있다.
  const notes = files.map((f) => {
    const n = parseNote(f, fs.readFileSync(path.join(VAULT, f), "utf8"));
    n.hash = sha(n.md);
    return n;
  });
  if (DRY) {
    notes.forEach((n) => console.log("  " + n.date + "  " + n.title +
      "  \u00b7 " + (n.kind || "\uc885\ub958 \uc5c6\uc74c") + "  \u00b7 " + n.md.length + "\uc790"));
    console.log("\n--dry \ub77c \uc62c\ub9ac\uc9c0 \uc54a\uc558\ub2e4. " + notes.length + "\uac74.");
    return;
  }

  const sa = serviceAccount();
  const base = "https://firestore.googleapis.com/v1/projects/" + sa.project_id + "/databases/(default)/documents";
  const token = await accessToken(sa);
  const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

  // 이미 올라간 것의 지문을 받아 바뀐 것만 올린다
  let have = {};
  if (!ALL) {
    const r = await fetch(base + "/minutes?pageSize=300", { headers: h });
    if (r.ok) {
      const j = await r.json();
      (j.documents || []).forEach((d) => {
        const id = d.name.split("/").pop();
        have[decodeURIComponent(id)] = ((d.fields || {}).hash || {}).stringValue || "";
      });
    }
  }

  let put = 0, same = 0;
  for (const n of notes) {
    if (!ALL && have[n.id] === n.hash) { same++; continue; }
    const fields = {};
    ["id", "date", "title", "kind", "attend", "decisions", "md", "hash"].forEach((k) => { fields[k] = toValue(n[k]); });
    fields.updated = toValue(new Date().toISOString());
    const url = base + "/minutes/" + encodeURIComponent(n.id);
    const r = await fetch(url, { method: "PATCH", headers: h, body: JSON.stringify({ fields }) });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      console.error("  ✗ " + n.title + " — " + (((j || {}).error || {}).message || r.status));
      continue;
    }
    console.log("  ✓ " + n.date + "  " + n.title);
    put++;
  }
  console.log("\n올림 " + put + "건" + (same ? " · 그대로 " + same + "건" : "") + " · 대시보드 회의록 메뉴에서 보인다.");
}

// 다른 파일이 parseNote 만 가져다 쓸 수도 있게 (시험)
if (import.meta.url === "file:///" + process.argv[1].replace(/\\/g, "/").replace(/^\//, "")) {
  main().catch((e) => { console.error("터짐: " + e.message); process.exit(1); });
}
