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
        var verdictShort: String
        var officialPsi24h: Int?
        var observedAt: Date
        var estimate: Bool
        var stale: Bool
        var accessibility: String

        init(snapshot s: Snapshot, profiles: Set<Profile> = [.general], estimate: Bool = false) {
            pm25 = s.pm25
            band = s.band
            arrow = s.trend.direction.arrow
            verdictShort = HazeCompute.verdict(for: s, profiles: profiles).short
            officialPsi24h = s.officialPsi24h
            observedAt = s.observedAt
            self.estimate = estimate
            stale = s.stale
            accessibility = HazeCompute.accessibleLabel(s)
        }

        var numberText: String { (estimate ? "~" : "") + "\(pm25)" }
    }

    /// "Central" / "Your location"
    var place: String
}
#endif
