import Foundation

// Country adapters (ports of countries/sources/air4thai.ts, adapters/th.ts and adapters/proxied.ts).
//
// - SG: unchanged (HazeClient, v1 + v2, the existing Snapshot path).
// - TH: direct to PCD Air4Thai. Air4Thai serves an incomplete certificate chain; URLSession completes it itself (AIA),
//   so there is no trust override. Community sensors come from the proxy, and stand in when Air4Thai fails or hangs.
// - MY, ID, VN, PH, LA, KH: `GET {edge}/v1/{cc}/observations` (no location sent). The snapshot is built on the device.
//
// Every request has the ~8 s upstream timeout (HazeNet.swift).

public enum HazeEdge {
    /// Placeholder until the proxy is deployed. Replace in Info.plist (`HazeNowEdge`) or here; while it's the
    /// placeholder (or empty), proxied countries show "Not available yet on this app".
    public static let placeholder = "https://HAZENOW_EDGE.invalid"
    /// The free Cloudflare Worker in services/worker. Used when nothing else is configured.
    public static let defaultURL = "https://hazenow-data.yongquan26.workers.dev"
    public static let infoKey = "HazeNowEdge"
    public static let defaultsKey = "hazenow.edge"

    /// The configured proxy base URL, or nil. Order: `-HazeEdge <url>` / the `hazenow.edge` default, then the app's
    /// Info.plist `HazeNowEdge`, then `defaultURL`. Setting any of the first three to the placeholder turns the proxy off.
    public static func configured(defaults: UserDefaults = .standard, bundle: Bundle = .main) -> String? {
        let candidates = [defaults.string(forKey: "HazeEdge"), defaults.string(forKey: defaultsKey),
                          bundle.object(forInfoDictionaryKey: infoKey) as? String, defaultURL]
        for c in candidates {
            let v = (c ?? "").trimmingCharacters(in: .whitespaces)
            if v.isEmpty { continue }
            return usable(v)
        }
        return nil
    }

    /// nil for the placeholder, blanks, and anything that isn't an http(s) URL.
    public static func usable(_ raw: String?) -> String? {
        let v = (raw ?? "").trimmingCharacters(in: .whitespaces)
        guard !v.isEmpty, v != placeholder, !v.contains("HAZENOW_EDGE"), let u = URL(string: v),
              u.scheme == "https" || u.scheme == "http", u.host != nil else { return nil }
        return v.hasSuffix("/") ? String(v.dropLast()) : v
    }
}

// MARK: - Air4Thai (PCD)

public enum Air4Thai {
    public static let ict = 7.0
    public static let base = "https://air4thai.pcd.go.th/forweb"
    public static let source = "PCD Air4Thai"
    public static let historyStations = 6
    public static let attribution = Attribution(
        id: "th.pcd", text: "Data: Pollution Control Department (PCD) Air4Thai, Thailand", url: "https://air4thai.pcd.go.th/",
        licence: "Thai government public data; redistribution terms unconfirmed (licence request pending)", shareAlike: nil)

    public struct Station: Sendable {
        public var stationID: String
        public var nameEN: String?
        public var nameTH: String?
        public var lat: Double
        public var lon: Double
        public var lastDate: String?
        public var lastTime: String?
        public var pm25Value: Double?
        public var aqi: Double?
        public var aqiParam: String?
    }

    /// A number that may arrive as a string; sentinel/invalid/negative values → nil (time.ts `num`).
    static func num(_ v: Any?) -> Double? {
        var n = Double.nan
        if let d = v as? Double { n = d } else if let i = v as? Int { n = Double(i) }
        else if let s = v as? String, !s.trimmingCharacters(in: .whitespaces).isEmpty { n = Double(s.trimmingCharacters(in: .whitespaces)) ?? .nan }
        guard n.isFinite, n >= 0, ![-1.0, -999, -9999].contains(n) else { return nil }
        return n
    }

    public static func aqiURL() -> URL { URL(string: "\(base)/getAQI_JSON.php")! }

