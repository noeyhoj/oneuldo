const { app, BrowserWindow, Menu, Tray, Notification, ipcMain, screen, shell, globalShortcut, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { createTrayTemplate } = require("./tray-menu.cjs");

const DEFAULT_SETTINGS = { morning: "09:00", evening: "18:00", cheer: "가끔", character: true, theme: "coral", animal: "cat" };
const GENTLE_MESSAGES = [
  "오늘의 속도도 충분히 너다워 🌿",
  "작은 한 칸도 분명한 전진이야.",
  "잠깐 숨을 고르는 것도 오늘의 좋은 선택이야.",
  "네가 해낸 작은 일도 내가 기억할게.",
  "서두르지 않아도 방향은 그대로야.",
  "지금 여기까지 온 것도 참 잘했어.",
  "완벽하지 않아도 오늘은 충분히 의미 있어.",
  "한 번에 하나씩, 우리 리듬대로 가보자.",
  "쉬어가는 동안에도 너는 멈춘 게 아니야.",
  "오늘의 작은 용기를 내가 기억할게 ✨",
  "애쓴 마음까지도 오늘의 성취야.",
  "어제보다 천천히 가도 괜찮은 날이 있어.",
  "지금 할 수 있는 만큼이면 충분해.",
  "오늘의 너에게도 다정한 말을 건네줘.",
  "잘 보이지 않는 노력도 분명 쌓이고 있어.",
];
const MATE_COMPACT_SIZE = { width: 176, height: 176 };
const MATE_SPEAKING_SIZE = { width: 244, height: 244 };

let mainWindow;
let mateWindow;
let tray;
let trayMenu;
let traySignature = "";
let nativeMenuBarProcess;
let quitting = false;
let pollTimer;
let reminderTimer;
let mateDragState;
let lastCompleted = 0;
let lastGentleMessage = -1;
let lastMateMessage = "";
let menuBarStateSignature = "";
let todayState = { completed: 0, total: 0, goals: [], settings: DEFAULT_SETTINGS, reviewedToday: false };

const prefsPath = () => path.join(app.getPath("userData"), "native-preferences.json");
const menuBarStatePath = () => path.join(app.getPath("userData"), "menubar-state.json");
const readPrefs = () => {
  try { return { mateVisible: true, reminders: true, openAtLogin: false, menuBarHelpShown: false, ...JSON.parse(fs.readFileSync(prefsPath(), "utf8")) }; }
  catch { return { mateVisible: true, reminders: true, openAtLogin: false, menuBarHelpShown: false }; }
};
const savePrefs = (next) => fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2));

const localDayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const minutesFromTime = (value) => {
  const [hour = "0", minute = "0"] = String(value || "00:00").split(":");
  return Number(hour) * 60 + Number(minute);
};

function getAttentionState(now = new Date()) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const morning = todayState.settings?.morning || DEFAULT_SETTINGS.morning;
  const evening = todayState.settings?.evening || DEFAULT_SETTINGS.evening;
  return {
    startPending: nowMinutes >= minutesFromTime(morning) && todayState.total === 0,
    reviewPending: nowMinutes >= minutesFromTime(evening) && !todayState.reviewedToday,
  };
}

function writeMenuBarState() {
  const attention = getAttentionState();
  const payload = { ...attention, completed: todayState.completed, total: todayState.total, updatedAt: new Date().toISOString() };
  const signature = JSON.stringify(payload, ["startPending", "reviewPending", "completed", "total"]);
  if (signature === menuBarStateSignature) return attention;
  menuBarStateSignature = signature;
  try {
    const target = menuBarStatePath();
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(payload));
    fs.renameSync(temporary, target);
  } catch { /* The Electron tray remains available if the helper cannot read state. */ }
  return attention;
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, "assets/oneuldo-menubar.png");
  if (!fs.existsSync(iconPath)) throw new Error("오늘도 메뉴 막대 아이콘을 불러오지 못했습니다.");
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) throw new Error("오늘도 메뉴 막대 아이콘을 생성하지 못했습니다.");
  // Keep the coral app color instead of letting macOS tint the icon as a template.
  icon.setTemplateImage(false);
  return icon;
}

