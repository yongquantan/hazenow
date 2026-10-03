#if os(iOS)
import ActivityKit
import Foundation
import HazeKit

/// Live Activity for "Haze watch". Updated locally by the app (no push server).
struct HazeActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var pm25: Int
        var band: Band
        var arrow: String
        var direction: TrendDirection
        var verdictShort: String
        var officialPsi24h: Int?
        var observedAt: Date
        var estimate: Bool
        var stale: Bool
        var accessibility: String
        /// The place this reading is for. It lives in the content state (not only the attributes, which are fixed when
        /// the activity starts) so a region change updates the label with the reading. Optional so states encoded
        /// before this field still decode.
        var place: String?

        init(snapshot s: Snapshot, place: String? = nil, profiles: Set<Profile> = [.general], estimate: Bool = false) {
            pm25 = s.pm25
            band = s.band
            arrow = s.trend.direction.arrow
            direction = s.trend.direction
            verdictShort = HazeCompute.verdict(for: s, profiles: profiles).short
            officialPsi24h = s.officialPsi24h
            observedAt = s.observedAt
            self.estimate = estimate
            stale = s.stale
            accessibility = HazeCompute.accessibleLabel(s)
            self.place = place
        }

        /// Always a clean integer (SPEC v1.5).
        var numberText: String { "\(pm25)" }
    }

    /// "Central" / "Your location" when the activity started. Use `placeLabel(_:)`, which prefers the current state.
    var place: String

    /// The label to show for a state: the state's own place, else the place the activity started with.
    func placeLabel(_ state: ContentState) -> String { state.place ?? place }
}
#endif
