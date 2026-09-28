import AppKit
import HazeKit
import HazeUI
import SwiftUI

// A small pill that hugs the MacBook notch: band icon on the left "ear", `105 ▲` on the right.
// Hovering expands it (downwards, out of the notch) into the full popover content.
// On displays without a notch the panel is not shown — the menu bar item remains.
//
// Layout-loop safety (fix for the "more Update Constraints in Window passes than there are views"
// crash): the panel has ONE fixed frame for its whole life (the expanded size). It is never resized
// on hover. The SwiftUI hosting view is a plain autoresizing subview with `sizingOptions = []`, so
// SwiftUI content can never drive the window size. Collapsed, the panel ignores mouse events (clicks
// fall through the transparent area); hover is detected with mouse-moved monitors instead of
// tracking areas, comparing the pointer to the pill rect.

extension NSScreen {
    /// Notch geometry from the auxiliary areas (the unobscured menu bar regions either side).
    var notchInfo: (width: CGFloat, height: CGFloat)? {
        guard safeAreaInsets.top > 0,
              let left = auxiliaryTopLeftArea, let right = auxiliaryTopRightArea else { return nil }
        let width = frame.width - left.width - right.width
        guard width > 0 else { return nil }
        return (width, safeAreaInsets.top)
    }

    static var notched: NSScreen? { screens.first { $0.notchInfo != nil } }
}

/// Borderless, non-activating, transparent panel above the menu bar.
final class NotchPanel: NSPanel {
    init(frame: NSRect) {
        super.init(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        isFloatingPanel = true
        becomesKeyOnlyIfNeeded = true
        level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 3)
        collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        isMovable = false
        hidesOnDeactivate = false
        ignoresMouseEvents = true
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@MainActor
@Observable
final class NotchController {
    private(set) var isExpanded = false
    private(set) var notchWidth: CGFloat = 200
    private(set) var notchHeight: CGFloat = 32
    var hasNotchedScreen: Bool { NSScreen.notched != nil }

    static let earWidth: CGFloat = 66
    static let expandedSize = CGSize(width: 400, height: 600)
    var collapsedWidth: CGFloat { notchWidth + Self.earWidth * 2 }

    @ObservationIgnored private let store: HazeStore
    @ObservationIgnored private var panel: NotchPanel?
    @ObservationIgnored private var enabled = false
    @ObservationIgnored private var pendingWork: DispatchWorkItem?
    @ObservationIgnored private var screenObserver: NSObjectProtocol?
    @ObservationIgnored private var globalMonitor: Any?
    @ObservationIgnored private var localMonitor: Any?
    /// Screen-space rects, updated in `layout()`.
    @ObservationIgnored private var pillRect: NSRect = .zero
    @ObservationIgnored private var panelRect: NSRect = .zero

    init(store: HazeStore) {
        self.store = store
    }

    func setEnabled(_ on: Bool) {
        enabled = on
        if on {
            if screenObserver == nil {
                screenObserver = NotificationCenter.default.addObserver(
                    forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
                ) { [weak self] _ in
                    MainActor.assumeIsolated { self?.layout() }
                }
            }
            installMonitors()
            layout()
        } else {
            removeMonitors()
            collapseNow()
            panel?.orderOut(nil)
        }
    }

    /// (Re)position for the current notched screen, or hide if there is none. Only called on enable and
    /// on screen-parameter changes — never from a layout pass.
    func layout() {
        guard enabled, let screen = NSScreen.notched, let info = screen.notchInfo else {
            panel?.orderOut(nil)
            return
        }
        notchWidth = info.width
        notchHeight = info.height
        let size = Self.expandedSize
        panelRect = NSRect(x: screen.frame.midX - size.width / 2, y: screen.frame.maxY - size.height,
                           width: size.width, height: size.height)
        pillRect = NSRect(x: screen.frame.midX - collapsedWidth / 2, y: screen.frame.maxY - notchHeight,
                          width: collapsedWidth, height: notchHeight)
        let panel = self.panel ?? makePanel(frame: panelRect)
        if panel.frame != panelRect { panel.setFrame(panelRect, display: false) }
        panel.orderFrontRegardless()
    }

    private func makePanel(frame: NSRect) -> NotchPanel {
        let panel = NotchPanel(frame: frame)
        let container = NSView(frame: NSRect(origin: .zero, size: frame.size))
        container.autoresizingMask = [.width, .height]
        let host = NSHostingView(rootView: NotchView(store: store, controller: self))
        host.sizingOptions = []   // SwiftUI must never size the window
        host.translatesAutoresizingMaskIntoConstraints = true
        host.autoresizingMask = [.width, .height]
        host.frame = container.bounds
        container.addSubview(host)
        panel.contentView = container
        self.panel = panel
        return panel
    }

    // MARK: Hover (mouse-moved monitors; no tracking areas, no frame changes)

    private func installMonitors() {
        guard globalMonitor == nil else { return }
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged]) { [weak self] _ in
            MainActor.assumeIsolated { self?.pointerMoved(NSEvent.mouseLocation) }
        }
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged]) { [weak self] event in
            MainActor.assumeIsolated { self?.pointerMoved(NSEvent.mouseLocation) }
            return event
        }
    }

    private func removeMonitors() {
        if let globalMonitor { NSEvent.removeMonitor(globalMonitor) }
        if let localMonitor { NSEvent.removeMonitor(localMonitor) }
        globalMonitor = nil
        localMonitor = nil
    }

    private func pointerMoved(_ p: NSPoint) {
        guard enabled, panel?.isVisible == true else { return }
        if isExpanded {
            // Keep open while inside the panel (with a small margin), collapse shortly after leaving.
            if panelRect.insetBy(dx: -6, dy: -6).contains(p) {
                pendingWork?.cancel(); pendingWork = nil
            } else if pendingWork == nil {
                schedule(after: 0.3) { [weak self] in
                    guard let self, !self.panelRect.insetBy(dx: -6, dy: -6).contains(NSEvent.mouseLocation) else { return }
                    self.collapseNow()
                }
            }
        } else if pillRect.contains(p) {
            // Hover intent: expand only if the pointer rests on the pill briefly.
            if pendingWork == nil {
                schedule(after: 0.15) { [weak self] in
                    guard let self, self.pillRect.contains(NSEvent.mouseLocation) else { return }
                    self.expandNow()
                }
            }
        } else {
            pendingWork?.cancel(); pendingWork = nil
        }
    }

    private func schedule(after delay: TimeInterval, _ body: @escaping @MainActor () -> Void) {
        pendingWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            MainActor.assumeIsolated {
                self?.pendingWork = nil
                body()
            }
        }
        pendingWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    /// Debug/stress hook (HAZENOW_DEBUG_NOTCH_CYCLE).
    func debugToggle() { isExpanded ? collapseNow() : expandNow() }

    private func expandNow() {
        guard !isExpanded else { return }
        panel?.ignoresMouseEvents = false
        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { isExpanded = true }
    }

    private func collapseNow() {
        pendingWork?.cancel(); pendingWork = nil
        guard isExpanded else { return }
        panel?.ignoresMouseEvents = true
        withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) { isExpanded = false }
    }
}

