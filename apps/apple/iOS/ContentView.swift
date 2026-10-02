import HazeKit
import HazeUI
import SwiftUI

/// One screen, SPEC v1.1 order: verdict → number → provenance → actions → chart → regions → footer.
/// Copy is verbatim from docs/COPY.md (via HazeKit). No Instant PSI (SPEC v1.2 §1).
struct ContentView: View {
    @Bindable var store: HazeStore
    let watch: HazeWatch
    @State private var sheet: Sheet?
    @State private var pickerStart: CountryCode?
    @Environment(\.openURL) private var openURL

    /// QA only (DEBUG builds): `-HazeOpenShare YES` / `-HazeOpenSheet profiles|about|explainer|areas`.
    /// Read from the launch-argument domain, which is never written back to disk.
    static var qaSheet: Sheet? {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "HazeOpenShare") { return .share }
        return UserDefaults.standard.string(forKey: "HazeOpenSheet").flatMap(Sheet.init(rawValue:))
        #else
        return nil
        #endif
    }

    enum Sheet: String, Identifiable {
        case explainer, profiles, areas, onboarding, share, shareClocks, about, places
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    GuessBannerView(store: store, onChange: { openPlaces(nil) }, onCountry: { openPlaces($0) })
                    if let c = store.country {
                        CountryDetailView(store: store, state: c, onChangePlace: { openPlaces(c.country) })
                    } else if let s = store.snapshot, let insight = store.insight {
                        loaded(s, insight)
                    } else if let error = store.loadError {
                        errorView(error)
                    } else {
                        ProgressView(HazeCopy.loading).frame(maxWidth: .infinity, minHeight: 300)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .background(background.ignoresSafeArea())
            .refreshable { await store.refresh() }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    PlaceSwitcherMenu(store: store, onPickArea: { sheet = .areas }, onOtherCountries: { openPlaces(nil) }) {
                        Label(store.resolved.label, systemImage: store.isMyLocation ? "location.fill" : "mappin")
                            .hazeHeadline(.headline)
                    }
                }
                ToolbarItem(placement: .principal) { MockBadge(scenario: store.mockScenario) }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { sheet = .profiles } label: { Image(systemName: "person.2") }
                        .accessibilityLabel(HazeCopy.profileTitle)
                }
            }
            .sheet(item: $sheet) { which in
                NavigationStack { sheetContent(which) }
                    .presentationDetents(which == .explainer || which == .about ? [.medium, .large] : [.large])
            }
            .onAppear {
                if store.showsFirstRunChoice { sheet = .onboarding }
                // QA: `-HazeOpenShare YES` opens the share sheet at launch (no URL confirmation dialog).
                else if let qa = Self.qaSheet { sheet = qa }
            }
            .onOpenURL { url in
                if url.host == "share" { sheet = .share } else if url.host == "about" { sheet = .about }
                else if url.host == "open" || url.host == "place" { store.openDeepLink(url); sheet = nil }
            }
            .onReceive(NotificationCenter.default.publisher(for: .hazeNowOpenShare)) { _ in sheet = .share }
        }
    }

    @ViewBuilder
    private func sheetContent(_ which: Sheet) -> some View {
        switch which {
        case .explainer:
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Button { sheet = .shareClocks } label: {
                        Label("Share the two clocks", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.bordered)
                    ExplainerView(snapshot: store.snapshot)
                }
                .padding(20)
            }
            .navigationTitle(HazeCopy.whyTwoNumbersLink)
            .toolbar { Button("Done") { sheet = nil } }
        case .share, .shareClocks:
            Group {
                if let model = ShareModel(store: store, fromWhyTwoNumbers: which == .shareClocks) {
                    ShareComposer(model: model).padding()
                } else {
                    ContentUnavailableView(HazeCopy.loading, systemImage: "hourglass")
                }
            }
            .navigationTitle("Share")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { sheet = nil } }
        case .about:
            ScrollView { AboutView().padding(20) }
                .navigationTitle("About")
                .toolbar { Button("Done") { sheet = nil } }
        case .profiles:
            Form {
                ProfilePicker(profiles: $store.profiles)
                Section {
                    Toggle("Notify when the band changes", isOn: $store.notifyOnRise)
                    NotifyPermissionNote(store: store)
                    Toggle("Also notify at Elevated", isOn: $store.elevatedForGeneral).disabled(!store.notifyOnRise)
                } footer: {
                    Text("Band changes only, with an all-clear. At most 3 a day. Never 10pm–7am.")
                }
                Section("Saved places") {
                    ForEach(SavedPlace.Kind.allCases, id: \.self) { kind in
                        let saved = store.savedPlaces.first { $0.kind == kind }
                        HStack {
                            Label(kind.defaultLabel, systemImage: kind.symbolName)
                            Spacer()
                            Text(saved.map { $0.area ?? "From location" } ?? "Not set").foregroundStyle(.secondary)
                            Button(saved == nil ? "Save current" : "Update") { store.save(kind) }
                                .disabled(store.resolved.input.coordinate == nil)
                        }
                    }
                    Text(HazeCopy.privacyLine).font(.haze(.footnote)).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .toolbar { Button("Done") { sheet = nil } }
        case .areas:
            AreaPickerList { area in
                store.placeMode = .area(area.name)
                store.onboarded = true
                sheet = nil
            }
            .padding()
            .navigationTitle(PlaceCopy.pickArea)
            .toolbar { Button("Cancel") { sheet = nil } }
        case .places:
            PlacePickerView(store: store, startAt: pickerStart) { sheet = nil }
                .padding()
                .navigationTitle("Places")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("Close") { sheet = nil } }
        case .onboarding:
            ScrollView {
                PlaceOnboardingView(store: store).padding(20)
            }
            .onChange(of: store.onboarded) { _, done in if done { sheet = nil } }
            .interactiveDismissDisabled(false)
        }
    }

    @ViewBuilder
    private func loaded(_ s: Snapshot, _ insight: HazeInsight) -> some View {
        if let note = store.locationNote {
            Label(note, systemImage: "location.slash").font(.haze(.footnote)).foregroundStyle(.secondary)
        }
        if store.locationDenied {
            LocationDeniedChip { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
        }
        if store.loadError == .offline {
            Label(HazeCopy.offlineChip, systemImage: "wifi.slash").font(.haze(.footnote, weight: .semibold)).foregroundStyle(.secondary)
        }
        VerdictHeader(snapshot: s, insight: insight, size: .title)
            .padding(.top, 8)
        Button { sheet = .share } label: {
            Label("Share", systemImage: "square.and.arrow.up")
                .font(.haze(.headline, weight: .semibold))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .tint(Color(red: 0.08, green: 0.14, blue: 0.17))
        BigNumber(snapshot: s, insight: insight, numberSize: 108)
            .animation(.smooth, value: s.pm25)
        ProvenanceLine(insight: insight)
        OfficialPsiView(snapshot: s)   // above the fold (SPEC v1.2 §1)
        if let detail = store.statusDetail {
            Text(detail).font(.haze(.footnote)).foregroundStyle(.secondary)
        }
        card { ActionsList(insight: insight, band: s.band) }
        NotifyAskSection(store: store)
        card { ChartSection(snapshot: s, height: 190, showOfficial: false, onWhy: { sheet = .explainer }) }
        card { RegionsSection(snapshot: s, onSelect: { store.placeMode = .region($0) }) }
        card { hazeWatch(s) }
        Link(destination: HazeCopy.neaForecastURL) {
            Label(HazeCopy.planningLine, systemImage: "calendar").font(.haze(.footnote))
        }
        Button { sheet = .explainer } label: { Text(HazeCopy.howTitle).font(.haze(.footnote)) }
        TrustFooter(snapshot: s)
        MadeByButton { sheet = .about }
    }

    private func errorView(_ error: HazeStore.LoadError) -> some View {
        let (title, detail): (String, String) = switch error {
        case .offline: (HazeCopy.offlineNoCacheTitle, HazeCopy.offlineNoCacheDetail)
        case .noData: (HazeCopy.noDataTitle, HazeCopy.noDataDetail)
        case .api: (HazeCopy.apiErrorTitle, HazeCopy.apiErrorDetail)
        }
        return ContentUnavailableView {
            Label(title, systemImage: error == .offline ? "wifi.slash" : "exclamationmark.icloud")
        } description: {
            Text(detail)
        } actions: {
            Button(HazeCopy.tryAgain) { Task { await store.refresh() } }
        }
        .padding(.top, 80)
    }

    private func hazeWatch(_ s: Snapshot) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: Binding(get: { watch.isOn }, set: { _ in Task { await watch.toggle(store: store) } })) {
                Label("Haze watch", systemImage: "eye")
            }
            Text("Keeps the current reading on your Lock Screen and Dynamic Island while the app refreshes.")
                .font(.haze(.footnote)).foregroundStyle(.secondary)
            if let m = watch.message { Text(m).font(.haze(.footnote)).foregroundStyle(.secondary) }
        }
    }

    private func openPlaces(_ cc: CountryCode?) {
        pickerStart = cc
        sheet = .places
    }

    private var background: some View {
        let tint: Color = store.country != nil ? (store.countryTint.map { Color(hex: $0) } ?? .gray) : (store.snapshot?.band.color ?? .gray)
        return LinearGradient(colors: [tint.opacity(0.14), Color(.systemBackground)],
                       startPoint: .top, endPoint: .center)
    }

    private func card<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.regularMaterial))
    }
}
