# HazeNow: sharing and the share-card system

How people in Singapore talk about and share haze, what makes a haze card worth forwarding, and which cards HazeNow should build.
This doc builds on `docs/UX_PSYCHOLOGY.md` (trust, Sandman, no Instant PSI), `docs/DISTRIBUTION.md` (channels, messengers) and `docs/COPY.md` (voice, §6 provenance, §7 "why two numbers", §15 share text).
Where it conflicts with them, those docs win on wording and this doc wins on card formats.

Researched 2026-09-28, during a live episode. Every link was fetched or returned by search on that day.
**Evidence limits, stated up front:**
- Reddit blocked automated access (HTTP 403), and search engines indexed almost no r/singapore haze threads. The Reddit quotes below are second-hand, quoted in news articles.
- I could not find or verify the **Calvin Cheng Facebook post** telling people to ignore the 24-hr PSI. It may exist. Search found nothing, and facebook.com can't be fetched. Don't cite it until someone has the link.
- TikTok, IG, Threads and Telegram can't be searched well from outside. I found no specific viral 2026 post on them, so claims about those platforms are marked *(inferred)*.
- HardwareZone (HWZ) quotes come from a model summary of the thread pages, not a human read. Spot-check them before quoting publicly.

---

## 0. Summary

1. **The 1-hr vs 24-hr gap is already the story.** People aren't asking "what is PSI?" any more. They're asking why the numbers disagree ("AQI 170++ NEA 76… what a big difference!", HWZ, 4 Sep 2026).
   The most viral framing of that gap is anger ("PSI is useless"). Anger spreads well online (Berger & Milkman, 2012). It's also the framing that loses us the trusted messengers.
   HazeNow's opening is to give people the **"aha" without the anger**: same NEA data, two clocks.
