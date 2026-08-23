import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

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
  assert.match(html, /<title>오늘도 — 네가 해낸 하루를 기억할게<\/title>/);
  assert.match(html, /오늘은 어떤 하루를/);
  assert.match(html, /오늘의 목표/);
  assert.match(html, /오늘 돌아보기/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
  assert.doesNotMatch(html, /목표 달성률|실패했습니다|목표 미달/);
});

test("includes the native macOS companion and offline renderer", async () => {
  const [main, mate, packageJson, renderer, page, styles] = await Promise.all([
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/mate.html", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../desktop-ui/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(main, /alwaysOnTop:\s*true/);
  assert.match(main, /new Tray\(/);
  assert.match(main, /new Notification\(/);
  assert.match(main, /setVisibleOnAllWorkspaces/);
  assert.match(main, /desktop-ui-dist\/index\.html/);
  assert.doesNotMatch(main, /oneuldo-daily-mate\.dryzero0\.chatgpt\.site/);
  assert.match(mate, /목표 메이트와 대화하기/);
  assert.match(renderer, /createRoot/);
  assert.match(packageJson, /"desktop:dist"/);
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
  assert.match(page, /dragOffset/);
  assert.match(page, /carry: direction === "right"/);
  assert.match(page, /이번에는 그만하기/);
  assert.match(page, /오늘 돌아보기 사용법/);
  assert.match(page, /const totalSteps = 6/);
  assert.match(page, /ArrowLeft/);
  assert.match(page, /ArrowRight/);
  assert.doesNotMatch(page, /period-switch/);
  assert.doesNotMatch(page, /wheel-notch/);
  assert.match(page, /value: "21:00"/);
  assert.match(page, /첫 시작 가이드 다시 보기/);
  assert.match(main, /theme:\s*todayState\.settings\?\.theme/);
  await access(new URL("../desktop/assets/app-icon.png", import.meta.url));
  await access(new URL("../electron/after-pack.cjs", import.meta.url));
  await access(projectRoot);
});
