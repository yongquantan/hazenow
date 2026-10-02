import Foundation
import HazeKit

// SPEC v2.0 (places outside Singapore) and v2.1 (country guess) for the store. Singapore keeps its v1 path untouched;
// everything here is only active when the place is outside Singapore.

/// The calm line a guess shows above the reading (SPEC v2.1 §4). Never saved.
public enum GuessBanner: Equatable, Sendable {
    /// A sure guess: "Showing Bangkok · Change".
    case sure(place: String)
    /// "Myanmar isn't available yet. Showing Chiang Mai, the nearest place we cover. Change"
    case notCovered(country: String, place: String)
    /// Unsure: "Where are you checking?" with a chip per country.
    case unsure
}

/// What the country view shows. `snapshot` may be a cached one (then `phase` says so).
public struct CountryViewState: Equatable, Sendable {
    public enum Phase: Equatable, Sendable {
        case loading
        case live
        /// The fetch failed; `snapshot` is the last good one. The line says so, with its time and age (COPY §10).
        case cached(line: String)
        /// Needs permission / not feasible (COVERAGE.md): calm "Not available yet" + why + what would fix it.
        case notAvailable(reason: String, fix: String?)
        /// Needs the proxy, and this app has no proxy URL yet. Never faked.
        case notOnThisApp(line: String)
        /// The source failed and there's nothing cached: "Can't reach {Country}'s official data right now".
        case down(title: String, line: String)
        /// Nothing in range for an honest number.
        case noData(title: String, line: String)
    }

    public var key: String
    public var country: CountryCode
    public var placeName: String
    public var lat: Double
    public var lon: Double
    public var city: CityPlace?
    public var snapshot: CountrySnapshot?
    public var phase: Phase
}

public struct CountryTarget: Equatable, Sendable {
    public var key: String
    public var country: CountryCode
    public var name: String
    public var query: CountryQuery
    public var city: CityPlace?
}

public enum GuessCopy {
    public static func showing(_ place: String) -> String { "Showing \(place)" }
    public static func notCovered(_ country: String, _ place: String) -> String {
        "\(country) isn't available yet. Showing \(place), the nearest place we cover."
    }
    public static let whereChecking = "Where are you checking?"
    public static let change = "Change"
    public static let precise = "Use my precise location"
    public static let notOnThisAppTitle = "Not available yet on this app"
    public static func notOnThisAppSensors(_ place: String) -> String {
        "\(place)'s readings come from community sensors, which reach HazeNow through our server. This app isn't connected to it yet."
    }
    public static func notOnThisApp(_ country: String) -> String {
        "Readings for \(country) come through HazeNow's server, which this app isn't connected to yet. Singapore and Thailand work now."
    }
}

public extension HazeStore {
    /// SPEC v2.1 §1 order: deep link (`-HazePlace`, DEBUG) → saved choice → guess → Singapore. Called once at init.
    internal func applyStartPlace() {
        #if DEBUG
        if let qa = UserDefaults.standard.string(forKey: "HazePlace"), !qa.isEmpty, mockScenario == nil || qa.lowercased().hasPrefix("sg") {
            let parts = qa.split(separator: ":", maxSplits: 1).map(String.init)
            if parts.count == 2 { _ = openPlace(country: parts[0], area: parts[1]) }
            return
        }
        #endif
        guard mockScenario == nil, !settings.hasSavedPlaceChoice else { return }
        let st = SeaPlaces.startPlace(guess)
        if guess.country == .SG, guess.confidence == .high { return } // unchanged: the v1.4 first-run card
        setTransient(st.place.country == .SG ? .island : .city(st.place.key))
        if let cc = st.notCoveredFrom {
            guessBanner = .notCovered(country: SeaRegistry.name(cc), place: st.place.name)
        } else if st.outside || guess.confidence != .high {
            guessBanner = .unsure
        } else {
            guessBanner = .sure(place: st.place.name)
        }
    }

    /// Show the Singapore first-run choice (location or area) as before. Not when a guess already chose a place.
    var showsFirstRunChoice: Bool { !onboarded && guessBanner == nil }

