// 휴대폰 알림 — 암호화와 앱 쪽 판단을 돌려본다 (2026-09-12).
//
// ⚠ 암호화는 **규격의 시험값(RFC 8291 §5)** 으로 맞춰 본다. 스스로 만든 값으로 왕복만 시키면
//   양쪽에 똑같이 틀린 코드도 통과한다. 규격값과 바이트가 같아야 진짜 맞는 것이다.
const fs = require("fs"), vm = require("vm"), crypto = require("crypto");
const ROOT = __dirname + "/..";
const T = [];
const ok = (n, c, e) => T.push((c ? "  OK  " : "FAIL  ") + n + (e ? "   " + e : ""));

// ---- 서버: 암호화 ----
{
  const src = fs.readFileSync(ROOT + "/api/_webpush.js", "utf8")
    .replace(/^import[\s\S]*?;$/m, "").replace(/^export (const |let |function |async )/gm, "$1");
  const ctx = vm.createContext({ crypto, Buffer, URL, fetch: () => Promise.reject(new Error("no net")), console });
  vm.runInContext(src, ctx);
  const encrypt = vm.runInContext("encrypt", ctx);

  // RFC 8291 §5 «When I grow up, I want to be a watermelon»
  const V = {
    uaPub: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
    asPriv: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    salt: "DGv6ra1nlYgDCS1FRnbzlw",
    text: "When I grow up, I want to be a watermelon",
    want: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  };
  const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const got = b64u(encrypt(V.text, V.uaPub, V.auth, { salt: V.salt, priv: V.asPriv }));
  ok("규격(RFC 8291)의 시험값과 바이트까지 같다", got === V.want, got === V.want ? "" : got.slice(0, 60) + "…");

  // 매번 달라야 한다 — 소금과 한 번 쓰는 열쇠를 새로 뽑으니까
  const a = encrypt("같은 글", V.uaPub, V.auth), b = encrypt("같은 글", V.uaPub, V.auth);
  ok("같은 글도 보낼 때마다 다르게 잠긴다", !a.equals(b));
  ok("머리 21바이트 + 공개키 65바이트가 앞에 붙는다", a[20] === 65 && a.readUInt32BE(16) === 4096, "idlen=" + a[20]);

  // 받는 쪽이 실제로 풀 수 있나 — 브라우저가 하는 일을 그대로 해 본다
  const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
  const authSecret = crypto.randomBytes(16);
  const uaPub = b64u(ua.getPublicKey()), uaAuth = b64u(authSecret);
  const msg = JSON.stringify({ title: "팀체크", body: "새 할 일: 월간계획 올리기" });
  const box = encrypt(msg, uaPub, uaAuth);
  const salt = box.slice(0, 16), asPub = box.slice(21, 21 + 65), ct = box.slice(21 + 65);
  const hmac = (k, m) => crypto.createHmac("sha256", k).update(m).digest();
  const shared = ua.computeSecret(asPub);
  const ikm = hmac(hmac(authSecret, shared),
    Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).slice(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).slice(0, 12);
  const dec = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  dec.setAuthTag(ct.slice(-16));
  const out = Buffer.concat([dec.update(ct.slice(0, -16)), dec.final()]);
  ok("받는 쪽이 풀면 보낸 글이 그대로 나온다", out.slice(0, -1).toString("utf8") === msg, out.toString("utf8").slice(0, 40));
  ok("마지막 바이트는 끝 표시 0x02", out[out.length - 1] === 2, String(out[out.length - 1]));

  // 열쇠 한 쌍
  const keys = vm.runInContext("newVapidKeys", ctx)();
  const pub = Buffer.from(keys.pub.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  ok("VAPID 공개키는 65바이트 날것이다", pub.length === 65 && pub[0] === 4, String(pub.length));
  ok("VAPID 개인값이 함께 나온다", !!keys.d && !!keys.x && !!keys.y);
  const k2 = vm.runInContext("newVapidKeys", ctx)();
  ok("부를 때마다 새 열쇠다", k2.pub !== keys.pub);

  // ---- 내가 누구인지 밝히는 쪽지(VAPID, RFC 8292) ----
  // ⚠ 여기가 틀리면 푸시 회사가 401 로 되돌린다. 그런데 그건 실제로 보내 봐야 알기 때문에
  //   꼴과 서명을 여기서 직접 뜯어 본다.
  const vh = vm.runInContext("vapidHeader", ctx)(keys,
    "https://web.push.apple.com/QRSTU/vwxyz?x=1", "https://climath-team1.vercel.app");
  const m = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(vh);
  ok("«vapid t=…, k=…» 꼴이다", !!m, vh.slice(0, 40));
  ok("k 는 우리 공개키다", m && m[2] === keys.pub);
  const [h1, p1, s1] = m[1].split(".");
  const un = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const jh = JSON.parse(un(h1)), jp = JSON.parse(un(p1));
  ok("알고리즘은 ES256", jh.alg === "ES256" && jh.typ === "JWT", JSON.stringify(jh));
  // ⚠ aud 는 «보낼 곳의 출처» 다. 주소 전체를 넣으면 거절당한다 (애플이 특히 깐깐하다)
  ok("aud 는 주소 전체가 아니라 출처다", jp.aud === "https://web.push.apple.com", jp.aud);
  ok("sub 는 앱 주소", jp.sub === "https://climath-team1.vercel.app");
  const life = jp.exp - Math.floor(Date.now() / 1000);
  ok("열두 시간쯤 산다 (하루를 넘기면 거절당한다)", life > 11 * 3600 && life <= 24 * 3600, String(life));
  // ⚠ ES256 서명은 **날것 R||S 64바이트**. node 의 기본인 DER(70바이트 안팎)로 보내면 401 이다
  ok("서명이 날것 64바이트다", un(s1).length === 64, String(un(s1).length));
  const pubKey = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: keys.x, y: keys.y }, format: "jwk" });
  ok("공개키로 서명이 풀린다",
    crypto.verify("sha256", Buffer.from(h1 + "." + p1), { key: pubKey, dsaEncoding: "ieee-p1363" }, un(s1)));
  // 보낼 곳이 다르면 aud 도 달라야 한다 — 한 번 만든 쪽지를 돌려쓰면 안 된다
  const vh2 = vm.runInContext("vapidHeader", ctx)(keys, "https://fcm.googleapis.com/wp/abc", "https://x");
  ok("보낼 곳마다 새로 만든다", JSON.parse(un(/t=([\w-]+\.[\w-]+)\./.exec(vh2)[1].split(".")[1])).aud === "https://fcm.googleapis.com");
}

