import CoreTransferable
import HazeKit
import SwiftUI
import UniformTypeIdentifiers
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

#if !os(watchOS)

/// A rendered card: PNG bytes + the time-stamped filename (SPEC v1.6 / SHARING §4.1).
public struct ShareCardFile: Transferable, Sendable {
    public var png: Data
    public var filename: String

    public static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .png) { $0.png }
            .suggestedFileName { $0.filename }
    }

    /// Writes the PNG to a temp file named `filename` (for NSSharingServicePicker / file-based sharing).
    public func temporaryURL() throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("HazeNowShare", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(filename)
        try png.write(to: url, options: .atomic)
        return url
    }
}

/// Everything the composer needs, built from the store.
@MainActor
public struct ShareModel {
    public var pick: SharePick
    public var contents: [ShareCardContent]

    public init?(store: HazeStore, fromWhyTwoNumbers: Bool = false) {
        guard let s = store.snapshot else { return nil }
        let profiles = store.profiles
        let point = store.locationInput.coordinate.map { LatLonPoint(lat: $0.lat, lon: $0.lon) }
        // Name a GPS spot by its nearest planning area ("Tampines"); areas/saved places use their own name.
        var placeName = store.resolved.name.flatMap { SGAreas.named($0)?.name ?? $0 }
        if placeName == nil, case .gps = s.locationMode, let p = point {
            placeName = SGAreas.nearest(lat: p.lat, lon: p.lon)?.name
        }
        let ctx = ShareContext(placeName: placeName, point: point, fromWhyTwoNumbers: fromWhyTwoNumbers)
        pick = HazeShare.pickShareCard(s, profile: profiles, context: ctx)
        contents = pick.all.map { ShareCardContent(card: $0, s, profile: profiles, context: ctx) }
    }
}

/// Preview of the auto-picked card, a swipeable row of eligible alternates, and one Share action.
public struct ShareComposer: View {
    let model: ShareModel
    var onDone: (() -> Void)?
    @State private var selection = 0
    @State private var rendered: [Int: ShareCardFile] = [:]

    public init(model: ShareModel, onDone: (() -> Void)? = nil) {
        self.model = model
        self.onDone = onDone
    }

    private var current: ShareCardContent { model.contents[selection] }

