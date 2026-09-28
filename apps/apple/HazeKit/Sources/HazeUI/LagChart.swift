import Charts
import HazeKit
import SwiftUI

/// The core trust visual (SPEC v1.2 §2, COPY §8), all in µg/m³: hourly 1-hr PM2.5 bars plus a line of NEA's
/// 24-hr average PM2.5 (`pm25_twenty_four_hourly`). It *shows* the lag instead of asserting it.
public struct LagChart: View {
    public var history: [HistoryPoint]
    public var showLegend: Bool
    public var showAxes: Bool
    public var showGuides: Bool

    public init(history: [HistoryPoint], showLegend: Bool = true, showAxes: Bool = true, showGuides: Bool = true) {
        self.history = history
        self.showLegend = showLegend
        self.showAxes = showAxes
        self.showGuides = showGuides
    }

    private var yMax: Int {
        let peak = max(history.map(\.pm25).max() ?? 0, history.compactMap(\.pm25Avg24h).max() ?? 0)
        return max(70, Int(Double(peak) * 1.12))
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Chart {
                if showGuides {
                    ForEach([(56, HazeCopy.chartGuideElevated), (151, HazeCopy.chartGuideHigh)].filter { $0.0 < yMax }, id: \.0) { guide in
                        RuleMark(y: .value("Band edge", guide.0))
                            .foregroundStyle(Color.secondary.opacity(0.5))
                            .lineStyle(StrokeStyle(lineWidth: 0.75, dash: [3, 3]))
                            .annotation(position: .top, alignment: .trailing, spacing: 1) {
                                Text(guide.1).font(.system(size: 9)).foregroundStyle(.secondary)
                            }
                    }
                }
                ForEach(history) { p in
                    BarMark(x: .value("Hour", p.time, unit: .hour), y: .value("1-hr PM2.5", p.pm25), width: .ratio(0.72))
                        .foregroundStyle(HazeCompute.band(pm25: p.pm25).color.opacity(0.9))
                        .cornerRadius(2)
                }
                ForEach(history.filter { $0.pm25Avg24h != nil }) { p in
                    LineMark(x: .value("Hour", p.time, unit: .hour), y: .value("NEA 24-hr average PM2.5", p.pm25Avg24h ?? 0),
                             series: .value("Series", "avg24"))
                        .foregroundStyle(Color.primary.opacity(0.8))
                        .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, dash: [5, 3]))
                        .interpolationMethod(.monotone)
                }
            }
            .chartYScale(domain: 0...yMax)
            .chartXAxis {
                if showAxes {
                    AxisMarks(values: .stride(by: .hour, count: 6)) { value in
                        AxisGridLine().foregroundStyle(.quaternary)
                        AxisValueLabel { if let d = value.as(Date.self) { Text(HazeFormat.hour(d)) } }
                    }
                }
            }
            .chartYAxis(showAxes ? .automatic : .hidden)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(HazeCompute.chartSummary(history))

            if showLegend {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) { legendBars; legendLine }
                    VStack(alignment: .leading, spacing: 2) { legendBars; legendLine }
                }
                .font(.haze(.caption2))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            }
        }
    }

    private var legendBars: some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 1.5).fill(Band.elevated.color).frame(width: 8, height: 10)
            Text(HazeCopy.chartLegendBars)
        }
    }

    private var legendLine: some View {
        HStack(spacing: 5) {
            DashedLine().stroke(Color.primary.opacity(0.8), style: StrokeStyle(lineWidth: 2, dash: [4, 2])).frame(width: 16, height: 2)
            Text(HazeCopy.chartLegendLine)
        }
    }
}

private struct DashedLine: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}
