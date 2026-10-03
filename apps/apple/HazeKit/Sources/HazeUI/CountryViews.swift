import Charts
import HazeKit
import SwiftUI

// SPEC v2.0/v2.1 views for places outside Singapore, mirroring apps/web/src/country.ts. Singapore's views are untouched.

// MARK: - Colour helpers

extension Color {
    /// The authority's hue mixed toward ink for text (same rule as the web's --band-ink: 58% / 62% in dark).
    static func bandInk(_ hex: String) -> Color {
        func mix(_ a: String, _ b: String, _ t: Double) -> String {
            let x = Band.rgb(hex: a), y = Band.rgb(hex: b)
            let c = [x.red * t + y.red * (1 - t), x.green * t + y.green * (1 - t), x.blue * t + y.blue * (1 - t)]
            return "#" + c.map { String(format: "%02X", Int(($0 * 255).rounded())) }.joined()
        }
        return .adaptive(light: mix(hex, "#14232B", 0.58), dark: mix(hex, "#F5F0E6", 0.62))
    }
}

extension ChipShape {
    var symbolName: String {
        switch self {
        case .circle: "circle.fill"
        case .half: "circle.lefthalf.filled"
        case .triangle: "triangle.fill"
        case .octagon: "octagon.fill"
        }
    }
}

public extension HazeStore {
    /// Tint for the country view (the chip's colour, the WHO tone, or neutral).
    var countryTint: String? {
        guard let s = country?.snapshot else { return nil }
        return SeaDisplay.display(s).chip?.color ?? "#8FA3AD"
    }
}

// MARK: - Chip

/// The authority's category (English + their own word small), never colour alone; "estimate" tag; "(old)" when stale.
public struct SeaChipView: View {
    var chip: ChipModel
    var stale: Bool
    public init(chip: ChipModel, stale: Bool = false) {
        self.chip = chip
        self.stale = stale
    }

    public var body: some View {
        let ink = Color.bandInk(chip.color)
        HStack(spacing: 5) {
            Image(systemName: chip.shape.symbolName).foregroundStyle(Color.rgb(chip.color))
            Text(chip.en + (stale ? " \(HazeCopy.oldSuffix)" : "")).font(.haze(.subheadline, weight: .semibold))
            if let local = chip.local { Text(local).font(.haze(.caption)).opacity(0.8) }
            if chip.estimate { Text("estimate").font(.haze(.caption2, weight: .medium)).opacity(0.75) }
        }
        .foregroundStyle(ink)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Capsule().fill(stale ? Color.clear : Color.rgb(chip.color).opacity(0.14)))
        .overlay(Capsule().strokeBorder(stale ? ink.opacity(0.7) : .clear, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(chip.en)\(chip.local.map { ", \($0)" } ?? ""), \(chip.agency)\(chip.estimate ? ", estimate" : "")\(stale ? ", old reading" : "")")
    }
}

// MARK: - Guess line (SPEC v2.1 §4)

public struct GuessBannerView: View {
    @Bindable var store: HazeStore
    var onChange: () -> Void
    var onCountry: (CountryCode) -> Void

    public init(store: HazeStore, onChange: @escaping () -> Void, onCountry: @escaping (CountryCode) -> Void) {
        self.store = store
        self.onChange = onChange
        self.onCountry = onCountry
    }

    public var body: some View {
        switch store.guessBanner {
        case let .sure(place)?:
            line(GuessCopy.showing(place))
        case let .notCovered(country, place)?:
            line(GuessCopy.notCovered(country, place))
        case .unsure?:
            VStack(alignment: .leading, spacing: 8) {
                Text(GuessCopy.whereChecking).font(.haze(.subheadline, weight: .semibold))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(SeaPlaces.pickerCountries, id: \.self) { cc in
                            Button(SeaRegistry.name(cc)) { onCountry(cc) }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                        }
                    }
                }
                preciseButton
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.regularMaterial))
        case nil:
            EmptyView()
        }
    }

    private func line(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Text(text + " ·").font(.haze(.footnote)).foregroundStyle(.secondary)
                Button(GuessCopy.change, action: onChange).font(.haze(.footnote, weight: .semibold)).buttonStyle(.borderless)
            }
            preciseButton
        }
    }

    private var preciseButton: some View {
        Button(GuessCopy.precise) { store.useMyLocation() }
            .font(.haze(.caption))
            .buttonStyle(.borderless)
    }
}

// MARK: - Country view

/// Everything for a place outside Singapore, in the web's order: verdict → number/chip → kind · range → WHO line →
/// official row → share → trend → provenance → flags → actions → chart → nearby stations → attribution.
public struct CountryDetailView: View {
    @Bindable var store: HazeStore
    var state: CountryViewState
    var compact: Bool
    var onChangePlace: () -> Void

