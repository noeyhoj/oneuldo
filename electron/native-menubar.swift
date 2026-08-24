import AppKit

private struct MenuBarState: Codable, Equatable {
    var startPending = false
    var reviewPending = false
    var completed = 0
    var total = 0
    var updatedAt = ""
}

final class OneuldoMenuBarDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var menuBarState = MenuBarState()
    private var stateTimer: Timer?
    private lazy var stateURL: URL? = {
        guard CommandLine.arguments.count > 1 else { return nil }
        return URL(fileURLWithPath: CommandLine.arguments[1])
    }()

    func applicationDidFinishLaunching(_ notification: Notification) {
        start()
    }

    func start() {
        guard statusItem == nil else { return }
        menuBarState = readMenuBarState()
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = item.button {
            button.image = makeCatIcon(startPending: menuBarState.startPending, reviewPending: menuBarState.reviewPending)
            button.imageScaling = .scaleProportionallyDown
            button.imagePosition = .imageOnly
            button.toolTip = attentionToolTip(menuBarState)
        }
        item.menu = makeMenu(menuBarState)
        statusItem = item
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in self?.refreshMenuBarState() }
        RunLoop.main.add(timer, forMode: .common)
        stateTimer = timer

        if ProcessInfo.processInfo.environment["ONEULDO_DEBUG_MENUBAR"] == "1" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                let frame = item.button?.window?.frame ?? .zero
                print("[oneuldo-menubar] visible=\(item.isVisible) frame=\(frame) bundle=\(Bundle.main.bundlePath)")
                fflush(stdout)
            }
        }
    }

    private func readMenuBarState() -> MenuBarState {
        guard let stateURL,
              let data = try? Data(contentsOf: stateURL),
              let state = try? JSONDecoder().decode(MenuBarState.self, from: data) else { return MenuBarState() }
        return state
    }

    private func refreshMenuBarState() {
        let nextState = readMenuBarState()
        guard nextState != menuBarState else { return }
        menuBarState = nextState
        guard let item = statusItem else { return }
        if let button = item.button {
            button.image = makeCatIcon(startPending: nextState.startPending, reviewPending: nextState.reviewPending)
            button.toolTip = attentionToolTip(nextState)
        }
        item.menu = makeMenu(nextState)
    }

    private func attentionToolTip(_ state: MenuBarState) -> String {
        if state.reviewPending && state.startPending { return "오늘도 · TODO와 오늘 돌아보기가 기다리고 있어요" }
        if state.reviewPending { return "오늘도 · 오늘 돌아보기 대기 중" }
        if state.startPending { return "오늘도 · 오늘의 TODO 대기 중" }
        return "오늘도"
    }

    private func loadCatIcon() -> NSImage {
        let adjacentIconURL = URL(fileURLWithPath: CommandLine.arguments[0])
            .deletingLastPathComponent()
            .appendingPathComponent("oneuldo-menubar-clear@2x.png")
        let iconURL = Bundle.main.url(forResource: "oneuldo-menubar-clear@2x", withExtension: "png")
            ?? (FileManager.default.fileExists(atPath: adjacentIconURL.path) ? adjacentIconURL : nil)
        if let iconURL,
           let bundledIcon = NSImage(contentsOf: iconURL) {
            bundledIcon.size = NSSize(width: 22, height: 17)
            bundledIcon.isTemplate = false
            return bundledIcon
        }

        // Keep a drawn fallback so the menu item still appears if a damaged
        // installation is missing its bundled color icon.
        let image = NSImage(size: NSSize(width: 22, height: 22), flipped: false) { _ in
            let coral = NSColor(calibratedRed: 1.0, green: 0.553, blue: 0.408, alpha: 1)
            let cream = NSColor(calibratedRed: 1.0, green: 0.831, blue: 0.769, alpha: 1)
            let ink = NSColor(calibratedRed: 0.227, green: 0.204, blue: 0.184, alpha: 1)

            coral.setFill()
            let leftEar = NSBezierPath()
            leftEar.move(to: NSPoint(x: 3, y: 15))
            leftEar.line(to: NSPoint(x: 4, y: 21))
            leftEar.line(to: NSPoint(x: 9, y: 17))
            leftEar.close()
            leftEar.fill()
            let rightEar = NSBezierPath()
            rightEar.move(to: NSPoint(x: 19, y: 15))
            rightEar.line(to: NSPoint(x: 18, y: 21))
            rightEar.line(to: NSPoint(x: 13, y: 17))
            rightEar.close()
            rightEar.fill()
            NSBezierPath(roundedRect: NSRect(x: 2, y: 2, width: 18, height: 17), xRadius: 8, yRadius: 8).fill()

            cream.setFill()
            NSBezierPath(ovalIn: NSRect(x: 7, y: 3, width: 8, height: 6)).fill()
            ink.setFill()
            NSBezierPath(ovalIn: NSRect(x: 7, y: 11, width: 2.4, height: 3.2)).fill()
            NSBezierPath(ovalIn: NSRect(x: 12.6, y: 11, width: 2.4, height: 3.2)).fill()
            NSBezierPath(ovalIn: NSRect(x: 10, y: 7, width: 2, height: 1.5)).fill()
            return true
        }
        image.isTemplate = false
        return image
    }

    private func makeCatIcon(startPending: Bool = false, reviewPending: Bool = false) -> NSImage {
        let base = loadCatIcon()
        guard startPending || reviewPending else { return base }
        let size = NSSize(width: 22, height: 17)
        let decorated = NSImage(size: size)
        decorated.lockFocus()
        base.draw(in: NSRect(origin: .zero, size: size), from: .zero, operation: .sourceOver, fraction: 1)

        func drawDot(_ rect: NSRect, color: NSColor) {
            let dot = NSBezierPath(ovalIn: rect)
            NSColor.white.withAlphaComponent(0.96).setStroke()
            dot.lineWidth = 1.4
            dot.stroke()
            color.setFill()
            dot.fill()
        }

        if startPending {
            drawDot(NSRect(x: 0.5, y: 11.1, width: 5.4, height: 5.4), color: NSColor(calibratedRed: 1, green: 0.36, blue: 0.23, alpha: 1))
        }
        if reviewPending {
            drawDot(NSRect(x: 16.1, y: 11.1, width: 5.4, height: 5.4), color: NSColor(calibratedRed: 0.53, green: 0.43, blue: 0.77, alpha: 1))
        }
        decorated.unlockFocus()
        decorated.isTemplate = false
        return decorated
    }

    private func symbolImage(_ name: String, color: NSColor, description: String) -> NSImage? {
        let base = NSImage.SymbolConfiguration(pointSize: 15, weight: .semibold)
        let palette = NSImage.SymbolConfiguration(paletteColors: [color])
        guard let image = NSImage(systemSymbolName: name, accessibilityDescription: description)?
            .withSymbolConfiguration(base.applying(palette)) else { return nil }
        image.size = NSSize(width: 18, height: 18)
        image.isTemplate = false
        return image
    }

    private func sectionTitle(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    private func menuItem(_ title: String, _ action: Selector, key: String = "", symbol: String, color: NSColor) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        item.image = symbolImage(symbol, color: color, description: title)
        return item
    }

    private func makeMenu(_ state: MenuBarState = MenuBarState()) -> NSMenu {
        let menu = NSMenu(title: "오늘도")
        let heading = NSMenuItem(title: "오늘도 — 네가 해낸 하루를 기억할게", action: nil, keyEquivalent: "")
        heading.isEnabled = false
        heading.image = makeCatIcon()
        menu.addItem(heading)
        if state.reviewPending {
            menu.addItem(menuItem("오늘 돌아보기 · 아직", #selector(openReview), symbol: "moon.stars.fill", color: NSColor(calibratedRed: 0.58, green: 0.5, blue: 0.78, alpha: 1)))
        }
        if state.startPending {
            menu.addItem(menuItem("오늘의 TODO를 아직 정하지 않았어요", #selector(openToday), symbol: "circle.fill", color: NSColor(calibratedRed: 1, green: 0.36, blue: 0.23, alpha: 1)))
        }
        if state.startPending || state.reviewPending {
            menu.addItem(.separator())
        }
        let progressTitle = state.total > 0 ? "오늘 \(state.completed)/\(state.total)개 완료" : "오늘의 목표가 아직 없어요"
        menu.addItem(sectionTitle(progressTitle))
        menu.addItem(.separator())
        menu.addItem(sectionTitle("바로가기"))
        menu.addItem(menuItem("새 목표 추가…", #selector(addGoal), symbol: "plus.circle.fill", color: NSColor(calibratedRed: 1, green: 0.45, blue: 0.28, alpha: 1)))
        menu.addItem(menuItem("오늘 화면 열기", #selector(openToday), symbol: "sun.max.fill", color: NSColor(calibratedRed: 0.96, green: 0.68, blue: 0.18, alpha: 1)))
        menu.addItem(menuItem("오늘 돌아보기", #selector(openReview), symbol: "moon.stars.fill", color: NSColor(calibratedRed: 0.58, green: 0.5, blue: 0.78, alpha: 1)))
        menu.addItem(menuItem("내 기록 보기", #selector(openRecords), symbol: "calendar", color: NSColor(calibratedRed: 0.35, green: 0.66, blue: 0.48, alpha: 1)))
        menu.addItem(.separator())
        menu.addItem(sectionTitle("앱 설정"))
        menu.addItem(menuItem("설정…", #selector(openSettings), symbol: "slider.horizontal.3", color: NSColor(calibratedRed: 0.42, green: 0.58, blue: 0.82, alpha: 1)))
        menu.addItem(menuItem("목표 메이트 표시 전환", #selector(toggleMate), symbol: "pawprint.fill", color: NSColor(calibratedRed: 1, green: 0.5, blue: 0.34, alpha: 1)))
        menu.addItem(menuItem("알림 받기 전환", #selector(toggleReminders), symbol: "bell.fill", color: NSColor(calibratedRed: 0.95, green: 0.65, blue: 0.15, alpha: 1)))
        menu.addItem(menuItem("로그인할 때 실행 전환", #selector(toggleLogin), symbol: "power", color: NSColor(calibratedRed: 0.32, green: 0.68, blue: 0.48, alpha: 1)))
        menu.addItem(.separator())
        menu.addItem(menuItem("오늘도 종료", #selector(quit), key: "q", symbol: "rectangle.portrait.and.arrow.right", color: NSColor(calibratedRed: 0.95, green: 0.28, blue: 0.3, alpha: 1)))
        return menu
    }

    private func send(_ action: String) {
        guard let url = URL(string: "oneuldo://\(action)") else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func addGoal() { send("add-goal") }
    @objc private func openToday() { send("today") }
    @objc private func openReview() { send("review") }
    @objc private func openRecords() { send("records") }
    @objc private func openSettings() { send("settings") }
    @objc private func toggleMate() { send("toggle-mate") }
    @objc private func toggleReminders() { send("toggle-reminders") }
    @objc private func toggleLogin() { send("toggle-login") }
    @objc private func quit() {
        send("quit")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            NSApplication.shared.terminate(nil)
        }
    }
}

let application = NSApplication.shared
let delegate = OneuldoMenuBarDelegate()
application.delegate = delegate
application.setActivationPolicy(.accessory)
withExtendedLifetime(delegate) {
    application.run()
}
