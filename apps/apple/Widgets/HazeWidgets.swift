import AppIntents
import OSLog
import HazeKit
import HazeUI
import SwiftUI
import WidgetKit

// Widgets shared by macOS and iOS (COPY §16). No Instant PSI and no "lagging" (SPEC v1.2 §1).
// Small: `● 105 ▲` + band word. Medium: + short verdict, "4pm · NEA", sparkline, official PSI.
// Large: + chart and regions. iOS lock screen: circular gauge, rectangular, inline.
// Timelines ask for the next refresh at hh:02 (SPEC v1.3). Each widget can pin a place (SPEC v1.4).

// MARK: - Configuration intent

enum WidgetPlace: String, AppEnum {
    case automatic, home, work, island, north, west, central, east, south

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Place"
    static let caseDisplayRepresentations: [WidgetPlace: DisplayRepresentation] = [
        .automatic: "Same as the app",
        .home: "Home",
        .work: "Work/School",
        .island: "Singapore (island average)",
        .north: "North station",
        .west: "West station",
        .central: "Central station",
        .east: "East station",
        .south: "South station",
    ]

    func resolve(_ settings: HazeSettings) -> ResolvedPlace {
        (WidgetPlaceChoice(rawValue: rawValue) ?? .automatic)
            .resolve(appPlace: settings.resolvedPlace, saved: settings.savedPlaces)
    }
}

struct SelectPlaceIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Choose a place"
    static let description = IntentDescription("Pin this widget to a saved place or an NEA station.")

    @Parameter(title: "Place", default: .automatic)
    var place: WidgetPlace

    init() {}
    init(place: WidgetPlace) { self.place = place }
}

// MARK: - Timeline

struct HazeEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
    let insight: HazeInsight?
    let placeLabel: String
    let mockScenario: String?
    let offline: Bool

    static var placeholder: HazeEntry {
        let s = Snapshot.sample
        return HazeEntry(date: .now, snapshot: s, insight: HazeInsight(snapshot: s, location: .default, now: s.publishedAt),
                         placeLabel: "Central", mockScenario: nil, offline: false)
    }
}

struct HazeProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> HazeEntry { .placeholder }

    func snapshot(for configuration: SelectPlaceIntent, in context: Context) async -> HazeEntry {
        context.isPreview ? .placeholder : await Self.load(configuration.place)
    }

    func timeline(for configuration: SelectPlaceIntent, in context: Context) async -> Timeline<HazeEntry> {
        let entry = await Self.load(configuration.place)
        return Timeline(entries: [entry], policy: .after(PollSchedule.widgetNextRefresh()))
    }

    static let log = Logger(subsystem: "sg.hazenow.widgets", category: "timeline")

    static func load(_ place: WidgetPlace) async -> HazeEntry {
        let settings = HazeSettings.shared
        let resolved = place.resolve(settings)
        // QA: `log stream --predicate 'subsystem == "sg.hazenow.widgets"'` shows the configured place per reload.
        log.info("timeline place=\(place.rawValue, privacy: .public) resolved=\(resolved.label, privacy: .public)")
        let profiles = settings.profiles
        do {
            let loaded = try await HazeSource.load(settings: settings, client: HazeClient(), includeV2: false)
            if let s = HazeCompute.snapshot(data: loaded.data, location: resolved.input, now: loaded.now) {
                return HazeEntry(date: .now, snapshot: s,
                                 insight: HazeInsight(snapshot: s, location: resolved.input, placeName: resolved.name,
                                                      profiles: profiles, now: loaded.now),
                                 placeLabel: resolved.label, mockScenario: loaded.mockScenario, offline: false)
            }
        } catch {}
        // Offline: last cached snapshot (from the app or a previous refresh), marked stale by age.
        var cached = settings.mockScenario == nil ? settings.lastSnapshot : nil
        if var c = cached { c.stale = c.stale || Date().timeIntervalSince(c.observedAt) > HazeCompute.staleAfter; cached = c }
        return HazeEntry(date: .now, snapshot: cached,
                         insight: cached.map { HazeInsight(snapshot: $0, location: resolved.input, placeName: resolved.name, profiles: profiles) },
                         placeLabel: resolved.label, mockScenario: settings.mockScenario, offline: true)
    }
}

struct HazeNowWidget: Widget {
    let kind = "HazeNowWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: SelectPlaceIntent.self, provider: HazeProvider()) { entry in
            HazeWidgetView(entry: entry)
                .containerBackground(for: .widget) { WidgetBackground(band: entry.snapshot?.band) }
        }
        .configurationDisplayName("HazeNow")
        .description("1-hr PM2.5 right now, from NEA.")
        .supportedFamilies(Self.families)
    }

    static var families: [WidgetFamily] {
        #if os(iOS)
        [.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline]
        #else
        [.systemSmall, .systemMedium, .systemLarge]
        #endif
    }
}

struct WidgetBackground: View {
    var band: Band?
    var body: some View {
        LinearGradient(colors: [(band?.color ?? .gray).opacity(0.16), .clear], startPoint: .top, endPoint: .bottom)
    }
}

