import Foundation

/// Formatting helpers. All human-facing times are shown in Singapore time.
public enum HazeFormat {
    public static let sgt = TimeZone(identifier: "Asia/Singapore") ?? TimeZone(secondsFromGMT: 8 * 3600)!

    public static var sgtCalendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = sgt
        return c
    }

    /// "4pm"
    public static func hour(_ date: Date) -> String {
        let c = sgtCalendar.dateComponents([.hour, .minute], from: date)
        let h = c.hour ?? 0
        let suffix = h < 12 ? "am" : "pm"
        let h12 = h % 12 == 0 ? 12 : h % 12
        if let m = c.minute, m != 0 { return String(format: "%d:%02d%@", h12, m, suffix) }
        return "\(h12)\(suffix)"
    }

    /// "4:30pm" (or "4pm" on the hour)
    public static func time(_ date: Date) -> String { hour(date) }

    /// "YYYY-MM-DD" in SGT (for the `?date=` query).
    public static func sgtDay(_ date: Date) -> String {
        let c = sgtCalendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    /// "Central"
    public static func regionName(_ name: String) -> String {
        name.prefix(1).uppercased() + name.dropFirst()
    }

    /// ISO-8601 with SGT offset: "2026-09-28T16:00:00+08:00".
    public static func iso8601(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.timeZone = sgt
        f.formatOptions = [.withInternetDateTime]
        return f.string(from: date)
    }

    public static func parseISO8601(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s)
    }

    /// "+25 in the last hour" / "steady"
    public static func trendText(_ trend: Trend) -> String {
        switch trend.direction {
        case .steady: return "steady vs last hour"
        case .up, .down:
            let sign = trend.delta > 0 ? "+" : "−"
            return "\(sign)\(abs(trend.delta)) vs last hour"
        }
    }
}