/// Black notch-extension shape: square top corners (flush with the bezel), rounded bottom.
struct NotchShape: Shape {
    var bottomRadius: CGFloat
    var animatableData: CGFloat {
        get { bottomRadius }
        set { bottomRadius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let r = min(bottomRadius, rect.height / 2, rect.width / 2)
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        p.addQuadCurve(to: CGPoint(x: rect.maxX - r, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        p.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - r), control: CGPoint(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

/// Fills the fixed-size panel; only the black shape inside animates between pill and expanded sizes.
struct NotchView: View {
    let store: HazeStore
    let controller: NotchController

    var body: some View {
        let expanded = controller.isExpanded
        let size = NotchController.expandedSize
        VStack(spacing: 0) {
            ears.frame(width: controller.collapsedWidth, height: controller.notchHeight)
            if expanded {
                ScrollView {
                    HazeDetailContent(store: store, compactChart: true)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 8)
                }
                .scrollIndicators(.never)
                .frame(width: size.width, height: size.height - controller.notchHeight)
                .transition(.opacity)
            }
        }
        .frame(width: expanded ? size.width : controller.collapsedWidth,
               height: expanded ? size.height : controller.notchHeight, alignment: .top)
        .background(NotchShape(bottomRadius: expanded ? 22 : 10).fill(.black))
        .clipShape(NotchShape(bottomRadius: expanded ? 22 : 10))
        .environment(\.colorScheme, .dark)
        .frame(width: size.width, height: size.height, alignment: .top)
    }

    private var ears: some View {
        HStack(spacing: 0) {
            Group {
                if let s = store.snapshot {
                    Image(systemName: s.band.symbolName)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(s.band.color)
                        .opacity(s.stale ? 0.5 : 1)
                } else {
                    Image(systemName: "aqi.medium").font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }
            .frame(width: NotchController.earWidth - 10, alignment: .trailing)
            Spacer(minLength: 0)
            Text((store.snapshot?.compactValueText ?? "—") + (store.mockScenario != nil ? " M" : ""))
                .font(.system(size: 12, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(.white)
                .frame(width: NotchController.earWidth - 8, alignment: .leading)
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(store.snapshot.map(HazeCompute.accessibleLabel) ?? "HazeNow")
    }
}
