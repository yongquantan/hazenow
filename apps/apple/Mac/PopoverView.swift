import AppKit
import HazeKit
import HazeUI
import SwiftUI

/// The menu-bar popover. The notch panel reuses `HazeDetailContent`.
/// Fixed size, so SwiftUI content never drives the MenuBarExtra window's frame.
struct PopoverView: View {
    let store: HazeStore
    let notch: NotchController
    @State private var page: Page = .main

    enum Page { case main, settings, about, areas, share, shareClocks, credits, places }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().opacity(0.5)
            ScrollView {
                Group {
                    switch page {
                    case .main:
                        if !store.showsFirstRunChoice {
                            GuessBannerView(store: store, onChange: { page = .places }, onCountry: { _ in page = .places })
                            HazeDetailContent(store: store, onWhy: { page = .about }, onShare: { page = .share },
                                              onCredits: { page = .credits }, onPlaces: { page = .places })
                        } else {
                            PlaceOnboardingView(store: store)
                        }
                    case .settings: SettingsPane(store: store, notch: notch, onPickArea: { page = .areas })
                    case .about:
                        VStack(alignment: .leading, spacing: 12) {
                            Button { page = .shareClocks } label: { Label("Share the two clocks", systemImage: "square.and.arrow.up") }
                            ExplainerView(snapshot: store.snapshot)
                        }
                    case .share, .shareClocks:
                        if let model = ShareModel(store: store, fromWhyTwoNumbers: page == .shareClocks) {
                            ShareComposer(model: model)
                        } else {
                            Text(HazeCopy.loading)
                        }
                    case .credits: AboutView()
                    case .places:
                        PlacePickerView(store: store, startAt: store.country?.country) { page = .main }
                            .frame(height: 530)
                    case .areas:
                        AreaPickerList { area in
                            store.placeMode = .area(area.name)
                            store.onboarded = true
                            page = .main
                        }
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 580)
        }
        .frame(width: 380)
        .task { store.start() }
    }

