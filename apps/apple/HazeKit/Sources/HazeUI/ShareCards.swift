import HazeKit
import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// SPEC v1.6 share cards 1–4 and 6, laid out 1:1 from docs/share-cards/*.html.
// Views are sized in points equal to the target pixels (1080×1350, 1200×630) and rendered with
// ImageRenderer at scale = pixelWidth / viewWidth = 1, so output is exact regardless of screen DPR.
// Type uses fixed sizes (no Dynamic Type) in Apfel Grotezk.

public extension Font {
    /// Fixed-size brand font for images (ignores Dynamic Type).
    static func hazeFixed(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        HazeFonts.register()
        let name = switch weight {
        case .bold, .heavy, .black: HazeFontFiles.fett
        case .medium, .semibold: HazeFontFiles.mittel
        default: HazeFontFiles.regular
        }
        return .custom(name, fixedSize: size)
    }
}

enum CardColor {
    static let ink = Color.rgb("#14232B")
    static let ivory = Color.rgb("#F5F0E6")
    static let paper = Color.rgb("#F3F1EC")
    static let mist = Color.rgb("#9FB3BB")
    static let slate = Color.rgb("#3D4F57")
    static let slate2 = Color.rgb("#4A5C64")
    static let body = Color.rgb("#24363E")
    static let rule = Color.rgb("#D9D4C9")
    static let cardBorder = Color.rgb("#E2DDD2")
    static let clearBg = Color.rgb("#EEF3EC")
    static let clearRule = Color.rgb("#C9D6C8")
    static let darkMuted = Color.rgb("#C9D5DA")
    static let darkBody = Color.rgb("#D5DEE1")
    static let darkRule = Color.rgb("#2E4550")
    static let darkBorder = Color.rgb("#3A5260")
    static let darkBar = Color.rgb("#4E6874")
}

/// The brand mark with explicit colours (cards don't follow the device appearance).
struct CardMark: View {
    var dot: Color
    var lines: Color
    var size: CGFloat

    var body: some View {
        Canvas { ctx, sz in
            let k = sz.width / 100
            func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat) -> Path {
                Path(roundedRect: CGRect(x: x * k, y: y * k, width: w * k, height: 7.5 * k), cornerRadius: 3.75 * k)
            }
            ctx.fill(Path(ellipseIn: CGRect(x: 33 * k, y: 21 * k, width: 34 * k, height: 34 * k)), with: .color(dot))
            ctx.fill(r(17, 61, 66), with: .color(lines))
            ctx.fill(r(27, 73.5, 46), with: .color(lines.opacity(0.7)))
            ctx.fill(r(38, 86, 24), with: .color(lines.opacity(0.45)))
        }
        .frame(width: size, height: size)
    }
}

/// Shared card chrome: 1080×1350, padding 80/84/72, sections spread vertically.
struct CardFrame<Content: View>: View {
    var background: Color
    var foreground: Color
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(.top, 80).padding(.horizontal, 84).padding(.bottom, 72)
            .frame(width: ShareCardView.size.width, height: ShareCardView.size.height, alignment: .topLeading)
            .background(background)
            .foregroundStyle(foreground)
    }
}

struct CardHeader: View {
    var dot: Color
    var lines: Color
    var right: String
    var rightColor: Color?
    var rightWeight: Font.Weight = .medium

    var body: some View {
        HStack {
            HStack(spacing: 14) {
                CardMark(dot: dot, lines: lines, size: 52)
                Text("HazeNow").font(.hazeFixed(34, .bold)).tracking(-0.68)
            }
            Spacer()
            Text(right).font(.hazeFixed(30, rightWeight)).foregroundStyle(rightColor ?? .primary)
                .cardLine()
        }
    }
}

/// Big headline with tight tracking; shrinks to fit so long headlines never clip.
struct CardHeadline: View {
    var text: String
    var size: CGFloat
    var tracking: CGFloat = -0.045
    var lines: Int = 3

