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
            LockScreenActivityView(state: context.state, place: context.attributes.place)
                .activityBackgroundTint(Color.black.opacity(0.6))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let st = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: st.band.symbolName).foregroundStyle(st.band.color)
                        Text(st.numberText).font(.title2.weight(.bold).monospacedDigit()).foregroundStyle(st.band.textColor)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 0) {
                        Label(st.band.label, systemImage: st.band.symbolName).font(.caption.weight(.semibold))
                        Text(st.arrow).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(st.verdictShort).font(.callout)
                        Spacer()
                        Text("\(context.attributes.place) · \(HazeFormat.hour(st.observedAt)) · NEA")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                HazeMark(band: st.band, size: 16)
            } compactTrailing: {
                Text("\(st.numberText)\(st.arrow)").monospacedDigit().foregroundStyle(st.band.textColor)
            } minimal: {
                Text("\(st.pm25)").font(.caption2.monospacedDigit()).foregroundStyle(st.band.textColor)
            }
            .keylineTint(st.band.color)
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
                    Text("Haze watch · \(place)").font(.caption).foregroundStyle(.secondary)
                }
                Text(state.verdictShort).font(.headline)
                Text("\(HazeFormat.hour(state.observedAt)) · \(HazeCopy.attribution)")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(state.numberText).font(.system(size: 36, weight: .bold, design: .rounded).monospacedDigit())
                    Text(state.arrow).font(.callout)
                }
                .foregroundStyle(state.band.textColor)
                Label(state.stale ? "\(state.band.label) \(HazeCopy.oldSuffix)" : state.band.label, systemImage: state.band.symbolName)
                    .font(.caption.weight(.semibold))
            }
        }
        .padding(16)
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(state.verdictShort). \(state.accessibility)")
    }
}
#endif
