import Charts
import HazeKit
import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// MARK: - Colors

extension Color {
    static func rgb(_ hex: String) -> Color {
        let c = Band.rgb(hex: hex)
        return Color(red: c.red, green: c.green, blue: c.blue)
    }

    /// Appearance-adaptive color from two hex values.
    static func adaptive(light: String, dark: String) -> Color {
        #if os(watchOS)
        return .rgb(dark)
        #elseif canImport(UIKit)
        return Color(UIColor { traits in
            let c = Band.rgb(hex: traits.userInterfaceStyle == .dark ? dark : light)
            return UIColor(red: c.red, green: c.green, blue: c.blue, alpha: 1)
        })
        #else
        return Color(NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            let c = Band.rgb(hex: isDark ? dark : light)
            return NSColor(srgbRed: c.red, green: c.green, blue: c.blue, alpha: 1)
        })
        #endif
    }
}

public extension Band {
    /// Brand fill color (SPEC §2). Use for fills, bars and dots — not for text.
    var color: Color { .rgb(hex) }

    /// Text/icon color with ≥4.5:1 contrast in both light and dark mode (SPEC v1.2 §11).
    var textColor: Color { .adaptive(light: lightTextHex, dark: darkTextHex) }

    /// Never color-only (COPY §3): circle, circle-with-bar, triangle, octagon.
    var symbolName: String {
        switch self {
        case .normal: "circle.fill"
        case .elevated: "circle.lefthalf.filled"
        case .high: "triangle.fill"
        case .veryHigh: "octagon.fill"
        }
    }
}

// MARK: - Band chip / dot

/// Band chip: icon + label (never color alone). Stale readings get the outline style + "(old)".
public struct BandChip: View {
    public var band: Band
    public var compact: Bool
    public var stale: Bool

    public init(band: Band, compact: Bool = false, stale: Bool = false) {
        self.band = band
        self.compact = compact
        self.stale = stale
    }

    public var body: some View {
        Label(stale ? "\(band.label) \(HazeCopy.oldSuffix)" : band.label, systemImage: band.symbolName)
            .font(compact ? .caption.weight(.semibold) : .subheadline.weight(.semibold))
            .foregroundStyle(band.textColor)
            .padding(.horizontal, compact ? 6 : 10)
            .padding(.vertical, compact ? 2 : 4)
            .background(Capsule().fill(stale ? Color.clear : band.color.opacity(0.14)))
            .overlay(Capsule().strokeBorder(stale ? band.textColor.opacity(0.7) : .clear, lineWidth: 1))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(stale ? "\(band.label), old reading" : band.label)
    }
}

public struct BandDot: View {
    public var band: Band
    public var size: CGFloat
    public init(band: Band, size: CGFloat = 8) {
        self.band = band
        self.size = size
    }

    public var body: some View {
        Circle().fill(band.color).frame(width: size, height: size).accessibilityHidden(true)
    }
}

/// "MOCK DATA" badge shown whenever a QA scenario is active.
public struct MockBadge: View {
    public var scenario: String?
    public init(scenario: String?) { self.scenario = scenario }

    public var body: some View {
        if let scenario {
            Text("\(HazeCopy.mockBadge) · \(scenario)")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(.white)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Capsule().fill(Color(red: 0.55, green: 0.1, blue: 0.1)))
                .accessibilityLabel("Mock data, scenario \(scenario)")
        }
    }
}

// MARK: - Sparkline (compact widgets / watch)

public struct Sparkline: View {
    public var history: [HistoryPoint]
    public var band: Band

    public init(history: [HistoryPoint], band: Band) {
        self.history = history
        self.band = band
    }

    private var yMax: Int { max(60, Int(Double(history.map(\.pm25).max() ?? 0) * 1.15)) }

