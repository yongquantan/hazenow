#if os(iOS)
import ActivityKit
import HazeKit
import HazeUI
import SwiftUI
import WidgetKit

/// Lock screen + Dynamic Island while "Haze watch" is on.
struct HazeLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HazeActivityAttributes.self) { context in
            LockScreenActivityView(state: context.state, place: context.attributes.placeLabel(context.state))
                .activityBackgroundTint(Color.black.opacity(0.6))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: "hazenow://share"))
        } dynamicIsland: { context in
            let st = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: st.band.symbolName).foregroundStyle(st.band.color)
                        Text(st.numberText).font(.haze(.title2, weight: .bold).monospacedDigit()).foregroundStyle(st.band.textColor)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 0) {
                        Label(st.band.label, systemImage: st.band.symbolName).font(.haze(.caption, weight: .semibold))
                        TrendArrow(st.direction).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(st.verdictShort).font(.haze(.callout))
                        Spacer()
                        Text("\(context.attributes.placeLabel(st)) · \(HazeFormat.hour(st.observedAt)) · NEA")
                            .font(.haze(.caption2)).foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                HazeMark(band: st.band, size: 16)
            } compactTrailing: {
                HStack(spacing: 2) {
                    Text(st.numberText).monospacedDigit()
                    TrendArrow(st.direction).font(.caption2)
                }
                .foregroundStyle(st.band.textColor)
            } minimal: {
                Text("\(st.pm25)").font(.haze(.caption2).monospacedDigit()).foregroundStyle(st.band.textColor)
            }
            .keylineTint(st.band.color)
            .widgetURL(URL(string: "hazenow://share"))
        }
    }
}

struct LockScreenActivityView: View {
    let state: HazeActivityAttributes.ContentState
    let place: String

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    HazeMark(band: state.band, size: 14)
                    Text("Haze watch · \(place)").font(.haze(.caption)).foregroundStyle(.secondary)
                }
                Text(state.verdictShort).hazeHeadline(.headline)
                Text("\(HazeFormat.hour(state.observedAt)) · \(HazeCopy.attribution)")
                    .font(.haze(.caption2)).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(state.numberText).font(.haze(size: 36, weight: .bold, relativeTo: .largeTitle).monospacedDigit())
                    TrendArrow(state.direction).font(.callout)
                }
                .foregroundStyle(state.band.textColor)
                Label(state.stale ? "\(state.band.label) \(HazeCopy.oldSuffix)" : state.band.label, systemImage: state.band.symbolName)
                    .font(.haze(.caption, weight: .semibold))
            }
        }
        .padding(16)
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(state.verdictShort). \(state.accessibility)")
    }
}
#endif