2. **The gap runs both ways, and that is our best defence.** On 27 Sep evening the 24-hr PSI was 83–119, reaching Unhealthy, while the 1-hr PM2.5 was 12–24 (Normal) ([NEA](https://www.nea.gov.sg/media/news/advisories/index/haze-situation-update-27-september-2026)).
   On 28 Sep at 8am it was PSI 62–77 with PM2.5 Normal everywhere ([AsiaOne](https://www.asiaone.com/singapore/weather-singapore-haze-psi-forecast-moderate-unhealthy-28-september)). Then it spiked to 105–140 by afternoon (our own feed).
   A tool that also says "it's cleared, even though the PSI still says Unhealthy" can't be read as "NEA hides bad air". It's plainly just faster.
3. **Private sharing is the main channel.** Haze sharing is protective and happens in WhatsApp family, parent and class groups. There, the sharer's reputation is on the line, and the "sharing is caring" urge also spreads misinformation (see §2).
   Design for the **forwarded-image-with-no-caption** case: the image must carry its own time, place, source and URL.
4. **Recommended cards:** (1) the Now card, (2) the Two Clocks chart, (3) the For-our-group card (kids and other profiles), (4) the All-clear card, (5) the Haze Receipt (a user photo with a stamp), shipped behind guardrails.
5. **#1 wedge:** the **Now card, built for forwarding in WhatsApp groups** (1080×1350). It shows NEA's own two-row advice (healthy / vulnerable) instead of the sharer's personal verdict. It also carries a one-line two-clocks explainer, so it answers the question the group is already arguing about.

---

## 1. How Singaporeans are talking about the haze

### 1.1 Right now (September 2026)

**The situation.**
- On 4 Sep the 24-hr PSI entered Unhealthy for the first time since 8 Oct 2023. NEA began daily advisories ([Mothership](https://mothership.sg/2026/09/nea-daily-haze-advisories-sep-2026/)).
- On 14 Sep the central 1-hr PM2.5 hit 113 while the 24-hr PSI was 78–99 ([Mothership](https://mothership.sg/2026/09/haze-september-reading-113/)).
- On 15 Sep at 12am the PSI was 145 ([Mothership](https://mothership.sg/2026/09/singapore-more-haze/)).
- On 27 Sep at 7am the central PSI was 128 ([littlebigreddot](https://littlebigreddot.com/singapore-haze-24-hour-psi-central-128-east-115-west-106-27-sep-2026/)). That night the PM2.5 was back to Normal.
- SIIA gave 2026 a rare "Red" haze outlook back in June ([Mothership](https://mothership.sg/2026/06/haze-outlook-report-2026/)). People expected this season.

**What people are confused about**
- **Why NEA's number is so much lower than "the app".** HWZ, "Latest PM2.5 Reading hit 179 (Unhealthy) in the East", 4 Sep 2026 ([thread](https://forums.hardwarezone.com.sg/threads/latest-pm2-5-reading-hit-179-unhealthy-in-the-east.7221413/)):
  - "AQI 170++ NEA 76… What a big difference!"
  - Another user corrects them with haze.gov.sg's 1-hr East reading of 76.
  - The OP pushes people to "look at pm2.5 readings".
  - Three different scales are being compared without anyone knowing it: US AQI, NEA 1-hr PM2.5, and PSI.
- **The same question earlier in the year.** HWZ, "PSI on haze.gov.sg and international site different" ([thread](https://forums.hardwarezone.com.sg/threads/psi-on-haze-gov-sg-and-international-site-different.7187053/); the date shows as Feb 2026, *verify*): "only 25 but 124 on aqicn".
  One reply gets it right ("one is 24hrs avg the other one is 2-3hrs avg"), and the OP says the numbers still didn't match. Same confusion, different month.
- **Media explainers exist because the question is common.** AsiaOne, 15 Sep 2026, "A haze of numbers?", opens with the common question of why Singapore doesn't use aqicn's AQI ([AsiaOne](https://www.asiaone.com/singapore/haze-singapore-psi-pm25-aqi-explained)).
  TheSmartLocal's survival guide (22 Sep) repeats NEA's "1-hr for now, 24-hr forecast for planning" split ([TSL](https://thesmartlocal.com/read/haze-singapore/)).
- **Smell vs number.** Burning smell at night with a "normal" reading, and the question "it's only at night ah, or is my nose tricking me" (Reddit, quoted by [STOMP](https://www.stomp.sg/in-a-nutshell/haze-hotspots-and-night-time-spikes-whats-behind-return-haze-spore), Mar 2025).
  NEA says the smell isn't always matched by PM2.5 or PSI.

**What people are angry about**
- **"The 24-hr PSI is useless."** Netizens called it that, and said the 1-hr PM2.5 "provides a more accurate reflection". NEA replied that the two serve different purposes ([planb.sg, 16 Sep 2026](https://www.planb.sg/post/singapore-s-use-of-24-hour-psidraws-criticism-amid-haze)).
- **Thresholds that feel too high.** When the Haze Task Force said CCs and RCs open air-con rooms at PSI >200, HWZ users said >100 is already "foggy and unbearable", joked about "goal posts", and noted the PSI may lag ([thread](https://forums.hardwarezone.com.sg/threads/community-centres-some-rcs-will-open-air-con-rooms-to-public-when-psi-exceeds-200-haze-task-force.7221435/)).
- **Government response.** "JLB Minister still monitoring?" ([HWZ, 4 Sep](https://forums.hardwarezone.com.sg/threads/latest-pm2-5-reading-hit-179-unhealthy-in-the-east.7221413/)), and calls for COVID-style WFH.
  This is the anti-government strand that a share card must never feed.
- **Worry about health.** Clinics report 20–30% more asthma flare-ups and respiratory visits ([Yahoo/ST, 15 Sep](https://sg.news.yahoo.com/organisations-singapore-haze-related-measures-140000613.html)).
  Organisers are cancelling things: Outward Bound Singapore cancelled a school camp, the Hockey Federation suspends matches at PSI >100, and the FAS has its own PSI protocol.
  Note that **organisations decide on the 24-hr PSI, and individuals ask about right now.** Both jobs are real.

**What people joke about**
- Silent Hill fog ("any buddies remember the haze era when everyday here look like sirent hill", [HWZ](https://forums.hardwarezone.com.sg/threads/any-buddies-remember-the-haze-era-when-everyday-here-look-like-sirent-hill.7195388/)).
- "East side best side! /cough cough", and "inhale a bit of smoke is good for the lungs" ([HWZ](https://forums.hardwarezone.com.sg/threads/latest-pm2-5-reading-hit-179-unhealthy-in-the-east.7221413/)).
- Regional pride and rivalry ("lucky i live in mary mount"). **Where you live is part of the joke.** That's why a region or place stamp is shareable.

**What gets shared** (2026, from the sources above; *platform mix partly inferred*)
- Skyline photos: Marina Bay and CBD shots by wire photographers are everywhere ([AP via Dayton Daily News](https://www.daytondailynews.com/nation-world/singapore-haze/image_7d30f96f-64d9-5ad2-8a06-c58c024ebbfb.html)), and personal window views.
- Screenshots of apps with the number: AirVisual/aqicn US AQI, and haze.gov.sg. These are the ammunition in the "big difference" arguments.
- Explainers: media PSI vs PM2.5 guides, and TikTok explainers such as [@safety.com.sg](https://www.tiktok.com/@safety.com.sg/video/7676431295248960776).
- Other web tools that reframe NEA data: [psi.sg](https://psi.sg/) ("Made by @jasonleowsg", data.gov.sg licence, Buy Me A Coffee) and [checkpointsg.com/haze](https://www.checkpointsg.com/haze), whose line is "the 24-hour PSI lags what you can actually smell outside, because it is still carrying yesterday's cleaner air".
  **HazeNow is not the first to make the "two numbers" point.** It has to win on calm, trust and share design, not on novelty.

### 1.2 Recent episodes

| episode | what happened | what people shared |
|---|---|---|
| **2013** | The 3-hr PSI hit 401. N95 queues and sell-outs. | Twitter was the main public channel; 75% of haze tweets were negative, and the positive ones came mostly from media and government ([Lin & Tan, 2013 via ResearchGate](https://www.researchgate.net/publication/262077601_Public_Opinions_about_Haze_Crisis_in_Singapore_Traditional_Media_News_vs_New_Media_Voices)). Humour as coping ([CNBC "Choking on Humor"](https://www.cnbc.com/id/100833470), which blocked fetching; title only). |
| **2015** | Three months of haze. Schools closed on 25 Sep. | About **250,000 #SGhaze tweets**, "from PSI levels to humourous images of the slowly disappearing skyline" ([Yahoo SG](https://sg.news.yahoo.com/you-d-never-guess-what-singapore-s-most-popular-tweet-of-2015-was-042104708.html)). SGAG memes: a giant fan in place of the Flyer, #ReplaceMovieNamesWithHaze. **Before-and-after skyline pairs** ([Yahoo slideshow](https://malaysia.news.yahoo.com/photos/haze-situation-in-singapore-sparks-memes-on-social-media-1371704264-slideshow/)). **A hoax**: the fake MOM "voluntary non-work day" spread on WhatsApp and Facebook at PSI 313–341, and MOM made a police report ([Wikipedia](https://en.wikipedia.org/wiki/2015_Voluntary_non-work_day)). |
| **2019** | 24-hr PSI Unhealthy from 15 Sep. N95 sell-outs. | The Spotify haze playlist ("Harder to Breathe", "We Didn't Start the Fire"), a Jay-Z/Jokowi meme, the Merlion, "Hazing with You" ([Yahoo SG, 18 Sep 2019](https://sg.news.yahoo.com/singaporeans-and-malaysians-react-to-the-haze-with-humour-because-what-else-can-we-do-092127456.html); [Wonderwall.sg](https://wonderwall.sg/health/handling-the-singapore-haze-season---with-memes/)). Malaysia's "bring a fan, blow it back" ([Mothership](https://mothership.sg/2019/09/malaysia-blow-the-haze-back-fan/)). Community care: Chong Pang's mask packs, "let's look out for one another" ([AsiaOne](https://www.asiaone.com/lifestyle/singapore-psi-haze-n95-mask-care-pack)). |
| **2023** | 7 Oct: PSI 66–120, PM2.5 30–94 ([MSS](https://www.weather.gov.sg/fwo-haze-situation-update-7-october-2023/)). | Short episode. I found no distinctive sharing pattern. |
| **2024** | No significant episode found. | — |
| **2025** | March: smoke from Johor hotspots, East PM2.5 69 at 2am ([STOMP](https://www.stomp.sg/in-a-nutshell/haze-hotspots-and-night-time-spikes-whats-behind-return-haze-spore)). | Night-time smell threads: "East side haze is super strong. Especially when the day darkens" (Reddit via STOMP). |

**Patterns across episodes**
- **Humour is the default public register.** Singaporeans cope by joking: fans, the Merlion, Silent Hill, "four seasons".
- **Photos of a place are the most repeated visual.** The skyline disappearing, before and after.
- **Numbers get shared as ammunition in disputes** ("NEA says X, app says Y").
- **Misinformation arrives through WhatsApp and Facebook at the peak.** The 2015 hoax is the example.
- **Community care** (check on the elderly, mask packs) is the positive, shareable counter-story.

---

## 2. Where sharing happens, who shares, and what they want to feel

**Channel facts.** Trust in news in Singapore is 45%. ST (75%) and CNA (74%) are the most trusted brands. WhatsApp and Facebook news use is steady, while YouTube, Instagram and TikTok news use are growing ([Reuters DNR 2025, Singapore](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2025/singapore)). Exact WhatsApp percentages weren't on the page.

| channel | private or public | who shares to whom | what they want to feel | card that fits |
|---|---|---|---|---|
| **WhatsApp family groups** | private, high trust | adult child → parents; aunty → everyone | **protective**, "I'm looking after you" | Now card, For-our-group (elderly), All-clear |
| **WhatsApp/Telegram parent and class groups** | semi-private, reputational | class rep, parent volunteer → other parents | **useful, in the know**, not alarmist in front of other parents | For-our-group (kids), Now card |
| **Telegram neighbourhood/estate groups** | semi-public | residents | local, "it's bad *here*" | Now card with region, Receipt |
| **Workplace Slack/Teams** | private, professional | colleague, HR/ops → team | practical, a bit wry | Now card, Two Clocks (the "why") |
| **Run clubs, Strava clubs** | semi-private | leader → members, before a session | **decisive** ("session moved indoors") | For-our-group (exercise) |
| **IG stories** | public, self-expression | self → friends | witness, awe, humour, "look at this" | Receipt (9:16) |
| **X / Threads** | public | self → strangers | commentary, "aha", sometimes indignant | Two Clocks (1.91:1) |
| **Reddit r/singapore, HWZ** | public, argumentative | self → sceptics | winning the argument, correcting | Two Clocks + link to "How we calculate this" |
| **Facebook** | public-ish, older | self → friends, pages → followers | opinion and outrage (influencer posts) | Two Clocks (neutral version only) |

**Why private groups matter most.** Research on WhatsApp family groups in Singapore treats them as a "meso-news space". The pull to share and the reluctance to correct elders both shape what spreads there ([Digital Journalism, 2023; authors not verified](https://www.tandfonline.com/doi/abs/10.1080/21670811.2023.2213731)).
Studies of older adults' health sharing find "sharing is caring even when it's wrong" ([Health Communication, 2025](https://www.tandfonline.com/doi/full/10.1080/10410236.2025.2457188)).
**Implication:** a HazeNow card will be forwarded by people who care, to people who trust them, often without checking. So the card itself must be hard to misread and hard to re-use when it's stale.

### Risks

1. **Fear-mongering.** A red card with a big number and no action spreads anxiety into a family group. Always pair the threat with an action (UX_PSYCHOLOGY §2.1), and avoid alarm colours at Elevated.
2. **Staleness as misinformation.** Haze screenshots circulate for days. A card that says "137, Elevated" with no date becomes false by evening; on 27–28 Sep the air swung from Normal to 140 within hours.
   **Fix:** every card shows an absolute timestamp ("Mon 28 Sep, 5pm"), never "just now".
3. **Stricter-scale confusion.** Mixing US AQI with NEA numbers is where the "NEA hides it" story comes from. Cards use NEA's numbers and bands only (see the AirVisual lesson in §3).
4. **Anti-government framing.** The strongest emotion online is "PSI useless / minister still monitoring". A card that looks like "NEA 86 vs reality 137" will be used as a weapon, and our clinicians, schools and run-club leaders will stop sharing it.
5. **POFMA sensitivity.** POFMA lets ministers order corrections to content they consider false, or that could reduce public confidence in the government ([Reuters DNR 2025 SG page](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2025/singapore)). I found **no POFMA direction about haze data to date**.
   Our protection is structural:
   - Every number on a card is NEA's, labelled with station and measured time.
   - There is no invented index (no Instant PSI, no US AQI).
   - Wording is NEA's own ("NEA recommends the 1-hr PM2.5 for deciding what to do now").
   - Users can't edit any value (see Receipt below).
6. **Impersonation of NEA.** No NEA logo, crest, colours or ".gov" look. The card must say "Not an official NEA app" (DISTRIBUTION §7).
7. **Commerce.** No purifier or mask mentions on cards. Selling alongside health advice caused the Vietnam backlash against AirVisual (UX_PSYCHOLOGY §5).

---

## 3. Share psychology and patterns that work

### 3.1 Frameworks, applied to haze

**STEPPS** (Berger, *Contagious*, 2013; [Wharton summary](https://knowledge.wharton.upenn.edu/article/contagious-jonah-berger-on-why-some-things-catch-on/)):

| principle | haze application | risk |
|---|---|---|
| **Social currency** (sharing makes me look good) | "I know why the numbers differ" makes the sharer the calm, informed one. Neighbourhood pride ("East side best side"). | Looking smart by bashing NEA. |
| **Triggers** (top of mind) | The haze itself, the smell at night, the morning school or commute decision, the 7–8am run check. | — |
| **Emotion** (high arousal spreads) | Awe (the skyline gone), relief (the all-clear), "aha" (two clocks). | Anger and anxiety are also high-arousal and spread well ([Berger & Milkman, 2012](https://journals.sagepub.com/doi/10.1509/jmr.10.0353)). We **choose** awe, surprise and relief. |
| **Public** (visible use) | A recognisable card look and a small wordmark that people learn to spot in chats. | — |
| **Practical value** | "What should my kid do at recess?" Practical usefulness independently predicts sharing (Berger & Milkman, 2012). | — |
| **Stories** | "Same air, two clocks." The Receipt's "my window at 5pm". | — |

**Why people share** (NYT Customer Insight Group, *The Psychology of Sharing*, 2011; [summary](https://contently.com/2012/02/24/psychology-of-sharing/); secondary source, the original PDF is hard to find):
- to bring value to others
- to define themselves (68%)
- to stay connected (78%)
- self-fulfilment (69%)
- to support causes

Haze sharing is mostly **"bring value" and "stay connected"**: protective, prosocial sharing. Design for the sharer to look caring and sensible, not clever.

### 3.2 Case studies

| product | what it does | lesson for HazeNow |
|---|---|---|
| **Wordle** emoji grid | Wardle added a share button that copies a **spoiler-free** grid, copying what users were already typing by hand ([Wardle on X](https://x.com/powerlanguish/status/1471493886031773707); [Slate](https://slate.com/culture/2022/01/wordle-game-creator-wardle-twitter-scores-strategy-stats.html)). | Ship a **text** share that works in any chat, and is "spoiler-free" for advice: no personal verdict, since the receiver's profile differs (COPY §15 already does this). Watch what users paste by hand, then productise it. |
| **Spotify Wrapped** | 9:16 cards made for Stories, one stat per card, identity labels ([Spotify newsroom 2025](https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/); [UX Playbook](https://uxplaybook.org/articles/spotify-wrapped-ux-design-lessons)). | **One idea per card.** Size natively for each channel. People won't screenshot "a boring dashboard". But avoid identity or bragging mechanics: haze is not an achievement. |
| **Strava** | "Stats Stickers": your stats and route as a transparent sticker layered on your own photo in IG Stories ([BikeRadar](https://www.bikeradar.com/news/strava-sticker-stats-spring-2025-updates); [Strava help](https://support.strava.com/en-us/articles/15401840-sharing-your-strava-activities)). | This is exactly the **Haze Receipt** pattern: the user's photo plus a small data stamp. The photo supplies the emotion, the stamp supplies the credibility. |
| **Flighty Passport** | Shareable artwork of your flight stats, in two designed themes, "optimized for sharing" ([Flighty](https://flighty.com/passport); [Apple "Behind the Design"](https://developer.apple.com/news/?id=970ncww4)). | Craft signals that a person made it on purpose: real typography, restraint, a strong single motif. It reads as an object, not a dashboard. |
| **BeReal** | The capture time is part of the post, and late posts are labelled as late ([BeReal help](https://help.bereal.com/hc/en-us/articles/7350386715165--Time-to-BeReal); [Flow Journal on "temporal authenticity"](https://www.flowjournal.org/2023/02/bereal_now_temporal_authenticity/)). | **The timestamp is what makes it real.** The Receipt should be capture-time-only, like BeReal, and show "taken 5:12pm · reading measured 5pm". |
| **Carrot Weather** | Personality (Professional → Overkill) makes forecasts screenshot-worthy, with screenshot and video sharing ([9to5Google](https://9to5google.com/2018/07/12/carrot-weather-android/); [TapSmart](https://www.tapsmart.com/features/deep-dive-carrot-weather/)). | Voice drives sharing, but snark is wrong for a health tool in a family chat. Our "personality" is the **calm neighbour**. A light local touch at Normal only ("Fine to be out. Enjoy it.") is the most we allow. |
| **Apple Weather** | *Unverified:* I couldn't confirm that Apple Weather produces an image share card rather than a link. | Don't copy it. |
| **US/Canada 2023 wildfire smoke** | NYC's orange sky on 7 Jun 2023 went viral as "Mars" comparisons, and same-view photos flooded feeds ([Washington Post](https://www.washingtonpost.com/weather/2023/06/08/orange-sky-explained-wildfire-smoke/); [Green Matters, 10 pictures](https://www.greenmatters.com/weather-and-global-warming/pictures-of-new-york-smoke)). | **Sky photos are the natural haze share.** Singapore did the same in 2015 (before/after skylines). People already take the photo; we can add the provenance. |
| **AirVisual screenshots** | The most-shared "number" in SG arguments. It shows US AQI, which is stricter: PM2.5 of 35.5–55.4 is "Unhealthy for Sensitive Groups" while NEA calls it Normal ([IQAir KB](https://www.iqair.com/support/knowledge-base/what-is-the-difference-between-singapores-pollutant-standards-index-and-the-u-s-air-quality-index)). IQAir's own SG article is headlined "won't tell you what the haze is like right now" ([IQAir](https://www.iqair.com/sg/newsroom/why-singapore-s-air-quality-index-won-t-tell-you-what-the-haze-is-like-right-now)). | Its screenshots spread because they give **a bigger, faster number that feels truer**. We give a fast number too, but it's NEA's, in NEA's words, so it settles the argument instead of starting one. |

### 3.3 Screenshot-worthy vs "AI-generated dashboard"

Screenshot-worthy cards:
- **one claim**
- **one big number or one photo**
- **a sentence a person would say out loud**
- **a place and a time**
- a strong, restrained typographic hierarchy
- a single accent colour (the band)
- whitespace
- a recognisable signature

"AI dashboard" cards have:
- many tiles of equal weight
- gradient glows and glassmorphism
- icons for every metric
- a generic sans at one weight
- emoji sprinkled in
- multiple charts
- "Air Quality Index: 137 · Humidity · Wind" clutter
- everything centred, with no point of view

Concrete rules for HazeNow cards:
1. **The headline is a sentence, not a label.** "Air near Tampines, 5pm: Elevated and rising", not "AQI STATUS".
2. **At most one chart, and only on the Two Clocks card.** No map on a card; maps don't survive WhatsApp compression or small screens.
3. **Use the app's own type pairing** (Instrument Serif for the headline, Instrument Sans for data; self-hosted, per UX_PSYCHOLOGY §7 P2-12). A serif headline alone moves the card away from "dashboard".
4. **Band colour is a single band or chip, not a full-card flood.** Never alarm red at Elevated. Text plus a shape, never colour alone.
5. **Real specifics beat polish:** a station name, "measured 5pm", and "nearby stations read 118–140". Specifics signal a human-checked source (van der Bles et al., 2020, on numeric ranges; UX_PSYCHOLOGY §3.5).
6. **Sizing:** body text at least ~36 px on a 1080-wide card, and the headline 72–110 px. WhatsApp and Telegram previews are small, and forwarded images get recompressed *(sizing is a design judgement, not sourced)*.

---

## 4. Recommendations: the HazeNow share system

### 4.1 Shared rules for every card

- **Every number is NEA's**, in µg/m³ or NEA's 24-hr PSI, with NEA's band words. No Instant PSI, no US AQI, no "×" multiples.
- **Absolute time and place on every card:** "Mon 28 Sep · 5pm · NEA East station". Relative time ("51 min ago") is banned on images.
- **Freshness guard:** only offer the share button when the reading is less than 90 min old. Otherwise show "Latest NEA reading is from 2pm; sharing is paused until the next update." *(90 min is a proposal.)*
- **Share text** stays COPY §15, attached as the caption where the platform allows.
- **Filenames** carry the time: `hazenow-east-2026-09-28-1700.png`. Many people forward the file itself, and the timestamp survives in the file.
- **Voice:** COPY.md rules. No exclamation marks, no banned words, "for now" rather than "today".

### 4.2 Attribution footer (every card, 2 lines, small but legible)

```
Data: NEA via data.gov.sg · measured 5pm, Mon 28 Sep · Not an official NEA app
HazeNow · free & open source · built by {builderName} · hazenow.app   [QR]
```
- **`{builderName}`**: the builder's public name or handle (for example "Yong Quan"). DISTRIBUTION §4 requires disclosing "I built this". A named human is also a trust signal, the way psi.sg shows "Made by @jasonleowsg".
- **"free & open source"**: the credibility signal (DISTRIBUTION §3). Put "no ads, no tracking" on the Now and Two Clocks cards if it fits; drop it before dropping the NEA credit.
- **The URL in text is mandatory.** Forwarded images lose their captions, and WhatsApp images aren't clickable.
- **The QR is optional per format.** Use it on the IG story (Stories have no clickable links without stickers) and on anything likely to be printed or shown on a second screen.
  Skip it on the 1.91:1 OG card, which is small and already links. QR codes on a phone screen are awkward to scan from the same phone *(design judgement)*.
- Order matters: **the NEA credit comes first**, then HazeNow. The card should read as "NEA's data, made clear", not "our number".

### 4.3 The card set

#### Card 1: the Now card (the #1 wedge)
- **For:** WhatsApp and Telegram groups, Slack/Teams, the default share. **1080×1350 (4:5).** It survives WhatsApp's image preview and IG feed, and fits in a chat bubble without heavy cropping.
- **Hook (top):** "Air near Tampines · Mon 28 Sep, 5pm"
- **Headline:** "**Elevated, and rising.**" · big "137" · "µg/m³ PM2.5 (1-hr)" · chip "● Elevated · High starts at 151"
- **Advice block, NEA's own split, no personal verdict:**
  - "Most people: go easy on long, hard exercise for now."
  - "Kids, older folks, pregnant, heart or lung conditions: skip strenuous activity for now."

  This keeps the COPY §15 principle (advice depends on the reader) while giving the group something to act on.
- **Two-clocks line (small):** "NEA 24-hr PSI: 86 (Moderate). That's a 24-hour average. For right now, NEA says use the 1-hr PM2.5."
- **Emotion to leave:** *protective calm.* The sharer looks caring and sensible.
- **Why it's the wedge:** this is the question the groups are already arguing about. It answers it with NEA's own words, so a parent volunteer or nurse can forward it without risk to their reputation.

#### Card 2: Two Clocks (the insight card)
- **For:** X/Threads, Reddit, HWZ, Facebook, press. **1200×630 (1.91:1)** as the OG image, and 1080×1350 for posting as an image.
- **Hook:** "**Same NEA data. Two clocks.**"
- **Headline:** "The last hour vs the last 24 hours, Central, 28 Sep"
- **Body:** the DISTRIBUTION §2 chart. Hourly PM2.5 bars against NEA's 24-hr PM2.5 average line, both in µg/m³, with dashed guides at 56 and 151. One annotation only: "5pm: 137 · 24-hr average: 43".
- **Caption line:** COPY §7 verbatim: "NEA's 24-hr PSI is an average of the last 24 hours, so it changes slowly and is best for planning tomorrow. The 1-hr PM2.5 shows the last hour, and NEA recommends it for deciding what to do right now."
- **Emotion:** *"aha", in the know.* Surprise and practical value, not indignation.
- **Also publish the mirror version when it happens:** "Cleared: 1-hr PM2.5 is back to Normal (18). The 24-hr PSI still reads 112 while it averages out." (as on 27 Sep evening). Posting both directions is what makes the card clearly non-partisan.

#### Card 3: For our group (profile-specific)
- **For:** parent and class chats (kids), eldercare and caregiver chats, run clubs. **1080×1350.**
- **Hook:** "For the kids · Recess check, 10am, Mon 28 Sep" / "For today's run · 6:30am" / "For Mum and Dad · 3pm"
- **Headline:** the COPY §2 verdict for that profile, for example "**Calm play only, for now.**"
- **Body:** 1–2 COPY §5 actions for the profile, plus the R4 line "Deciding about school tomorrow? Check NEA's 24-hr PSI forecast at haze.gov.sg."
- **Emotion:** *decisive, responsible.* The class rep or run leader looks prepared.
- **Why it's separate from Card 1:** the audience of a parent or run group shares one profile, so a verdict is fine here. It must say who it's for in the hook.

#### Card 4: All-clear
- **For:** the same WhatsApp and Telegram groups the earlier cards went to. **1080×1350**, plus a text version.
- **Hook:** "Air's back to Normal near Tampines · 9pm"
- **Headline:** "**Fine to be out.**" · "PM2.5 18 · Normal"
- **Line:** "The 24-hr PSI will take a while to catch up. It's an average of the last 24 hours."
- **Emotion:** *relief*, and the sharer gets to bring good news. Reprieves reset alert fatigue (Graff Zivin & Neidell, 2009; UX_PSYCHOLOGY §3.8).
  This card is also the most politically safe thing we can ship, because it shows our number is faster in both directions.
- **Trigger:** offer it in-app, and in the Telegram all-clear message, to anyone who shared an Elevated+ card in the last 24 h ("You shared a haze update earlier. Share the all-clear?"). This happens on-device; no tracking is needed.

#### Card 5: Haze Receipt (the user's sky photo, stamped)
- **For:** IG stories, plus X and Telegram estate groups. **1080×1920 (9:16)**, with a 4:5 crop option. Keep the stamp inside the story safe zone, clear of about 250 px at the top and 250–340 px at the bottom ([Instagram safe-zone guide](https://www.outfy.com/blog/instagram-safe-zone/)).
- **Pattern:** Strava's stats sticker plus BeReal's time honesty. The photo fills the frame, with a small stamp in one corner:
  ```
  Tampines · 5:12pm Mon 28 Sep
  PM2.5 137 · Elevated ▲
  NEA East station, measured 5pm
  hazenow.app  [QR]
  ```
- **Hook (optional, user-chosen from a fixed list, no free text):** "My window, 5pm." / "Same view, yesterday vs today." (a two-photo pairing, reviving 2015's before/after format) / no hook.
- **Emotion:** *witness and awe*, a little humour (the Silent Hill instinct). It has the highest reach potential of all the cards.

**Is it compelling?** Yes, probably the most. Sky photos are the most-repeated haze share in 2013, 2015, 2019 and 2023's wildfire smoke. Place pride and rivalry ("East side best side") is built in. The stamp turns a vibe into a checkable record.

**Risks, and the guardrails that make it shippable:**

| risk | guardrail |
|---|---|
| Old or someone else's photo stamped with today's reading (misattribution, "fake haze") | **In-app camera capture only**, with no camera-roll import in v1. The stamp time equals the capture time. |
| Edited values → possible POFMA "falsehood" | The stamp is rendered from the live NEA reading. The user **can't edit** the number, band, station or time. |
| Photo looks worse or better than the reading (white balance, sunset, fog, rain). A photo is not a measurement, and smell and visibility don't track PM2.5 reliably (NEA via [STOMP](https://www.stomp.sg/in-a-nutshell/haze-hotspots-and-night-time-spikes-whats-behind-return-haze-spore)). | The stamp always says "NEA ... station, measured {time}". We never claim the photo *is* the reading. No filters that add haze. |
| Location privacy (EXIF GPS, a home view identifying the flat) | Strip all EXIF. Stamp a **region or planning area**, never coordinates or a street. Processing stays on-device (our privacy stance). |
| Receipt used as "proof NEA lies" next to a PSI screenshot | Never put the 24-hr PSI on the Receipt. It has one number only: NEA's 1-hr PM2.5. |
| Photos of people or children | A light prompt: "Sky shots work best. Avoid faces." No face detection is needed in v1. |
| Nighttime or indoor photos | Allow them. Don't block anything; the stamp still tells the truth about the air. |

Verdict: **build it second or third, not first.** It has the most reach but needs the most guardrails, and its audience (IG stories) is the least protective and least private. The Now card earns trust in the groups that matter first.

### 4.4 Phrasing the 1-hr vs 24-hr gap (shareable, not an attack)

**Use**
- "Same NEA data. Two clocks."
- "The last hour vs the last 24 hours."
- "The 24-hr PSI is an average, so it moves slowly. NEA recommends the 1-hr PM2.5 for right now."
- "For right now: 1-hr PM2.5. For planning tomorrow: NEA's 24-hr PSI forecast."
- In the mirror case: "Cleared. The 24-hr average will catch up."

**Never use**
- "the real number"
- "what NEA won't tell you"
- "PSI is useless"
- "lagging" (on labels; COPY §6)
- "NEA says 86, reality says 137"
- side-by-side "vs" layouts with red circles or arrows
- US AQI

**Replying under a "PSI is useless" thread** (DISTRIBUTION §1): "Both are NEA numbers, for different jobs. NEA itself says to use the 1-hr PM2.5 for what to do now, and the 24-hr forecast for tomorrow." Then link Card 2.

### 4.5 Build order

1. **Now card**, with the text share and the OG version of it at 1200×630 for link previews. Today.
2. **All-clear card**, which reuses the Now card template. The next time a region returns to Normal.
3. **Two Clocks card**, in both directions. For the Reddit/HWZ post and the press pitch (DISTRIBUTION §5).
4. **For-our-group card**, as a profile switch on the Now card.
5. **Haze Receipt**, with in-app capture only, the non-editable stamp, EXIF stripped, and region-level place.

**Measuring without tracking** (DISTRIBUTION §9): count share-button taps per card type as an aggregate counter with no user ID, if we add any counter at all. The honest proxies are otherwise:
- inbound visits with `?s=now|clocks|group|clear|receipt` on the share URL, counted server-side as aggregate totals only
- Telegram bot `/start` payloads

---

## 5. Sources

**Singapore, 2026 episode**
- NEA Haze Situation Update, 27 Sep 2026. https://www.nea.gov.sg/media/news/advisories/index/haze-situation-update-27-september-2026
- AsiaOne, air quality improves, 28 Sep 2026. https://www.asiaone.com/singapore/weather-singapore-haze-psi-forecast-moderate-unhealthy-28-september
- AsiaOne, "A haze of numbers?", 15 Sep 2026. https://www.asiaone.com/singapore/haze-singapore-psi-pm25-aqi-explained
- planb.sg, 24-hr PSI draws criticism, 16 Sep 2026. https://www.planb.sg/post/singapore-s-use-of-24-hour-psidraws-criticism-amid-haze
- Mothership: 14 Sep (113), https://mothership.sg/2026/09/haze-september-reading-113/ ; 15 Sep (PSI 145), https://mothership.sg/2026/09/singapore-more-haze/ ; daily advisories, https://mothership.sg/2026/09/nea-daily-haze-advisories-sep-2026/ ; SIIA red outlook, https://mothership.sg/2026/06/haze-outlook-report-2026/
- littlebigreddot, 27 Sep 2026. https://littlebigreddot.com/singapore-haze-24-hour-psi-central-128-east-115-west-106-27-sep-2026/
- Yahoo SG, organisations take haze measures, 15 Sep 2026. https://sg.news.yahoo.com/organisations-singapore-haze-related-measures-140000613.html
- TheSmartLocal survival guide, 22 Sep 2026. https://thesmartlocal.com/read/haze-singapore/
- HWZ threads: https://forums.hardwarezone.com.sg/threads/latest-pm2-5-reading-hit-179-unhealthy-in-the-east.7221413/ ; https://forums.hardwarezone.com.sg/threads/community-centres-some-rcs-will-open-air-con-rooms-to-public-when-psi-exceeds-200-haze-task-force.7221435/ ; https://forums.hardwarezone.com.sg/threads/psi-on-haze-gov-sg-and-international-site-different.7187053/ ; https://forums.hardwarezone.com.sg/threads/any-buddies-remember-the-haze-era-when-everyday-here-look-like-sirent-hill.7195388/
- TikTok explainer: https://www.tiktok.com/@safety.com.sg/video/7676431295248960776
- Other SG haze tools: https://psi.sg/ ; https://www.checkpointsg.com/haze

**Singapore, earlier episodes**
- STOMP, March 2025 night-time haze. https://www.stomp.sg/in-a-nutshell/haze-hotspots-and-night-time-spikes-whats-behind-return-haze-spore
- MSS, 7 Oct 2023. https://www.weather.gov.sg/fwo-haze-situation-update-7-october-2023/
- Yahoo SG, 2019 haze humour. https://sg.news.yahoo.com/singaporeans-and-malaysians-react-to-the-haze-with-humour-because-what-else-can-we-do-092127456.html
- Wonderwall.sg, haze memes, 2019. https://wonderwall.sg/health/handling-the-singapore-haze-season---with-memes/
- Mothership, "blow the haze back", 2019. https://mothership.sg/2019/09/malaysia-blow-the-haze-back-fan/
- AsiaOne, Chong Pang care packs, 2019. https://www.asiaone.com/lifestyle/singapore-psi-haze-n95-mask-care-pack
- Yahoo SG, #SGhaze 2015 (~250k tweets). https://sg.news.yahoo.com/you-d-never-guess-what-singapore-s-most-popular-tweet-of-2015-was-042104708.html
- Yahoo, 2015 haze memes slideshow. https://malaysia.news.yahoo.com/photos/haze-situation-in-singapore-sparks-memes-on-social-media-1371704264-slideshow/
- 2015 MOM non-work-day hoax. https://en.wikipedia.org/wiki/2015_Voluntary_non-work_day
- Lin & Tan (2013), public opinion on the haze crisis. https://www.researchgate.net/publication/262077601_Public_Opinions_about_Haze_Crisis_in_Singapore_Traditional_Media_News_vs_New_Media_Voices
- CNBC, "Choking on Humor" (2013). https://www.cnbc.com/id/100833470 (fetch blocked; title only)

**Channels and misinformation**
- Reuters Institute DNR 2025, Singapore. https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2025/singapore
- (Authors not verified) (2023), Misinformation in WhatsApp family groups. *Digital Journalism* 12(5). https://www.tandfonline.com/doi/abs/10.1080/21670811.2023.2213731
- "Sharing is caring even when it's wrong" (2025). *Health Communication* 40(11). https://www.tandfonline.com/doi/full/10.1080/10410236.2025.2457188

**Share psychology**
- Berger, J., & Milkman, K. L. (2012). What makes online content viral? *JMR* 49(2). https://journals.sagepub.com/doi/10.1509/jmr.10.0353
- Berger, J. (2013). *Contagious*. Wharton summary: https://knowledge.wharton.upenn.edu/article/contagious-jonah-berger-on-why-some-things-catch-on/
- NYT Customer Insight Group (2011). *The Psychology of Sharing* (secondary summary). https://contently.com/2012/02/24/psychology-of-sharing/

**Case studies**
- Wordle: https://x.com/powerlanguish/status/1471493886031773707 ; https://slate.com/culture/2022/01/wordle-game-creator-wardle-twitter-scores-strategy-stats.html
- Spotify Wrapped 2025: https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/ ; https://uxplaybook.org/articles/spotify-wrapped-ux-design-lessons
- Strava Stats Stickers: https://www.bikeradar.com/news/strava-sticker-stats-spring-2025-updates ; https://support.strava.com/en-us/articles/15401840-sharing-your-strava-activities
- Flighty Passport: https://flighty.com/passport ; https://developer.apple.com/news/?id=970ncww4
- BeReal: https://help.bereal.com/hc/en-us/articles/7350386715165--Time-to-BeReal ; https://www.flowjournal.org/2023/02/bereal_now_temporal_authenticity/
- Carrot Weather: https://9to5google.com/2018/07/12/carrot-weather-android/ ; https://www.tapsmart.com/features/deep-dive-carrot-weather/
- 2023 NYC wildfire smoke: https://www.washingtonpost.com/weather/2023/06/08/orange-sky-explained-wildfire-smoke/ ; https://www.greenmatters.com/weather-and-global-warming/pictures-of-new-york-smoke
- IQAir: https://www.iqair.com/support/knowledge-base/what-is-the-difference-between-singapores-pollutant-standards-index-and-the-u-s-air-quality-index ; https://www.iqair.com/sg/newsroom/why-singapore-s-air-quality-index-won-t-tell-you-what-the-haze-is-like-right-now

**Format specs**
- Instagram Story safe zones: https://www.outfy.com/blog/instagram-safe-zone/
- WhatsApp link previews (1.91:1 recommended; reportedly no image above ~300 KB, *verify on device*): https://opengraphplus.com/consumers/whatsapp/images ; Meta docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/
