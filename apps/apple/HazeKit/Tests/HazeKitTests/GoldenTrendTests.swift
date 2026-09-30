import Foundation
import Testing
@testable import HazeKit

/// Cross-platform parity: packages/core/fixtures/golden/trend.json (generated from the TS reference) is read
/// in place, so every client is checked against the same file.
@Suite("Golden: trend phrase and word")
struct GoldenTrendTests {
    struct Case: Decodable, Sendable, CustomTestStringConvertible {
        struct Point: Decodable, Sendable { let time: String; let pm25: Int }
        struct Expected: Decodable, Sendable { let words: String; let word: String? }
        let name: String
        let history: [Point]
        let expected: Expected
        var testDescription: String { name }
    }

    static let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()      // HazeKitTests
        .deletingLastPathComponent()      // Tests
        .deletingLastPathComponent()      // HazeKit
        .deletingLastPathComponent()      // apple
        .deletingLastPathComponent()      // apps
        .deletingLastPathComponent()      // repo root
        .appendingPathComponent("packages/core/fixtures/golden/trend.json")

    static let cases: [Case] = (try? JSONDecoder().decode([Case].self, from: Data(contentsOf: url))) ?? []

    @Test func fileLoads() {
        #expect(Self.cases.count == 28, "Could not read \(Self.url.path)")
    }

    @Test(arguments: cases)
    func matchesReference(_ c: Case) throws {
        let history = try c.history.map { p in
            HistoryPoint(time: try #require(HazeFormat.parseISO8601(p.time)), pm25: p.pm25)
        }
        #expect(HazeCompute.trendWords(history: history) == c.expected.words)
        #expect(HazeCompute.trendWord(history: history)?.rawValue == c.expected.word)
    }
}
