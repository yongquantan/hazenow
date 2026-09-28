import Foundation

/// Canonical user-facing strings, verbatim from docs/COPY.md (shared with the web/TS and Android clients).
public enum HazeCopy {
    public static let attribution = "Data: NEA via data.gov.sg"
    /// COPY §13 footer.
    public static let footer = "Data: NEA via data.gov.sg · Free & open source · No ads, no tracking, no account"
    public static let privacyLine = "Your location stays on your device. We never send it anywhere."
    public static let profileStorageLine = "Saved on this device only."
    public static let pm25Unit = "µg/m³"
    public static let pm25Label = "1-hr PM2.5"

    // COPY §1 profile screen
    public static let profileTitle = "Who are you checking for?"
    public static let profileSubtitle = "We'll give advice that fits. You can pick more than one."
    public static let profileFootnote = "Saved on this device only. Change it any time in Settings."

    // COPY §5
    public static let calmLine = "Enjoy the fresh air."
    public static let clearedLine = "Air's cleared. Good time to open the windows."
    public static let planningLine = "Planning for tomorrow? Use NEA's 24-hr PSI forecast. Schools and events plan with it."
    public static let neaForecastURL = URL(string: "https://www.haze.gov.sg/")!
    public static let moreTips = [
        "Indoors is a good shield. Windows shut helps a bit. A purifier running helps a lot.",
        "Surgical masks aren't made to filter haze. N95 masks are, when they fit well.",
        "Sore throat or itchy eyes usually get better once you're out of the haze.",
        planningLine,
    ]

    // COPY §6 official figure
    public static let officialCaption = "24-hour average"
    public static func officialPsiLabel(_ psi: Int?) -> String {
        guard let psi else { return "NEA 24-hr PSI: not available right now" }
        return "NEA 24-hr PSI: \(psi) (\(HazeCompute.psiLabel(psi).rawValue))"
    }

    // COPY §7
    public static let whyTwoNumbersLink = "Why two numbers?"
    public static let whyTwoNumbers = "NEA's 24-hr PSI is an average of the last 24 hours, so it changes slowly and is best for planning tomorrow. The 1-hr PM2.5 shows the last hour, and NEA recommends it for deciding what to do right now."
    public static let whyTwoNumbersShort = "Both are from NEA: the PSI averages 24 hours, PM2.5 shows the last hour."

    // COPY §8 chart. The line is NEA's 24-hr average PM2.5 in µg/m³ (SPEC v1.2 §2), so the legend says so.
    public static let chartTitle = "Last 24 hours"
    public static let chartLegendBars = "Bars: hourly PM2.5 at your spot"
    public static let chartLegendLine = "Line: NEA 24-hr average PM2.5"
    public static let chartCaption = "The line moves slowly because it averages a whole day. The bars show each hour."
    public static let chartGuideHigh = "High 151"
    public static let chartGuideElevated = "Elevated 56"

    // COPY §10 states
    public static let loading = "Getting NEA's latest reading…"
    public static let nextUpdateSoon = "NEA usually posts each hour at about half past. Next update soon."
    public static let staleDetail = "Newer readings from NEA are late. We'll keep checking."
    public static func allOffline(_ obs: String) -> String { "NEA's stations haven't reported since \(obs)." }
    public static func offlineCached(_ obs: String) -> String { "You're offline. Showing the reading from \(obs)." }
    public static let offlineNoCacheTitle = "Can't load the air reading"
    public static let offlineNoCacheDetail = "You're offline. Connect to see NEA's latest reading."
    public static let apiErrorTitle = "Can't reach NEA's data right now"
    public static let apiErrorDetail = "We'll try again in a few minutes."
    public static let noDataTitle = "No reading available"
    public static let noDataDetail = "NEA's data didn't include a usable reading this hour. We'll try again soon."
    public static func locationDenied(_ region: String) -> String {
        "Showing \(region). Pick your area, or allow location for a closer reading."
    }
    public static func outsideSingapore(_ region: String) -> String {
        "You seem to be outside Singapore. Showing NEA's \(region) station, the closest."
    }
    public static let locationLoading = "Finding your spot…"
    public static let tryAgain = "Try again"
    public static let offlineChip = "Offline"
    public static let oldSuffix = "(old)"

    // COPY §11 permission ask
    public static let notifyAskTitle = "Want a heads-up when the haze changes?"
    public static let notifyAskBody = "We'll only message when the band changes near you, and tell you when it's clear again. Never at night."
    public static let notifyAskYes = "Yes, notify me"
    public static let notifyAskNo = "Not now"

    // COPY §13 location pre-prompt
    public static let locationAskTitle = "Get the reading for your exact spot?"
    public static let locationAskBody = "We use your location only on this device, to pick the nearest NEA stations. It's never sent or stored anywhere else."
    public static let locationAskYes = "Use my location"
    public static let locationAskNo = "Pick my area instead"

    // COPY §14 regions
    public static let regionsHeading = "Across Singapore"

    // COPY §12
    public static let howTitle = "How we calculate this"
    public static let howSections: [(title: String, body: String)] = [
        ("Where the numbers come from", "Every number here comes from the National Environment Agency (NEA), published on data.gov.sg. We don't have our own sensors and we don't change NEA's readings."),
        ("The big number: 1-hr PM2.5", "PM2.5 is tiny particles in the air, the main part of haze. NEA measures it every hour at five stations: North, South, East, West and Central. The big number is the latest hour, in micrograms per cubic metre (µg/m³). NEA recommends this reading for deciding what to do in the next hour or so."),
        ("Your spot", "If you share your location, we estimate the reading for your spot from all of NEA's stations. Closer stations count more. If you're right next to a station, we use that station. If you don't share your location, we use the area you pick. Your location stays on your device."),
        ("The advice", "We use NEA's four bands for 1-hr PM2.5: Normal (0–55), Elevated (56–150), High (151–250) and Very High (251 and above). The advice for each band follows NEA's personal guide for healthy and vulnerable people. Vulnerable means older adults, pregnant women, children, and people with chronic lung or heart disease. We only put it in everyday words."),
        ("NEA's 24-hr PSI", "We also show NEA's official 24-hr PSI. It averages the last 24 hours, so it moves slowly. It's the right number for planning tomorrow, and schools and events use NEA's 24-hr PSI forecast. The chart shows both, so you can see how they move."),
        ("Trend", "We compare this hour with the hour before. \"Rising\" means up by 5 or more. \"Rising fast\" means up by 20 or more."),
        ("When data is late or missing", "NEA usually posts each hour's reading about 30 minutes later. Sometimes a station goes offline, and we then use the other stations and tell you. If readings are more than 2 hours old, we say so clearly."),
        ("What this app is not", "It's not medical advice, and it's not an official NEA app. If you feel unwell, see a doctor. In an emergency, call 995."),
        ("Check our work", "HazeNow is free and open source (MIT). All the maths is public, and every app uses the same rules."),
    ]

    public static let mockBadge = "MOCK DATA"
}