    var body: some View {
        Text(text)
            .font(.hazeFixed(size, .medium))
            .tracking(tracking * size)
            .lineLimit(lines)
            .minimumScaleFactor(0.45)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, size * 0.04)
    }
}

// Note: no tight line-height. `.lineHeight(.multiple(...))` (iOS/macOS 26) clips descenders of a
// single-line headline on iOS, which would ship clipped images. Default leading never clips.

extension View {
    /// Single line that shrinks horizontally but never gets squeezed vertically.
    func cardLine(_ minScale: CGFloat = 0.6) -> some View {
        lineLimit(1).minimumScaleFactor(minScale).fixedSize(horizontal: false, vertical: true)
    }
}

struct CardFooter: View {
    var left: [String]
    var rule: Color
    var color: Color
    var leftBold: String?

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(rule).frame(height: 2)
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    if let leftBold {
                        Text(leftBold).font(.hazeFixed(30, .bold)).foregroundStyle(.primary)
                    }
                    ForEach(left, id: \.self) { Text($0) }
                }
                Spacer(minLength: 24)
                VStack(alignment: .trailing, spacing: 4) {
                    Text("Free and open source")
                    Text("Made by \(ShareCredit.name)")
                }
                .multilineTextAlignment(.trailing)
            }
            .font(.hazeFixed(24))
            .foregroundStyle(color)
            .cardLine(0.7)
            .padding(.top, 28)
        }
    }
}

// MARK: - Card 1 · Now

struct NowCard: View {
    let c: ShareCardContent

