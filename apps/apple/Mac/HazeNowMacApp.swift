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
        store.onSnapshot = { [weak self] snap in
            WidgetCenter.shared.reloadAllTimelines()
            if let self, let dir = ProcessInfo.processInfo.environment["HAZENOW_DEBUG_DIR"] {
                DebugRender.write(snapshot: snap, store: self.store, notch: self.notch, to: URL(fileURLWithPath: dir))
            }
        }
        store.start()
        notch.setEnabled(store.settings.showNotch)
        if ProcessInfo.processInfo.environment["HAZENOW_DEBUG_NOTCH_CYCLE"] != nil {
            DebugRender.cycleNotch(notch)
        }
        if ProcessInfo.processInfo.environment["HAZENOW_DEBUG_POPOVER_CYCLE"] != nil {
            DebugRender.cyclePopover()
        }
    }
}

/// `● 105 ▲` — dot tinted by band. The dot is a non-template image so it keeps its color
/// in the (otherwise monochrome) menu bar; the text follows the menu bar appearance.
struct MenuBarLabel: View {
    let store: HazeStore

    var body: some View {
        if let s = store.snapshot {
            HStack(spacing: 3) {
                Image(nsImage: MenuBarDot.image(for: s.band, stale: s.stale))
                Text(s.compactValueText).monospacedDigit()
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(store.insight?.compactLabel ?? HazeCompute.accessibleLabel(s))
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