    /// History, yesterday → today in ICT.
    public static func historyURL(_ ids: [String], now: TimeInterval) -> URL {
        let d = SeaTime.localDate(now, offsetHours: ict)
        let y = SeaTime.localDate(now - 86400, offsetHours: ict)
        let enc = ids.map { $0.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? $0 }.joined(separator: ",")
        return URL(string: "\(base)/getHistoryData.php?stationID=\(enc)&param=PM25&type=hr&sdate=\(y)&edate=\(d)&stime=00&etime=23")!
    }

    public static func parseStations(_ data: Data) -> [Station] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = root["stations"] as? [[String: Any]] else { return [] }
        return list.compactMap { s in
            guard let id = s["stationID"] as? String, let lat = num(s["lat"]), let lon = num(s["long"]) else { return nil }
            let last = s["AQILast"] as? [String: Any] ?? [:]
            let pm = last["PM25"] as? [String: Any]
            let aqi = last["AQI"] as? [String: Any]
            return Station(stationID: id, nameEN: s["nameEN"] as? String, nameTH: s["nameTH"] as? String, lat: lat, lon: lon,
                           lastDate: last["date"] as? String, lastTime: last["time"] as? String,
                           pm25Value: num(pm?["value"]), aqi: num(aqi?["aqi"]), aqiParam: aqi?["param"] as? String)
        }
    }

    /// stationID → hourly series (hour-ending ISO +07:00), oldest → newest.
    public static func parseHistory(_ data: Data) -> [String: [(time: String, pm25: Double?)]] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let stations = root["stations"] as? [[String: Any]] else { return [:] }
        var out: [String: [(time: String, pm25: Double?)]] = [:]
        for st in stations {
            guard let id = st["stationID"] as? String, let rows = st["data"] as? [[String: Any]] else { continue }
            var list: [(time: String, pm25: Double?)] = []
            for r in rows {
                guard let w = r["DATETIMEDATA"] as? String, let t = SeaTime.wallToIso(w, offsetHours: ict) else { continue }
                list.append((t, num(r["PM25"])))
            }
            list.sort { (SeaTime.parse($0.time) ?? 0) < (SeaTime.parse($1.time) ?? 0) }
            out[id] = list
        }
        return out
    }

    /// PCD's rolling 24-h mean over the available hours ending at index i.
    static func rolling24(_ rows: [(time: String, pm25: Double?)], _ i: Int) -> Double? {
        guard let end = SeaTime.parse(rows[i].time) else { return nil }
        let vals = rows.compactMap { r -> Double? in
            guard let t = SeaTime.parse(r.time), t <= end, t > end - 86400 else { return nil }
            return r.pm25
        }
        guard vals.count >= 12 else { return nil }
        return jsRound(vals.reduce(0, +) / Double(vals.count) * 10) / 10
    }

    public static func observations(_ stations: [Station], history: [String: [(time: String, pm25: Double?)]] = [:], keepHours: Int = 26) -> [SeaObservation] {
        stations.compactMap { s in
            let lastTime = (s.lastDate != nil && s.lastTime != nil) ? SeaTime.wallToIso("\(s.lastDate!) \(s.lastTime!)", offsetHours: ict) : nil
            let official = s.aqi.map { aqi in
                OfficialIndex(scaleId: "th_aqi", name: "Thai AQI", value: aqi, category: SeaScales.classifyIndex("th_aqi", aqi)?.labelLocal,
                              averaging: "24h", param: (s.aqiParam != nil && s.aqiParam != "-1") ? s.aqiParam : nil, agency: "PCD")
            }
            let rows = history[s.stationID] ?? []
            var hist = rows.enumerated().map { ObservationHour(time: $0.element.time, pm25: $0.element.pm25, pm25Avg24h: rolling24(rows, $0.offset)) }
            hist = Array(hist.suffix(keepHours))
            if let lt = lastTime, let v = s.pm25Value, let idx = hist.firstIndex(where: { SeaTime.parse($0.time) == SeaTime.parse(lt) }) {
                hist[idx].pm25Avg24h = v
            }
            let lastValid = rows.last { $0.pm25 != nil }
            guard let periodEnd = lastValid?.time ?? lastTime else { return nil }
            let name = (s.nameEN ?? s.nameTH ?? s.stationID).trimmingCharacters(in: .whitespaces)
            return SeaObservation(stationId: "th.pcd:\(s.stationID)", name: name, country: .TH, lat: s.lat, lon: s.lon, grade: "reference",
                               indoor: nil, pm25_1h: lastValid?.pm25, pm25_now: nil, pm25_24h: s.pm25Value, official: official,
                               periodEnd: periodEnd, publishedAt: nil, history: hist.isEmpty ? nil : hist, corrected: "none",
                               k: nil, qc: nil, attributionId: attribution.id)
        }
    }
}

