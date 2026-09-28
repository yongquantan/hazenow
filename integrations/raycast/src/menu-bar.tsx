import { Clipboard, Color, Icon, LaunchType, MenuBarExtra, getPreferenceValues, launchCommand, open } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import {
  ANCHOR,
  BANDS,
  FOOTER,
  FORECAST_TIP,
  FORECAST_URL,
  OFFICIAL_CAPTION,
  REGIONS,
  REGIONS_HEADING,
  WHY_SHORT,
  a11y,
  actionsFor,
  arrowOf,
  bandOf,
  displayNumber,
  getSnapshot,
  officialLine,
  provenance,
  regionRow,
  secondLine,
  shareText,
  trendPhrase,
  uncertaintyLine,
  verdictLong,
  type Band,
  type Profile,
} from "./haze";

type Prefs = { region?: string; profile?: Profile };

// Brand mark (brand/svg/mark-currentcolor.svg, copied into assets/) for the no-data state: neutral, no band colour.
const NO_DATA_ICON = { source: "mark-currentcolor.svg", tintColor: Color.PrimaryText };

// COPY §3 shapes via Raycast icons (never colour alone).
const BAND_ICON: Record<Band, Icon> = {
  normal: Icon.CircleFilled,
  elevated: Icon.CircleProgress50,
  high: Icon.Warning,
  very_high: Icon.StopFilled, // closest to an octagon in the Raycast icon set
};

export default function Command() {
  const { region = "central", profile = "general" } = getPreferenceValues<Prefs>();
  const { data: s, isLoading, error, revalidate } = useCachedPromise(getSnapshot, [region], { keepPreviousData: true });

  if (!s) {
    return (
      <MenuBarExtra icon={NO_DATA_ICON} title={error ? "--" : ""} isLoading={isLoading} tooltip="HazeNow">
        <MenuBarExtra.Item title={error ? "Can't reach NEA's data right now" : "Getting NEA's latest reading…"} />
        {error && <MenuBarExtra.Item title="We'll try again in a few minutes." />}
        <MenuBarExtra.Item title="Try again" icon={Icon.ArrowClockwise} onAction={revalidate} />
      </MenuBarExtra>
    );
  }

  const b = BANDS[s.band];
  const second = secondLine(s);
  const unc = uncertaintyLine(s);
  return (
    <MenuBarExtra
      icon={{ source: BAND_ICON[s.band], tintColor: b.color }}
      title={`${s.pm25} ${arrowOf(s.trend.direction)}`}
      tooltip={a11y(s, profile)}
      isLoading={isLoading}
    >
      <MenuBarExtra.Section title={verdictLong(s.band, profile)}>
        {second && <MenuBarExtra.Item title={second} />}
        <MenuBarExtra.Item
          icon={{ source: BAND_ICON[s.band], tintColor: b.color }}
          title={`${displayNumber(s)} PM2.5 · ${b.label}`}
          subtitle={trendPhrase(s.history).words}
          onAction={() => launchCommand({ name: "haze-now", type: LaunchType.UserInitiated })}
        />
        <MenuBarExtra.Item title={ANCHOR[s.band]} />
        {unc && <MenuBarExtra.Item title={unc} />}
        <MenuBarExtra.Item title={provenance(s)} />
      </MenuBarExtra.Section>
      <MenuBarExtra.Section title="What you can do">
        {actionsFor(s, profile).map((a) => (
          <MenuBarExtra.Item key={a} title={a} />
        ))}
      </MenuBarExtra.Section>
      <MenuBarExtra.Section>
        <MenuBarExtra.Item title={officialLine(s)} subtitle={OFFICIAL_CAPTION} tooltip={WHY_SHORT} />
        <MenuBarExtra.Submenu title={REGIONS_HEADING} icon={Icon.Map}>
          {REGIONS.map((k) => {
            const v = s.regions[k]?.pm25;
            return (
              <MenuBarExtra.Item
                key={k}
                icon={v == null ? Icon.Circle : { source: BAND_ICON[bandOf(v)], tintColor: BANDS[bandOf(v)].color }}
                title={regionRow(s, k)}
              />
            );
          })}
        </MenuBarExtra.Submenu>
        <MenuBarExtra.Item title={FORECAST_TIP} icon={Icon.Calendar} onAction={() => open(FORECAST_URL)} />
      </MenuBarExtra.Section>
      <MenuBarExtra.Section>
        <MenuBarExtra.Item title="Open HazeNow" icon={Icon.AppWindow} onAction={() => launchCommand({ name: "haze-now", type: LaunchType.UserInitiated })} />
        <MenuBarExtra.Item title="Copy share text" icon={Icon.Clipboard} onAction={() => Clipboard.copy(shareText(s))} />
        <MenuBarExtra.Item title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
        <MenuBarExtra.Item title={FOOTER} onAction={() => open("https://data.gov.sg")} />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