function showMain(mode = "today") {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  app.focus({ steal: true });
  mainWindow.focus();
  const action = {
    today: `document.querySelector('.brand')?.click()`,
    review: `document.querySelector('.review-button')?.click()`,
    records: `document.querySelectorAll('.main-nav button')[1]?.click()`,
    settings: `document.querySelector('.icon-button')?.click()`,
  }[mode];
  if (action) setTimeout(() => mainWindow?.webContents.executeJavaScript(action).catch(() => {}), 250);
}

function showAddGoal() {
  showMain("today");
  setTimeout(() => mainWindow?.webContents.executeJavaScript(`document.querySelector('.add-goal')?.click(); setTimeout(() => document.querySelector('.add-form input')?.focus(), 80)`).catch(() => {}), 360);
}

function toggleGoalFromMenu(goalId) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('oneuldo:toggle-goal', { detail: ${JSON.stringify(goalId)} }))`)
    .then(() => setTimeout(syncFromWeb, 160))
    .catch(() => {});
}

function positionMate() {
  if (!mateWindow) return;
  const saved = readPrefs().matePosition;
  const targetPoint = saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)
    ? { x: Math.round(saved.right), y: Math.round(saved.bottom) }
    : screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(targetPoint);
  const { x, y, width, height } = display.workArea;
  const [mateWidth, mateHeight] = mateWindow.getSize();
  const preferredX = saved ? saved.right - mateWidth : x + width - mateWidth - 26;
  const preferredY = saved ? saved.bottom - mateHeight : y + height - mateHeight - 22;
  mateWindow.setPosition(
    Math.round(Math.min(Math.max(preferredX, x), x + width - mateWidth)),
    Math.round(Math.min(Math.max(preferredY, y), y + height - mateHeight)),
    false,
  );
}

function saveMatePosition() {
  if (!mateWindow || mateWindow.isDestroyed()) return;
  const prefs = readPrefs();
  const bounds = mateWindow.getBounds();
  prefs.matePosition = { right: bounds.x + bounds.width, bottom: bounds.y + bounds.height };
  savePrefs(prefs);
}

function beginMateDrag() {
  if (!mateWindow || mateWindow.isDestroyed()) return;
  mateDragState = { cursor: screen.getCursorScreenPoint(), bounds: mateWindow.getBounds() };
}

function updateMateDrag() {
  if (!mateDragState || !mateWindow || mateWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursor);
  const nextX = mateDragState.bounds.x + cursor.x - mateDragState.cursor.x;
  const nextY = mateDragState.bounds.y + cursor.y - mateDragState.cursor.y;
  mateWindow.setPosition(
    Math.round(Math.min(Math.max(nextX, workArea.x), workArea.x + workArea.width - mateDragState.bounds.width)),
    Math.round(Math.min(Math.max(nextY, workArea.y), workArea.y + workArea.height - mateDragState.bounds.height)),
    false,
  );
}

function endMateDrag() {
  updateMateDrag();
  saveMatePosition();
  mateDragState = undefined;
}

function resizeMateWindow(expanded) {
  if (!mateWindow || mateWindow.isDestroyed()) return;
  const next = expanded ? MATE_SPEAKING_SIZE : MATE_COMPACT_SIZE;
  const current = mateWindow.getBounds();
  if (current.width === next.width && current.height === next.height) return;
  mateWindow.setBounds({
    x: current.x + current.width - next.width,
    y: current.y + current.height - next.height,
    width: next.width,
    height: next.height,
  }, true);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 830,
    minWidth: 820,
    minHeight: 620,
    show: false,
    title: "오늘도",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 19 },
    backgroundColor: "#F3EFE7",
    icon: path.join(__dirname, "../desktop/assets/app-icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  mainWindow.loadFile(path.join(__dirname, "../desktop-ui-dist/index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
      sendMateMessage("나는 여기서 기다릴게 🌿");
    }
  });

  mainWindow.webContents.on("did-finish-load", async () => {
    await mainWindow.webContents.insertCSS(`
      .topbar { padding-left: 108px !important; -webkit-app-region: drag; }
      .topbar button, .topbar a, .topbar nav { -webkit-app-region: no-drag; }
      .today-view .mate-zone { display: none !important; }
      .today-view .day-column { transform: none !important; }
      body { user-select: none; }
      input, textarea { user-select: text; }
    `);
    syncFromWeb();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) return;
    event.preventDefault();
    shell.openExternal(url);
  });
}

function createMateWindow() {
  const prefs = readPrefs();
  mateWindow = new BrowserWindow({
    width: MATE_COMPACT_SIZE.width,
    height: MATE_COMPACT_SIZE.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: true,
    type: "panel",
    webPreferences: {
      preload: path.join(__dirname, "mate-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mateWindow.setAlwaysOnTop(true, "floating");
  mateWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mateWindow.loadFile(path.join(__dirname, "mate.html"));
  mateWindow.once("ready-to-show", () => {
    positionMate();
    if (prefs.mateVisible) mateWindow.showInactive();
  });
  mateWindow.on("closed", () => { mateWindow = undefined; mateDragState = undefined; });
}

function sendMateMessage(message) {
  if (!mateWindow || mateWindow.isDestroyed()) return;
  mateWindow.webContents.send("mate:message", message);
}

function nextGentleMessage() {
  let nextIndex = Math.floor(Math.random() * GENTLE_MESSAGES.length);
  if (GENTLE_MESSAGES.length > 1 && nextIndex === lastGentleMessage) nextIndex = (nextIndex + 1) % GENTLE_MESSAGES.length;
  lastGentleMessage = nextIndex;
  return GENTLE_MESSAGES[nextIndex];
}

const KOREAN_COUNTS = ["영", "한", "두", "세", "네", "다섯"];
const KOREAN_ORDINALS = ["영 번째", "첫 번째", "두 번째", "세 번째", "네 번째", "다섯 번째"];
const koreanCount = (value) => KOREAN_COUNTS[value] || String(value);
const koreanOrdinal = (value) => KOREAN_ORDINALS[value] || `${value}번째`;
const shortGoalTitle = (title) => title.length > 22 ? `${title.slice(0, 21)}…` : title;

function pickDistinctMateMessage(candidates) {
  const unique = [...new Set(candidates.filter(Boolean))];
  const available = unique.filter((message) => message !== lastMateMessage);
  const pool = available.length ? available : unique;
  const next = pool[Math.floor(Math.random() * pool.length)] || nextGentleMessage();
  lastMateMessage = next;
  return next;
}

function contextualMateMessage() {
  const goals = Array.isArray(todayState.goals) ? todayState.goals : [];
  const doneGoals = goals.filter((goal) => goal.done);
  const openGoals = goals.filter((goal) => !goal.done);
  const titles = doneGoals.map((goal) => goal.title).join(" ");
  const has = (words) => words.some((word) => titles.includes(word));
  const candidates = [nextGentleMessage(), nextGentleMessage()];

  if (!goals.length) candidates.push("오늘 마음에 담아둘 작은 일 한 가지를 천천히 골라볼까?");
  if (goals.length && doneGoals.length === goals.length) candidates.push("마음에 담은 일을 모두 해냈네. 오늘의 리듬이 참 멋져 🎉");
  if (!doneGoals.length && goals.some((goal) => goal.carriedFrom)) candidates.push("어제에서 가져온 일도 오늘의 속도에 맞춰 천천히 이어가면 돼.");
  if (has(["산책", "운동", "요가", "달리기", "스트레칭"])) candidates.push("바쁜 하루에도 나를 돌보는 시간을 챙겼네. 참 다정한 선택이야 🌿");
  if (has(["공부", "책", "읽기", "강의", "알고리즘", "연습"])) candidates.push("오늘 쌓은 배움은 작아 보여도 오래 남을 거야.");
  if (has(["기획", "프로젝트", "포트폴리오", "보고서", "회의", "문구", "화면", "PR"])) candidates.push("복잡한 일을 눈에 보이는 한 걸음으로 바꿔냈네. 잘했어 ✨");
  if (has(["전화", "연락", "가족", "친구", "만나"])) candidates.push("소중한 사람에게 건넨 마음도 오늘의 따뜻한 성취야.");
  if (doneGoals.length) candidates.push(`오늘 ${koreanCount(doneGoals.length)} 가지나 발자국으로 남겼어. 네가 움직인 만큼을 기억할게.`);

  if (openGoals.length) {
    const goal = openGoals[Math.floor(Math.random() * openGoals.length)];
    candidates.push(`“${shortGoalTitle(goal.title)}”도 오늘의 속도에 맞춰 한 걸음씩 가보자.`);
  }
  if (doneGoals.length) {
    const goal = doneGoals[Math.floor(Math.random() * doneGoals.length)];
    candidates.push(`“${shortGoalTitle(goal.title)}”까지 해낸 오늘의 너, 정말 멋져.`);
  }

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const eveningMinutes = Number((todayState.settings?.evening || "18:00").slice(0, 2)) * 60 + Number((todayState.settings?.evening || "18:00").slice(3, 5));
  if (nowMinutes >= eveningMinutes && !doneGoals.length) candidates.push("완료 표시가 없어도 애쓴 시간은 사라지지 않아. 오늘을 돌아본 것부터 충분해.");
  return pickDistinctMateMessage(candidates);
}

function sendMateStatus() {
  if (!mateWindow || mateWindow.isDestroyed()) return;
  mateWindow.webContents.send("mate:status", {
    completed: todayState.completed,
    total: todayState.total,
    theme: todayState.settings?.theme || "coral",
    cheer: todayState.settings?.cheer || DEFAULT_SETTINGS.cheer,
    animal: todayState.settings?.animal || DEFAULT_SETTINGS.animal,
  });
}

async function syncFromWeb() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const state = await mainWindow.webContents.executeJavaScript(`(() => {
      try {
        const goals = JSON.parse(localStorage.getItem('oneuldo-goals') || '[]');
        const settings = JSON.parse(localStorage.getItem('oneuldo-settings') || '{}');
        const records = JSON.parse(localStorage.getItem('oneuldo-records') || '[]');
        const now = new Date();
        const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
        return { completed: goals.filter((goal) => goal.done).length, total: goals.length, goals, settings, reviewedToday: records.some((record) => record.date === today) };
      } catch { return { completed: 0, total: 0, goals: [], settings: {}, reviewedToday: false }; }
    })()`);
    todayState = { completed: state.completed, total: state.total, goals: state.goals || [], settings: { ...DEFAULT_SETTINGS, ...state.settings }, reviewedToday: Boolean(state.reviewedToday) };
    if (state.completed > lastCompleted) {
      sendMateMessage(state.completed === state.total ? "오늘 마음에 담은 일을 모두 해냈네. 정말 멋져 🎉" : `오늘의 ${koreanOrdinal(state.completed)} 발자국이야. 작은 성취도 소중해 ✨`);
    }
    lastCompleted = state.completed;
    sendMateStatus();
    if (todayState.settings.character === false && mateWindow?.isVisible()) mateWindow.hide();
    writeMenuBarState();
    rebuildTrayMenu();
  } catch { /* The hosted view may still be loading. */ }
}

function notify(title, body, mode) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body, icon: path.join(__dirname, "../desktop/assets/app-icon.png"), silent: true });
  notification.on("click", () => showMain(mode));
  notification.show();
  sendMateMessage(body);
}

function checkReminders() {
  const prefs = readPrefs();
  if (!prefs.reminders) return;
  const now = new Date();
  const day = localDayKey(now);
  const attention = getAttentionState(now);
  let prefsChanged = false;
  if (attention.startPending && prefs.lastMorningReminderDate !== day) {
    prefs.lastMorningReminderDate = day;
    prefsChanged = true;
    notify("오늘을 여는 작은 질문", "좋은 아침이에요. 오늘 마음에 담아둘 한 가지를 골라볼까요?", "today");
  }
  if (attention.reviewPending && prefs.lastEveningReminderDate !== day) {
    prefs.lastEveningReminderDate = day;
    prefsChanged = true;
    notify("오늘을 다정하게 돌아볼 시간", "오늘도 수고했어요. 해낸 일부터 천천히 함께 돌아볼까요?", "review");
  }
  if (prefsChanged) savePrefs(prefs);
  writeMenuBarState();
  rebuildTrayMenu();
}

function toggleMate(visible) {
  if (!mateWindow) return;
  const prefs = readPrefs();
  prefs.mateVisible = visible;
  savePrefs(prefs);
  if (visible) { positionMate(); mateWindow.showInactive(); } else mateWindow.hide();
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  const prefs = readPrefs();
  const attention = getAttentionState();
  const nextSignature = JSON.stringify({ completed: todayState.completed, total: todayState.total, goals: todayState.goals.map(({ id, title, done }) => ({ id, title, done })), reviewedToday: todayState.reviewedToday, attention, prefs });
  if (nextSignature === traySignature) return;
  traySignature = nextSignature;
  trayMenu = Menu.buildFromTemplate(createTrayTemplate({
    state: { ...todayState, attention },
    prefs,
    actions: {
      toggleGoal: toggleGoalFromMenu,
      addGoal: showAddGoal,
      openToday: () => showMain("today"),
      openReview: () => showMain("review"),
      openRecords: () => showMain("records"),
      openSettings: () => showMain("settings"),
      openMenuBarSettings,
      setMateVisible: toggleMate,
      setReminders: (checked) => { prefs.reminders = checked; savePrefs(prefs); rebuildTrayMenu(); },
      setOpenAtLogin: (checked) => { prefs.openAtLogin = checked; savePrefs(prefs); app.setLoginItemSettings({ openAtLogin: checked }); rebuildTrayMenu(); },
      quit: () => { quitting = true; app.quit(); },
    },
  }));
  if (tray && !tray.isDestroyed()) {
    tray.setTitle("");
    tray.setToolTip("오늘도 — 네가 해낸 하루를 기억할게");
    tray.setContextMenu(trayMenu);
  }
}

function openTrayMenu() {
  if (tray && trayMenu) tray.popUpContextMenu(trayMenu);
  else showMain("today");
}

function openMenuBarSettings() {
  shell.openExternal("x-apple.systempreferences:com.apple.ControlCenter-Settings.extension").catch(() => shell.openPath("/System/Applications/System Settings.app"));
}

function createElectronMenuBar() {
  if (tray && !tray.isDestroyed()) return;
  tray = new Tray(createTrayIcon());
  traySignature = "";
  rebuildTrayMenu();
}

function createMenuBar() {
  if (process.platform === "darwin" && app.isPackaged) {
    const helperPath = path.join(process.resourcesPath, "OneuldoMenuBarNative");
    if (fs.existsSync(helperPath)) {
      // Launch the native status item directly. Keeping it out of a nested app
      // bundle prevents macOS from restoring the legacy helper's off-screen
      // menu bar coordinates, while NSStatusBar still manages spacing and
      // mirrors the item across every active display.
      execFile("/usr/bin/pkill", ["-x", "OneuldoMenuBarNative"], () => {
        if (quitting) return;
        writeMenuBarState();
        nativeMenuBarProcess = execFile(helperPath, [menuBarStatePath()], (error) => {
          nativeMenuBarProcess = undefined;
          if (!quitting && error) createElectronMenuBar();
        });
      });
      return;
    }
  }
  createElectronMenuBar();
  if (process.env.ONEULDO_DEBUG_TRAY === "1") {
    for (const delay of [500, 3000]) setTimeout(() => console.info("[oneuldo-tray]", JSON.stringify({ delay, bounds: tray.getBounds(), title: tray.getTitle(), displays: screen.getAllDisplays().map(({ id, bounds, workArea, primary }) => ({ id, bounds, workArea, primary })) })), delay);
  }
}

function stopNativeMenuBar() {
  if (nativeMenuBarProcess && !nativeMenuBarProcess.killed) nativeMenuBarProcess.kill();
  nativeMenuBarProcess = undefined;
  if (process.platform === "darwin") execFile("/usr/bin/pkill", ["-x", "OneuldoMenuBarNative"], () => {});
}

function handleMenuBarAction(rawUrl) {
  let action;
  try { action = new URL(rawUrl).hostname; } catch { return false; }
  const prefs = readPrefs();
  if (action === "add-goal") showAddGoal();
  else if (["today", "review", "records", "settings"].includes(action)) showMain(action);
  else if (action === "toggle-mate") toggleMate(!prefs.mateVisible);
  else if (action === "toggle-reminders") {
    prefs.reminders = !prefs.reminders;
    savePrefs(prefs);
    rebuildTrayMenu();
  } else if (action === "toggle-login") {
    prefs.openAtLogin = !prefs.openAtLogin;
    savePrefs(prefs);
    app.setLoginItemSettings({ openAtLogin: prefs.openAtLogin });
    rebuildTrayMenu();
  } else if (action === "quit") {
    quitting = true;
    app.quit();
  } else return false;
  return true;
}

function createApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "오늘도", submenu: [
      { role: "about", label: "오늘도 정보" },
      { type: "separator" },
      { label: "환경설정…", accelerator: "CmdOrCtrl+,", click: () => showMain("settings") },
      { label: "메뉴 막대 표시 설정…", click: openMenuBarSettings },
      { type: "separator" },
      { role: "hide", label: "오늘도 숨기기" },
      { role: "hideOthers", label: "다른 항목 숨기기" },
      { role: "unhide", label: "모두 보이기" },
      { type: "separator" },
      { role: "quit", label: "오늘도 종료" },
    ]},
    { label: "편집", submenu: [{ role: "undo", label: "실행 취소" }, { role: "redo", label: "다시 실행" }, { type: "separator" }, { role: "cut", label: "잘라내기" }, { role: "copy", label: "복사" }, { role: "paste", label: "붙여넣기" }, { role: "selectAll", label: "모두 선택" }] },
    { label: "보기", submenu: [{ role: "reload", label: "새로고침" }, { role: "togglefullscreen", label: "전체 화면" }] },
    { label: "창", submenu: [{ role: "minimize", label: "최소화" }, { role: "zoom", label: "확대" }, { label: "오늘 열기", click: () => showMain() }] },
  ]));
}

ipcMain.on("mate:talk", () => sendMateMessage(contextualMateMessage()));
ipcMain.on("mate:open", () => showMain());
ipcMain.on("mate:menu", openTrayMenu);
ipcMain.on("mate:resize", (_event, expanded) => resizeMateWindow(Boolean(expanded)));
ipcMain.on("mate:drag-start", beginMateDrag);
ipcMain.on("mate:drag", updateMateDrag);
ipcMain.on("mate:drag-end", endMateDrag);

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleMenuBarAction(url);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((value) => value.startsWith("oneuldo://"));
    if (!url || !handleMenuBarAction(url)) showMain();
  });
  app.whenReady().then(() => {
    app.setName("오늘도");
    if (process.platform === "darwin") app.setActivationPolicy("accessory");
    app.setAsDefaultProtocolClient("oneuldo");
    app.setAboutPanelOptions({ applicationName: "오늘도", applicationVersion: app.getVersion(), copyright: "네가 해낸 하루를 기억할게." });
    createApplicationMenu();
    createMainWindow();
    createMateWindow();
    createMenuBar();
    pollTimer = setInterval(syncFromWeb, 2000);
    reminderTimer = setInterval(checkReminders, 30000);
    globalShortcut.register("CommandOrControl+Shift+O", () => mainWindow?.isVisible() ? mainWindow.hide() : showMain());
  });
}

app.on("activate", () => showMain());
app.on("before-quit", () => { quitting = true; stopNativeMenuBar(); clearInterval(pollTimer); clearInterval(reminderTimer); globalShortcut.unregisterAll(); });
app.on("window-all-closed", () => { /* Keep the menu bar companion alive on macOS. */ });
