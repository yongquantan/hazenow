import HazeKit
import HazeUI
import SwiftUI
import WidgetKit

/// watchOS complications: `● 105 ▲` in circular / corner / rectangular / inline.
struct ComplicationEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}

struct ComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ComplicationEntry { ComplicationEntry(date: .now, snapshot: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        if context.isPreview { return completion(placeholder(in: context)) }
        Task { completion(await load()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        Task {
            let entry = await load()
            completion(Timeline(entries: [entry], policy: .after(PollSchedule.widgetNextRefresh())))
        }
    }

    private func load() async -> ComplicationEntry {
        let settings = HazeSettings.shared
        if let loaded = try? await HazeSource.load(settings: settings, client: HazeClient(), includeV2: false),
           let s = HazeCompute.snapshot(data: loaded.data, location: settings.locationInput, now: loaded.now) {
            return ComplicationEntry(date: .now, snapshot: s)
        }
        return ComplicationEntry(date: .now, snapshot: settings.lastSnapshot)
    }
}

struct ComplicationView: View {
    let entry: ComplicationEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if let s = entry.snapshot {
            switch family {
            case .accessoryCircular:
                Gauge(value: Double(min(s.pm25, 300)), in: 0...300) {
                    Image(systemName: s.band.symbolName)
                } currentValueLabel: {
                    Text("\(s.pm25)").monospacedDigit()
                }
                .gaugeStyle(.accessoryCircular)
                .tint(bandGradient)
            case .accessoryCorner:
                Text("\(s.pm25)")
                    .font(.haze(.title3).monospacedDigit())
                    .widgetLabel { Text("\(s.band.label) \(s.trend.direction.arrow)") }
            case .accessoryInline:
                Text("\(s.compactText) \(s.band.label)")
            default:
                VStack(alignment: .leading) {
                    HStack(spacing: 4) {
                        Image(systemName: s.band.symbolName).foregroundStyle(s.band.color)
                        Text("\(s.pm25)").font(.haze(.headline, weight: .bold).monospacedDigit())
                        TrendArrow(s.trend.direction).font(.caption)
                        Text(s.band.label).font(.haze(.caption))
                    }
                    Text(HazeCompute.verdict(for: s, profiles: HazeSettings.shared.profiles).short).font(.haze(.caption))
                    Text("\(HazeFormat.hour(s.observedAt)) · NEA").font(.haze(.caption2))
                }
            }
        } else {
            Image(systemName: "aqi.medium")
        }
    }
}

@main
struct HazeComplications: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HazeNowComplication", provider: ComplicationProvider()) { entry in
            ComplicationView(entry: entry)
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("HazeNow")
        .description("1-hr PM2.5 right now.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline])
    }
}
