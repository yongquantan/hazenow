import AppKit
import HazeKit
import HazeUI
import SwiftUI
import UserNotifications

/// Dev aid: with HAZENOW_DEBUG_DIR set, each new snapshot is written as JSON and the menu bar label,
/// popover content and notch pill are rendered to PNGs (useful where screen recording isn't permitted).
@MainActor
enum DebugRender {
    static func write(snapshot: Snapshot, store: HazeStore, notch: NotchController, to dir: URL) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let json = try? Snapshot.jsonEncoder(pretty: true).encode(snapshot) {
            try? json.write(to: dir.appendingPathComponent("snapshot.json"))
        }
        let line = "\(snapshot.compactText)  [\(snapshot.band.label)] \(snapshot.placeText) \(snapshot.asOfText)\n"
        try? line.write(to: dir.appendingPathComponent("menubar.txt"), atomically: true, encoding: .utf8)
        FileHandle.standardOutput.write(Data(("HazeNow menu bar: " + line).utf8))

        let windows = NSApp.windows.map { w in
            "\(type(of: w)) frame=\(w.frame) visible=\(w.isVisible) onActiveSpace=\(w.isOnActiveSpace) occluded=\(!w.occlusionState.contains(.visible))"
        }.joined(separator: "\n")
        try? windows.write(to: dir.appendingPathComponent("windows.txt"), atomically: true, encoding: .utf8)
        png(MenuBarLabel(store: store)
                .padding(.horizontal, 8).frame(height: 24)
                .background(Color(nsColor: .windowBackgroundColor)),
            dir.appendingPathComponent("menubar.png"))
        png(HazeDetailContent(store: store).padding(16).frame(width: 380)
                .background(Color(nsColor: .windowBackgroundColor)),
            dir.appendingPathComponent("popover.png"))
        png(NotchView(store: store, controller: notch).background(Color.gray),
            dir.appendingPathComponent("notch.png"))
    }

    /// Stress test for the notch panel: expand/collapse repeatedly (HAZENOW_DEBUG_NOTCH_CYCLE=1).
    static func cycleNotch(_ notch: NotchController, count: Int = 40) {
        var n = 0
        Timer.scheduledTimer(withTimeInterval: 0.35, repeats: true) { timer in
            MainActor.assumeIsolated {
                n += 1
                notch.debugToggle()
                FileHandle.standardOutput.write(Data("notch cycle \(n) expanded=\(notch.isExpanded)\n".utf8))
                if n >= count { timer.invalidate() }
            }
        }
    }

    /// Stress test for the MenuBarExtra popover: click the status item repeatedly (HAZENOW_DEBUG_POPOVER_CYCLE=1).
    static func cyclePopover(count: Int = 20) {
        var n = 0
        Timer.scheduledTimer(withTimeInterval: 1.2, repeats: true) { timer in
            MainActor.assumeIsolated {
                n += 1
                let open = NSApp.windows.filter { $0.isVisible && !String(describing: type(of: $0)).contains("StatusBar") && !($0 is NotchPanel) }
                let button = NSApp.windows
                    .filter { String(describing: type(of: $0)).contains("StatusBarWindow") }
                    .compactMap { $0.contentView.flatMap(findButton) }
                    .first
                button?.performClick(nil)
                FileHandle.standardOutput.write(Data("popover cycle \(n) button=\(button != nil) openWindows=\(open.map { "\(type(of: $0)) \($0.frame.size)" })\n".utf8))
                if n >= count { timer.invalidate() }
            }
        }
    }

    private static func findButton(_ v: NSView) -> NSStatusBarButton? {
        if let b = v as? NSStatusBarButton { return b }
        for sub in v.subviews { if let b = findButton(sub) { return b } }
        return nil
    }

    /// Exercises the exact "Yes, notify me" path (HAZENOW_DEBUG_NOTIFY_YES=<dir>) and logs every state.
    static func tapNotifyYes(store: HazeStore, notch: NotchController, dir: URL) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        func log(_ line: String) {
            FileHandle.standardOutput.write(Data("notify: \(line)\n".utf8))
            let url = dir.appendingPathComponent("notify.log")
            let old = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            try? (old + line + "\n").write(to: url, atomically: true, encoding: .utf8)
        }
        Task { @MainActor in
            while store.snapshot == nil { try? await Task.sleep(for: .milliseconds(300)) }
            await store.refreshNotifyStatus()
            log("before: band=\(store.snapshot!.band.rawValue) shouldAsk=\(store.shouldAskNotify) status=\(store.notifyStatus) asked=\(store.notifyAsked)")
            png(HazeDetailContent(store: store).padding(16).frame(width: 380).background(Color(nsColor: .windowBackgroundColor)),
                dir.appendingPathComponent("before.png"))
            await store.answerNotifyAsk(true)
            log("after: result=\(String(describing: store.notifyAskResult)) status=\(store.notifyStatus) notifyOnRise=\(store.notifyOnRise) shouldAsk=\(store.shouldAskNotify) asked=\(store.notifyAsked)")
            png(HazeDetailContent(store: store).padding(16).frame(width: 380).background(Color(nsColor: .windowBackgroundColor)),
                dir.appendingPathComponent("after.png"))
            let pending = await UNUserNotificationCenter.current().deliveredNotifications()
            log("delivered notifications: \(pending.map(\.request.identifier))")
        }
    }

    private static func png(_ view: some View, _ url: URL) {
        let r = ImageRenderer(content: view)
        r.scale = 2
        guard let cg = r.cgImage else { return }
        let rep = NSBitmapImageRep(cgImage: cg)
        try? rep.representation(using: .png, properties: [:])?.write(to: url)
    }
}
