// swift-tools-version: 6.0
// HazeKit: the SPEC.md computation + data.gov.sg client for Apple platforms.
import PackageDescription

let package = Package(
    name: "HazeKit",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
        .watchOS(.v10),
    ],
    products: [
        .library(name: "HazeKit", targets: ["HazeKit"]),
        .library(name: "HazeUI", targets: ["HazeUI"]),
    ],
    targets: [
        // Pure Foundation: models, computation, networking. No UI imports.
        .target(name: "HazeKit", resources: [.copy("Resources/Scenarios"), .copy("Resources/Data"), .copy("Resources/Fonts")]),
        // Shared SwiftUI building blocks (colors, sparkline, region grid) used by apps + widgets.
        .target(name: "HazeUI", dependencies: ["HazeKit"]),
        // Dev tool (macOS): export every share card for the mock scenarios and personas as PNGs.
        //   swift run hazecards ../docs/cards
        .executableTarget(name: "hazecards", dependencies: ["HazeKit", "HazeUI"]),
        .testTarget(
            name: "HazeKitTests",
            dependencies: ["HazeKit"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