    public init(store: HazeStore, state: CountryViewState, compact: Bool = false, onChangePlace: @escaping () -> Void) {
        self.store = store
        self.state = state
        self.compact = compact
        self.onChangePlace = onChangePlace
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: compact ? 12 : 18) {
            if let s = state.snapshot {
                reading(s)
            } else {
                emptyState
            }
        }
    }

    // MARK: States without a reading

    @ViewBuilder private var emptyState: some View {
        switch state.phase {
        case .loading, .live, .cached:
            ProgressView("Getting the latest reading…").frame(maxWidth: .infinity, minHeight: compact ? 160 : 260)
        case let .notAvailable(reason, fix):
            calm(title: SeaDisplay.notAvailableHeadline, lines: [reason] + (fix.map { ["What would fix it: \($0)"] } ?? []))
        case let .notOnThisApp(line):
            calm(title: GuessCopy.notOnThisAppTitle, lines: [line] + (state.city?.note.map { [$0] } ?? []))
        case let .down(title, line):
            calm(title: title, lines: [line], retry: true)
        case let .noData(title, line):
            calm(title: title, lines: [line], retry: true)
        }
    }

    private func calm(title: String, lines: [String], retry: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(state.placeName).font(.haze(.subheadline)).foregroundStyle(.secondary)
            Text(title).font(.haze(compact ? .title3 : .title2, weight: .semibold)).tracking(-0.4)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            ForEach(lines, id: \.self) { l in
                Text(l).font(.haze(.callout)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                if retry { Button(HazeCopy.tryAgain) { Task { await store.refresh() } }.buttonStyle(.bordered) }
                Button("Pick another place", action: onChangePlace).buttonStyle(.bordered)
            }
            .padding(.top, 4)
        }
        .padding(.top, compact ? 4 : 24)
    }

    // MARK: A reading

    @ViewBuilder private func reading(_ s: CountrySnapshot) -> some View {
        let d = SeaDisplay.display(s, placeName: state.placeName, viewerOffsetHours: SeaDisplay.deviceOffsetHours, lon: state.lon)
        let v = SeaVerdicts.verdict(s, profiles: store.profiles)
        let tint = d.chip?.color ?? "#8FA3AD"
        let history = s.historyPoints

        // 1. Verdict. The headline is always ink (WHO-guidance verdicts included); the bar carries the tone.
        HStack(alignment: .top, spacing: 10) {
            Capsule().fill(Color.rgb(tint)).frame(width: 4).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(v.headline)
                    .font(.haze(compact ? .title3 : .title, weight: .semibold))
                    .tracking(-0.4)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let second = v.secondLine, second != d.whoLine {
                    Text(second).font(.haze(.callout)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Text(v.forWhom).font(.haze(.caption)).foregroundStyle(.secondary)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .opacity(s.stale ? 0.75 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .padding(.top, compact ? 0 : 8)

        // 2. Number (or the calm no-number state) and the chip.
        if let pm25 = s.pm25 {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(pm25)")
                        .font(.haze(size: compact ? 54 : 108, weight: .bold, relativeTo: .largeTitle).monospacedDigit())
                        .tracking(-0.045 * (compact ? 54 : 108))
                        .foregroundStyle(Color.bandInk(tint))
                        .lineLimit(1).minimumScaleFactor(0.3)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(HazeCopy.pm25Unit).font(.haze(.callout, weight: .medium))
                        Text(d.numberSub).font(.haze(.caption)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("PM2.5 \(pm25) micrograms per cubic metre. \(d.numberSub)")
                if let chip = d.chip {
                    SeaChipView(chip: chip, stale: s.stale)
                    Text(chip.basisNote).font(.haze(.caption)).foregroundStyle(.secondary)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text(d.noNumberTitle ?? "").font(.haze(.headline, weight: .semibold))
                if let chip = d.chip { SeaChipView(chip: chip, stale: s.stale) }
                Text(d.noNumberLine ?? "").font(.haze(.callout)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if let sl = d.sensorLine {
                    Text("\(sl) It's a community sensor, not an official reading.").font(.haze(.callout)).fixedSize(horizontal: false, vertical: true)
                }
            }
        }

        if let kind = d.kindLabel {
            Text(kind + (s.range.map { " · range \($0[0])–\($0[1])" } ?? "")).font(.haze(.footnote, weight: .medium)).foregroundStyle(.secondary)
        }
        if let who = d.whoLine {
            (Text(who) + Text("  WHO 2021, 15 µg/m³ over 24 hours").font(.haze(.caption)).foregroundStyle(.secondary))
                .font(.haze(.callout))
        }
        if let o = d.official {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(o.label): \(jsNumber(o.value))\((o.en ?? o.local).map { " · \($0)" } ?? "")").font(.haze(.headline, weight: .semibold))
                    if o.en != nil, let local = o.local { Text(local).font(.haze(.caption)).foregroundStyle(.secondary) }
                }
                if let e = d.officialExplainer { Text(e).font(.haze(.caption)).foregroundStyle(.secondary) }
            }
        }

        // Share (text, naming the scale and the authority). Only for a live hourly reading.
        if s.pm25 != nil, state.phase == .live {
            ShareLink(item: SeaDisplay.shareText(s, placeName: state.placeName, lon: state.lon)) {
                Label("Share", systemImage: "square.and.arrow.up")
                    .font(.haze(.headline, weight: .semibold))
                    .frame(maxWidth: compact ? nil : .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(compact ? .regular : .large)
            .tint(Color(red: 0.08, green: 0.14, blue: 0.17))
        }

        if s.pm25 != nil, HazeCompute.trendWord(history: history) != nil {
            HStack(spacing: 6) {
                TrendArrow(s.trend.direction)
                Text(HazeCompute.trendWords(history: history))
            }
            .font(.haze(.callout)).foregroundStyle(.secondary)
        }

        // Provenance and calm flags.
        VStack(alignment: .leading, spacing: 6) {
            if let p = d.provenance {
                let shown = (s.range != nil && d.kindLabel != nil) ? p.replacingOccurrences(of: #" · range \d+–\d+"#, with: "", options: .regularExpression) : p
                Label("\(shown) · \(age(s))", systemImage: "mappin.and.ellipse").font(.haze(.footnote)).foregroundStyle(.secondary)
            }
            if case let .cached(line) = state.phase { flag(line) }
            else if s.stale {
                flag("\(SeaDisplay.mainAgency(s)) hasn't posted a newer reading. This one is from \(SeaDisplay.stationTime(s.observedAt, s.country, viewerOffsetHours: SeaDisplay.deviceOffsetHours, lon: state.lon)).")
            }
            if s.notes.contains("nearest_far") {
                flag("The nearest official station is far from \(state.placeName), so treat this as a rough guide.")
            }
            ForEach(d.notices, id: \.self) { flag($0) }
            if let note = state.city?.note { Text(note).font(.haze(.caption)).foregroundStyle(.secondary) }
        }

        // Actions follow the authority's advice for the chip's category (never SG's bands).
        let acts = SeaVerdicts.actions(s, profiles: store.profiles)
        if !acts.isEmpty {
            card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("What helps now").font(.haze(.headline, weight: .semibold))
                    ForEach(acts, id: \.self) { a in
                        Label(a, systemImage: "checkmark.circle").font(.haze(.callout))
                    }
                }
            }
        } else if SeaVerdicts.adviceBand(s) == .normal, let pm = s.pm25, s.bandBasis == "pm25_1h" || pm <= 25 {
            Text(HazeCompute.calmLine(history: history)).font(.haze(.callout)).foregroundStyle(.secondary)
        }
        if let b = s.localBand, v.needsReview {
            Text(s.country == .TH
                 ? "Advice follows PCD's guidance for each Thai AQI category. Wording is a draft, awaiting native review."
                 : "Advice follows \(b.agency)'s guidance for each category. Wording is a draft, awaiting native review.")
                .font(.haze(.caption)).foregroundStyle(.secondary)
        }

        if s.pm25 != nil, s.history.count >= 2 {
            card { CountryChart(snapshot: s, lon: state.lon, height: compact ? 130 : 180) }
        }
        let rows = s.stations.filter { ($0.distanceKm ?? 0) <= SeaBuild.officialMaxKm }.prefix(6)
        if !rows.isEmpty {
            card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Nearby in \(s.country == .PH ? "the Philippines" : SeaRegistry.name(s.country))").font(.haze(.headline, weight: .semibold))
                    ForEach(Array(rows), id: \.stationId) { r in
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(r.name).font(.haze(.callout)).lineLimit(1)
                                Text("\(km(r.distanceKm))\(r.grade == "lowcost" ? " · sensor" : "")").font(.haze(.caption)).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if let v = r.pm25_1h { Text("\(Int((v + 0.5).rounded(.down))) µg/m³").font(.haze(.callout, weight: .semibold)).monospacedDigit() }
                            else if let o = r.official { Text("\(jsNumber(o.value)) \(o.name)").font(.haze(.callout)) }
                            else { Text("no reading").font(.haze(.caption)).foregroundStyle(.secondary) }
                        }
                    }
                    Text("Only \(SeaDisplay.officialDataOf(s.country).replacingOccurrences(of: " official data", with: "")) own stations and sensors are used here, never readings from across a border.")
                        .font(.haze(.caption)).foregroundStyle(.secondary)
                }
            }
        }
        if !d.attribution.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(d.attribution, id: \.text) { a in
                    if let url = URL(string: a.url) { Link(a.text, destination: url).font(.haze(.caption)) } else { Text(a.text).font(.haze(.caption)) }
                }
                Text("Not affiliated with any government agency. Estimates are labelled as estimates.").font(.haze(.caption2)).foregroundStyle(.secondary)
            }
        }
    }

    private func flag(_ text: String) -> some View {
        Label(text, systemImage: "info.circle").font(.haze(.footnote)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
    }

    private func age(_ s: CountrySnapshot) -> String {
        guard let t = SeaTime.parse(s.observedAt) else { return "" }
        let m = max(0, Int((Date().timeIntervalSince1970 - t) / 60))
        return m < 1 ? "just now" : SeaDisplay.ageText(minutes: m)
    }

    private func km(_ d: Double?) -> String {
        guard let d else { return "" }
        return d < 0.1 ? "under 0.1 km" : d < 10 ? String(format: "%.1f km", d) : "\(Int(d.rounded())) km"
    }

    private func card<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(compact ? 12 : 16)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.regularMaterial))
    }
}

