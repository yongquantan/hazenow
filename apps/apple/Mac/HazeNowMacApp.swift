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
