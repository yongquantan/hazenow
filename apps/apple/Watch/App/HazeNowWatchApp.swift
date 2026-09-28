import HazeKit
import HazeUI
import SwiftUI
import WidgetKit

@main
struct HazeNowWatchApp: App {
    @State private var store = HazeStore()

    var body: some Scene {
        WindowGroup {
            WatchContentView(store: store)
                .task {
                    store.onSnapshot = { _ in WidgetCenter.shared.reloadAllTimelines() }
                    store.start()
                }
        }
    }
}

struct WatchContentView: View {
    @Bindable var store: HazeStore

    var body: some View {
        ScrollView {
            if let s = store.snapshot, let insight = store.insight {
                VStack(alignment: .leading, spacing: 8) {
                    Text(insight.verdict.short).hazeHeadline(.headline)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(insight.numberText)
                            .font(.haze(size: 48, weight: .bold, relativeTo: .largeTitle).monospacedDigit())
                            .foregroundStyle(s.band.textColor)
                        TrendArrow(s.trend.direction).foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(insight.compactLabel)
                    BandChip(band: s.band, compact: true, stale: s.stale)
                    Text("µg/m³ 1-hr PM2.5 · \(store.resolved.label)").font(.haze(.caption2)).foregroundStyle(.secondary)
                    Text(HazeCopy.officialPsiLabel(s.officialPsi24h)).font(.haze(.caption2))
                    Sparkline(history: s.history, band: s.band).frame(height: 40)
                    Picker("Place", selection: $store.placeMode) {
                        Text("Singapore").tag(PlaceMode.island)
                        ForEach(store.savedPlaces) { Text($0.label).tag(PlaceMode.saved($0.kind)) }
                        ForEach(HazeRegions.canonicalOrder, id: \.self) { Text("\(HazeFormat.regionName($0)) station").tag(PlaceMode.region($0)) }
                    }
                    Text("\(s.asOfText)\n\(HazeCopy.attribution)").font(.haze(.caption2)).foregroundStyle(.secondary)
                }
            } else {
                ProgressView()
            }
        }
    }
}
