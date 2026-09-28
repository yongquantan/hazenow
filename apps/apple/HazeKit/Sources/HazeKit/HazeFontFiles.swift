import Foundation

/// Apfel Grotezk (SIL OFL 1.1, see Resources/Fonts/OFL.txt) — the HazeNow brand typeface.
public enum HazeFontFiles {
    public static let regular = "ApfelGrotezk-Regular"
    public static let mittel = "ApfelGrotezk-Mittel"
    public static let fett = "ApfelGrotezk-Fett"

    /// URLs of the bundled .otf files (registered at runtime by HazeUI).
    public static var urls: [URL] {
        [regular, mittel, fett].compactMap { Bundle.module.url(forResource: $0, withExtension: "otf", subdirectory: "Fonts") }
    }

    public static var licenseURL: URL? { Bundle.module.url(forResource: "OFL", withExtension: "txt", subdirectory: "Fonts") }
}
