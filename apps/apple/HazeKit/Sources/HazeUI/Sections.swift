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
    var size: Font

    public init(snapshot: Snapshot, insight: HazeInsight, size: Font = .title2) {
        self.snapshot = snapshot
        self.insight = insight
        self.size = size
    }

    public var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Capsule().fill(snapshot.band.color).frame(width: 4).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(insight.verdict.headline)
                    .font(size.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                if let second = insight.verdict.secondLine {
                    Text(second).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Text(insight.verdict.forWhom).font(.caption).foregroundStyle(.secondary)
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

    public init(snapshot: Snapshot, insight: HazeInsight, numberSize: CGFloat = 64) {
        self.snapshot = snapshot
        self.insight = insight
        self.numberSize = numberSize
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(insight.numberText)
                    .font(.system(size: numberSize, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(snapshot.band.textColor)
                    .contentTransition(.numericText())
                VStack(alignment: .leading, spacing: 0) {
                    Text(HazeCopy.pm25Unit).font(.callout.weight(.medium))
                    Text(HazeCopy.pm25Label).font(.caption).foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("P M 2.5 \(insight.uncertainty.a11y) micrograms per cubic metre")
            if let text = insight.uncertainty.text {
                Text(text).font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                BandChip(band: snapshot.band, stale: snapshot.stale)
                Label(insight.trendWords, systemImage: snapshot.trend.direction.symbolName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Text(insight.anchor).font(.caption).foregroundStyle(.secondary)
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
        .font(.caption)
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
                Label(calm, systemImage: "leaf").font(.callout)
            }
            ForEach(insight.actions, id: \.self) { a in
                Label {
                    Text(a).fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "checkmark.circle").foregroundStyle(band.textColor)
                }
                .font(.callout)
            }
        }
    }
}

/// The official figure, always visible, smaller (COPY §6). No "lagging".
public struct OfficialPsiView: View {
    var snapshot: Snapshot
    public init(snapshot: Snapshot) { self.snapshot = snapshot }

    public var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(HazeCopy.officialPsiLabel(snapshot.officialPsi24h)).font(.subheadline.weight(.medium))
            Text(HazeCopy.officialCaption).font(.caption2).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

/// 5. "Last 24 hours" chart section with the official figure and the neutral explainer.
public struct ChartSection: View {
    var snapshot: Snapshot
    var height: CGFloat
    var onWhy: (() -> Void)?

    public init(snapshot: Snapshot, height: CGFloat = 150, onWhy: (() -> Void)? = nil) {
        self.snapshot = snapshot
        self.height = height
        self.onWhy = onWhy
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(HazeCopy.chartTitle).font(.headline)
            OfficialPsiView(snapshot: snapshot)
            LagChart(history: snapshot.history).frame(height: height)
            Text(HazeCopy.chartCaption).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            if let onWhy {
                Button(action: onWhy) { Label(HazeCopy.whyTwoNumbersLink, systemImage: "info.circle").font(.callout) }
                    .buttonStyle(.borderless)
            }
        }
    }
}

/// 6. Regions.
public struct RegionsSection: View {
    var snapshot: Snapshot
    var compact: Bool
    public init(snapshot: Snapshot, compact: Bool = false) {
        self.snapshot = snapshot
        self.compact = compact
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(HazeCopy.regionsHeading).font(.headline)
            RegionGrid(snapshot: snapshot, highlight: snapshot.locationMode == .island ? nil : snapshot.nearestRegion, compact: compact)
        }
    }
}

/// 7. Footer: credibility signals, quietly.
public struct TrustFooter: View {
    var snapshot: Snapshot?
    public init(snapshot: Snapshot?) { self.snapshot = snapshot }

    public var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let snapshot { Text(snapshot.asOfText).font(.caption2.monospacedDigit()).foregroundStyle(.secondary) }
            Text(HazeCopy.footer).font(.caption2).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// "Who are you checking for?" (COPY §1).
public struct ProfilePicker: View {
    @Binding var profiles: Set<Profile>
    public init(profiles: Binding<Set<Profile>>) { _profiles = profiles }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(HazeCopy.profileTitle).font(.headline)
            Text(HazeCopy.profileSubtitle).font(.caption).foregroundStyle(.secondary)
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
                        HStack(spacing: 8) {
                            Image(systemName: on ? "checkmark.square.fill" : "square")
                                .foregroundStyle(on ? Color.accentColor : .secondary)
                            Image(systemName: p.symbolName).frame(width: 18).foregroundStyle(.secondary)
                            Text(p.label)
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .font(.callout)
            Text(HazeCopy.profileFootnote).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

/// "Why two numbers?" + "How we calculate this" + more tips (COPY §5, §7, §12).
public struct ExplainerView: View {
    var snapshot: Snapshot?
    public init(snapshot: Snapshot? = nil) { self.snapshot = snapshot }

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(HazeCopy.whyTwoNumbersLink).font(.headline)
            Text(HazeCopy.whyTwoNumbers).font(.callout)
            if let snapshot {
                Text(snapshot.asOfText).font(.caption).foregroundStyle(.secondary)
                Text(HazeCompute.typicalText()).font(.caption).foregroundStyle(.secondary)
            }
            Divider()
            Text("More tips").font(.headline)
            ForEach(HazeCopy.moreTips, id: \.self) { Label($0, systemImage: "lightbulb").font(.callout) }
            Link(destination: HazeCopy.neaForecastURL) { Label("NEA haze forecast", systemImage: "arrow.up.right.square") }
                .font(.callout)
            Divider()
            Text(HazeCopy.howTitle).font(.title3.weight(.semibold))
            ForEach(HazeCopy.howSections, id: \.title) { section in
                VStack(alignment: .leading, spacing: 4) {
                    Text(section.title).font(.subheadline.weight(.semibold))
                    Text(section.body).font(.callout)
                }
            }
            Text(HazeCopy.privacyLine).font(.caption).foregroundStyle(.secondary)
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
            Text(HazeCopy.notifyAskTitle).font(.subheadline.weight(.semibold))
            Text(HazeCopy.notifyAskBody).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
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

// MARK: - Shareable image (no verdict, no Instant PSI — COPY §15)

public struct ShareCard: View {
    var snapshot: Snapshot
    var insight: HazeInsight

    public init(snapshot: Snapshot, insight: HazeInsight) {
        self.snapshot = snapshot
        self.insight = insight
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("HazeNow").font(.headline)
                Spacer()
                Text("\(snapshot.placeText) · \(HazeFormat.hour(snapshot.observedAt))").font(.caption).foregroundStyle(.secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(insight.numberText)
                    .font(.system(size: 72, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(snapshot.band.textColor)
                VStack(alignment: .leading, spacing: 4) {
                    Text("µg/m³ · 1-hr PM2.5").font(.callout)
                    BandChip(band: snapshot.band, compact: true, stale: snapshot.stale)
                }
            }
            Text(insight.trendWords).font(.callout).foregroundStyle(.secondary)
            OfficialPsiView(snapshot: snapshot)
            Text(HazeCopy.chartTitle).font(.subheadline.weight(.semibold))
            LagChart(history: snapshot.history).frame(height: 170)
            Text(HazeCopy.chartCaption).font(.caption).foregroundStyle(.secondary)
            Text(HazeCopy.footer).font(.caption2).foregroundStyle(.secondary)
        }
        .padding(24)
        .frame(width: 520)
        .background(Color.white)
        .environment(\.colorScheme, .light)
    }

    /// Render to a SwiftUI Image (Transferable) via ImageRenderer.
    @MainActor
    public func renderImage(scale: CGFloat = 2) -> Image? {
        let renderer = ImageRenderer(content: self)
        renderer.scale = scale
        #if os(macOS)
        return renderer.nsImage.map { Image(nsImage: $0) }
        #else
        return renderer.uiImage.map { Image(uiImage: $0) }
        #endif
    }
}

/// ShareLink with the rendered card + COPY §15 share text.
public struct ShareSnapshotButton: View {
    var snapshot: Snapshot
    var insight: HazeInsight
    @State private var image: Image?

    public init(snapshot: Snapshot, insight: HazeInsight) {
        self.snapshot = snapshot
        self.insight = insight
    }

    public var body: some View {
        let text = HazeCompute.shareText(snapshot)
        Group {
            if let image {
                ShareLink(item: image, message: Text(text), preview: SharePreview("HazeNow · PM2.5 \(snapshot.pm25)", image: image)) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            } else {
                ShareLink(item: text) { Label("Share", systemImage: "square.and.arrow.up") }
            }
        }
        .task(id: snapshot) { image = ShareCard(snapshot: snapshot, insight: insight).renderImage() }
    }
}