    var body: some View {
        CardFrame(background: CardColor.paper, foreground: CardColor.ink) {
            CardHeader(dot: c.band.color, lines: CardColor.ink, right: c.site)
            Spacer(minLength: 20)
            VStack(alignment: .leading, spacing: 28) {
                Text(c.hook).font(.hazeFixed(34, .medium)).foregroundStyle(CardColor.slate).cardLine()
                CardHeadline(text: c.headline, size: 132, lines: 2)
                HStack(alignment: .firstTextBaseline, spacing: 20) {
                    Circle().fill(c.band.color).frame(width: 28, height: 28).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 2 }
                    Text("\(c.pm25)").font(.hazeFixed(88, .bold)).tracking(-3.5)
                    Text(c.pmDetail).font(.hazeFixed(32)).foregroundStyle(CardColor.slate)
                        .cardLine()
                }
            }
            Spacer(minLength: 20)
            VStack(alignment: .leading, spacing: 24) {
                Text(c.adviceLabel.uppercased()).font(.hazeFixed(24, .bold)).tracking(1.9).foregroundStyle(CardColor.slate2)
                adviceRow("Most people", c.adviceMost)
                adviceRow("Elderly, children, pregnant, heart or lung conditions", c.adviceVulnerable)
            }
            .padding(.vertical, 40).padding(.horizontal, 44)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 28).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: 28).strokeBorder(CardColor.cardBorder, lineWidth: 2))
            Spacer(minLength: 20)
            Text(c.psiLine).font(.hazeFixed(30)).lineSpacing(12).foregroundStyle(CardColor.body)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 20)
            CardFooter(left: ["Data: NEA via data.gov.sg", c.station], rule: CardColor.rule, color: CardColor.slate)
        }
    }

    private func adviceRow(_ who: String, _ what: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(who).font(.hazeFixed(28)).foregroundStyle(CardColor.slate).fixedSize(horizontal: false, vertical: true)
            Text(what).font(.hazeFixed(40, .medium)).tracking(-0.4).lineLimit(2).minimumScaleFactor(0.7).fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Card 2 · Two clocks

struct ClocksCard: View {
    let c: ShareCardContent

    var body: some View {
        CardFrame(background: CardColor.ink, foreground: CardColor.ivory) {
            // A stale place line is long ("… reading from … (latest available)"): give it its own row.
            CardHeader(dot: c.band.color, lines: CardColor.mist, right: c.stale ? "" : c.placeLine, rightColor: CardColor.darkMuted, rightWeight: .regular)
            if c.stale {
                Text(c.placeLine).font(.hazeFixed(28)).foregroundStyle(CardColor.darkMuted).cardLine().padding(.top, 20)
            }
            Spacer(minLength: 16)
            CardHeadline(text: c.headline, size: c.stale ? 104 : 120, lines: 2)
            Spacer(minLength: c.stale ? 20 : 28)
            HStack(alignment: .top, spacing: 28) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(c.lastHourLabel).font(.hazeFixed(28, .medium))
                    Text("\(c.pm25)").font(.hazeFixed(144, .bold)).tracking(-7.2).cardLine(0.5).padding(.vertical, -18)
                    Text("µg/m³ PM2.5").font(.hazeFixed(26)).foregroundStyle(CardColor.slate)
                    HStack(spacing: 10) {
                        Circle().fill(c.band.color).frame(width: 18, height: 18)
                        Text(c.band.label).font(.hazeFixed(30, .bold))
                    }
                    .padding(.top, 6)
                }
                .foregroundStyle(CardColor.ink)
                .padding(36)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 28).fill(CardColor.ivory))
                VStack(alignment: .leading, spacing: 10) {
                    Text("The last 24 hours").font(.hazeFixed(28, .medium)).foregroundStyle(CardColor.darkMuted)
                    Text(c.avg.map(String.init) ?? "–").font(.hazeFixed(144, .bold)).tracking(-7.2).foregroundStyle(CardColor.darkMuted)
                        .cardLine(0.5).padding(.vertical, -18)
                    Text("µg/m³ PM2.5, averaged").font(.hazeFixed(26)).foregroundStyle(CardColor.mist)
                    Text(c.psi.map { "24-hr PSI \($0)" } ?? "24-hr PSI –").font(.hazeFixed(30, .bold)).padding(.top, 6)
                }
                .padding(36)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(RoundedRectangle(cornerRadius: 28).strokeBorder(CardColor.darkBorder, lineWidth: 2))
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 16)
            chart
            Spacer(minLength: 16)
            Text(c.caption).font(.hazeFixed(30)).lineSpacing(12).foregroundStyle(CardColor.darkBody)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 16)
            CardFooter(left: ["Data: NEA via data.gov.sg"], rule: CardColor.darkRule, color: CardColor.darkMuted, leftBold: c.site)
        }
    }

    private var chart: some View {
        let bars = Array(c.bars.suffix(24))
        let peak = CGFloat(max(bars.max() ?? 1, c.avg ?? 0, 1))
        let band = c.band.color
        let avg = c.avg
        return VStack(spacing: 14) {
            Canvas { ctx, size in
                let plot: CGFloat = size.height - 10
                let gap: CGFloat = 8
                let n = CGFloat(max(bars.count, 1))
                let w = (size.width - gap * (n - 1)) / n
                for (i, v) in bars.enumerated() {
                    let h = max(4, CGFloat(v) / peak * plot)
                    let rect = CGRect(x: CGFloat(i) * (w + gap), y: size.height - h, width: w, height: h)
                    let path = Path(roundedRect: rect, cornerRadii: RectangleCornerRadii(topLeading: 5, topTrailing: 5))
                    ctx.fill(path, with: .color(i == bars.count - 1 ? band : CardColor.darkBar))
                }
                if let avg {
                    let y = size.height - CGFloat(avg) / peak * plot
                    var line = Path()
                    line.move(to: CGPoint(x: 0, y: y))
                    line.addLine(to: CGPoint(x: size.width, y: y))
                    ctx.stroke(line, with: .color(CardColor.ivory), style: StrokeStyle(lineWidth: 4, dash: [14, 10]))
                    let label = ctx.resolve(Text("24-hr average").font(.hazeFixed(22, .bold)).foregroundStyle(CardColor.ivory))
                    let ls = label.measure(in: size)
                    let ly = max(0, y - 12 - ls.height)
                    ctx.fill(Path(CGRect(x: 0, y: ly - 2, width: ls.width + 8, height: ls.height + 4)), with: .color(CardColor.ink))
                    ctx.draw(label, at: CGPoint(x: 0, y: ly), anchor: .topLeading)
                }
                var axis = Path()
                axis.addRect(CGRect(x: 0, y: size.height - 1.5, width: size.width, height: 3))
                ctx.fill(axis, with: .color(CardColor.mist))
            }
            .frame(height: c.stale ? 160 : 200)
            HStack {
                Text("24 hours ago").foregroundStyle(CardColor.mist)
                Spacer()
                Text(c.axisEnd).font(.hazeFixed(22, .bold))
            }
            .font(.hazeFixed(22))
        }
    }
}