    internal func setTransient(_ mode: PlaceMode) {
        transientPlace = true
        placeMode = mode
        transientPlace = false
    }

    /// A deep link: `hazenow://open?country=th&area=pai`, `?area=Tampines`, `?region=east`, `?lat=..&lon=..`.
    /// Transient (not saved) and it clears any guess line.
    @discardableResult
    func openDeepLink(_ url: URL) -> Bool {
        guard let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return false }
        let q = { (k: String) in items.first { $0.name == k }?.value }
        if let lat = q("lat").flatMap(Double.init), let lon = q("lon").flatMap(Double.init) {
            let cc = SeaBorders.countryAt(lat: lat, lon: lon)
            let city = cc.flatMap { c in SeaPlaces.cities(c).min { seaHaversineKm(LatLon(lat: lat, lon: lon), LatLon(lat: $0.lat, lon: $0.lon)) < seaHaversineKm(LatLon(lat: lat, lon: lon), LatLon(lat: $1.lat, lon: $1.lon)) } }
            if cc == .SG || cc == nil { return false }
            if let city { guessBanner = nil; setTransient(.city(city.key)); return true }
            return false
        }
        if let r = q("region"), HazeRegions.canonicalOrder.contains(r.lowercased()) {
            guessBanner = nil
            setTransient(.region(r.lowercased()))
            return true
        }
        return openPlace(country: q("country") ?? "sg", area: q("area") ?? "")
    }

    @discardableResult
    internal func openPlace(country: String, area: String) -> Bool {
        let cc = CountryCode(rawValue: country.uppercased()) ?? .SG
        if cc == .SG {
            if let a = SGAreas.named(area) ?? SGAreas.search(area).first, !area.isEmpty {
                guessBanner = nil
                setTransient(.area(a.name))
                return true
            }
            guessBanner = nil
            setTransient(.island)
            return true
        }
        guard let place = (area.isEmpty ? SeaPlaces.defaultCity(cc) : SeaPlaces.find(area, country: cc)) else { return false }
        guessBanner = nil
        setTransient(.city(place.key))
        return true
    }

    /// The user's own pick in the place picker (saved).
    func pick(_ place: CityPlace) {
        guessBanner = nil
        onboarded = true
        placeMode = place.country == .SG ? .island : .city(place.key)
    }

    func pickSingaporeArea(_ area: SGArea) {
        guessBanner = nil
        onboarded = true
        placeMode = .area(area.name)
    }

    /// The place outside Singapore to show, or nil for the Singapore view.
    var countryTarget: CountryTarget? {
        if let city = placeMode.cityPlace {
            return CountryTarget(key: city.key, country: city.country, name: city.name, query: SeaPlaces.query(city), city: city)
        }
        // "Use my location" outside Singapore: the jurisdiction follows the reading (SPEC v2.0 §3).
        if case .myLocation = placeMode, let c = coordinate, locationStatus == .active || locationStatus == .requesting,
           let cc = SeaBorders.countryAt(lat: c.latitude, lon: c.longitude), cc != .SG {
            let near = SeaPlaces.cities(cc).min {
                seaHaversineKm(LatLon(lat: c.latitude, lon: c.longitude), LatLon(lat: $0.lat, lon: $0.lon))
                    < seaHaversineKm(LatLon(lat: c.latitude, lon: c.longitude), LatLon(lat: $1.lat, lon: $1.lon))
            }
            return CountryTarget(key: "gps:\(cc.rawValue)", country: cc, name: near.map { "Near \($0.name)" } ?? "Near you",
                                 query: CountryQuery(lat: c.latitude, lon: c.longitude), city: nil)
        }
        return nil
    }

    /// A place, location or saved choice changed: re-render, and fetch at once if the new place needs it.
    internal func placeChanged() {
        recompute()
        guard let target = countryTarget else {
            if country != nil { country = nil }
            if data == nil { pollWake = true; Task { await refresh() } }
            return
        }
        if country?.key != target.key {
            country = initialState(target)
            countryTask?.cancel()
            countryTask = Task { [weak self] in await self?.refreshCountry(target) }
        }
    }

    internal func initialState(_ t: CountryTarget) -> CountryViewState {
        let cached = settings.countryCache[t.key].map { SeaBuild.cached($0, now: Date().timeIntervalSince1970) }
        return CountryViewState(key: t.key, country: t.country, placeName: t.name, lat: t.query.lat ?? 0, lon: t.query.lon ?? 0,
                                city: t.city, snapshot: cached, phase: .loading)
    }

    /// Fetch and build on the device. Fallbacks (COPY §10): community sensors (inside the adapter), then the cached
    /// snapshot with its age, then the calm "can't reach" state. Every request is bounded by the ~8 s timeout.
    internal func refreshCountry(_ target: CountryTarget) async {
        var state = country?.key == target.key ? country! : initialState(target)
        if let city = target.city, city.status == .needsPermission || city.status == .notFeasible {
            let na = SeaPlaces.notAvailable(city)
            state.snapshot = nil
            state.phase = .notAvailable(reason: na.reason, fix: na.fix)
            country = state
            return
        }
        guard SeaAdapters.available(target.country, proxyBase: edge) else {
            state.snapshot = nil
            state.phase = .notOnThisApp(line: GuessCopy.notOnThisApp(SeaRegistry.name(target.country)))
            country = state
            return
        }
        // A direct country's place that only community sensors cover (Pai): those come through the proxy.
        if edge == nil, let city = target.city, city.status == .needsProxy {
            state.snapshot = nil
            state.phase = .notOnThisApp(line: GuessCopy.notOnThisAppSensors(city.name))
            country = state
            return
        }
        if state.snapshot == nil { state.phase = .loading }
        country = state
        isLoading = true
        defer { isLoading = false }
        let now = Date().timeIntervalSince1970
        do {
            let s = try await SeaAdapters.snapshot(target.country, query: target.query, ctx: SeaContext(now: now, proxyBase: edge))
            guard country?.key == target.key, !Task.isCancelled else { return }
            state.snapshot = s
            state.phase = .live
            lastChecked = Date()
            var cache = settings.countryCache
            cache[target.key] = s
            settings.countryCache = cache
        } catch {
            guard country?.key == target.key, !Task.isCancelled else { return }
            lastChecked = Date()
            if error is NoCountryDataError {
                state.snapshot = nil
                state.phase = .noData(title: "No reading near here right now",
                                      line: "There's no official station or community sensor close enough for an honest number.")
            } else if let cached = state.snapshot ?? settings.countryCache[target.key] {
                let c = SeaBuild.cached(cached, now: now)
                state.snapshot = c
                let line = SeaDisplay.officialDownCopy(target.country, cachedObservedAt: c.observedAt, now: now,
                                                       viewerOffsetHours: SeaDisplay.deviceOffsetHours).cachedLine ?? ""
                state.phase = .cached(line: line)
            } else {
                let copy = SeaDisplay.officialDownCopy(target.country)
                state.phase = .down(title: copy.title, line: copy.line)
            }
        }
        country = state
    }

    /// SPEC v2.0 §8: TH from hh:02 local every 2 min until the new hour lands (stop at hh:30), else the next hh:02.
    /// Proxied countries every 5 min. Places that can't be fetched: idle (30 min).
    internal func countryPollDelay(_ t: CountryTarget) -> TimeInterval {
        switch country?.phase {
        case .notAvailable?, .notOnThisApp?: return 30 * 60
        case .down?, .cached?: return 3 * 60
        default: break
        }
        guard t.country == .TH else { return 5 * 60 }
        let now = Date().timeIntervalSince1970
        let off = 7.0 * 3600
        let local = now + off
        let min = Int(local.truncatingRemainder(dividingBy: 3600) / 60)
        let hourStart = local - local.truncatingRemainder(dividingBy: 3600) - off
        let have = country?.snapshot.flatMap { SeaTime.parse($0.observedAt) }.map { $0 >= hourStart } ?? false
        if !have, min >= 2, min < 30 { return 2 * 60 }
        return max(60, hourStart + 3600 + 120 - now)
    }
}