struct HazeWidgetView: View {
    let entry: HazeEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if let s = entry.snapshot, let insight = entry.insight {
            switch family {
            case .systemSmall: SmallView(e: entry, s: s, insight: insight)
            case .systemMedium: MediumView(e: entry, s: s, insight: insight)
            case .systemLarge: LargeView(e: entry, s: s, insight: insight)
            #if os(iOS)
            case .accessoryCircular: CircularView(s: s)
            case .accessoryRectangular: RectangularView(s: s, insight: insight)
            case .accessoryInline:
                // Inline widgets render in the system font, which has the ▲▼ glyphs.
                Label("\(insight.numberText) \(s.trend.direction.arrow) \(s.band.label)", systemImage: s.band.symbolName)
                    .accessibilityLabel(insight.compactLabel)
            #endif
            default: SmallView(e: entry, s: s, insight: insight)
            }
        } else {
            VStack(spacing: 4) {
                Image(systemName: "wifi.slash")
                Text(HazeCopy.offlineNoCacheTitle).font(.haze(.caption)).multilineTextAlignment(.center)
                MockBadge(scenario: entry.mockScenario)
            }
            .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Families

/// `● 105 ▲` + band word (COPY §16).
private struct CompactLine: View {
    let s: Snapshot
    let insight: HazeInsight
    var size: CGFloat = 40

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(insight.numberText)
                    .font(.haze(size: size, weight: .bold, relativeTo: .largeTitle).monospacedDigit())
                    .foregroundStyle(s.band.textColor)
                    .minimumScaleFactor(0.6).lineLimit(1)
                TrendArrow(s.trend.direction).font(.system(size: size * 0.32)).foregroundStyle(.secondary)
            }
            BandChip(band: s.band, compact: true, stale: s.stale)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(insight.compactLabel)
    }
}

/// Small brand mark (dot tinted by band) + place.
private struct Header: View {
    let e: HazeEntry
    let band: Band
    var share = false
    var body: some View {
        HStack(spacing: 5) {
            HazeMark(band: band, size: 14)
            Text(e.placeLabel).font(.haze(.caption, weight: .semibold)).lineLimit(1)
            if share {
                Spacer(minLength: 4)
                Link(destination: URL(string: "hazenow://share")!) {
                    Image(systemName: "square.and.arrow.up").font(.caption.weight(.semibold))
                }
                .accessibilityLabel("Share")
            }
        }
    }
}

private struct Footer: View {
    let e: HazeEntry
    let s: Snapshot
    var body: some View {
        HStack(spacing: 4) {
            Text("\(HazeFormat.hour(s.observedAt)) · NEA").lineLimit(1)
            if e.offline { Image(systemName: "wifi.slash") }
            MockBadge(scenario: e.mockScenario)
        }
        .font(.haze(.caption2))
        .foregroundStyle(.secondary)
    }
}

private struct SmallView: View {
    let e: HazeEntry
    let s: Snapshot
    let insight: HazeInsight

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Header(e: e, band: s.band)
            Spacer(minLength: 0)
            CompactLine(s: s, insight: insight, size: 44)
            Footer(e: e, s: s)
        }
    }
}

private struct MediumView: View {
    let e: HazeEntry
    let s: Snapshot
    let insight: HazeInsight

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Header(e: e, band: s.band, share: true)
                Text(insight.verdict.short).hazeHeadline(.headline).lineLimit(2).minimumScaleFactor(0.8)
                CompactLine(s: s, insight: insight, size: 38)
                Spacer(minLength: 0)
                Footer(e: e, s: s)
            }
            VStack(alignment: .leading, spacing: 6) {
                Sparkline(history: s.history, band: s.band).frame(maxHeight: .infinity)
                Text(HazeCopy.officialPsiLabel(s.officialPsi24h)).font(.haze(.caption2)).lineLimit(1).minimumScaleFactor(0.8)
            }
        }
    }
}

private struct LargeView: View {
    let e: HazeEntry
    let s: Snapshot
    let insight: HazeInsight

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Header(e: e, band: s.band, share: true)
            Text(insight.verdict.headline).hazeHeadline(.headline).lineLimit(2)
            HStack(alignment: .top) {
                CompactLine(s: s, insight: insight, size: 44)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(insight.trendWords).font(.haze(.caption)).multilineTextAlignment(.trailing)
                    Text(HazeCopy.officialPsiLabel(s.officialPsi24h)).font(.haze(.caption2)).foregroundStyle(.secondary)
                }
            }
            LagChart(history: s.history, showLegend: false, showAxes: false).frame(maxHeight: .infinity)
            RegionGrid(snapshot: s, highlight: s.locationMode == .island ? nil : s.nearestRegion, compact: true)
            Footer(e: e, s: s)
        }
    }
}

#if os(iOS)
private struct CircularView: View {
    let s: Snapshot
    var body: some View {
        Gauge(value: Double(min(s.pm25, 300)), in: 0...300) {
            Image(systemName: s.band.symbolName)
        } currentValueLabel: {
            Text("\(s.pm25)").monospacedDigit()
        }
        .gaugeStyle(.accessoryCircular)
        .tint(bandGradient)
        .widgetAccentable()
        .accessibilityLabel(HazeCompute.accessibleLabel(s))
    }
}

private struct RectangularView: View {
    let s: Snapshot
    let insight: HazeInsight
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Image(systemName: s.band.symbolName)
                Text(insight.numberText).font(.haze(.headline, weight: .bold).monospacedDigit())
                TrendArrow(s.trend.direction).font(.caption)
                Text(s.band.label).font(.haze(.caption))
            }
            .widgetAccentable()
            Text(insight.verdict.short).font(.haze(.caption)).lineLimit(1)
            Text("\(HazeFormat.hour(s.observedAt)) · NEA").font(.haze(.caption2)).lineLimit(1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(insight.compactLabel)
    }
}
#endif

@main
struct HazeWidgetBundle: WidgetBundle {
    var body: some Widget {
        HazeNowWidget()
        #if os(iOS)
        HazeLiveActivity()
        #endif
    }
}
