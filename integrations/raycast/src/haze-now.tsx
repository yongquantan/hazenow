import { Action, ActionPanel, Color, Icon, List, getPreferenceValues } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import {
  ANCHOR,
  BANDS,
  CHART_CAPTION,
  CHART_TITLE,
  FOOTER,
  FORECAST_TIP,
  FORECAST_URL,
  FOR_LABEL,
  OFFICIAL_CAPTION,
  REGIONS,
  WHY_LONG,
  actionsFor,
  arrowOf,
  buildSnapshot,
  displayNumber,
  fetchRaw,
  officialLine,
  provenance,
  secondLine,
  shareText,
  sparkPair,
  title,
  trendPhrase,
  uncertaintyLine,
  verdictLong,
  verdictShort,
  type Profile,
  type Snapshot,
} from "./haze";

type Prefs = { region?: string; profile?: Profile };

function markdown(s: Snapshot, label: string, profile: Profile): string {
  const b = BANDS[s.band];
  const second = secondLine(s);
  const unc = uncertaintyLine(s);
  const chart = sparkPair(s);
  return [
    `# ${verdictLong(s.band, profile)}`,
    `${FOR_LABEL[profile]} · ${label}${second ? `  \n${second}` : ""}`,
    "",
    `## ${displayNumber(s)} PM2.5 · ${b.glyph} ${b.label} ${arrowOf(s.trend.direction)}`,
    `${trendPhrase(s.history).words}  `,
    `${ANCHOR[s.band]}${unc ? `  \n${unc}` : ""}`,
    "",
    `*${provenance(s)}*`,
    "",
    "**What you can do**",
    "",
    ...actionsFor(s, profile).map((a) => `- ${a}`),
    "",
    `**${officialLine(s)}** · ${OFFICIAL_CAPTION}`,
    "",
    `**${CHART_TITLE}** (µg/m³, same scale)`,
    "```",
    `hourly PM2.5   ${chart.hourly}`,
    `NEA 24-hr avg  ${chart.daily}`,
    "```",
    `<sub>${CHART_CAPTION}</sub>`,
    "",
    "---",
    `**Why two numbers?** ${WHY_LONG}`,
    "",
    `[${FORECAST_TIP}](${FORECAST_URL})`,
    "",
    `<sub>${FOOTER}</sub>`,
  ].join("\n");
}

export default function Command() {
  const { region = "central", profile = "general" } = getPreferenceValues<Prefs>();
  // One fetch, then derive every region's snapshot locally (gentle on data.gov.sg's rate limit).
  const { data: raw, isLoading, error, revalidate } = useCachedPromise(() => fetchRaw(), [], { keepPreviousData: true });
  const keys = [region, ...REGIONS.filter((r) => r !== region), ...(region === "island" ? [] : ["island"])];

  return (
    <List isLoading={isLoading} isShowingDetail navigationTitle="HazeNow — PM2.5 right now">
      {!raw && error && <List.EmptyView title="Can't reach NEA's data right now" description="We'll try again in a few minutes." icon={Icon.WifiDisabled} />}
      {raw &&
        keys.map((k) => {
          const s = buildSnapshot(raw, k);
          if (k !== "island" && s.fellBack) {
            return <List.Item key={k} title={title(k)} subtitle="offline" icon={Icon.Circle} />;
          }
          const b = BANDS[s.band];
          const label = k === "island" ? "Islandwide" : title(k);
          return (
            <List.Item
              key={k}
              title={label}
              icon={{ source: Icon.CircleFilled, tintColor: b.color }}
              accessories={[{ tag: { value: `${s.pm25} ${arrowOf(s.trend.direction)}`, color: b.color as Color.Raw } }, { text: b.label }]}
              keywords={[b.label, verdictShort(s.band, profile)]}
              detail={<List.Item.Detail markdown={markdown(s, label, profile)} />}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard title="Copy Share Text" content={shareText(s)} />
                  <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
                  <Action.OpenInBrowser title="NEA 24-hr PSI Forecast" url={FORECAST_URL} />
                  <Action.OpenInBrowser title="Open HazeNow Web" url="https://hazenow.app" />
                </ActionPanel>
              }
            />
          );
        })}
    </List>
  );
}
