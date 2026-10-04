import Foundation

/// The anonymous daily "+1" (docs/PRIVACY.md). At most once per UTC day per install, the app adds 1 to the data
/// server's `app_open` counter for (day, surface, new|returning, the selected place's country). Count, never identify:
/// no id, version, coordinate or anything else is sent, and "once a day" is decided here, on the device. Mirrors
/// apps/android core `DailyCount`.
public enum HazeDailyCount {
    public static let surfaces: Set<String> = ["android", "ios", "mac"]
    static let lastDayKey = "hazenow.count.countedOn"
    static let firstSeenKey = "hazenow.count.firstSeen"

    /// The UTC day, yyyy-MM-dd.
    public static func utcDay(_ date: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    public struct Decision: Equatable, Sendable {
        public let day: String
        public let seen: String
    }

    /// nil when today (UTC) was already counted. `existingInstall`: settings from before this counter existed.
    public static func decide(now: Date, lastDay: String?, firstSeen: Bool, existingInstall: Bool) -> Decision? {
        let day = utcDay(now)
        if lastDay == day { return nil }
        return Decision(day: day, seen: firstSeen || existingInstall ? "returning" : "new")
    }

    /// POST target. `cc` is the selected place's covered country (never a location); omitted when unknown.
    public static func url(base: String, surface: String, seen: String, cc: CountryCode?) -> URL? {
        guard surfaces.contains(surface), seen == "new" || seen == "returning" else { return nil }
        let b = base.hasSuffix("/") ? String(base.dropLast()) : base
        return URL(string: "\(b)/v1/hit?e=app_open&surface=\(surface)&seen=\(seen)" + (cc.map { "&cc=\($0.rawValue.lowercased())" } ?? ""))
    }

    /// This platform's surface, or nil where the counter doesn't run (watchOS, widgets).
    public static var surface: String? {
        #if os(iOS)
        return "ios"
        #elseif os(macOS)
        return "mac"
        #else
        return nil
        #endif
    }

    /// Fire-and-forget: one ephemeral request (no cookies, no cache), 5 s timeout, failures ignored. Off in Debug.
    public static func maybeSend(base: String?, cc: CountryCode?, existingInstall: Bool, defaults: UserDefaults = .standard, now: Date = Date()) {
        #if DEBUG
        return
        #else
        guard let base, let surface,
              let d = decide(now: now, lastDay: defaults.string(forKey: lastDayKey), firstSeen: defaults.bool(forKey: firstSeenKey), existingInstall: existingInstall),
              let url = url(base: base, surface: surface, seen: d.seen, cc: cc) else { return }
        defaults.set(d.day, forKey: lastDayKey)
        defaults.set(true, forKey: firstSeenKey)
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5)
        req.httpMethod = "POST"
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 5
        config.httpCookieStorage = nil
        let session = URLSession(configuration: config)
        session.dataTask(with: req) { _, _, _ in session.finishTasksAndInvalidate() }.resume()
        #endif
    }
}
