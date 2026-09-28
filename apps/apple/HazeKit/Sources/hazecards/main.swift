#if os(macOS)
import AppKit
import HazeKit
import HazeUI
import SwiftUI

// Exports share cards 1–4 and 6 (link preview) for every mock scenario and persona, at exact pixel sizes.
//   swift run hazecards <dir>            every card (scenarios × cards, personas, all-clear, long names) + INDEX.tsv
//   swift run hazecards --docs <dir>     only the 6 representative cards committed in apps/apple/docs/cards
@MainActor
func run() throws {
    var args = Array(CommandLine.arguments.dropFirst())
    let docsOnly = args.first == "--docs"
    if docsOnly { args.removeFirst() }
    let out = URL(fileURLWithPath: args.first ?? "cards")
    try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    HazeFonts.register()
    var report: [String] = []

    func write(_ c: ShareCardContent, _ name: String) {
        let view = ShareCardView(content: c)
        guard let cg = view.cgImage(), let png = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:]) else {
            print("FAILED \(name)"); return
        }
        try? png.write(to: out.appendingPathComponent(name))
        let expected = view.pixelSize
        let ok = cg.width == Int(expected.width) && cg.height == Int(expected.height)
        report.append("\(name)\t\(cg.width)x\(cg.height)\(ok ? "" : "\tWRONG SIZE")")
    }

    func snapshot(_ scenario: String, _ location: LocationInput) throws -> Snapshot {
        let m = try HazeMock.load(scenario)
        return HazeCompute.snapshot(data: m.data, location: location, now: m.now)!
    }

    let tampines = LatLonPoint(lat: 1.3526, lon: 103.9447)
    let cck = LatLonPoint(lat: 1.3840, lon: 103.7470)
    func gps(_ p: LatLonPoint) -> LocationInput { .gps(lat: p.lat, lon: p.lon) }

    func allClearSnapshot() throws -> Snapshot {
        var s = try snapshot("high", gps(tampines))
        let tail = [96, 61, 38, 22]
        for (i, v) in tail.enumerated() { s.history[s.history.count - tail.count + i].pm25 = v }
        s.pm25 = 22; s.band = .normal; s.trend = Trend(delta: -16)
        return s
    }

    if docsOnly {
        let tctx = ShareContext(placeName: "Tampines", point: tampines)
        let cctx = ShareContext(placeName: "Choa Chu Kang", point: cck)
        let elevated = try snapshot("elevated", gps(tampines))
        write(ShareCardContent(card: .now, elevated, context: tctx), "now-elevated.png")
        write(ShareCardContent(card: .clocks, elevated, context: tctx), "clocks-elevated.png")
        write(ShareCardContent(.preview, elevated, context: tctx), "linkpreview-elevated.png")
        write(ShareCardContent(card: .group, try snapshot("very_high", gps(cck)), profile: [.kids], context: cctx), "group-kids-very_high.png")
        write(ShareCardContent(card: .clear, try allClearSnapshot(), context: tctx), "clear.png")
        write(ShareCardContent(card: .now, try snapshot("very_high", gps(cck)), profile: [.elderly], context: cctx), "longname-now-very_high.png")
        print(report.joined(separator: "\n"))
        return
    }

    // Every scenario × every eligible card (+ link preview), as a GPS user in Tampines
    // (south_offline as a South region user, which falls back to the island average).
    for sc in HazeMock.scenarios where sc != "network_error" {
        let south = sc == "south_offline"
        let s = try snapshot(sc, south ? .region("south") : gps(tampines))
        let ctx = south ? ShareContext() : ShareContext(placeName: "Tampines", point: tampines)
        let pick = HazeShare.pickShareCard(s, profile: [Profile.general], context: ctx)
        for card in ShareCardKind.allCases where pick.all.contains(card) || card == .group {
            write(ShareCardContent(card: card, s, profile: [.general], context: ctx), "\(sc)-\(card.rawValue).png")
        }
        write(ShareCardContent(.preview, s, profile: [.general], context: ctx), "\(sc)-preview.png")
    }

    // Each persona's group card, Elevated and Very High, with a long area name.
    for persona in Profile.sharePersonaPriority {
        for sc in ["elevated", "very_high"] {
            let s = try snapshot(sc, gps(cck))
            let c = ShareCardContent(card: .group, s, profile: [persona], context: ShareContext(placeName: "Choa Chu Kang", point: cck))
            write(c, "persona-\(persona.rawValue)-\(sc).png")
        }
    }

    // All clear: an episode that just ended (synthesised from the high scenario's last hours).
    let s = try allClearSnapshot()
    for (slug, name, p) in [("tampines", "Tampines", tampines), ("choa-chu-kang", "Choa Chu Kang", cck)] {
        write(ShareCardContent(card: .clear, s, profile: [.general], context: ShareContext(placeName: name, point: p)), "all_clear-\(slug).png")
    }

    // Widest case: Very High 3-digit + "Choa Chu Kang" on every card.
    let wide = try snapshot("very_high", gps(cck))
    let wctx = ShareContext(placeName: "Choa Chu Kang", point: cck)
    for card in [ShareCardKind.now, .clocks, .group] {
        write(ShareCardContent(card: card, wide, profile: [.elderly], context: wctx), "longname-\(card.rawValue).png")
    }
    write(ShareCardContent(.preview, wide, profile: [.elderly], context: wctx), "longname-preview.png")

    try (report.joined(separator: "\n") + "\n").write(to: out.appendingPathComponent("INDEX.tsv"), atomically: true, encoding: .utf8)
    print(report.joined(separator: "\n"))
}

MainActor.assumeIsolated { try! run() }
#else
print("hazecards runs on macOS only")
#endif
