import HazeKit
import SwiftUI

// SPEC v1.4 place UI: first-run choice, offline area search, saved places, quick switcher.

public enum PlaceCopy {
    /// Shown *before* the OS prompt.
    #if os(macOS)
    public static let explainer = "We only use this to find your nearest NEA station. It stays on your Mac."
    #else
    public static let explainer = "We only use this to find your nearest NEA station. It stays on your phone."
    #endif
    public static let pickArea = "Pick my area"
    public static let searchPrompt = "Search towns and estates"
    public static let islandLabel = "Singapore (island average)"
}

/// First run: two equal choices, no OS prompt until the user taps.
public struct PlaceOnboardingView: View {
    @Bindable var store: HazeStore
    @State private var picking = false

    public init(store: HazeStore) { self.store = store }

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if picking {
                AreaPickerList { area in
                    store.placeMode = .area(area.name)
                    store.onboarded = true
                }
            } else {
                Text(HazeCopy.locationAskTitle).hazeHeadline(.title3)
                Text(HazeCopy.locationAskBody).font(.haze(.callout)).foregroundStyle(.secondary)
                Button {
                    store.useMyLocation()
                } label: {
                    Label(HazeCopy.locationAskYes, systemImage: "location").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                Text(PlaceCopy.explainer).font(.haze(.caption)).foregroundStyle(.secondary)
                Button {
                    picking = true
                } label: {
                    Label(PlaceCopy.pickArea, systemImage: "list.bullet").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                Button("Skip for now") {
                    store.placeMode = .island
                    store.onboarded = true
                }
                .buttonStyle(.borderless)
                .font(.haze(.caption))
            }
        }
    }
}

/// Offline, searchable list of the 55 URA planning areas (+ estate aliases). Typing leaks nothing.
public struct AreaPickerList: View {
    var onPick: (SGArea) -> Void
    @State private var query = ""

    public init(onPick: @escaping (SGArea) -> Void) { self.onPick = onPick }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(PlaceCopy.searchPrompt, text: $query)
                #if !os(watchOS)
                .textFieldStyle(.roundedBorder)
                #endif
                #if os(iOS)
                .textInputAutocapitalization(.words)
                #endif
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(SGAreas.search(query)) { area in
                        Button { onPick(area) } label: {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(area.name)
                                if let alias = matchingAlias(area) {
                                    Text(alias).font(.haze(.caption)).foregroundStyle(.secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Divider()
                    }
                }
            }
            .frame(minHeight: 220)
        }
    }

    private func matchingAlias(_ a: SGArea) -> String? {
        let q = query.lowercased()
        guard !q.isEmpty, !a.name.lowercased().contains(q) else { return nil }
        return a.aliases.first { $0.lowercased().contains(q) }
    }
}

#if !os(watchOS)
/// Quick switcher: Near you · Home · Work/School · picked area · Singapore.
public struct PlaceSwitcherMenu<LabelContent: View>: View {
    @Bindable var store: HazeStore
    var onPickArea: () -> Void
    var onOtherCountries: (() -> Void)?
    var label: () -> LabelContent

    public init(store: HazeStore, onPickArea: @escaping () -> Void, onOtherCountries: (() -> Void)? = nil,
                @ViewBuilder label: @escaping () -> LabelContent) {
        self.store = store
        self.onPickArea = onPickArea
        self.onOtherCountries = onOtherCountries
        self.label = label
    }

    public var body: some View {
        Menu {
            Button { store.useMyLocation() } label: { Label("Near you", systemImage: "location") }
            ForEach(store.savedPlaces) { p in
                Button { store.placeMode = .saved(p.kind) } label: {
                    Label(p.area.map { "\(p.label) · \($0)" } ?? p.label, systemImage: p.kind.symbolName)
                }
            }
            Button { onPickArea() } label: { Label(PlaceCopy.pickArea, systemImage: "list.bullet") }
            Button { store.placeMode = .island } label: { Label(PlaceCopy.islandLabel, systemImage: "globe.asia.australia") }
            if let onOtherCountries {
                // SPEC v2.1: the two-step place picker (countries, then places; search across all countries).
                Button { onOtherCountries() } label: { Label("Other countries…", systemImage: "globe") }
            }
            Menu("NEA stations") {
                ForEach(HazeRegions.canonicalOrder, id: \.self) { r in
                    Button { store.placeMode = .region(r) } label: {
                        if store.placeMode == .region(r) {
                            Label("\(HazeFormat.regionName(r)) station", systemImage: "checkmark")
                        } else {
                            Text("\(HazeFormat.regionName(r)) station")
                        }
                    }
                }
            }
            Divider()
            Menu("Save this place as…") {
                ForEach(SavedPlace.Kind.allCases, id: \.self) { kind in
                    Button { store.save(kind) } label: { Label(kind.defaultLabel, systemImage: kind.symbolName) }
                }
            }
            .disabled(store.resolved.input.coordinate == nil)
        } label: {
            label()
        }
    }
}

#endif

/// Quiet chip after the user denied location: deep-links to Settings. Never re-prompts on its own.
public struct LocationDeniedChip: View {
    var openSettings: () -> Void
    public init(openSettings: @escaping () -> Void) { self.openSettings = openSettings }

    public var body: some View {
        Button(action: openSettings) {
            Label(HazeCopy.locationAskYes, systemImage: "location.slash")
                .font(.haze(.caption, weight: .medium))
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Capsule().fill(Color.secondary.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens Settings to allow location")
    }
}
