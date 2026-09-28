import CoreText
import HazeKit
import SwiftUI

/// Registers the bundled Apfel Grotezk faces once per process (app, widget extension, watch).
public enum HazeFonts {
    private static let registered: Bool = {
        let urls = HazeFontFiles.urls
        guard !urls.isEmpty else { return false }
        CTFontManagerRegisterFontURLs(urls as CFArray, .process, true, nil)
        return true
    }()

    /// Call at launch; also called lazily by `Font.haze`.
    @discardableResult public static func register() -> Bool { registered }
}

public extension Font {
    /// Brand font. Weights: body Regular, headlines Mittel (use tight tracking), big numbers Fett.
    /// `relativeTo` keeps Dynamic Type scaling.
    static func haze(size: CGFloat, weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        HazeFonts.register()
        return .custom(faceName(weight), size: size, relativeTo: style)
    }

    /// Brand font at a text style's default size.
    static func haze(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        haze(size: defaultSize(style), weight: weight, relativeTo: style)
    }

    private static func faceName(_ w: Font.Weight) -> String {
        switch w {
        case .bold, .heavy, .black: HazeFontFiles.fett
        case .medium, .semibold: HazeFontFiles.mittel
        default: HazeFontFiles.regular
        }
    }

    private static func defaultSize(_ s: Font.TextStyle) -> CGFloat {
        #if os(macOS)
        switch s {
        case .largeTitle: 26; case .title: 22; case .title2: 17; case .title3: 15; case .headline: 13
        case .subheadline: 11; case .body: 13; case .callout: 12; case .footnote: 10; case .caption: 10; case .caption2: 10
        default: 13
        }
        #elseif os(watchOS)
        switch s {
        case .largeTitle: 32; case .title: 28; case .title2: 24; case .title3: 20; case .headline: 16
        case .subheadline: 15; case .body: 16; case .callout: 15; case .footnote: 13; case .caption: 12; case .caption2: 11
        default: 16
        }
        #else
        switch s {
        case .largeTitle: 34; case .title: 28; case .title2: 22; case .title3: 20; case .headline: 17
        case .subheadline: 15; case .body: 17; case .callout: 16; case .footnote: 13; case .caption: 12; case .caption2: 11
        default: 17
        }
        #endif
    }
}

public extension View {
    /// Headline treatment: Mittel with tight tracking.
    func hazeHeadline(_ style: Font.TextStyle = .headline) -> some View {
        font(.haze(style, weight: .semibold)).tracking(-0.3)
    }
}