/// Last 24 hours: hourly bars (by the scale's colour where the chip classifies the hour, else neutral), the
/// authority's 24-hr line where published, and the WHO 15 µg/m³ guide.
public struct CountryChart: View {
    var snapshot: CountrySnapshot
    var lon: Double
    var height: CGFloat

    public init(snapshot: CountrySnapshot, lon: Double, height: CGFloat = 180) {
        self.snapshot = snapshot
        self.lon = lon
        self.height = height
    }

    public var body: some View {
        let s = snapshot
        let pts = s.historyPoints
        let byHour = s.localBand != nil && s.bandBasis == "pm25_1h"
        let lines = s.history.compactMap { h in SeaTime.parse(h.time).flatMap { t in h.pm25Avg24h.map { (Date(timeIntervalSince1970: t), $0) } } }
        let agency = SeaDisplay.mainAgency(s)
        VStack(alignment: .leading, spacing: 8) {
            Text("Last 24 hours").font(.haze(.headline, weight: .semibold))
            Chart {
                ForEach(pts) { p in
                    BarMark(x: .value("Hour", p.time, unit: .hour), y: .value("PM2.5", p.pm25))
                        .foregroundStyle(Color.rgb(byHour ? (SeaScales.classifyPm25(s.localBand!.scaleId, Double(p.pm25))?.color ?? "#8FA3AD") : "#8FA3AD").opacity(0.85))
                }
                if lines.count >= 2 {
                    ForEach(lines, id: \.0) { l in
                        LineMark(x: .value("Hour", l.0, unit: .hour), y: .value("24-hr", l.1))
                            .foregroundStyle(.primary)
                            .lineStyle(StrokeStyle(lineWidth: 2))
                    }
                }
                RuleMark(y: .value("WHO", 15))
                    .foregroundStyle(.secondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
            .chartYScale(domain: 0...max(60, Double(pts.map(\.pm25).max() ?? 0) * 1.15))
            .frame(height: height)
            .accessibilityLabel(HazeCompute.chartSummary(pts))
            Text(s.isCrowdEstimate ? "Bars: hourly PM2.5, community-sensor estimate" : "Bars: hourly PM2.5 at your spot")
                .font(.haze(.caption)).foregroundStyle(.secondary)
            if lines.count >= 2 {
                Text("Line: \(agency) 24-hr average PM2.5. It moves slowly because it averages a whole day.").font(.haze(.caption)).foregroundStyle(.secondary)
            } else {
                Text("The dashed line is the WHO 24-hour guideline.").font(.haze(.caption)).foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Two-step place picker (SPEC v2.1 §4)

/// Step 1: countries (status chip, band dot when loaded). Step 2: that country's places, Popular first, then all
/// cities (SG: its 55 areas), then "Use my precise location". One search box searches every country and alias.
public struct PlacePickerView: View {
    @Bindable var store: HazeStore
    var onDone: () -> Void
    @State private var step: CountryCode?
    @State private var query = ""

    public init(store: HazeStore, startAt: CountryCode? = nil, onDone: @escaping () -> Void) {
        self.store = store
        self.onDone = onDone
        _step = State(initialValue: startAt)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Search places (Bali, Penang, KL, Tampines…)", text: $query)
                #if !os(watchOS)
                .textFieldStyle(.roundedBorder)
                #endif
                #if os(iOS)
                .textInputAutocapitalization(.words)
                #endif
                .autocorrectionDisabled()
            if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                searchResults
            } else if let cc = step {
                places(cc)
            } else {
                countries
            }
        }
    }

    private var searchResults: some View {
        let sea = SeaPlaces.search(query)
        let sg = SGAreas.search(query).prefix(6)
        return ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(sea, id: \.place.key) { m in
                    row(m.place.name, sub: [m.matched, m.place.region, SeaRegistry.name(m.place.country)].compactMap { $0 }.joined(separator: " · "),
                        status: SeaPlaces.coverageLabel(m.place)) { choose(m.place) }
                }
                ForEach(Array(sg)) { a in
                    row(a.name, sub: "Singapore", status: "Live") { store.pickSingaporeArea(a); onDone() }
                }
                if sea.isEmpty && sg.isEmpty {
                    Text("No place matches “\(query)”.").font(.haze(.callout)).foregroundStyle(.secondary).padding(.vertical, 8)
                }
            }
        }
    }

    private func status(_ cc: CountryCode) -> String {
        switch SeaRegistry.info(cc).status {
        case .liveDirect: "Live"
        case .needsProxy: SeaAdapters.available(cc, proxyBase: store.edge) ? "Live" : "Not yet on this app"
        default: "Not yet"
        }
    }

    private func dot(_ cc: CountryCode) -> Color? {
        if cc == .SG, store.country == nil, let s = store.snapshot { return s.band.color }
        if let c = store.country, c.country == cc, let hex = store.countryTint { return .rgb(hex) }
        return nil
    }

    private var countries: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Text("Countries").font(.haze(.headline, weight: .semibold)).padding(.bottom, 4).accessibilityAddTraits(.isHeader)
                ForEach(SeaPlaces.pickerCountries, id: \.self) { cc in
                    Button { step = cc } label: {
                        HStack {
                            if let d = dot(cc) { Circle().fill(d).frame(width: 8, height: 8) }
                            Text(SeaRegistry.name(cc)).font(.haze(.body))
                            Spacer()
                            Text(status(cc)).font(.haze(.caption, weight: .medium)).foregroundStyle(.secondary)
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 9)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Divider()
                }
            }
        }
    }