    public var body: some View {
        Chart {
            ForEach(history) { p in
                AreaMark(x: .value("Hour", p.time), y: .value("PM2.5", p.pm25))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(LinearGradient(colors: [band.color.opacity(0.35), band.color.opacity(0.02)],
                                                    startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Hour", p.time), y: .value("PM2.5", p.pm25))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(band.textColor)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
        }
        .chartYScale(domain: 0...yMax)
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .accessibilityLabel(HazeCompute.chartSummary(history))
    }
}

// MARK: - Regions (COPY §14)

public struct RegionGrid: View {
    public var snapshot: Snapshot
    public var highlight: String?
    public var compact: Bool

    public init(snapshot: Snapshot, highlight: String? = nil, compact: Bool = false) {
        self.snapshot = snapshot
        self.highlight = highlight
        self.compact = compact
    }

    public var body: some View {
        HStack(spacing: compact ? 4 : 6) {
            ForEach(snapshot.orderedRegions, id: \.name) { item in
                RegionCell(name: item.name, reading: item.reading, highlighted: item.name == highlight,
                           mark: item.name == highlight ? (snapshot.locationMode == .gps ? "(nearest)" : "(your area)") : nil,
                           compact: compact)
            }
        }
    }
}

public struct RegionCell: View {
    var name: String
    var reading: RegionReading
    var highlighted: Bool
    var mark: String?
    var compact: Bool

    public var body: some View {
        let band = reading.pm25.map(HazeCompute.band(pm25:))
        VStack(spacing: 2) {
            Text(HazeFormat.regionName(name))
                .font(compact ? .caption2 : .caption)
                .foregroundStyle(.secondary)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(reading.pm25.map(String.init) ?? "offline")
                .font((reading.pm25 == nil ? Font.caption : (compact ? .callout : .title3)).monospacedDigit().weight(.semibold))
                .foregroundStyle(band?.textColor ?? .secondary)
            if !compact, let band {
                Image(systemName: band.symbolName).font(.system(size: 9)).foregroundStyle(band.textColor)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, compact ? 4 : 8)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill((band?.color ?? .gray).opacity(highlighted ? 0.2 : 0.08)))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
            .strokeBorder(highlighted ? (band?.textColor ?? .gray).opacity(0.7) : .clear, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(reading.pm25.map { "\(HazeFormat.regionName(name)) · \($0) · \(HazeCompute.band(pm25: $0).label)\(mark.map { " \($0)" } ?? "")" }
            ?? "\(HazeFormat.regionName(name)) · offline")
    }
}

public extension Snapshot {
    /// 0…1 on a 0–300 µg/m³ scale, for accessory gauges.
    var gaugeFraction: Double { min(1, Double(pm25) / 300) }
}

public let bandGradient = Gradient(colors: [Band.normal.color, Band.elevated.color, Band.high.color, Band.veryHigh.color])

// MARK: - Brand mark ("Sun over haze", brand/svg/mark-*.svg)

public extension Band {
    /// Dot color for the brand mark: band color, with the lighter Very High (#B06BC4) on dark backgrounds.
    var markDotColor: Color {
        .adaptive(light: hex, dark: self == .veryHigh ? "#B06BC4" : hex)
    }
}

/// The small mark (dot above haze lines). The dot takes the band color; the lines never change.
/// Geometry from brand/svg/mark-currentcolor.svg (viewBox 100).
public struct HazeMark: View {
    public var band: Band?
    public var size: CGFloat
    public init(band: Band?, size: CGFloat = 14) {
        self.band = band
        self.size = size
    }

    public var body: some View {
        Canvas { ctx, sz in
            let k = sz.width / 100
            let lines = Color.adaptive(light: "#14232B", dark: "#9FB3BB")
            func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat) -> Path {
                Path(roundedRect: CGRect(x: x * k, y: y * k, width: w * k, height: 7.5 * k), cornerRadius: 3.75 * k)
            }
            ctx.fill(Path(ellipseIn: CGRect(x: 33 * k, y: 21 * k, width: 34 * k, height: 34 * k)),
                     with: .color(band?.markDotColor ?? Color.adaptive(light: "#14232B", dark: "#F5F0E6")))
            ctx.fill(r(17, 61, 66), with: .color(lines))
            ctx.fill(r(27, 73.5, 46), with: .color(lines.opacity(0.7)))
            ctx.fill(r(38, 86, 24), with: .color(lines.opacity(0.45)))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
