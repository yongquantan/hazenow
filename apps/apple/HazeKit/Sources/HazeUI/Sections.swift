import Charts
import HazeKit
import SwiftUI

// Shared building blocks, in SPEC v1.1 screen order:
// verdict → number/band/trend → provenance → actions → chart (+ official PSI) → regions → footer.
// Copy is verbatim from docs/COPY.md via HazeKit. No Instant PSI and no "lagging" (SPEC v1.2 §1).

/// 1. Verdict headline + optional second line + who it's for.
public struct VerdictHeader: View {
    var snapshot: Snapshot
    var insight: HazeInsight
    var headlineStyle: Font.TextStyle

    public init(snapshot: Snapshot, insight: HazeInsight, size: Font.TextStyle = .title2) {
        self.snapshot = snapshot
        self.insight = insight
        self.headlineStyle = size
    }

    public var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Capsule().fill(snapshot.band.color).frame(width: 4).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(insight.verdict.headline)
                    .font(.haze(headlineStyle, weight: .semibold))
                    .tracking(-0.4)
                    .fixedSize(horizontal: false, vertical: true)
                if let second = insight.verdict.secondLine {
                    Text(second).font(.haze(.callout)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Text(insight.verdict.forWhom).font(.haze(.caption)).foregroundStyle(.secondary)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .opacity(snapshot.stale ? 0.75 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(insight.headlineLabel + (insight.verdict.secondLine.map { " \($0)" } ?? ""))
        .accessibilityAddTraits(.isHeader)
    }
}

/// 2. Big number + unit, band chip, trend words, band anchor, uncertainty range.
public struct BigNumber: View {
    var snapshot: Snapshot
    var insight: HazeInsight
    var numberSize: CGFloat
    /// At accessibility text sizes, show the compact official 24-hr PSI line directly under the number, so it stays
    /// above the fold (SPEC v1.2 §1) even when the verdict and number fill the first screen. The caller then skips its
    /// own `OfficialPsiView` at those sizes (see `OfficialPsiView.isInline(_:)`).
    var officialInline: Bool

    public init(snapshot: Snapshot, insight: HazeInsight, numberSize: CGFloat = 64, officialInline: Bool = false) {
        self.snapshot = snapshot
        self.insight = insight
        self.numberSize = numberSize
        self.officialInline = officialInline
    }

    @Environment(\.dynamicTypeSize) private var typeSize

    public var body: some View {
        let big = typeSize.isAccessibilitySize
        VStack(alignment: .leading, spacing: 6) {
            // The hero number never wraps: one line, shrinking if it must. At accessibility sizes the unit
            // moves below the number instead of competing for the same line.
            let number = Text(insight.numberText)
                .font(.haze(size: numberSize, weight: .bold, relativeTo: .largeTitle).monospacedDigit())
                .tracking(-0.045 * numberSize)
                .foregroundStyle(snapshot.band.textColor)
                .lineLimit(1)
                .minimumScaleFactor(0.3)
                .contentTransition(.numericText())
            let unit = VStack(alignment: .leading, spacing: 0) {
                Text(HazeCopy.pm25Unit).font(.haze(.callout, weight: .medium))
                Text(HazeCopy.pm25Label).font(.haze(.caption)).foregroundStyle(.secondary)
            }
            Group {
                if big && officialInline {
                    // Keep the hero number huge but stop it growing past the AX2 scale, so the number, its unit and
                    // the official PSI line all fit on the first screen with the verdict.
                    VStack(alignment: .leading, spacing: 0) {
                        number.dynamicTypeSize(...DynamicTypeSize.accessibility2)
                        unit.dynamicTypeSize(...DynamicTypeSize.accessibility1)
                    }
                } else if big {
                    VStack(alignment: .leading, spacing: 2) { number; unit }
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 6) { number; unit }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("P M 2.5 \(insight.uncertainty.a11y) micrograms per cubic metre")
            if big && officialInline { OfficialPsiView(snapshot: snapshot, compact: true) }
            Text(insight.uncertaintyLine).font(.haze(.caption)).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            let trend = Label(insight.trendWords, systemImage: snapshot.trend.direction.symbolName)
                .font(.haze(.subheadline))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if big {
                VStack(alignment: .leading, spacing: 6) { BandChip(band: snapshot.band, stale: snapshot.stale); trend }
            } else {
                HStack(spacing: 8) { BandChip(band: snapshot.band, stale: snapshot.stale); trend }
            }
            Text(insight.anchor).font(.haze(.caption)).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// 3. Provenance: station · distance · age (+ offline note in words).
public struct ProvenanceLine: View {
    var insight: HazeInsight
    public init(insight: HazeInsight) { self.insight = insight }

    public var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(insight.provenance.full, systemImage: "mappin.and.ellipse")
            if let note = insight.provenance.note { Label(note, systemImage: "info.circle") }
        }
        .font(.haze(.caption))
        .foregroundStyle(.secondary)
    }
}

/// 4. Actions (threat + efficacy), or the calm line in Normal.
public struct ActionsList: View {
    var insight: HazeInsight
    var band: Band
    public init(insight: HazeInsight, band: Band) {
        self.insight = insight
        self.band = band
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if insight.actions.isEmpty, let calm = insight.calmLine {
                Label(calm, systemImage: "leaf").font(.haze(.callout))
            }
            ForEach(insight.actions, id: \.self) { a in
                Label {
                    Text(a).fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "checkmark.circle").foregroundStyle(band.textColor)
                }
                .font(.haze(.callout))
            }
        }
    }
}

/// The official figure, always visible, smaller (COPY §6). No "lagging".
public struct OfficialPsiView: View {
    var snapshot: Snapshot
    /// One line, no caption: the form used under the big number at accessibility text sizes.
    var compact: Bool
    public init(snapshot: Snapshot, compact: Bool = false) {
        self.snapshot = snapshot
        self.compact = compact
    }

    /// Whether `BigNumber(officialInline: true)` already shows the official figure at this text size.
    public static func isInline(_ size: DynamicTypeSize) -> Bool { size.isAccessibilitySize }

    public var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(HazeCopy.officialPsiLabel(snapshot.officialPsi24h))
                .font(.haze(.subheadline, weight: .medium))
                .fixedSize(horizontal: false, vertical: true)
                .dynamicTypeSize(...(compact ? DynamicTypeSize.accessibility3 : .accessibility5))
            if !compact {
                Text(HazeCopy.officialCaption).font(.haze(.caption2)).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// 5. "Last 24 hours" chart section with the official figure and the neutral explainer.
public struct ChartSection: View {
    var snapshot: Snapshot
    var height: CGFloat
    var showOfficial: Bool
    var onWhy: (() -> Void)?

    public init(snapshot: Snapshot, height: CGFloat = 150, showOfficial: Bool = true, onWhy: (() -> Void)? = nil) {
        self.snapshot = snapshot
        self.height = height
        self.showOfficial = showOfficial
        self.onWhy = onWhy
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(HazeCopy.chartTitle).hazeHeadline(.headline)
            if showOfficial { OfficialPsiView(snapshot: snapshot) }
            LagChart(history: snapshot.history).frame(height: height)
            Text(HazeCopy.chartCaption).font(.haze(.caption)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            if let onWhy {
                Button(action: onWhy) { Label(HazeCopy.whyTwoNumbersLink, systemImage: "info.circle").font(.haze(.callout)) }
                    .buttonStyle(.borderless)
            }
        }
    }
}

/// 6. Regions. Tapping a region shows that NEA station.
public struct RegionsSection: View {
    var snapshot: Snapshot
    var compact: Bool
    var onSelect: ((String) -> Void)?
    public init(snapshot: Snapshot, compact: Bool = false, onSelect: ((String) -> Void)? = nil) {
        self.snapshot = snapshot
        self.compact = compact
        self.onSelect = onSelect
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(HazeCopy.regionsHeading).hazeHeadline(.headline)
            RegionGrid(snapshot: snapshot, highlight: snapshot.markedRegion,
                       compact: compact, onSelect: onSelect)
        }
    }
}

/// 7. Footer: credibility signals, quietly.
public struct TrustFooter: View {
    var snapshot: Snapshot?
    public init(snapshot: Snapshot?) { self.snapshot = snapshot }

    public var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let snapshot { Text(snapshot.asOfText).font(.haze(.caption2).monospacedDigit()).foregroundStyle(.secondary) }
            Text(HazeCopy.footer).font(.haze(.caption2)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// "Who are you checking for?" (COPY §1).
public struct ProfilePicker: View {
    @Binding var profiles: Set<Profile>
    @ScaledMetric(relativeTo: .callout) private var iconWidth: CGFloat = 20
    public init(profiles: Binding<Set<Profile>>) { _profiles = profiles }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(HazeCopy.profileTitle).hazeHeadline(.headline)
            Text(HazeCopy.profileSubtitle).font(.haze(.caption)).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Profile.allCases) { p in
                    let on = profiles.contains(p)
                    Button {
                        var next = profiles
                        if on { next.remove(p) } else {
                            next.insert(p)
                            if p.isSensitive { next.remove(.general) }            // picking a sensitive option unticks "general"
                            if p == .general { next.subtract(Profile.allCases.filter(\.isSensitive)) }
                        }
                        profiles = Set(Profile.normalise(next))
                    } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: on ? "checkmark.square.fill" : "square")
                                .foregroundStyle(on ? Color.accentColor : .secondary)
                            // Scaled width so large symbols never overlap the label.
                            Image(systemName: p.symbolName).frame(minWidth: iconWidth).foregroundStyle(.secondary)
                            Text(p.label).fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .font(.haze(.callout))
            Text(HazeCopy.profileFootnote).font(.haze(.caption2)).foregroundStyle(.secondary)
        }
    }
}

/// "Why two numbers?" + "How we calculate this" + more tips (COPY §5, §7, §12).
public struct ExplainerView: View {
    var snapshot: Snapshot?
    public init(snapshot: Snapshot? = nil) { self.snapshot = snapshot }

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(HazeCopy.whyTwoNumbersLink).hazeHeadline(.headline)
            Text(HazeCopy.whyTwoNumbers).font(.haze(.callout))
            if let snapshot {
                Text(snapshot.asOfText).font(.haze(.caption)).foregroundStyle(.secondary)
                Text(HazeCompute.typicalText()).font(.haze(.caption)).foregroundStyle(.secondary)
            }
            Divider()
            Text("More tips").hazeHeadline(.headline)
            ForEach(HazeCopy.moreTips, id: \.self) { Label($0, systemImage: "lightbulb").font(.haze(.callout)) }
            Link(destination: HazeCopy.neaForecastURL) { Label("NEA haze forecast", systemImage: "arrow.up.right.square") }
                .font(.haze(.callout))
            Divider()
            Text(HazeCopy.howTitle).hazeHeadline(.title3)
            ForEach(HazeCopy.howSections, id: \.title) { section in
                VStack(alignment: .leading, spacing: 4) {
                    Text(section.title).font(.haze(.subheadline, weight: .semibold))
                    Text(section.body).font(.haze(.callout))
                }
            }
            Text(HazeCopy.privacyLine).font(.haze(.caption)).foregroundStyle(.secondary)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// Notification permission ask, shown after the first Elevated+ view (COPY §11).
public struct NotifyAskCard: View {
    var onYes: () -> Void
    var onNo: () -> Void
    public init(onYes: @escaping () -> Void, onNo: @escaping () -> Void) {
        self.onYes = onYes
        self.onNo = onNo
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(HazeCopy.notifyAskTitle).font(.haze(.subheadline, weight: .semibold))
            Text(HazeCopy.notifyAskBody).font(.haze(.caption)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                Button(HazeCopy.notifyAskYes, action: onYes).buttonStyle(.borderedProminent)
                Button(HazeCopy.notifyAskNo, action: onNo).buttonStyle(.borderless)
            }
            .controlSize(.small)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.secondary.opacity(0.1)))
    }
}

/// The notification ask, then its real result inline (granted / denied / error). COPY §11.
public struct NotifyAskSection: View {
    let store: HazeStore
    public init(store: HazeStore) { self.store = store }

