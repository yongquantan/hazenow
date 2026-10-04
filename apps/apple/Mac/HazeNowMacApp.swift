import AppKit
import HazeKit
import HazeUI
import ServiceManagement
import SwiftUI
import WidgetKit

@main
struct HazeNowMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        MenuBarExtra {
            PopoverView(store: appDelegate.store, notch: appDelegate.notch)
        } label: {
            MenuBarLabel(store: appDelegate.store)
        }
        .menuBarExtraStyle(.window)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let store = HazeStore()
    lazy var notch = NotchController(store: store)

    func applicationDidFinishLaunching(_ notification: Notification) {
        HazeFonts.register()
        store.onSnapshot = { [weak self] snap in
            WidgetCenter.shared.reloadAllTimelines()
            #if DEBUG
            if let self, let dir = ProcessInfo.processInfo.environment["HAZENOW_DEBUG_DIR"] {
                DebugRender.write(snapshot: snap, store: self.store, notch: self.notch, to: URL(fileURLWithPath: dir))
            }
            #endif
        }
        store.start()
        notch.setEnabled(store.settings.showNotch)
        #if DEBUG
        // Dev/QA hooks: environment variables only, nothing is persisted.
        let env = ProcessInfo.processInfo.environment
        if env["HAZENOW_DEBUG_NOTCH_CYCLE"] != nil { DebugRender.cycleNotch(notch) }
        if let dir = env["HAZENOW_DEBUG_NOTIFY_YES"] {
            DebugRender.tapNotifyYes(store: store, notch: notch, dir: URL(fileURLWithPath: dir))
        }
        if env["HAZENOW_DEBUG_POPOVER_CYCLE"] != nil { DebugRender.cyclePopover() }
        #endif
        firstLaunchHint.scheduleIfNeeded(settings: store.settings, notch: notch)
    }

    private let firstLaunchHint = FirstLaunchHint()
}

// MARK: - First-launch hint

/// One-time "HazeNow lives up here." popover under the menu-bar item. A menu-bar-only app (LSUIElement)
/// otherwise shows nothing on first launch. Transient: closes on "Got it", a click elsewhere, opening the
/// menu (so it never sits on top of the first-run place onboarding), or after ~12 s.
///
/// Anchoring: MenuBarExtra exposes no NSStatusItem, but its button lives in this app's own
/// `NSStatusBarWindow`; the popover is shown relative to that window's content view.
@MainActor
final class FirstLaunchHint: NSObject, NSPopoverDelegate {
    static let shownKey = "hazenow.mac.firstLaunchHintShown"

    private var popover: NSPopover?
    private var observers: [NSObjectProtocol] = []
    private var monitors: [Any] = []
    private var autoClose: DispatchWorkItem?

    func scheduleIfNeeded(settings: HazeSettings, notch: NotchController) {
        let defaults = settings.defaults
        var force = false
        #if DEBUG
        force = ProcessInfo.processInfo.environment["HAZENOW_DEBUG_FIRST_LAUNCH_HINT"] != nil  // not persisted
        #endif
        guard force || !defaults.bool(forKey: Self.shownKey) else { return }
        // Someone upgrading who already picked a place has found the menu bar; don't greet them.
        if !force && settings.hasSavedPlaceChoice {
            defaults.set(true, forKey: Self.shownKey)
            return
        }
        // ~1 s so the status item has a frame; retry briefly if it isn't there yet.
        attempt(remaining: 5, after: 1.0) { [weak self] anchor in
            guard let self else { return }
            if !force { defaults.set(true, forKey: Self.shownKey) }
            self.show(at: anchor, notchLine: notch.hasNotchedScreen && settings.showNotch)
        }
    }

    private func attempt(remaining: Int, after delay: TimeInterval, _ body: @escaping @MainActor (NSView) -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            MainActor.assumeIsolated {
                guard let self else { return }
                if let anchor = Self.statusItemView() {
                    body(anchor)
                } else if remaining > 1 {
                    self.attempt(remaining: remaining - 1, after: 0.5, body)
                }
                // No status item found (e.g. hidden by a menu-bar manager): skip; the flag stays unset.
            }
        }
    }

    /// The content view of this app's status-bar window (the MenuBarExtra button), if it is actually showing.
    /// With several displays there is one such window per menu bar; an item crowded out by app menus (or behind
    /// the notch) still has a window but it is occluded, so only visible ones count. The active screen wins.
    static func statusItemView() -> NSView? {
        let candidates = NSApp.windows.filter {
            String(describing: type(of: $0)).contains("StatusBarWindow") && $0.isVisible
                && $0.frame.width > 0 && $0.occlusionState.contains(.visible)
        }
        let preferred = candidates.first { $0.screen == NSScreen.main } ?? candidates.first
        return preferred?.contentView
    }

    private func show(at anchor: NSView, notchLine: Bool) {
        guard popover == nil, anchor.window != nil else { return }
        let p = NSPopover()
        p.behavior = .transient
        p.animates = true
        p.delegate = self
        p.contentViewController = NSHostingController(rootView: FirstLaunchHintView(notchLine: notchLine) { [weak self] in
            self?.close()
        })
        popover = p
        // Bring the (Dock-less) app forward so the popover can take keyboard focus and VoiceOver lands on it.
        NSApp.activate(ignoringOtherApps: true)
        p.show(relativeTo: anchor.bounds, of: anchor, preferredEdge: .minY)
        p.contentViewController?.view.window?.makeKey()

        // Opening the menu (or any other window of ours becoming key) dismisses the hint.
        observers.append(NotificationCenter.default.addObserver(
            forName: NSWindow.didBecomeKeyNotification, object: nil, queue: .main
        ) { [weak self] note in
            MainActor.assumeIsolated {
                guard let self, let w = note.object as? NSWindow,
                      w !== self.popover?.contentViewController?.view.window else { return }
                self.close()
            }
        })
        // Belt and braces for a non-active accessory app: any click outside the popover closes it.
        if let m = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown], handler: { [weak self] _ in
            MainActor.assumeIsolated { self?.close() }
        }) { monitors.append(m) }
        if let m = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown], handler: { [weak self] event in
            MainActor.assumeIsolated {
                if let self, event.window !== self.popover?.contentViewController?.view.window { self.close() }
            }
            return event
        }) { monitors.append(m) }

        let work = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.close() } }
        autoClose = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: work)
    }

    func close() {
        popover?.performClose(nil)
        teardown()
    }

    nonisolated func popoverDidClose(_ notification: Notification) {
        MainActor.assumeIsolated { teardown() }
    }

    private func teardown() {
        autoClose?.cancel(); autoClose = nil
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        monitors.forEach(NSEvent.removeMonitor)
        monitors = []
        popover = nil
    }
}