// MARK: - Adapters

public struct SeaContext: Sendable {
    public var fetch: FetchFunction
    public var now: TimeInterval
    /// Proxy base (HAZENOW_EDGE), or nil when unset.
    public var proxyBase: String?
    /// Per-request timeout (default ~8 s).
    public var timeout: TimeInterval
    public init(fetch: @escaping FetchFunction = HazeFetch.urlSession(), now: TimeInterval = Date().timeIntervalSince1970,
                proxyBase: String? = HazeEdge.configured(), timeout: TimeInterval = upstreamTimeout) {
        self.fetch = fetch
        self.now = now
        self.proxyBase = proxyBase
        self.timeout = timeout
    }
}

public enum SeaAdapters {
    static func getJSON(_ f: FetchFunction, _ url: URL) async throws -> Data {
        let r = try await f(url)
        guard r.ok else { throw ProxyError(message: "HTTP \(r.status) for \(url.absoluteString)", status: r.status, retryAfter: r.retryAfter) }
        return r.data
    }

    /// Minimal shape check so a broken proxy can't feed garbage into the builder.
    public static func decodeSet(_ data: Data, country: CountryCode) -> ObservationSet? {
        guard let s = try? JSONDecoder().decode(ObservationSet.self, from: data), s.country == country else { return nil }
        return s
    }

    /// Thailand's community sensors from the proxy (low-cost rows only).
    static func thCrowd(_ f: FetchFunction, _ base: String) async throws -> (obs: [SeaObservation], attr: [Attribution]) {
        let url = URL(string: "\(base)/v1/th/observations?grade=lowcost")!
        guard let set = decodeSet(try await getJSON(f, url), country: .TH) else { throw ProxyError(message: "Unexpected response for \(url)") }
        let obs = set.observations.filter { $0.grade == "lowcost" && $0.country == .TH }
        let ids = Set(obs.map(\.attributionId))
        return (obs, set.attribution.filter { ids.contains($0.id) })
    }