    private var header: some View {
        HStack(spacing: 8) {
            if page == .main {
                PlaceMenu(store: store, onPickArea: { page = .areas }, onOtherCountries: { page = .places })
            } else {
                Button { page = .main } label: { Label("Back", systemImage: "chevron.left") }
                    .buttonStyle(.borderless)
            }
            MockBadge(scenario: store.mockScenario)
            Spacer()
            if store.isLoading { ProgressView().controlSize(.small) }
            HeaderButton(symbol: "arrow.clockwise", help: "Refresh") { Task { await store.refresh() } }
            HeaderButton(symbol: "info.circle", help: HazeCopy.whyTwoNumbersLink) { page = page == .about ? .main : .about }
            HeaderButton(symbol: "gearshape", help: "Settings") { page = page == .settings ? .main : .settings }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}

struct HeaderButton: View {
    var symbol: String
    var help: String
    var action: () -> Void
    var body: some View {
        Button(action: action) { Image(systemName: symbol) }
            .buttonStyle(.borderless)
            .help(help)
            .accessibilityLabel(help)
    }
}

/// Place switcher (SPEC v1.4): Near you · Home · Work/School · area · Singapore.
struct PlaceMenu: View {
    @Bindable var store: HazeStore
    var onPickArea: () -> Void
    var onOtherCountries: (() -> Void)?

    var body: some View {
        PlaceSwitcherMenu(store: store, onPickArea: onPickArea, onOtherCountries: onOtherCountries) {
            Label(store.resolved.label, systemImage: store.isMyLocation ? "location.fill" : "mappin")
                .hazeHeadline(.headline)
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }
}

/// Everything below the header, in SPEC v1.1 order (copy from docs/COPY.md).
struct HazeDetailContent: View {
    let store: HazeStore
    var compactChart = false
    var onWhy: (() -> Void)?
    var onShare: (() -> Void)?
    var onCredits: (() -> Void)?
    var onPlaces: (() -> Void)?

    var body: some View {
        if let c = store.country {
            CountryDetailView(store: store, state: c, compact: true, onChangePlace: { onPlaces?() })
        } else if let s = store.snapshot, let insight = store.insight {
            VStack(alignment: .leading, spacing: 14) {
                if let note = store.locationNote {
                    Label(note, systemImage: "location.slash").font(.haze(.caption)).foregroundStyle(.secondary)
                }
                if store.locationDenied {
                    LocationDeniedChip(openSettings: openLocationSettings)
                }
                if store.loadError == .offline {
                    Label(HazeCopy.offlineChip, systemImage: "wifi.slash").font(.haze(.caption, weight: .semibold)).foregroundStyle(.secondary)
                }
                HStack(alignment: .top) {
                    VerdictHeader(snapshot: s, insight: insight, size: .title3)
                    Spacer(minLength: 8)
                    if let onShare {
                        Button(action: onShare) { Label("Share", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.regular)
                    }
                }
                BigNumber(snapshot: s, insight: insight, numberSize: 54)
                ProvenanceLine(insight: insight)
                OfficialPsiView(snapshot: s)
                if let detail = store.statusDetail {
                    Text(detail).font(.haze(.caption)).foregroundStyle(.secondary)
                }
                ActionsList(insight: insight, band: s.band)
                NotifyAskSection(store: store)
                Divider().opacity(0.5)
                ChartSection(snapshot: s, height: compactChart ? 100 : 130, showOfficial: false, onWhy: onWhy)
                RegionsSection(snapshot: s, onSelect: { store.placeMode = .region($0) })
                VStack(alignment: .leading, spacing: 4) {
                    TrustFooter(snapshot: s)
                    if let onCredits { MadeByButton(action: onCredits) }
                }
            }
        } else if let error = store.loadError {
            let (title, detail) = Self.errorCopy(error)
            ContentUnavailableView {
                Label(title, systemImage: error == .offline ? "wifi.slash" : "exclamationmark.icloud")
            } description: {
                Text(detail)
            } actions: {
                Button(HazeCopy.tryAgain) { Task { await store.refresh() } }
            }
        } else {
            VStack(spacing: 8) {
                ProgressView()
                Text(HazeCopy.loading).font(.haze(.callout)).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 200)
        }
    }

    static func errorCopy(_ e: HazeStore.LoadError) -> (String, String) {
        switch e {
        case .offline: (HazeCopy.offlineNoCacheTitle, HazeCopy.offlineNoCacheDetail)
        case .noData: (HazeCopy.noDataTitle, HazeCopy.noDataDetail)
        case .api: (HazeCopy.apiErrorTitle, HazeCopy.apiErrorDetail)
        }
    }

    private func openLocationSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices") {
            NSWorkspace.shared.open(url)
        }
    }
}

struct SettingsPane: View {
    @Bindable var store: HazeStore
    let notch: NotchController
    var onPickArea: () -> Void
    @State private var launchAtLogin = LaunchAtLogin.isEnabled
    @State private var loginError: String?
    @State private var showNotch = HazeSettings.shared.showNotch

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ProfilePicker(profiles: $store.profiles)
            Divider()
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Showing: \(store.resolved.label)")
                    Spacer()
                    Button(HazeCopy.locationAskYes) { store.useMyLocation() }
                    Button(PlaceCopy.pickArea, action: onPickArea)
                }
                ForEach(SavedPlace.Kind.allCases, id: \.self) { kind in
                    let saved = store.savedPlaces.first { $0.kind == kind }
                    HStack {
                        Label(kind.defaultLabel, systemImage: kind.symbolName)
                        Spacer()
                        Text(saved.map { $0.area ?? "Set from location" } ?? "Not set").foregroundStyle(.secondary)
                        Button(saved == nil ? "Save current" : "Update") { store.save(kind) }
                            .disabled(store.resolved.input.coordinate == nil)
                    }
                    .font(.haze(.callout))
                }
                Text(HazeCopy.privacyLine).font(.haze(.caption)).foregroundStyle(.secondary)
                Toggle("Notify when the band changes", isOn: $store.notifyOnRise)
                NotifyPermissionNote(store: store)
                Toggle("Also notify at Elevated", isOn: $store.elevatedForGeneral)
                    .disabled(!store.notifyOnRise)
                Text("Band changes only, with an all-clear. At most 3 a day. Never 10pm–7am.")
                    .font(.haze(.caption)).foregroundStyle(.secondary)
                Toggle("Show beside the notch", isOn: $showNotch)
                    .onChange(of: showNotch) { _, on in
                        HazeSettings.shared.showNotch = on
                        notch.setEnabled(on)
                    }
                if showNotch && !notch.hasNotchedScreen {
                    Text("No notched display connected. HazeNow stays in the menu bar.")
                        .font(.haze(.caption)).foregroundStyle(.secondary)
                }
                Toggle("Launch at login", isOn: $launchAtLogin)
                    .onChange(of: launchAtLogin) { _, on in
                        loginError = LaunchAtLogin.set(on)
                        launchAtLogin = LaunchAtLogin.isEnabled
                    }
                if let loginError { Text(loginError).font(.haze(.caption)).foregroundStyle(.secondary) }
            }
            .toggleStyle(.switch)
            Divider()
            HStack {
                Text(HazeCopy.footer).font(.haze(.caption2)).foregroundStyle(.secondary)
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }
            }
        }
    }
}