struct FirstLaunchHintView: View {
    static let title = "HazeNow lives up here."
    static let notchLine = "On a MacBook with a notch, the pill beside it shows the same reading. Hover it to see more."
    static let fallbackLine = "Click the reading any time for the full picture."

    let notchLine: Bool
    let onDone: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Self.title)
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Text(notchLine ? Self.notchLine : Self.fallbackLine)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Spacer()
                Button("Got it", action: onDone)
                    .keyboardShortcut(.defaultAction)
                    .controlSize(.regular)
            }
            .padding(.top, 2)
        }
        .padding(14)
        .frame(width: 260, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}

/// `● 105 ▲` — dot tinted by band. The dot is a non-template image so it keeps its color
/// in the (otherwise monochrome) menu bar; the text follows the menu bar appearance.
struct MenuBarLabel: View {
    let store: HazeStore

    var body: some View {
        if let c = store.country {
            // A place outside Singapore: its own number and the authority's colour (no number → the mark).
            if let s = c.snapshot, let pm = s.pm25 {
                HStack(spacing: 3) {
                    Image(nsImage: MenuBarDot.image(hex: store.countryTint ?? "#8FA3AD", stale: s.stale))
                    Text("\(pm)").monospacedDigit()
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(c.placeName), PM2.5 \(pm), \(SeaVerdicts.verdict(s, profiles: store.profiles).short)")
            } else {
                Image("MenubarTemplate").renderingMode(.template).accessibilityLabel("HazeNow, \(c.placeName)")
            }
        } else if let s = store.snapshot {
            HStack(spacing: 3) {
                Image(nsImage: MenuBarDot.image(for: s.band, stale: s.stale))
                // Never mistakable for real data (QA mock is DEBUG-only and session-scoped). One Text: the menu bar
                // shows only the image and the first Text of a MenuBarExtra label.
                Text(s.menuBarText(mock: store.mockScenario != nil)).monospacedDigit()
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel((store.insight?.compactLabel ?? HazeCompute.accessibleLabel(s)) + (store.mockScenario != nil ? ", mock data" : ""))
        } else {
            // No data yet / loading: the brand template mark (brand/png/menubar-template-18/36.png).
            Image("MenubarTemplate")
                .renderingMode(.template)
                .accessibilityLabel("HazeNow, loading")
        }
    }
}

enum MenuBarDot {
    private static var cache: [String: NSImage] = [:]

    static func image(hex: String, stale: Bool) -> NSImage {
        let key = "\(hex)-\(stale)"
        if let img = cache[key] { return img }
        let img = NSImage(size: NSSize(width: 10, height: 10), flipped: false) { rect in
            let c = Band.rgb(hex: hex)
            NSColor(srgbRed: c.red, green: c.green, blue: c.blue, alpha: stale ? 0.45 : 1).setFill()
            NSBezierPath(ovalIn: rect.insetBy(dx: 1, dy: 1)).fill()
            return true
        }
        img.isTemplate = false
        cache[key] = img
        return img
    }

    static func image(for band: Band, stale: Bool) -> NSImage {
        let key = "\(band.rawValue)-\(stale)"
        if let img = cache[key] { return img }
        let size = NSSize(width: 10, height: 10)
        let img = NSImage(size: size, flipped: false) { rect in
            let c = band.rgb
            let color = NSColor(srgbRed: c.red, green: c.green, blue: c.blue, alpha: stale ? 0.45 : 1)
            color.setFill()
            NSBezierPath(ovalIn: rect.insetBy(dx: 1, dy: 1)).fill()
            return true
        }
        img.isTemplate = false
        img.accessibilityDescription = band.label
        cache[key] = img
        return img
    }
}

// MARK: - Launch at login

enum LaunchAtLogin {
    static var isEnabled: Bool { SMAppService.mainApp.status == .enabled }

    /// Returns an error message if the change failed (e.g. unsigned dev builds).
    @discardableResult
    static func set(_ enabled: Bool) -> String? {
        do {
            if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            return nil
        } catch {
            return "Couldn't change login item: \(error.localizedDescription)"
        }
    }
}