    public var body: some View {
        if let result = store.notifyAskResult {
            VStack(alignment: .leading, spacing: 8) {
                switch result {
                case .requesting, .notDetermined:
                    HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Asking for permission…") }
                        .font(.haze(.caption))
                case .granted:
                    Label("You're set. We'll message when the band changes, and when it's clear.", systemImage: "checkmark.circle.fill")
                        .font(.haze(.callout))
                case .denied, .error:
                    // Friendly copy only: the OS error text (e.g. "Notifications are not allowed for this
                    // application") is system jargon and is logged by HazeNotifier instead of shown.
                    Label("Notifications are off for HazeNow.", systemImage: "bell.slash")
                        .font(.haze(.callout, weight: .semibold))
                    Button("Open System Settings") { HazeNotifier.openSystemSettings() }
                        .buttonStyle(.bordered).controlSize(.small)
                }
                if result != .requesting {
                    Button("Dismiss") { store.dismissNotifyResult() }.buttonStyle(.borderless).font(.haze(.caption))
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.secondary.opacity(0.1)))
        } else if store.shouldAskNotify {
            NotifyAskCard(onYes: { Task { await store.answerNotifyAsk(true) } },
                          onNo: { Task { await store.answerNotifyAsk(false) } })
        }
    }
}

/// Under the Settings toggle: reflects the real system permission.
public struct NotifyPermissionNote: View {
    let store: HazeStore
    public init(store: HazeStore) { self.store = store }
    public var body: some View {
        switch store.notifyStatus {
        case .denied, .error:
            if store.notifyOnRise || store.notifyAsked {
                HStack {
                    Text("Notifications are off for HazeNow.").font(.haze(.caption)).foregroundStyle(.secondary)
                    Button("Open System Settings") { HazeNotifier.openSystemSettings() }
                        .buttonStyle(.borderless).font(.haze(.caption))
                }
            }
        default:
            EmptyView()
        }
    }
}