    @ViewBuilder private func places(_ cc: CountryCode) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Button { step = nil } label: { Label("Countries", systemImage: "chevron.left") }
                    .buttonStyle(.borderless).padding(.bottom, 4)
                Text(SeaRegistry.name(cc)).font(.haze(.title3, weight: .semibold)).accessibilityAddTraits(.isHeader)
                if cc == .SG {
                    section("Singapore")
                    row(PlaceCopy.islandLabel, sub: nil, status: nil) { store.pick(SeaPlaces.defaultCity(.SG)); onDone() }
                    ForEach(SGAreas.all) { a in row(a.name, sub: nil, status: nil) { store.pickSingaporeArea(a); onDone() } }
                } else {
                    let g = SeaPlaces.groups(cc)
                    if !g.popular.isEmpty {
                        section("Popular")
                        ForEach(g.popular) { p in row(p.name, sub: p.region, status: SeaPlaces.coverageLabel(p)) { choose(p) } }
                    }
                    if !g.others.isEmpty {
                        section("All cities")
                        ForEach(g.others) { p in row(p.name, sub: p.region, status: SeaPlaces.coverageLabel(p)) { choose(p) } }
                    }
                }
                Button { store.useMyLocation(); onDone() } label: { Label(GuessCopy.precise, systemImage: "location") }
                    .buttonStyle(.borderless).padding(.top, 12)
            }
        }
    }

    private func choose(_ p: CityPlace) {
        store.pick(p)
        onDone()
    }

    private func section(_ t: String) -> some View {
        Text(t).font(.haze(.caption, weight: .semibold)).foregroundStyle(.secondary).padding(.top, 12).padding(.bottom, 2)
    }

    private func row(_ title: String, sub: String?, status: String?, action: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            Button(action: action) {
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title).font(.haze(.body))
                        if let sub, !sub.isEmpty { Text(sub).font(.haze(.caption)).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    if let status { Text(status).font(.haze(.caption2)).foregroundStyle(.secondary) }
                }
                .padding(.vertical, 7)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Divider()
        }
    }
}

public extension Color {
    /// A colour from "#RRGGBB" (for app targets).
    init(hex: String) { self = .rgb(hex) }
}
