const { app, BrowserWindow, Menu, Tray, Notification, ipcMain, nativeImage, screen, shell, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");

const DEFAULT_SETTINGS = { morning: "09:00", evening: "18:00", cheer: "가끔", character: true };
const GENTLE_MESSAGES = [
  "천천히 해도 괜찮아.",
  "지금 하고 있는 것도 충분해.",
  "잠깐 쉬어가도 좋아 🌿",
  "네가 해낸 건 내가 기억할게.",
  "오늘도 꽤 잘하고 있어.",
];

let mainWindow;
let mateWindow;
let tray;
let quitting = false;
let pollTimer;
let reminderTimer;
let lastCompleted = 0;
let todayState = { completed: 0, total: 0, settings: DEFAULT_SETTINGS };
const sentReminders = new Set();

const prefsPath = () => path.join(app.getPath("userData"), "native-preferences.json");
const readPrefs = () => {
  try { return { mateVisible: true, reminders: true, openAtLogin: false, ...JSON.parse(fs.readFileSync(prefsPath(), "utf8")) }; }
  catch { return { mateVisible: true, reminders: true, openAtLogin: false }; }
};
const savePrefs = (next) => fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2));

function trayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><path fill="#000" d="M8 11 6 5l7 4a13 13 0 0 1 10 0l7-4-2 6a13 13 0 1 1-20 0Z"/><circle cx="14" cy="18" r="1.7" fill="#fff"/><circle cx="22" cy="18" r="1.7" fill="#fff"/><path d="M15 23c2 1.8 4 1.8 6 0" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>`;
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`).resize({ width: 18, height: 18 });
  icon.setTemplateImage(true);
  return icon;
}

function showMain(mode = "today") {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (mode === "review") {
    setTimeout(() => mainWindow?.webContents.executeJavaScript(`document.querySelector('.review-button')?.click()`).catch(() => {}), 350);
  }
}

function positionMate() {
  if (!mateWindow) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const [mateWidth, mateHeight] = mateWindow.getSize();
  mateWindow.setPosition(Math.round(x + width - mateWidth - 26), Math.round(y + height - mateHeight - 22), false);
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
    width: 310,
    height: 300,
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
  mateWindow.on("closed", () => { mateWindow = undefined; });
}

function sendMateMessage(message) {
  if (!mateWindow || mateWindow.isDestroyed()) return;
  mateWindow.webContents.send("mate:message", message);
}

function sendMateStatus() {
  if (!mateWindow || mateWindow.isDestroyed()) return;
  mateWindow.webContents.send("mate:status", { completed: todayState.completed, total: todayState.total });
}

async function syncFromWeb() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const state = await mainWindow.webContents.executeJavaScript(`(() => {
      try {
        const goals = JSON.parse(localStorage.getItem('oneuldo-goals') || '[]');
        const settings = JSON.parse(localStorage.getItem('oneuldo-settings') || '{}');
        return { completed: goals.filter((goal) => goal.done).length, total: goals.length, settings };
      } catch { return { completed: 0, total: 0, settings: {} }; }
    })()`);
    todayState = { completed: state.completed, total: state.total, settings: { ...DEFAULT_SETTINGS, ...state.settings } };
    if (state.completed > lastCompleted) {
      sendMateMessage(state.completed === state.total ? "오늘의 목표를 다 해냈네! 정말 멋져 🎉" : `오늘 벌써 ${state.completed}번째 완료야 ✨`);
    }
    lastCompleted = state.completed;
    sendMateStatus();
    if (todayState.settings.character === false && mateWindow?.isVisible()) mateWindow.hide();
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
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const morning = todayState.settings?.morning || DEFAULT_SETTINGS.morning;
  const evening = todayState.settings?.evening || DEFAULT_SETTINGS.evening;
  if (time === morning && !sentReminders.has(`${day}-morning`)) {
    sentReminders.add(`${day}-morning`);
    notify("오늘의 목표", "오늘은 어떤 하루를 보내볼까?", "today");
  }
  if (time === evening && !sentReminders.has(`${day}-evening`)) {
    sentReminders.add(`${day}-evening`);
    notify("오늘의 기록", "오늘 해낸 일들을 같이 돌아볼까?", "review");
  }
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
  if (!tray) return;
  const prefs = readPrefs();
  const menu = Menu.buildFromTemplate([
    { label: "오늘 열기", click: () => showMain("today") },
    { label: "오늘 돌아보기", click: () => showMain("review") },
    { type: "separator" },
    { label: "목표 메이트 보기", type: "checkbox", checked: prefs.mateVisible, click: (item) => toggleMate(item.checked) },
    { label: "알림 받기", type: "checkbox", checked: prefs.reminders, click: (item) => { prefs.reminders = item.checked; savePrefs(prefs); rebuildTrayMenu(); } },
    { label: "로그인할 때 실행", type: "checkbox", checked: prefs.openAtLogin, click: (item) => { prefs.openAtLogin = item.checked; savePrefs(prefs); app.setLoginItemSettings({ openAtLogin: item.checked }); rebuildTrayMenu(); } },
    { type: "separator" },
    { label: "오늘도 종료", click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip("오늘도 — 네가 해낸 하루를 기억할게");
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.on("click", () => mainWindow?.isVisible() ? mainWindow.hide() : showMain());
  rebuildTrayMenu();
}

function createApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "오늘도", submenu: [
      { role: "about", label: "오늘도 정보" },
      { type: "separator" },
      { label: "환경설정…", accelerator: "CmdOrCtrl+,", click: () => { showMain(); setTimeout(() => mainWindow?.webContents.executeJavaScript(`document.querySelector('.icon-button')?.click()`), 300); } },
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

ipcMain.on("mate:talk", () => sendMateMessage(GENTLE_MESSAGES[Math.floor(Math.random() * GENTLE_MESSAGES.length)]));
ipcMain.on("mate:open", () => showMain());
ipcMain.on("mate:menu", () => tray?.popUpContextMenu());

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", () => showMain());
  app.whenReady().then(() => {
    app.setName("오늘도");
    app.setAboutPanelOptions({ applicationName: "오늘도", applicationVersion: app.getVersion(), copyright: "네가 해낸 하루를 기억할게." });
    createApplicationMenu();
    createMainWindow();
    createMateWindow();
    createTray();
    pollTimer = setInterval(syncFromWeb, 12000);
    reminderTimer = setInterval(checkReminders, 30000);
    globalShortcut.register("CommandOrControl+Shift+O", () => mainWindow?.isVisible() ? mainWindow.hide() : showMain());
  });
}

app.on("activate", () => showMain());
app.on("before-quit", () => { quitting = true; clearInterval(pollTimer); clearInterval(reminderTimer); globalShortcut.unregisterAll(); });
app.on("window-all-closed", () => { /* Keep the menu bar companion alive on macOS. */ });