// MARK: - Card 3 · For our group

struct GroupCard: View {
    let c: ShareCardContent

    var body: some View {
        CardFrame(background: CardColor.ivory, foreground: CardColor.ink) {
            CardHeader(dot: c.band.color, lines: CardColor.ink, right: c.site)
            Spacer(minLength: 20)
            VStack(alignment: .leading, spacing: 28) {
                Text(c.chip ?? "For our group")
                    .font(.hazeFixed(30, .bold))
                    .foregroundStyle(CardColor.ivory)
                    .padding(.horizontal, 28).padding(.vertical, 12)
                    .background(Capsule().fill(CardColor.ink))
                Text(c.placeLine).font(.hazeFixed(32, .medium)).foregroundStyle(CardColor.slate).cardLine()
                CardHeadline(text: c.headline, size: 136, lines: 3)
                HStack(spacing: 16) {
                    Circle().fill(c.band.color).frame(width: 24, height: 24)
                    Text("PM2.5 \(c.pm25)").font(.hazeFixed(34, .bold))
                    Text(c.statsRest).font(.hazeFixed(34)).foregroundStyle(CardColor.slate)
                        .cardLine()
                }
            }
            Spacer(minLength: 20)
            VStack(alignment: .leading, spacing: 18) {
                Rectangle().fill(CardColor.rule).frame(height: 2).padding(.bottom, 14)
                ForEach(Array(c.actions.enumerated()), id: \.offset) { i, line in
                    HStack(alignment: .firstTextBaseline, spacing: 20) {
                        Text("\(i + 1)").font(.hazeFixed(36, .bold)).foregroundStyle(CardColor.mist).frame(width: 26, alignment: .leading)
                        Text(line).font(.hazeFixed(36)).lineSpacing(10).lineLimit(2).minimumScaleFactor(0.7)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            Spacer(minLength: 20)
            CardFooter(left: ["Based on NEA’s 1-hr PM2.5 advice", "Data: NEA via data.gov.sg · \(c.station)"],
                       rule: CardColor.rule, color: CardColor.slate)
        }
    }
}

// MARK: - Card 4 · All clear

struct ClearCard: View {
    let c: ShareCardContent

    var body: some View {
        CardFrame(background: CardColor.clearBg, foreground: CardColor.ink) {
            CardHeader(dot: Band.normal.color, lines: CardColor.ink, right: c.site)
            Spacer(minLength: 20)
            VStack(alignment: .leading, spacing: 32) {
                Circle().fill(Band.normal.color).frame(width: 160, height: 160)
                Text(c.placeLine).font(.hazeFixed(34, .medium)).foregroundStyle(CardColor.slate).cardLine()
                CardHeadline(text: c.headline, size: 150, tracking: -0.05, lines: 2)
                Text(c.bodyLines.joined(separator: "\n")).font(.hazeFixed(40)).lineSpacing(12).foregroundStyle(CardColor.body)
            }
            Spacer(minLength: 20)
            VStack(alignment: .leading, spacing: 24) {
                if !c.stats.isEmpty {
                    Text(c.stats).font(.hazeFixed(28)).foregroundStyle(CardColor.slate).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
                CardFooter(left: ["Data: NEA via data.gov.sg"], rule: CardColor.clearRule, color: CardColor.slate)
            }
        }
    }
}

// MARK: - Card 6 · Link preview (1200×630)

struct LinkPreviewCard: View {
    let c: ShareCardContent
    /// Headline from the Now card (link previews always show the Now framing).
    let headline: String

    var body: some View {
        HStack(spacing: 52) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    CardMark(dot: c.band.color, lines: CardColor.ink, size: 40)
                    Text("HazeNow").font(.hazeFixed(26, .bold)).tracking(-0.26)
                }
                Spacer()
                VStack(alignment: .leading, spacing: 16) {
                    Text(c.hook)
                        .font(.hazeFixed(26, .medium)).foregroundStyle(CardColor.slate).cardLine()
                    CardHeadline(text: headline, size: 84, lines: 3)
                }
                Spacer()
                Text("Data: NEA · Free and open source · Made by \(ShareCredit.name)").font(.hazeFixed(22)).foregroundStyle(CardColor.slate)
                    .cardLine(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading) {
                Text("1-hr PM2.5").font(.hazeFixed(24)).foregroundStyle(CardColor.darkMuted)
                Spacer()
                Text("\(c.pm25)").font(.hazeFixed(150, .bold)).tracking(-7.5).cardLine(0.5)
                Spacer()
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 10) {
                        Circle().fill(c.band.color).frame(width: 16, height: 16)
                        Text(c.band.label).font(.hazeFixed(26, .bold))
                        if let d = c.direction { Image(systemName: d.symbolName).font(.system(size: 22, weight: .bold)) }
                    }
                    Text("\(c.psi.map { "24-hr PSI \($0) · " } ?? "")\(c.site)").font(.hazeFixed(22)).foregroundStyle(CardColor.darkMuted)
                }
            }
            .foregroundStyle(CardColor.ivory)
            .padding(38)
            .frame(width: 360, alignment: .leading)
            .frame(maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 28).fill(CardColor.ink))
        }
        .padding(.vertical, 60).padding(.horizontal, 68)
        .frame(width: 1200, height: 630)
        .background(CardColor.paper)
        .foregroundStyle(CardColor.ink)
    }
}