// ---- 서버: 손대는 자리 ----
{
  const p = fs.readFileSync(ROOT + "/api/push.js", "utf8");
  ok("POST 만 받는다", /req\.method !== "POST"/.test(p));
  ok("토큰을 검사한다", /verifyIdToken\(body\.idToken\)/.test(p));
  ok("팀 밖은 403", /role !== "owner" && role !== "teacher"/.test(p));
  // ⚠ «보내기» 를 선생님에게 열면 서로에게 알림을 쏠 수 있다. 팀장만이어야 한다
  ok("팀에게 보내는 것은 팀장만", /want === "send"[\s\S]{0,200}role !== "owner"/.test(p));
  // ⚠ 보내는 쪽이 적은 글을 그대로 띄우면 알림이 아무 말이나 나르는 통로가 된다
  ok("선생님→팀장 알림은 글을 서버가 만든다", /want === "lead"[\s\S]{0,700}const TEXT = \{/.test(p));
  ok("죽은 구독(404·410)은 지운다", /404 \|\| r\.status === 410/.test(fs.readFileSync(ROOT + "/api/_webpush.js", "utf8")));
  ok("열쇠는 규칙에 안 적은 곳에 둔다", /secrets\/vapid/.test(p));
  // ⚠ 메일 주소를 남의 서버에 남길 이유가 없다
  ok("보내는 사람 표시는 메일이 아니라 앱 주소", /const SUBJECT = "https:/.test(p) && !/mailto:/.test(p));
}

// ---- 규칙 ----
{
  const r = fs.readFileSync(ROOT + "/firestore.rules", "utf8");
  const h = fs.readFileSync(ROOT + "/index.html", "utf8");
  // ⚠ 규칙에 없는 컬렉션은 브라우저에서 아무도 못 읽는다. push·secrets 는 서버만 쓰므로
  //   **적지 않는 것이 가장 좁다.** 적으면 없어도 될 문이 하나 열린다.
  ok("push 는 규칙에 안 적는다 (서버만 쓴다)", !/match \/push\//.test(r));
  ok("secrets 도 안 적는다", !/match \/secrets/.test(r));
  ok("왜 안 적었는지는 적어 둔다", /push\/\{tid\}/.test(r) && /secrets\/vapid/.test(r));
  // ⚠ 앱이 이 둘을 직접 만지기 시작하면 위 전제가 깨진다
  ok("앱은 구독 문서를 직접 안 만진다",
    !/collection\("push"\)|doc\("secrets/.test(h) && !/tdb\.collection\(['"]push/.test(h));
}

// ---- 홈 화면에 추가할 수 있나 ----
{
  const h = fs.readFileSync(ROOT + "/index.html", "utf8");
  const m = JSON.parse(fs.readFileSync(ROOT + "/manifest.json", "utf8"));
  ok("manifest 를 건다", /<link rel="manifest" href="\/manifest.json">/.test(h));
  // ⚠ standalone 이 아니면 아이폰이 «홈 화면에 추가» 를 앱으로 안 친다 — 알림도 안 온다
  ok("display 는 standalone", m.display === "standalone");
  ok("아이콘 192·512 가 있다", m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512"));
  ok("안드로이드가 동그랗게 깎을 몫(maskable)이 있다", m.icons.some((i) => i.purpose === "maskable"));
  m.icons.forEach((i) => ok("아이콘 파일이 실제로 있다 " + i.src, fs.existsSync(ROOT + i.src)));
  ok("아이폰 홈 화면 아이콘을 건다", /rel="apple-touch-icon"/.test(h) && fs.existsSync(ROOT + "/apple-touch-icon.png"));
  ok("아이폰용 meta 를 건다", /apple-mobile-web-app-capable/.test(h));
  // PNG 인가 (머리 8바이트)
  const sig = fs.readFileSync(ROOT + "/icon-192.png").slice(0, 8);
  ok("아이콘이 진짜 PNG 다", sig.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
}

// ---- 서비스 워커 ----
{
  const s = fs.readFileSync(ROOT + "/sw.js", "utf8");
  ok("sw.js 는 뿌리에 있다", fs.existsSync(ROOT + "/sw.js"));
  ok("push 를 받는다", /addEventListener\("push"/.test(s));
  // ⚠ 푸시를 받고 아무것도 안 띄우면 브라우저가 구독을 끊는다(userVisibleOnly)
  ok("내용을 못 읽어도 무언가는 띄운다", /catch[\s\S]{0,120}d = \{\}/.test(s) && /showNotification/.test(s));
  ok("누르면 열린 창으로 간다", /clients\.matchAll/.test(s) && /openWindow/.test(s));
  // ⚠ 크롬은 판에 따라 «fetch 를 맡는 워커» 가 있어야 홈 화면 추가를 물어본다.
  //   없으면 안드로이드에서 그 단추가 영영 안 나온다
  ok("fetch 처리는 둔다 (안드로이드 설치 물음의 조건)", /addEventListener\("fetch"/.test(s));
  // ⚠ 그런데 **캐시는 절대 안 한다.** 51만 자짜리 옛 판을 물면 고친 것이 안 보인다
  //   («respondWith» 라는 낱말은 설명에 나온다. 부르는 것만 본다 — 괄호까지 봐야 주석에 안 걸린다)
  ok("캐시는 손대지 않는다", !/caches\.|respondWith\s*\(/.test(s));
  ok("새 판이 바로 일한다", /skipWaiting/.test(s) && /clients\.claim/.test(s));
}

// ---- 앱 쪽 판단 ----
{
  const h = fs.readFileSync(ROOT + "/index.html", "utf8");
  const src = (/<script>([\s\S]*)<\/script>/.exec(h) || [])[1] || h;

  // 아이폰·홈 화면 판단을 실제로 돌려본다
  const mk = (ua, standalone) => {
    const ctx = vm.createContext({
      navigator: { userAgent: ua, maxTouchPoints: /iPad|Macintosh/.test(ua) ? 5 : 0, standalone: standalone },
      window: { matchMedia: () => ({ matches: !!standalone }) },
    });
    vm.runInContext(/function isIOS\(\)[\s\S]*?\n\}/.exec(src)[0], ctx);
    vm.runInContext(/function isStandalone\(\)[\s\S]*?\n\}/.exec(src)[0], ctx);
    return { ios: vm.runInContext("isIOS()", ctx), st: vm.runInContext("isStandalone()", ctx) };
  };
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36";
  const IPADOS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";
  ok("아이폰을 알아본다", mk(IPHONE, false).ios === true);
  ok("안드로이드는 아이폰이 아니다", mk(ANDROID, false).ios === false);
  // ⚠ 아이패드는 요즘 자기를 «맥» 이라고 말한다. 손가락이 닿는 맥은 아이패드다
  ok("아이패드도 아이폰 쪽으로 센다 (자기를 맥이라고 말한다)", mk(IPADOS, false).ios === true);
  ok("사파리 탭은 홈 화면 앱이 아니다", mk(IPHONE, false).st === false);
  ok("홈 화면에서 연 것은 안다", mk(IPHONE, true).st === true);

  // 화면 글
  // ---- 홈 화면에 추가 ----
  // ⚠ 크롬의 «설치해도 되겠나» 는 앱이 뜨자마자 한 번 오고 다시 안 온다.
  //   boot() 안에 걸면 늦어 놓치고, 그러면 단추가 영영 안 나온다
  ok("설치 물음을 화면 그리기 전에 붙잡는다",
    /addEventListener\("beforeinstallprompt"/.test(src) &&
    src.indexOf('addEventListener("beforeinstallprompt"') < src.indexOf("async function boot()") ||
    /window\.addEventListener\("beforeinstallprompt"[\s\S]{0,200}PUSH\.install = e/.test(src));
  ok("크롬이 제 마음대로 띄우는 것은 막는다", /beforeinstallprompt[\s\S]{0,120}e\.preventDefault\(\)/.test(src));
  // ⚠ 한 번 쓰면 다시 못 쓴다. 들고 있다가 또 부르면 오류다
  ok("한 번 쓴 물음은 버린다", /PUSH\.install = null;\s*\/\/ ⚠ 한 번 쓰면/.test(src));
  ok("추가되면 상태를 다시 본다", /addEventListener\("appinstalled"/.test(src));
  ok("단추가 있다 (글만 있는 게 아니라)", /id="push-install"/.test(src));
  // ⚠ 아이폰에는 그 물음이 아예 없다. 애플이 안 연다 — 단계를 적어 주는 수밖에
  ok("아이폰은 단계를 펼친다", /PUSH\.howto = !PUSH\.howto/.test(src) && /홈 화면에 추가<\/b>를 누른다/.test(src));
  ok("공유 단추를 그림으로도 보여 준다", /function shareIcon\(\)/.test(src) && /<svg viewBox="0 0 24 24"/.test(src));
  // ⚠ 이미 앱으로 열었으면 꺼낼 말이 없다
  ok("홈 화면 앱으로 열었으면 안 뜬다", /if \(PUSH\.standalone\) return "";/.test(src));
  // ⚠ 설치가 안 되는 브라우저(PC 사파리 등)에 «홈 화면에 추가» 를 내면 눌러도 아무 일이 없다
  ok("설치할 수 없는 브라우저에는 말을 안 꺼낸다", /if \(!PUSH\.ios && !PUSH\.install\) return "";/.test(src));
  ok("아이폰·탭이면 켜기 단추를 안 낸다", /if \(PUSH\.ios && !PUSH\.standalone\) return head;/.test(src));
  // ⚠ 허락 창은 누른 그 순간에만 열린다. 부팅에서 부르면 브라우저가 무시하고, 무시당한 뒤에는 다시 못 묻는다
  ok("허락은 «켜기» 를 누를 때만 묻는다",
    /async function pushOn\(\)[\s\S]{0,400}Notification\.requestPermission\(\)/.test(src) &&
    !/pushSync[\s\S]{0,200}requestPermission/.test(src));
  ok("부팅에서는 상태만 본다", /pushSync\(\)\.then\(renderBell/.test(src));
  // ⚠ register() 가 준 것은 아직 설치 중일 수 있다. 홈 화면에 막 추가하고 바로 켜면 그 상태다
  ok("워커가 «설 때까지» 기다린 뒤 구독한다", /navigator\.serviceWorker\.ready/.test(src));
  ok("종 상자 안에 알림 줄이 있다", /pushRowHtml\(\) \+ '<\/div>'/.test(src) && /pushRowWire\(\)/.test(src));
  // ⚠ 초안은 선생님 화면에 아직 없다. 알리면 열어도 아무것도 없다
  ok("초안은 안 알린다", /!t\.own && !taskDraft\(t\)/.test(src));
  ok("초안을 내릴 때 알린다", /await saveTasks\(\);\s*\n\s*pushNewTasks\(sent\)/.test(src));
  ok("팀장이 더한 할 일도 알린다", /saveTaskOf\(t\); pushNewTasks\(\[t\]\)/.test(src));
  // ⚠ 고칠 때마다 울리면 하루 열 번이고, 그러면 꺼 버린다
  ok("업무보고는 처음 올릴 때만 알린다", /if \(!prev \|\| !prev\.submitted\) pingLead\("report"\)/.test(src));
  ok("한 줄 보고는 새로 생겼을 때만 알린다", /if \(text && !\(cur\.reports \|\| \{\}\)\[id\]\) pingLead\("done"\)/.test(src));
  ok("선생님은 팀에게 못 보낸다", /function pushNewTasks[\s\S]{0,120}if \(S\.ro\) return;/.test(src));
  ok("담당은 taskTids 로 푼다 (이름 맞추기가 아니라)", /taskTids\(t\)\.forEach/.test(src));

  // ---- 누가 어느 기기로 켰나 (팀장만) ----
  // ⚠ 팀장이 아이폰만 쓰면 «안드로이드도 되나» 를 확인할 길이 여기밖에 없다
  const ctx = vm.createContext({});
  vm.runInContext(/function uaLabel\(ua\)[\s\S]*?\n\}/.exec(src)[0], ctx);
  const lab = (s) => vm.runInContext("uaLabel(" + JSON.stringify(s) + ")", ctx);
  ok("안드로이드를 알아본다",
    lab("Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36") === "안드로이드");
  ok("아이폰을 알아본다", lab("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile Safari/604.1") === "아이폰");
  // ⚠ 아이패드는 자기를 «맥» 이라고 말한다 — 손가락이 닿는다고 적혀 있으면 아이패드다
  ok("손가락 닿는 맥은 아이패드로 센다", lab("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.5 Mobile Safari/605.1") === "아이패드");
  ok("진짜 맥은 맥이다", lab("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.5 Safari/605.1") === "맥");
  ok("윈도우도 가른다", lab("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36") === "윈도우 PC");
  ok("빈 것은 «알 수 없음»", lab("") === "알 수 없음");
  ok("팀장만 목록을 본다", /if \(S\.ro \|\| !PUSH\.who\) return "";/.test(src) && /S\.ro \? "" : '<button class="mini" id="push-who"/.test(src));
  ok("사람마다 보내 보기 단추가 있다", /data-ptest/.test(src));

  const p = fs.readFileSync(ROOT + "/api/push.js", "utf8");
  ok("서버도 팀장만 연다", /want === "who"[\s\S]{0,240}role !== "owner"/.test(p));
  // ⚠ 주소(endpoint)만 있으면 남의 폰에 알림을 쏠 수 있다. 절대 돌려주지 않는다
  ok("기기 주소는 안 돌려준다", /want === "who"[\s\S]{0,500}devices:/.test(p) && !/endpoint: \(d\.subs/.test(p));
}

console.log(T.join("\n"));
const bad = T.filter((x) => x.startsWith("FAIL")).length;
console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과 (" + T.length + "건)");
process.exit(bad ? 1 : 0);