    public var body: some View {
        VStack(spacing: 16) {
            #if os(iOS)
            TabView(selection: $selection) {
                ForEach(Array(model.contents.enumerated()), id: \.offset) { i, c in
                    CardPreview(content: c).tag(i).padding(.horizontal, 8)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .indexViewStyle(.page(backgroundDisplayMode: .always))
            #else
            CardPreview(content: current).frame(maxHeight: 360)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(model.contents.enumerated()), id: \.offset) { i, c in
                        Button { selection = i } label: {
                            VStack(spacing: 4) {
                                CardPreview(content: c).frame(width: 72)
                                Text(c.shareCard?.title ?? "").font(.haze(.caption2))
                            }
                            .padding(4)
                            .background(RoundedRectangle(cornerRadius: 8).strokeBorder(i == selection ? Color.accentColor : .clear, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            #endif
            Text((current.shareCard?.title ?? "") + (selection == 0 ? " · picked for now" : ""))
                .font(.haze(.caption)).foregroundStyle(.secondary)
            shareButton
        }
        .task(id: selection) { render(selection) }
    }

    @ViewBuilder
    private var shareButton: some View {
        let c = current
        let message = "\(c.shareText)\n\(c.url.absoluteString)"
        if let file = rendered[selection] {
            #if os(iOS)
            ShareLink(item: file, subject: Text("HazeNow"), message: Text(message),
                      preview: SharePreview(c.shareCard?.title ?? "HazeNow", image: Image(uiImage: UIImage(data: file.png) ?? UIImage()))) {
                Label("Share", systemImage: "square.and.arrow.up").font(.haze(.headline, weight: .semibold)).frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            #else
            SharingPickerButton(title: "Share…", items: {
                var items: [Any] = []
                if let url = try? file.temporaryURL() { items.append(url) }
                items.append(message)
                return items
            })
            .frame(height: 30)
            #endif
        } else {
            ProgressView().controlSize(.small)
        }
    }

    private func render(_ i: Int) {
        guard rendered[i] == nil, model.contents.indices.contains(i) else { return }
        let c = model.contents[i]
        if let png = ShareCardView(content: c).pngData() {
            rendered[i] = ShareCardFile(png: png, filename: c.filename)
        }
    }
}

/// The card view scaled to fit, rendered live (crisp at any size).
struct CardPreview: View {
    let content: ShareCardContent
    var body: some View {
        let size = ShareCardView.size
        GeometryReader { geo in
            let k = min(geo.size.width / size.width, geo.size.height / size.height)
            ShareCardView(content: content)
                .frame(width: size.width, height: size.height)
                .scaleEffect(k, anchor: .topLeading)
                .frame(width: size.width * k, height: size.height * k, alignment: .topLeading)
                .clipShape(RoundedRectangle(cornerRadius: 24 * k * 2))
                .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .aspectRatio(size.width / size.height, contentMode: .fit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(content.shareCard?.title ?? "Share") card: \(content.headline.replacingOccurrences(of: "\n", with: " ")) PM2.5 \(content.pm25), \(content.band.label). \(content.hook)")
    }
}

#if os(macOS)
/// NSSharingServicePicker anchored to a native button.
public struct SharingPickerButton: NSViewRepresentable {
    var title: String
    var items: () -> [Any]

    public init(title: String, items: @escaping () -> [Any]) {
        self.title = title
        self.items = items
    }

    public func makeNSView(context: Context) -> NSButton {
        let b = NSButton(title: title, target: context.coordinator, action: #selector(Coordinator.show(_:)))
        b.bezelStyle = .push
        b.keyEquivalent = "\r"
        b.image = NSImage(systemSymbolName: "square.and.arrow.up", accessibilityDescription: nil)
        b.imagePosition = .imageLeading
        return b
    }

    public func updateNSView(_ nsView: NSButton, context: Context) {
        context.coordinator.items = items
    }

    public func makeCoordinator() -> Coordinator { Coordinator(items: items) }

    @MainActor
    public final class Coordinator: NSObject {
        var items: () -> [Any]
        init(items: @escaping () -> [Any]) { self.items = items }
        @objc func show(_ sender: NSButton) {
            NSSharingServicePicker(items: items()).show(relativeTo: sender.bounds, of: sender, preferredEdge: .minY)
        }
    }
}
#endif

// MARK: - About (v1.6 credit link)

/// COPY §18, verbatim.
public struct AboutView: View {
    public init() {}
    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("About HazeNow").hazeHeadline(.title3)
            Text("I built HazeNow because the number most of us check during a haze, the 24-hr PSI, moves slowly. NEA also publishes the last hour's PM2.5, and recommends it for deciding what to do right now. HazeNow puts that number first, in plain words, using only NEA's data.")
                .font(.haze(.callout))
            Text("It's free and open source (MIT). No ads, no accounts, and we never track you. We only count things in total, like visits, downloads and shares — never who did them. Your location stays on your phone.")
                .font(.haze(.callout))
            Text("— \(ShareCredit.name)").font(.haze(.callout, weight: .semibold))
            VStack(alignment: .leading, spacing: 12) {
                Link(destination: ShareCredit.linkedIn) { Label("LinkedIn", systemImage: "person.crop.square") }
                VStack(alignment: .leading, spacing: 2) {
                    Link(destination: ShareCredit.kairosLabs) { Label("Kairos Labs · kairoslabs.sg", systemImage: "building.2") }
                    Text("I run Kairos Labs, an applied AI studio.").font(.haze(.caption)).foregroundStyle(.secondary)
                }
                Link(destination: ShareCredit.gitHub) { Label("Source code on GitHub", systemImage: "chevron.left.forwardslash.chevron.right") }
            }
            .font(.haze(.body, weight: .semibold))
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// "Made by Yong Quan Tan" footer link.
public struct MadeByButton: View {
    var action: () -> Void
    public init(action: @escaping () -> Void) { self.action = action }
    public var body: some View {
        Button(action: action) {
            Text("Made by \(ShareCredit.name)").font(.haze(.caption2)).underline()
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
    }
}

#endif