// MARK: - Public API

/// A share card at its native pixel size.
public struct ShareCardView: View {
    public static let size = CGSize(width: 1080, height: 1350)
    public static let linkPreviewSize = CGSize(width: 1200, height: 630)

    public let content: ShareCardContent

    public init(content: ShareCardContent) {
        self.content = content
    }

    var linkPreview: Bool { content.kind == .preview }

    public var body: some View {
        Group {
            switch content.kind {
            case .preview: LinkPreviewCard(c: content, headline: content.headline)
            case .now: NowCard(c: content)
            case .clocks: ClocksCard(c: content)
            case .group: GroupCard(c: content)
            case .clear: ClearCard(c: content)
            }
        }
        .environment(\.colorScheme, .light)
        .environment(\.dynamicTypeSize, .large)
    }

    public var pixelSize: CGSize { linkPreview ? Self.linkPreviewSize : Self.size }

    /// Render to PNG at exactly `pixelSize` (scale = pixel width / view width = 1).
    @MainActor
    public func pngData() -> Data? {
        let renderer = ImageRenderer(content: self.frame(width: pixelSize.width, height: pixelSize.height))
        renderer.scale = pixelSize.width / pixelSize.width
        renderer.proposedSize = ProposedViewSize(pixelSize)
        guard let cg = renderer.cgImage else { return nil }
        #if canImport(UIKit)
        return UIImage(cgImage: cg).pngData()
        #else
        return NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:])
        #endif
    }

    @MainActor
    public func cgImage() -> CGImage? {
        let renderer = ImageRenderer(content: self.frame(width: pixelSize.width, height: pixelSize.height))
        renderer.scale = 1
        return renderer.cgImage
    }
}
