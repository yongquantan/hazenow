import HazeKit
import HazeUI
import SwiftUI

/// One screen, SPEC v1.1 order: verdict → number → provenance → actions → chart → regions → footer.
/// Copy is verbatim from docs/COPY.md (via HazeKit). No Instant PSI (SPEC v1.2 §1).
struct ContentView: View {
    @Bindable var store: HazeStore
    let watch: HazeWatch
    @State private var sheet: Sheet?
    @Environment(\.openURL) private var openURL

    enum Sheet: String, Identifiable {
        case explainer, profiles, areas, onboarding
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let s = store.snapshot, let insight = store.insight {
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
                    PlaceSwitcherMenu(store: store, onPickArea: { sheet = .areas }) {
                        Label(store.resolved.label, systemImage: store.isMyLocation ? "location.fill" : "mappin")
                            .font(.headline)
                    }
                }
                ToolbarItem(placement: .principal) { MockBadge(scenario: store.mockScenario) }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { sheet = .profiles } label: { Image(systemName: "person.2") }
                        .accessibilityLabel(HazeCopy.profileTitle)
                    if let s = store.snapshot, let insight = store.insight {
                        ShareSnapshotButton(snapshot: s, insight: insight).labelStyle(.iconOnly)
                    }
                }
            }
            .sheet(item: $sheet) { which in
                NavigationStack { sheetContent(which) }
                    .presentationDetents(which == .explainer ? [.medium, .large] : [.large])
            }
            .onAppear { if !store.onboarded { sheet = .onboarding } }
        }
    }

    @ViewBuilder
    private func sheetContent(_ which: Sheet) -> some View {
        switch which {
        case .explainer:
            ScrollView { ExplainerView(snapshot: store.snapshot).padding(20) }
                .navigationTitle(HazeCopy.whyTwoNumbersLink)
                .toolbar { Button("Done") { sheet = nil } }
        case .profiles:
            Form {
                ProfilePicker(profiles: $store.profiles)
                Section {
                    Toggle("Notify when the band changes", isOn: $store.notifyOnRise)
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
                    Text(HazeCopy.privacyLine).font(.footnote).foregroundStyle(.secondary)
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
            Label(note, systemImage: "location.slash").font(.footnote).foregroundStyle(.secondary)
        }
        if store.locationDenied {
            LocationDeniedChip { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
        }
        if store.loadError == .offline {
            Label(HazeCopy.offlineChip, systemImage: "wifi.slash").font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
        }
        VerdictHeader(snapshot: s, insight: insight, size: .title)
            .padding(.top, 8)
        BigNumber(snapshot: s, insight: insight, numberSize: 108)
            .animation(.smooth, value: s.pm25)
        ProvenanceLine(insight: insight)
        if let detail = store.statusDetail {
            Text(detail).font(.footnote).foregroundStyle(.secondary)
        }
        card { ActionsList(insight: insight, band: s.band) }
        if store.shouldAskNotify {
            NotifyAskCard(onYes: { store.answerNotifyAsk(true) }, onNo: { store.answerNotifyAsk(false) })
        }
        card { ChartSection(snapshot: s, height: 190, onWhy: { sheet = .explainer }) }
        card { RegionsSection(snapshot: s) }
        card { hazeWatch(s) }
        Link(destination: HazeCopy.neaForecastURL) {
            Label(HazeCopy.planningLine, systemImage: "calendar").font(.footnote)
        }
        Button { sheet = .explainer } label: { Text(HazeCopy.howTitle).font(.footnote) }
        TrustFooter(snapshot: s)
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
                .font(.footnote).foregroundStyle(.secondary)
            if let m = watch.message { Text(m).font(.footnote).foregroundStyle(.secondary) }
        }
    }

    private var background: some View {
        LinearGradient(colors: [(store.snapshot?.band.color ?? .gray).opacity(0.14), Color(.systemBackground)],
                       startPoint: .top, endPoint: .center)
    }

    private func card<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.regularMaterial))
    }
}
