import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
const { createTrayTemplate } = require("../electron/tray-menu.cjs");

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Oneuldo daily companion", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>오늘도 - 네가 해낸 하루를 기억할게<\/title>/);
  assert.match(html, /오늘은 어떤 하루를/);
  assert.match(html, /오늘의 목표/);
  assert.match(html, /오늘 돌아보기/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
  assert.doesNotMatch(html, /목표 달성률|실패했습니다|목표 미달/);
});

test("includes the native macOS companion and offline renderer", async () => {
  const [main, mate, mateStyles, matePreload, packageJson, renderer, page, styles, nativeMenuBar, afterPack] = await Promise.all([
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/mate.html", import.meta.url), "utf8"),
    readFile(new URL("../electron/mate.css", import.meta.url), "utf8"),
    readFile(new URL("../electron/mate-preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../desktop-ui/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../electron/native-menubar.swift", import.meta.url), "utf8"),
    readFile(new URL("../electron/after-pack.cjs", import.meta.url), "utf8"),
  ]);

  assert.match(main, /alwaysOnTop:\s*true/);
  assert.match(main, /MATE_COMPACT_SIZE = \{ width: 176, height: 176 \}/);
  assert.match(main, /MATE_SPEAKING_SIZE = \{ width: 244, height: 244 \}/);
  assert.match(main, /ipcMain\.on\("mate:resize"/);
  assert.match(main, /ipcMain\.on\("mate:drag-start"/);
  assert.match(main, /saveMatePosition/);
  assert.match(main, /matePosition/);
  assert.match(main, /setInterval\(syncFromWeb, 2000\)/);
  assert.match(main, /new Tray\(/);
  assert.match(main, /app\.focus\(\{ steal: true \}\)/);
  assert.match(main, /todayState\.goals\.map/);
  assert.match(main, /toggleGoalFromMenu/);
  assert.match(main, /tray\.setTitle/);
  assert.match(main, /new Tray\(createTrayIcon\(\)\)/);
  assert.match(main, /nativeImage\.createFromPath/);
  assert.match(main, /retinaIcon\.setTemplateImage\(false\)/);
  assert.match(main, /app\.setActivationPolicy\("accessory"\)/);
  assert.match(main, /oneuldo-menubar-clear@2x\.png/);
  assert.doesNotMatch(main, /9B77F9B4-1A8E-4A6F-8D73-2B6E4C1A90D2/);
  assert.match(main, /tray\.setContextMenu\(trayMenu\)/);
  assert.match(main, /tray\.popUpContextMenu\(trayMenu\)/);
  assert.match(main, /function createMenuBar\(\)/);
  assert.match(main, /function createElectronMenuBar\(\)/);
  assert.match(main, /process\.platform === "darwin"/);
  assert.match(main, /OneuldoMenuBarNative/);
  assert.match(main, /nativeMenuBarProcess = execFile\(helperPath/);
  assert.match(main, /nativeMenuBarProcess\.kill\(\)/);
  assert.match(main, /createElectronMenuBar\(\)/);
  assert.match(main, /setAsDefaultProtocolClient\("oneuldo"\)/);
  assert.match(main, /handleMenuBarAction/);
  assert.match(nativeMenuBar, /oneuldo:\/\//);
  assert.match(nativeMenuBar, /NSStatusBar\.system\.statusItem\(withLength: NSStatusItem\.squareLength\)/);
  assert.match(nativeMenuBar, /private var statusItem: NSStatusItem\?/);
  assert.match(nativeMenuBar, /item\.menu = makeMenu\(menuBarState\)/);
  assert.match(nativeMenuBar, /withExtendedLifetime\(delegate\)/);
  assert.match(nativeMenuBar, /guard statusItem == nil else \{ return \}/);
  assert.match(nativeMenuBar, /button\.image = makeCatIcon\(startPending:/);
  assert.match(nativeMenuBar, /startPending/);
  assert.match(nativeMenuBar, /reviewPending/);
  assert.match(nativeMenuBar, /Timer\(timeInterval: 1/);
  assert.match(nativeMenuBar, /오늘 돌아보기 · 아직/);
  assert.match(nativeMenuBar, /오늘의 TODO를 아직 정하지 않았어요/);
  assert.match(nativeMenuBar, /drawDot/);
  assert.match(nativeMenuBar, /button\.imagePosition = \.imageOnly/);
  assert.doesNotMatch(nativeMenuBar, /NSPanel/);
  assert.doesNotMatch(nativeMenuBar, /CGWindowListCopyWindowInfo/);
  assert.doesNotMatch(nativeMenuBar, /positionTimer/);
  assert.doesNotMatch(nativeMenuBar, /setFrameOrigin/);
  assert.match(nativeMenuBar, /Bundle\.main\.url\(forResource: "oneuldo-menubar-clear@2x"/);
  assert.match(nativeMenuBar, /CommandLine\.arguments\[0\]/);
  assert.match(nativeMenuBar, /bundledIcon\.isTemplate = false/);
  assert.match(nativeMenuBar, /SymbolConfiguration\(paletteColors:/);
  assert.match(nativeMenuBar, /sectionTitle\("바로가기"\)/);
  assert.match(nativeMenuBar, /sectionTitle\("앱 설정"\)/);
  assert.match(afterPack, /swiftc/);
  assert.match(afterPack, /oneuldo-menubar-clear@2x\.png/);
  assert.match(afterPack, /OneuldoMenuBarNative/);
  assert.match(afterPack, /chmodSync\(helperBinary, 0o755\)/);
  assert.match(afterPack, /fs\.copyFileSync/);
  assert.match(page, /oneuldo:toggle-goal/);
  assert.match(page, /className="brand-image"/);
  assert.match(page, /오늘도 - 네가 해낸 하루를 기억할게/);
  assert.match(page, /className="bug-report-link"/);
  assert.match(page, /issues\/new\?template=bug_report\.yml/);
  assert.match(main, /new Notification\(/);
  assert.match(main, /setVisibleOnAllWorkspaces/);
  assert.match(main, /desktop-ui-dist\/index\.html/);
  assert.doesNotMatch(main, /oneuldo-daily-mate\.dryzero0\.chatgpt\.site/);
  assert.match(mate, /목표 메이트와 대화하기/);
  assert.match(mate, /class="character-image"/);
  assert.match(mate, /class="status"/);
  assert.doesNotMatch(mate, /<button class="status"/);
  assert.match(mate, /id="characterImage"/);
  assert.match(mate, /assets\/mate-cat-sign-3d\.png/);
  assert.match(mateStyles, /\.character-image/);
  assert.match(mateStyles, /width:\s*174px/);
  assert.match(mateStyles, /pointer-events:\s*none/);
  assert.doesNotMatch(mateStyles, /rotate\(-10\.5deg\)/);
  assert.match(mateStyles, /font-size:\s*25px/);
  assert.match(mateStyles, /PretendardVariable\.woff2/);
  assert.match(mateStyles, /--progress-color/);
  assert.match(mateStyles, /drop-shadow/);
  assert.match(mateStyles, /\.bubble\.is-hidden/);
  assert.match(mateStyles, /visibility:\s*hidden/);
  const mateScript = await readFile(new URL("../electron/mate.js", import.meta.url), "utf8");
  assert.match(mateScript, /BUBBLE_VISIBLE_MS = 5000/);
  assert.match(mateScript, /SPEECH_INTERVALS/);
  assert.match(mateScript, /showBubble\(nextMessage\)/);
  assert.match(mateScript, /setTimeout\(hideBubble, BUBBLE_VISIBLE_MS\)/);
  assert.match(mateScript, /character\.addEventListener\("click"/);
  assert.match(mateScript, /character\.addEventListener\("pointermove"/);
  assert.match(mateScript, /oneuldoMate\.startDrag\(\)/);
  assert.doesNotMatch(mateScript, /status\.addEventListener/);
  assert.match(matePreload, /mate:drag-start/);
  assert.match(mateScript, /oneuldoMate\.resize\(true\)/);
  assert.match(mateScript, /oneuldoMate\.resize\(false\)/);
  assert.match(mateScript, /progress >= 1/);
  assert.match(mateScript, /MATE_ASSETS/);
  assert.match(mateScript, /characterImage\.src/);
  assert.match(mateScript, /document\.body\.dataset\.animal/);
  assert.match(main, /cheer:\s*todayState\.settings\?\.cheer/);
  assert.match(main, /animal:\s*todayState\.settings\?\.animal/);
  assert.match(renderer, /createRoot/);
  assert.match(packageJson, /"desktop:dist"/);
  assert.match(packageJson, /"version": "1\.18\.0"/);
  assert.match(packageJson, /"afterPack": "\.\/electron\/after-pack\.cjs"/);
  assert.match(page, /oneuldo-onboarded/);
  assert.match(page, /function OnboardingGuide/);
  assert.match(page, /function SoftTimePicker/);
  assert.match(page, /function TimePickerDialog/);
  assert.match(page, /wheelDelta/);
  assert.match(page, /turn-forward/);
  assert.match(page, /aria-expanded/);
  assert.match(page, /keepTimesInOrder/);
  assert.match(page, /min=\{0\} max=\{23\}/);
  assert.match(page, /min=\{0\} max=\{50\} step=\{10\}/);
  assert.match(page, /normalizeToTenMinutes/);
  assert.match(page, /modal-scroll-locked/);
  assert.match(page, /body\.style\.position = "fixed"/);
  assert.match(page, /shell\.style\.overflow = "hidden"/);
  assert.match(styles, /overflow-x:clip/);
  assert.match(page, /unfinished-meta/);
  assert.match(styles, /Record detail readability/);
  assert.match(styles, /\.unfinished-copy strong\{font-size:15px;font-weight:820\}/);
  assert.match(page, /dragOffset/);
  assert.match(page, /carry: direction === "right"/);
  assert.match(page, /oneuldo-pending-carryovers/);
  assert.match(page, /oneuldo-goals-date/);
  assert.match(page, /getDueCarryovers/);
  assert.match(page, /dueCarryovers/);
  assert.match(page, /오늘에 추가/);
  assert.match(page, /이번에는 넘기기/);
  assert.match(page, /targetDate: addDaysToDateKey\(sourceDate, 1\)/);
  assert.match(page, /carriedFrom/);
  assert.match(page, /내일 TODO에 넣기/);
  assert.match(page, /buildCompanionReflection/);
  assert.match(page, /피곤한 날에도 나를 잘 돌봤어/);
  assert.match(styles, /Next-day TODO handoff/);
  assert.match(page, /이번에는 그만하기/);
  assert.match(page, /empty-done/);
  assert.match(page, /오늘 완료로 표시한 일은/);
  assert.match(styles, /card-rise-in/);
  assert.match(page, /오늘 돌아보기 사용법/);
  assert.match(page, /const totalSteps = 6/);
  assert.match(page, /guide-mate-showcase/);
  assert.match(page, /guide-mate-art/);
  assert.match(page, /guide-mate-options/);
  assert.match(page, /MATE_OPTIONS\.map/);
  assert.match(page, /option\.description/);
  assert.match(styles, /Onboarding character consistency and readability/);
  assert.match(styles, /\.guide-mate-options/);
  assert.match(styles, /\.guide-mate-option-art/);
  assert.match(main, /function nextGentleMessage\(\)/);
  assert.match(main, /function contextualMateMessage\(\)/);
  assert.match(main, /goal\.carriedFrom/);
  assert.match(main, /복잡한 일을 눈에 보이는 한 걸음으로/);
  assert.match(main, /오늘의 속도도 충분히 너다워/);
  assert.match(main, /function getAttentionState/);
  assert.match(main, /oneuldo-records/);
  assert.match(main, /reviewedToday/);
  assert.match(main, /lastMorningReminderDate/);
  assert.match(main, /lastEveningReminderDate/);
  assert.match(main, /writeMenuBarState/);
  assert.match(main, /menubar-state\.json/);
  assert.match(main, /execFile\(helperPath, \[menuBarStatePath\(\)\]/);
  assert.match(mateScript, /bubbleHeading/);
  assert.match(page, /ArrowLeft/);
  assert.match(page, /ArrowRight/);
  assert.doesNotMatch(page, /period-switch/);
  assert.doesNotMatch(page, /wheel-notch/);
  assert.match(page, /value: "21:00"/);
  assert.match(page, /첫 시작 가이드 다시 보기/);
  assert.match(page, /APP_VERSION = "1\.18\.0"/);
  assert.match(page, /extraDone\?: string\[\]/);
  assert.match(page, /오늘 한 일 중에/);
  assert.match(page, /더 기억나는 게 있나요/);
  assert.match(page, /목표 외에 오늘 해낸 일/);
  assert.match(page, /목표 밖에서 기억난 일/);
  assert.match(page, /rememberedDone/);
  assert.match(styles, /A final reflection step for accomplishments that were never TODOs/);
  assert.match(styles, /\.memory-card/);
  assert.match(page, /오늘 꼭 해내고 싶은 것만 적어봐/);
  assert.match(page, /humanizeCountPhrases/);
  assert.match(page, /koreanCount\(reviewedCount\)/);
  assert.match(page, /goalAwareMateCheers/);
  assert.match(page, /className="close-settings"/);
  assert.match(page, /onPointerDown=\{\(event\)/);
  assert.match(styles, /\.modal-head \.close-settings/);
  assert.match(main, /function pickDistinctMateMessage/);
  assert.match(main, /shortGoalTitle\(goal\.title\)/);
  assert.match(main, /koreanCount\(doneGoals\.length\)/);
  assert.match(page, /syncedUntilMidnight/);
  assert.match(page, /자정까지 오늘 TODO와 동기화 중/);
  assert.match(styles, /Carryovers wait for the user/);
  assert.match(styles, /\.carryover-inbox/);
  assert.match(mate, /오늘도 네 편이야 🌿/);
  assert.match(mateScript, /오늘도 네 편이야 🌿/);
  assert.match(mateStyles, /\.bubble[\s\S]*box-shadow: none/);
  assert.match(mateStyles, /\.bubble strong \{ color:#2f2a26; font-size: 16px; font-weight:880/);
  assert.match(nativeMenuBar, /NSRect\(x: 0\.5, y: 11\.1/);
  assert.match(page, /className="settings-scroll"/);
  assert.match(page, /className="app-info"/);
  assert.match(page, /데이터는 이 Mac에 저장돼요/);
  assert.match(styles, /\.app-shell::-webkit-scrollbar/);
  assert.match(styles, /\.settings-scroll::-webkit-scrollbar-thumb/);
  assert.match(styles, /scrollbar-color:#c4baae #f5f0e8/);
  assert.match(styles, /\.settings-modal\{[^}]*overflow:hidden/);
  assert.match(styles, /Make the review's core achievement label unmistakable/);
  assert.match(styles, /\.review-card-kind\.done small\{[^}]*font-size:16px/);
  assert.match(page, /나의 목표 메이트/);
  assert.match(page, /mate-options/);
  assert.match(page, /animal: "cat"/);
  assert.match(main, /theme:\s*todayState\.settings\?\.theme/);
  await access(new URL("../desktop/assets/app-icon.png", import.meta.url));
  await access(new URL("../public/oneuldo-brand.png", import.meta.url));
  await access(new URL("../electron/assets/oneuldo-mate-3d.png", import.meta.url));
  for (const animal of ["cat", "dog", "rabbit", "bear"]) {
    await access(new URL(`../electron/assets/mate-${animal}-sign-3d.png`, import.meta.url));
    await access(new URL(`../public/mates/mate-${animal}-sign-3d.png`, import.meta.url));
  }
  await access(new URL("../electron/assets/PretendardVariable.woff2", import.meta.url));
  await access(new URL("../public/fonts/PretendardVariable.woff2", import.meta.url));
  await access(new URL("../electron/assets/oneuldo-menubar-Template.png", import.meta.url));
  await access(new URL("../electron/assets/oneuldo-menubar-Template@2x.png", import.meta.url));
  await access(new URL("../electron/assets/oneuldo-menubar.png", import.meta.url));
  await access(new URL("../electron/assets/oneuldo-menubar@2x.png", import.meta.url));
  await access(new URL("../electron/assets/oneuldo-menubar-clear@2x.png", import.meta.url));
  await access(new URL("../electron/native-menubar.swift", import.meta.url));
  await access(new URL("../electron/after-pack.cjs", import.meta.url));
  await access(projectRoot);
});

test("builds an actionable macOS menu bar menu", () => {
  let toggledGoal = "";
  let opened = "";
  const noop = () => {};
  const template = createTrayTemplate({
    state: { completed: 1, total: 2, goals: [{ id: "goal-1", title: "기획서 핵심 흐름 정리하기", done: true }, { id: "goal-2", title: "프로젝트 첫 화면 만들기", done: false }] },
    prefs: { mateVisible: true, reminders: true, openAtLogin: false },
    actions: { toggleGoal: (id) => { toggledGoal = id; }, addGoal: noop, openToday: () => { opened = "today"; }, openReview: noop, openRecords: noop, openSettings: noop, openMenuBarSettings: noop, setMateVisible: noop, setReminders: noop, setOpenAtLogin: noop, quit: noop },
  });
  assert.equal(template[0].label, "오늘 1/2개 완료");
  const firstGoal = template.find((item) => item.label === "기획서 핵심 흐름 정리하기");
  assert.equal(firstGoal.type, "checkbox");
  assert.equal(firstGoal.checked, true);
  firstGoal.click();
  assert.equal(toggledGoal, "goal-1");
  template.find((item) => item.label === "오늘 화면 열기").click();
  assert.equal(opened, "today");
  assert.ok(template.some((item) => item.label === "오늘 돌아보기"));
  assert.ok(template.some((item) => item.label === "내 기록 보기"));
  assert.ok(template.some((item) => item.label === "설정…"));
  assert.ok(template.some((item) => item.label === "메뉴 막대 표시 설정…"));

  const attentionTemplate = createTrayTemplate({
    state: { completed: 0, total: 0, goals: [], attention: { startPending: true, reviewPending: true } },
    prefs: { mateVisible: true, reminders: true, openAtLogin: false },
    actions: { toggleGoal: noop, addGoal: noop, openToday: noop, openReview: noop, openRecords: noop, openSettings: noop, openMenuBarSettings: noop, setMateVisible: noop, setReminders: noop, setOpenAtLogin: noop, quit: noop },
  });
  assert.equal(attentionTemplate[0].label, "☾ 오늘 돌아보기 · 아직");
  assert.equal(attentionTemplate[1].label, "● 오늘의 TODO를 아직 정하지 않았어요");
});