    /// PCD Air4Thai, with the in-country community-sensor fallback (adapters/th.ts).
    public static func thObservations(_ ctx: SeaContext, near: LatLon?) async throws -> ObservationSet {
        let f = HazeFetch.timed(ctx.fetch, seconds: ctx.timeout)
        let fetchedAt = SeaTime.toUtcIso(ctx.now)
        let crowdTask: Task<Result<(obs: [SeaObservation], attr: [Attribution]), Error>, Never>? = ctx.proxyBase.map { base in
            Task { do { return .success(try await thCrowd(f, base)) } catch { return .failure(error) } }
        }
        var warnings: [String] = []
        let stations: [Air4Thai.Station]
        do {
            stations = Air4Thai.parseStations(try await getJSON(f, Air4Thai.aqiURL()))
            if stations.isEmpty { throw NoCountryDataError(message: "Air4Thai: no stations in getAQI_JSON") }
        } catch {
            // Air4Thai down or timed out: in-country community sensors stand in (≤ 10 km, same country), labelled.
            guard let c = await crowdTask?.value, case let .success(crowd) = c, !crowd.obs.isEmpty else {
                throw OfficialUnavailableError(country: .TH, source: Air4Thai.source)
            }
            return ObservationSet(country: .TH, adapters: ["crowd.proxy"], fetchedAt: fetchedAt, observations: crowd.obs,
                                  attribution: crowd.attr, hotspots: nil, hotspotSource: nil,
                                  warnings: ["th.air4thai: \(error.localizedDescription); PCD stations unavailable"],
                                  officialUnavailable: Air4Thai.source)
        }
        var ids = stations.map(\.stationID)
        if let p = near {
            ids = stations.sorted { seaHaversineKm(p, LatLon(lat: $0.lat, lon: $0.lon)) < seaHaversineKm(p, LatLon(lat: $1.lat, lon: $1.lon)) }
                .prefix(Air4Thai.historyStations).map(\.stationID)
        }
        var history: [String: [(time: String, pm25: Double?)]] = [:]
        var historyDown = false
        do {
            history = Air4Thai.parseHistory(try await getJSON(f, Air4Thai.historyURL(ids, now: ctx.now)))
        } catch {
            historyDown = true
            warnings.append("th.air4thai history: \(error.localizedDescription); 1-hr values unavailable")
        }
        var extra: (obs: [SeaObservation], attr: [Attribution])?
        if let c = await crowdTask?.value {
            switch c {
            case let .success(x): extra = x
            case let .failure(e): warnings.append("th.crowd: \(e.localizedDescription); community sensors unavailable")
            }
        }
        return ObservationSet(country: .TH, adapters: ["th.air4thai"] + ((extra?.obs.isEmpty ?? true) ? [] : ["crowd.proxy"]),
                              fetchedAt: fetchedAt, observations: Air4Thai.observations(stations, history: history) + (extra?.obs ?? []),
                              attribution: [Air4Thai.attribution] + (extra?.attr ?? []), hotspots: nil, hotspotSource: nil,
                              warnings: warnings.isEmpty ? nil : warnings, officialUnavailable: historyDown ? Air4Thai.source : nil)
    }

    /// Proxied countries: `GET {edge}/v1/{cc}/observations`.
    public static func proxiedObservations(_ cc: CountryCode, _ ctx: SeaContext) async throws -> ObservationSet {
        guard let base = ctx.proxyBase else { throw ProxyError(message: "\(cc.rawValue.lowercased()).proxy: the proxy URL (HAZENOW_EDGE) is not configured") }
        let f = HazeFetch.timed(ctx.fetch, seconds: ctx.timeout)
        let url = URL(string: "\(base)/v1/\(cc.rawValue.lowercased())/observations")!
        guard let set = decodeSet(try await getJSON(f, url), country: cc) else { throw ProxyError(message: "Unexpected response for \(url)") }
        return set
    }

    /// Whether this app can fetch a country right now (SG/TH direct; others need the proxy URL).
    public static func available(_ cc: CountryCode, proxyBase: String?) -> Bool {
        switch cc {
        case .SG, .TH: true
        case .MY, .ID, .VN, .PH, .LA, .KH: proxyBase != nil
        case .MM, .BN, .TL: false
        }
    }

    /// Fetch + build for a place (never for SG, which keeps the v1 path).
    public static func snapshot(_ cc: CountryCode, query: CountryQuery, ctx: SeaContext = SeaContext()) async throws -> CountrySnapshot {
        let near = query.lat.flatMap { lat in query.lon.map { LatLon(lat: lat, lon: $0) } }
        let set: ObservationSet = switch cc {
        case .TH: try await thObservations(ctx, near: near)
        case .MY, .ID, .VN, .PH, .LA, .KH: try await proxiedObservations(cc, ctx)
        case .SG, .MM, .BN, .TL: throw NoCountryDataError(message: "No adapter for \(cc.rawValue) here")
        }
        return try SeaBuild.snapshot(set, query: query, now: ctx.now)
    }
}
