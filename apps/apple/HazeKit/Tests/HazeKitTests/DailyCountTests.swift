import Foundation
import Testing
@testable import HazeKit

/// Mirrors apps/android core DailyCountTest.
@Suite("Daily count")
struct DailyCountTests {
    // 2026-10-05T23:30:00Z (07:30 the next morning in Singapore: the day is UTC's, not local).
    static let now = Date(timeIntervalSince1970: 1_791_243_000)

    @Test func utcDay() { #expect(HazeDailyCount.utcDay(Self.now) == "2026-10-05") }

    @Test func oncePerUtcDay() {
        #expect(HazeDailyCount.decide(now: Self.now, lastDay: "2026-10-05", firstSeen: true, existingInstall: false) == nil)
        #expect(HazeDailyCount.decide(now: Self.now, lastDay: "2026-10-04", firstSeen: true, existingInstall: false)?.seen == "returning")
    }

    @Test func newThenReturning() {
        #expect(HazeDailyCount.decide(now: Self.now, lastDay: nil, firstSeen: false, existingInstall: false)?.seen == "new")
        #expect(HazeDailyCount.decide(now: Self.now, lastDay: nil, firstSeen: false, existingInstall: true)?.seen == "returning")
    }

    @Test func url() {
        #expect(HazeDailyCount.url(base: "https://w.dev/", surface: "mac", seen: "new", cc: .TH)?.absoluteString == "https://w.dev/v1/hit?e=app_open&surface=mac&seen=new&cc=th")
        #expect(HazeDailyCount.url(base: "https://w.dev", surface: "ios", seen: "returning", cc: nil)?.absoluteString == "https://w.dev/v1/hit?e=app_open&surface=ios&seen=returning")
        #expect(HazeDailyCount.url(base: "https://w.dev", surface: "web", seen: "new", cc: nil) == nil)
    }
}
