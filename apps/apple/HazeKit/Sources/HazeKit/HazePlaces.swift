import Foundation

// SPEC v1.4 — location: ask well, need little. Areas are bundled offline (packages/core/data/sg-areas.json),
// so searching leaks nothing. Stored coordinates are rounded to 2 decimals (~1 km).

public struct SGArea: Codable, Sendable, Hashable, Identifiable {
    public var name: String
    public var aliases: [String]
    public var lat: Double
    public var lon: Double
    public var id: String { name }
}

public enum SGAreas {
    /// The 55 URA planning areas with common estate names as aliases.
    public static let all: [SGArea] = {
        guard let url = Bundle.module.url(forResource: "sg-areas", withExtension: "json", subdirectory: "Data"),
              let data = try? Data(contentsOf: url),
              let list = try? JSONDecoder().decode([SGArea].self, from: data) else { return [] }
        return list.sorted { $0.name < $1.name }
    }()

    public static func named(_ name: String) -> SGArea? {
        let q = name.lowercased()
        return all.first { $0.name.lowercased() == q } ?? all.first { $0.aliases.contains { $0.lowercased() == q } }
    }

    /// Offline search by name or alias (prefix matches first).
    public static func search(_ query: String) -> [SGArea] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return all }
        func score(_ a: SGArea) -> Int? {
            let names = [a.name] + a.aliases
            if names.contains(where: { $0.lowercased().hasPrefix(q) }) { return 0 }
            if names.contains(where: { $0.lowercased().contains(q) }) { return 1 }
            return nil
        }
        var scored: [(area: SGArea, score: Int)] = []
        for a in all { if let sc = score(a) { scored.append((a, sc)) } }
        scored.sort { (x: (area: SGArea, score: Int), y: (area: SGArea, score: Int)) -> Bool in
            if x.score != y.score { return x.score < y.score }
            return x.area.name < y.area.name
        }
        return scored.map { $0.area }
    }
}

/// Round to 2 decimals (~1 km) before persisting (SPEC v1.4 §5).
public func roundCoordinate(_ v: Double) -> Double { (v * 100).rounded() / 100 }

public struct SavedPlace: Codable, Sendable, Hashable, Identifiable {
    public enum Kind: String, Codable, Sendable, CaseIterable { case home, work, other }
    public var kind: Kind
    /// "Home", "Work/School", or the user's label for the extra place.
    public var label: String
    /// Area name when set from the list; nil when set from location.
    public var area: String?
    public var lat: Double
    public var lon: Double
    public var id: Kind { kind }

    public init(kind: Kind, label: String? = nil, area: String? = nil, lat: Double, lon: Double) {
        self.kind = kind
        self.label = label ?? kind.defaultLabel
        self.area = area
        self.lat = roundCoordinate(lat)
        self.lon = roundCoordinate(lon)
    }

    public init(kind: Kind, area: SGArea) {
        self.init(kind: kind, area: area.name, lat: area.lat, lon: area.lon)
    }
}

public extension SavedPlace.Kind {
    var defaultLabel: String {
        switch self {
        case .home: "Home"
        case .work: "Work/School"
        case .other: "Other"
        }
    }

    var symbolName: String {
        switch self {
        case .home: "house"
        case .work: "building.2"
        case .other: "star"
        }
    }
}

/// What the user has chosen to see.
public enum PlaceMode: Codable, Sendable, Hashable {
    case myLocation
    case area(String)
    case saved(SavedPlace.Kind)
    case region(String)
    case island
}

/// A resolved place: the computation input plus how to describe it.
public struct ResolvedPlace: Sendable, Hashable {
    public var input: LocationInput
    /// "Tampines", "Home" — nil for GPS / region / island.
    public var name: String?
    public var mode: PlaceMode

    public init(input: LocationInput, name: String?, mode: PlaceMode) {
        self.input = input
        self.name = name
        self.mode = mode
    }

    /// Resolve a mode. `gps` is the current (rounded) fix, if location is allowed and available.
    /// Denied / unavailable location falls back quietly to the island view.
    public static func resolve(_ mode: PlaceMode, gps: (lat: Double, lon: Double)?, saved: [SavedPlace]) -> ResolvedPlace {
        switch mode {
        case .myLocation:
            if let gps { return ResolvedPlace(input: .gps(lat: gps.lat, lon: gps.lon), name: nil, mode: mode) }
            return ResolvedPlace(input: .island, name: nil, mode: .island)
        case let .area(name):
            if let a = SGAreas.named(name) { return ResolvedPlace(input: .gps(lat: a.lat, lon: a.lon), name: a.name, mode: mode) }
            return ResolvedPlace(input: .island, name: nil, mode: .island)
        case let .saved(kind):
            if let p = saved.first(where: { $0.kind == kind }) {
                return ResolvedPlace(input: .gps(lat: p.lat, lon: p.lon), name: p.label, mode: mode)
            }
            return ResolvedPlace(input: .island, name: nil, mode: .island)
        case let .region(r):
            return ResolvedPlace(input: .region(r), name: nil, mode: mode)
        case .island:
            return ResolvedPlace(input: .island, name: nil, mode: mode)
        }
    }

    /// Short label for pickers and headers: "Near you", "Tampines", "Home", "Central", "Singapore".
    public var label: String {
        switch mode {
        case .myLocation: "Near you"
        case .area, .saved: name ?? "Singapore"
        case let .region(r): HazeFormat.regionName(r)
        case .island: "Singapore"
        }
    }
}
