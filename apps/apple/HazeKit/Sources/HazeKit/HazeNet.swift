import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Upstream timeouts (port of packages/core/src/net.ts). Every fetch to an upstream (NEA v1/v2, Air4Thai, the HazeNow
// proxy) goes through `withUpstreamTimeout`: the request is cancelled after ~8 s, and a timer race means even an
// operation that ignores cancellation can't hang the app (Air4Thai's certificate renewal, 30 Sep 2026, left requests
// hanging ~30 s). The caller then falls back quickly: another source, the last cached snapshot with its age, or the
// calm "can't reach" state.

public let upstreamTimeout: TimeInterval = 8

public struct UpstreamTimeoutError: Error, LocalizedError, Sendable, Equatable {
    public var url: String
    public var seconds: TimeInterval
    public init(url: String, seconds: TimeInterval) {
        self.url = url
        self.seconds = seconds
    }

    public var errorDescription: String? {
        "Timed out after \((seconds * 10).rounded() / 10) s: \(url)"
    }
}

/// Resumes a continuation exactly once (whichever of the work and the timer finishes first).
private final class Once<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var cont: CheckedContinuation<T, Error>?
    init(_ c: CheckedContinuation<T, Error>) { cont = c }
    @discardableResult
    func resume(_ r: Result<T, Error>) -> Bool {
        let c: CheckedContinuation<T, Error>? = lock.withLock {
            defer { cont = nil }
            return cont
        }
        c?.resume(with: r)
        return c != nil
    }
}

/// Run `operation`, failing with `UpstreamTimeoutError` after `seconds` (and cancelling it). A caller's own
/// cancellation still wins. Answers and errors pass straight through.
public func withUpstreamTimeout<T: Sendable>(
    _ seconds: TimeInterval = upstreamTimeout, url: String = "",
    _ operation: @escaping @Sendable () async throws -> T
) async throws -> T {
    guard seconds > 0, seconds.isFinite else { return try await operation() }
    let box = LockedTask()
    return try await withTaskCancellationHandler {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<T, Error>) in
            let once = Once(c)
            let work = Task {
                do { once.resume(.success(try await operation())) } catch { once.resume(.failure(error)) }
            }
            let timer = Task {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                if once.resume(.failure(UpstreamTimeoutError(url: url, seconds: seconds))) { work.cancel() }
            }
            box.set(work: work, timer: timer, cancel: { once.resume(.failure(CancellationError())) })
        }
    } onCancel: {
        box.cancelAll()
    }
}

private final class LockedTask: @unchecked Sendable {
    private let lock = NSLock()
    private var work: Task<Void, Never>?
    private var timer: Task<Void, Never>?
    private var cancel: (() -> Void)?
    private var cancelled = false

    func set(work: Task<Void, Never>, timer: Task<Void, Never>, cancel: @escaping () -> Void) {
        let already: Bool = lock.withLock {
            self.work = work
            self.timer = timer
            self.cancel = cancel
            return cancelled
        }
        if already { cancelAll() }
    }

    func cancelAll() {
        let (w, t, c): (Task<Void, Never>?, Task<Void, Never>?, (() -> Void)?) = lock.withLock {
            cancelled = true
            return (work, timer, cancel)
        }
        w?.cancel()
        t?.cancel()
        c?()
    }
}

// MARK: - Fetching JSON for the Southeast Asia adapters

/// One HTTP response: status and body. Injectable so tests can make an upstream fail, hang or answer.
public struct FetchResponse: Sendable {
    public var status: Int
    public var data: Data
    public var retryAfter: TimeInterval?
    public init(status: Int, data: Data, retryAfter: TimeInterval? = nil) {
        self.status = status
        self.data = data
        self.retryAfter = retryAfter
    }

    public var ok: Bool { (200..<300).contains(status) }
}

public typealias FetchFunction = @Sendable (URL) async throws -> FetchResponse

public enum HazeFetch {
    /// URLSession with the system trust evaluation. Air4Thai serves an incomplete chain; Apple platforms complete it
    /// themselves (AIA), so there is no certificate override anywhere (SPEC v2.0 §10).
    public static func urlSession(_ session: URLSession = .shared) -> FetchFunction {
        { url in
            var req = URLRequest(url: url)
            req.timeoutInterval = upstreamTimeout + 2
            req.cachePolicy = .reloadIgnoringLocalCacheData
            req.setValue("application/json", forHTTPHeaderField: "Accept")
            do {
                let (data, response) = try await session.data(for: req)
                let http = response as? HTTPURLResponse
                let ra = http?.value(forHTTPHeaderField: "Retry-After").flatMap(TimeInterval.init)
                return FetchResponse(status: http?.statusCode ?? 200, data: data, retryAfter: ra)
            } catch let e as URLError where [.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed].contains(e.code) {
                throw HazeClientError.offline
            }
        }
    }

    /// `fetch` with the upstream timeout.
    public static func timed(_ fetch: @escaping FetchFunction, seconds: TimeInterval = upstreamTimeout) -> FetchFunction {
        { url in try await withUpstreamTimeout(seconds, url: url.absoluteString) { try await fetch(url) } }
    }
}
