# HazeNow: copy

This is the final microcopy for every state, on every client (web, Apple, Android, widgets, integrations).
The reasons behind each choice are in `docs/UX_PSYCHOLOGY.md`.

**Voice:** Singapore English. Plain, warm and calm. Aim for a grade-6 reading level: short words, one idea per sentence, no jargon in headlines.
We sound like a sensible neighbour who happens to read NEA's data, not like a siren and not like a salesperson.

**Rules for every string**

1. The **verdict comes first** and the number second. Every Elevated or worse state carries at least one action the person can do right now.
2. Use **NEA's words** for bands (Normal, Elevated, High, Very High) and NEA's verbs (reduce, avoid, minimise). Don't invent a new scale in the UI.
3. Say **"for now"**, not "today". NEA's 1-hr guidance covers the next hour, and the reading can change within hours.
4. **Banned words:** danger, dangerous, toxic, deadly, hazardous (except when quoting NEA's 24-hr PSI descriptor), alarming, "the truth", "what NEA won't tell you", cigarette comparisons, and exclamation marks.
5. **No commerce.** Never name a brand, link to a shop, or suggest buying anything. Say "a purifier, if you have one".
6. **Never criticise NEA.** Both numbers are NEA's. We are explaining, not correcting.
7. Numbers are µg/m³ of PM2.5 unless labelled otherwise. Write "PM2.5" in UI text; screen readers get "P M 2.5".
8. `{placeholders}` in curly braces are filled in by code. Times use the 12-hour clock with no ":00", for example "4pm" or "4:30pm".

---

## 1. Profiles (the first-run question)

### Screen

> **Who are you checking for?**
> We'll give advice that fits. You can pick more than one.
>
> - [ ] Just me, generally healthy
> - [ ] Kids
> - [ ] Older adults (65+)
> - [ ] Pregnant
> - [ ] Asthma, COPD or a heart condition
> - [ ] I exercise outdoors
>
> [ **Done** ]  ·  Skip for now
>
> *Saved on this device only. Change it any time in Settings.*

Rules:
- If nothing is picked or the user taps Skip, use `general`.
- "Just me, generally healthy" can't be combined with a sensitive option. Picking a sensitive option unticks it.

### Profile keys and "who it's for" labels

| key | picker label | "for" label under the headline |
|---|---|---|
| `general` | Just me, generally healthy | For you |
| `kids` | Kids | For kids |
| `elderly` | Older adults (65+) | For older adults |
| `pregnant` | Pregnant | For pregnancy |
| `heart_lung` | Asthma, COPD or a heart condition | For asthma, COPD & heart |
| `exercising` | I exercise outdoors | For your workout |

Combinations: join up to two labels with " + ", with `general` shown as "you". Examples: "For you + kids" and "For older adults + your workout".
With three or more, use "For your household".

**Sensitive** means `kids`, `elderly`, `pregnant` or `heart_lung`, which is NEA's "vulnerable persons".
For a mixed profile, use the **strictest** verdict. If two are equally strict, use the wording of the first match in this order: `heart_lung` > `kids` > `pregnant` > `elderly` > `exercising` > `general`.

---

## 2. Verdict headlines (band × profile)

The long form is the headline on the main screen, in the app and on the web.
The short form (28 characters or fewer, no full stop) is for medium widgets, notification titles and watch faces.
Each cell follows NEA's 1-hr PM2.5 personal guide (June 2026 poster).

### Normal (0–55)
NEA: continue with normal activities.

| profile | long | short (≤28) |
|---|---|---|
| general | Fine to be out. | Fine to be out |
| kids | Fine for outdoor play. | Fine for outdoor play |
| elderly | Fine to be out. | Fine to be out |
| pregnant | Fine to be out. | Fine to be out |
| heart_lung | Fine to be out. | Fine to be out |
| exercising | Fine to exercise outside. | Fine to exercise outside |

### Elevated (56–150)
NEA: healthy people **reduce** strenuous outdoor activity. Vulnerable people **avoid** strenuous outdoor activity.

| profile | long | short (≤28) |
|---|---|---|
| general | OK to be out. Go easy on hard exercise. | Go easy outdoors |
| kids | Calm play outside is OK. Skip running games for now. | Calm play only |
| elderly | A gentle walk is OK. Skip hard exercise for now. | Gentle activity only |
| pregnant | Gentle activity is OK. Skip hard exercise for now. | Gentle activity only |
| heart_lung | Gentle activity is OK. Skip hard exercise for now. | Gentle activity only |
| exercising | Keep your workout light, or move it indoors. | Light workout or go indoors |

### High (151–250)
NEA: healthy people **avoid** strenuous outdoor activity. Vulnerable people **avoid all** outdoor activity.

| profile | long | short (≤28) |
|---|---|---|
| general | Short trips out are OK. Exercise indoors. | No outdoor exercise |
| kids | Indoor play for now. Keep trips out short. | Indoor play for now |
| elderly | Stay indoors for now if you can. | Stay indoors for now |
| pregnant | Stay indoors for now if you can. | Stay indoors for now |
| heart_lung | Stay indoors for now if you can. | Stay indoors for now |
| exercising | Move your workout indoors. | Work out indoors |

### Very High (251 and above)
NEA: healthy people **minimise** all outdoor activity. Vulnerable people **avoid all** outdoor activity.

| profile | long | short (≤28) |
|---|---|---|
| general | Stay indoors for now. Go out only if you need to. | Stay indoors for now |
| kids | Keep kids indoors for now. | Kids indoors for now |
| elderly | Stay indoors for now. | Stay indoors for now |
| pregnant | Stay indoors for now. | Stay indoors for now |
| heart_lung | Stay indoors for now. | Stay indoors for now |
| exercising | Skip outdoor exercise for now. | No outdoor exercise |

### Second line (optional, shown under the headline, at most one)

Use the first rule that applies:

| condition | text |
|---|---|
| `stale` | Reading is from {observedTime}. It may not match the air now. |
| delta ≥ +20 in the last hour, band ≥ Elevated | Getting worse. Check again in an hour. |
| delta ≥ +20 in the last hour, band = Normal | Rising quickly. Check again in an hour. |
| delta ≤ −20 in the last hour, band ≥ Elevated | Getting better. Check again in an hour. |
| band ≥ Elevated, 2+ hours in a row falling | Easing since {peakTime}. |
| none | (no second line) |

Never promise a "best time to go out". We have no forecast. If a future version adds one, it must say where the forecast comes from.

### Accessibility label for the headline block
`"{verdictLong} {forLabel}. PM2.5 {pm25}, {bandLabel}, {trendWord}."`
Example: "OK to be out. Go easy on hard exercise. For you. PM2.5 105, Elevated, rising."

### Translations of verdict headlines, needs native review

These are drafts. Each one **needs native review** before shipping. The band names should use NEA's own published translations where they exist; those have not been checked here.

| English | 中文 (Simplified), needs native review | Bahasa Melayu, needs native review | தமிழ், needs native review |
|---|---|---|---|
| Fine to be out. | 可以正常外出。 | Boleh keluar seperti biasa. | வழக்கம்போல் வெளியே செல்லலாம். |
| Fine for outdoor play. | 可以在户外玩耍。 | Boleh bermain di luar. | வெளியே விளையாடலாம். |
| Fine to exercise outside. | 可以在户外运动。 | Boleh bersenam di luar. | வெளியே உடற்பயிற்சி செய்யலாம். |
| OK to be out. Go easy on hard exercise. | 可以外出，但请减少剧烈运动。 | Boleh keluar. Kurangkan senaman berat. | வெளியே செல்லலாம். கடுமையான உடற்பயிற்சியைக் குறைக்கவும். |
| Calm play outside is OK. Skip running games for now. | 可以在户外安静地玩，暂时不要跑跳。 | Main dengan tenang di luar tidak mengapa. Elakkan permainan berlari buat masa ini. | வெளியே அமைதியாக விளையாடலாம். இப்போதைக்கு ஓடி விளையாட வேண்டாம். |
| Gentle activity is OK. Skip hard exercise for now. | 轻松活动没问题，暂时避免剧烈运动。 | Aktiviti ringan tidak mengapa. Elakkan senaman berat buat masa ini. | மிதமான செயல்பாடுகள் பரவாயில்லை. இப்போதைக்கு கடுமையான உடற்பயிற்சியைத் தவிர்க்கவும். |
| Keep your workout light, or move it indoors. | 运动请放轻松，或改在室内进行。 | Bersenam ringan sahaja, atau bersenam di dalam. | உடற்பயிற்சியை மிதமாகச் செய்யவும், அல்லது உள்ளே செய்யவும். |
| Short trips out are OK. Exercise indoors. | 短暂外出没问题，运动请改在室内。 | Keluar sebentar tidak mengapa. Bersenam di dalam. | சிறிது நேரம் வெளியே செல்லலாம். உடற்பயிற்சியை உள்ளே செய்யவும். |
| Stay indoors for now if you can. | 如果可以，暂时留在室内。 | Jika boleh, duduk di dalam buat masa ini. | முடிந்தால், இப்போதைக்கு உள்ளேயே இருங்கள். |
| Stay indoors for now. | 暂时留在室内。 | Duduk di dalam buat masa ini. | இப்போதைக்கு உள்ளேயே இருங்கள். |
| Stay indoors for now. Go out only if you need to. | 暂时留在室内，非必要不外出。 | Duduk di dalam buat masa ini. Keluar hanya jika perlu. | இப்போதைக்கு உள்ளேயே இருங்கள். தேவைப்பட்டால் மட்டும் வெளியே செல்லுங்கள். |
| Keep kids indoors for now. | 暂时让孩子留在室内。 | Biarkan kanak-kanak di dalam buat masa ini. | இப்போதைக்கு குழந்தைகளை உள்ளேயே வைத்திருங்கள். |

Band labels (native review needed; check NEA's own translations first): Normal / Elevated / High / Very High → 正常 / 偏高 / 高 / 非常高 · Normal / Tinggi Sedikit / Tinggi / Sangat Tinggi · இயல்பு / சற்று அதிகம் / அதிகம் / மிக அதிகம்.

---

## 3. Band chip (never colour alone)

| band | chip text | icon (shape carries meaning) | accessibility |
|---|---|---|---|
| Normal | Normal | filled circle | "Normal" |
| Elevated | Elevated | circle with one bar (like a half gauge) | "Elevated" |
| High | High | triangle | "High" |
| Very High | Very High | octagon | "Very High" |

The chip always shows the text, never only the icon or colour.
Don't use ▲ or ▼ in the chip. Those glyphs mean the trend.

### Where you sit (harm anchor), shown under the big number
We use this **instead of** "N× a typical day". See UX_PSYCHOLOGY §3.6.

| band | text |
|---|---|
| Normal | Normal is up to 55. |
| Elevated | Elevated band (56–150). High starts at 151. |
| High | High band (151–250). Very High starts at 251. |
| Very High | Very High band (251 and above). |

Optional line in the detail sheet (not the main screen): "A usual clear day in Singapore is around {typical}."

---

## 4. Trend phrases

`delta` = latest − previous hour, at the same location, using the same method.

| rule | words | accessibility trend word |
|---|---|---|
| −4 to +4 | Steady over the last hour | steady |
| +5 to +19 | Rising: up {delta} in the last hour | rising |
| +20 or more | Rising fast: up {delta} in the last hour | rising fast |
| −5 to −19 | Easing: down {abs} in the last hour | easing |
| −20 or less | Clearing fast: down {abs} in the last hour | clearing fast |
| no previous hour | Trend not available yet | (omit) |

2-hour variant, used when the 2-h change is bigger and in the same direction: "Rising fast: up {d2} in 2 hours".
Compact surfaces keep the glyph: `● 105 ▲` / `▼` / `▶`.

---

## 5. Actions (show 1–3, most useful first)

Pick by band, then filter by profile. Every Elevated or worse screen shows at least one action.

### Normal
- (no actions. Show the calm line instead:) "Enjoy the fresh air."
- After an episode, for the first 3 hours back at Normal: "Air's cleared. Good time to open the windows."

### Elevated
1. `heart_lung`: "Asthma or COPD? Keep your inhaler with you."
2. `exercising`: "Shorten or slow your run, or move it indoors."
3. `kids`: "Swap running games for calm play for now."
4. `any sensitive`: "At home? Close the windows. Use a fan or aircon to keep cool."
5. `general`: "Haze isn't always easy to see. Check here before a long run."

### High
1. "Close windows. Use aircon or a fan to keep cool."
2. "Run a purifier in the room you're in, if you have one."
3. `exercising` or `general`: "Move exercise indoors, or try later."
4. `heart_lung`: "Keep your inhaler or medicine close. Follow your doctor's plan."
5. `kids`: "Plan indoor play. Keep trips out short."
6. "Out for hours? An N95 mask helps. Not needed for short trips."
   - Hide this for `kids`-only profiles. Show instead: "N95 masks aren't made for children. Keeping kids indoors works better."
   - `pregnant`: "Pregnant? Wear an N95 only for short periods, and take it off if it feels hard to breathe."
   - `heart_lung`: "Heart or lung condition? Ask your doctor before using an N95."

### Very High
All High actions, plus:
- "Check on older family and neighbours."
- "Feeling unwell? See a doctor. Chest pain or can't breathe: call 995."

### Always available (in the "More tips" sheet, not on the main screen)
- "Indoors is a good shield. Windows shut helps a bit. A purifier running helps a lot."
- "Surgical masks aren't made to filter haze. N95 masks are, when they fit well."
- "Sore throat or itchy eyes usually get better once you're out of the haze."
- "Planning for tomorrow? Use NEA's 24-hr PSI forecast. Schools and events plan with it."

---

## 6. Provenance line (main screen, under the number)

| case | text |
|---|---|
| GPS, nearest station < 0.5 km | NEA {Region} station · {dist} km away · measured {obsTime} |
| GPS, blended | Estimated for your spot from NEA stations · nearest: {Region}, {dist} km · measured {obsTime} |
| Region picked | NEA {Region} station · measured {obsTime} |
| Region picked but offline → island mean | {Region} station is offline. Showing the average of NEA's other stations. |
| Island mode | Average of NEA stations islandwide · measured {obsTime} |
| Age suffix (always) | · {age} ago |

Age format: "just now" (<5 min), "{n} min ago", "1 h 10 min ago". Detail sheet: "Measured {obsTime} · posted by NEA {pubTime}".

### Uncertainty
- When the value is blended, prefix it with "~": `~105`.
- When the nearest valid station is more than 5 km away, or the two nearest stations differ by more than 30, add under the number: "Nearby stations read {lo}–{hi}."
- Accessibility: "about 105, nearby stations read 83 to 117".

### Official figure (always visible, smaller)
- Label: "NEA 24-hr PSI: {psi} ({descriptor})"
- Secondary caption: "24-hour average"
- If missing: "NEA 24-hr PSI: not available right now"

Don't use the word "lagging" in the label. It sounds like a criticism. The chart shows the lag on its own.

---

## 7. "Why is this different from the PSI?" (neutral, 2 sentences)

> **NEA's 24-hr PSI is an average of the last 24 hours, so it changes slowly and is best for planning tomorrow. The 1-hr PM2.5 shows the last hour, and NEA recommends it for deciding what to do right now.**

Link text: "Why two numbers?"

Short version for tooltips (1 sentence): "Both are from NEA: the PSI averages 24 hours, PM2.5 shows the last hour."

---

## 8. Chart

- Title: "Last 24 hours"
- Legend: "Bars: hourly PM2.5 at your spot" · "Line: NEA 24-hr average PM2.5"
- Caption: "The line moves slowly because it averages a whole day. The bars show each hour."
- Band guide lines (dashed, labelled at right): "High 151" · "Elevated 56"
- Accessibility summary: "Chart. Over the last 24 hours PM2.5 went from {first} to {last}, peaking at {max} at {maxTime}. NEA's 24-hr average PM2.5 went from {avgFirst} to {avgLast}."

---

## 9. Instant PSI (only if the SPEC keeps it; see recommendation R1)

If shown, it lives **in the detail sheet only**, never on the main screen, widgets or notifications:

- Label: "PSI-style estimate: ~{instantPsi}"
- Explainer: "This is not an NEA number. It's what the 24-hr PSI would read if this hour's air stayed the same all day. NEA doesn't publish an hourly PSI, so treat this as a rough guide only."
- Never show the PSI descriptor ("Unhealthy") next to it on the same screen as the NEA band ("Elevated").

---

## 10. Stale, offline, loading and error states

| state | headline area | detail |
|---|---|---|
| First load | Getting NEA's latest reading… | (skeleton, no number) |
| Loaded, NEA hour late (observed > 75 min ago, < 2 h 15 min) | (normal verdict) | NEA usually posts each hour at about half past. Next update soon. |
| `stale` (> 2 h 15 min) | Verdict + second line "Reading is from {obsTime}. It may not match the air now." | Newer readings from NEA are late. We'll keep checking. |
| All stations offline for the latest hour | (verdict from last good hour, marked stale) | NEA's stations haven't reported since {obsTime}. |
| One station offline | (normal) | {Region} station is offline. Using nearby stations. |
| Device offline, cached data | Verdict, greyed + "Offline" chip | You're offline. Showing the reading from {obsTime}. |
| Device offline, no cache | Can't load the air reading | You're offline. Connect to see NEA's latest reading. [Try again] |
| API error / timeout | Can't reach NEA's data right now | We'll try again in a few minutes. [Try again] |
| API returned nothing usable | No reading available | NEA's data didn't include a usable reading this hour. We'll try again soon. |
| Location permission denied | (verdict for chosen region) | Showing {Region}. Pick your area, or allow location for a closer reading. |
| Location outside Singapore | (verdict for nearest region) | You seem to be outside Singapore. Showing NEA's {Region} station, the closest. |
| Location loading | (verdict for last region) | Finding your spot… |

**Southeast Asia (SPEC v2.0), official source down or slow** (every upstream request times out after ~8 s):

| state | headline area | line under the number / detail |
|---|---|---|
| Official source down, community sensors in range | Verdict for the estimate, prefixed "Estimate: …" (never "No official reading near here.") | **{Country}'s official data isn't responding right now · community sensors estimate** (e.g. "Thailand's official data isn't responding right now · community sensors estimate") |
| Official source down, nothing in range, cached reading | Verdict from the cached reading (stale rules apply) | Can't reach {Country}'s official data right now. Showing the last reading we got, from {time} ({age}). |
| Official source down, nothing in range, no cache | Can't reach {Country}'s official data right now | We'll try again in a few minutes. [Try again] |
| Community estimate, no official station within 25 km | Verdict for the estimate, "Estimate: …" | No official reading near here · community sensors estimate |
| Community estimate, no national scale (KH, LA, MM, TL) | WHO-guidance verdict (§20) | There's no official air-quality scale here · community sensors estimate |

"No official reading near here." and "There's no official air-quality scale here." are only ever the small line under the
number, never the headline. With no number at all, the headline is "Can't say for here right now."

Never show `-1`, `null`, `NaN`, or an empty number with a band colour.
A stale reading keeps its band chip, and the chip gets the outline style plus the word "(old)".

---

## 11. Notifications

Rules from the SPEC still apply: band crossings only, with hysteresis, quiet hours 22:00–07:00, and an action in every message.
In addition (see recommendations R6 and R7):
- **Default on:** band crossings to High or above for everyone, and crossings to Elevated for sensitive or exercise profiles.
- **Default off, opt-in:** crossings to Elevated for `general`.
- No more than **3 notifications per day**. The all-clear always gets through.
- Use the short verdict in the title and the place in the body.

`{area}` is "near you" in GPS mode, or "in the {Region}" in region mode.

### Rising

| to band | title | body |
|---|---|---|
| Elevated | Haze rising {area} | Now Elevated (PM2.5 {pm25}). {verdictLong} |
| High | Haze now High {area} | PM2.5 {pm25}. {verdictLong} Close windows and keep cool with aircon or a fan. |
| Very High | Haze now Very High {area} | PM2.5 {pm25}. {verdictLong} Check on older family. |

Examples:
- general → Elevated: title "Haze rising in the West", body "Now Elevated (PM2.5 105). OK to be out. Go easy on hard exercise."
- kids → High: title "Haze now High near you", body "PM2.5 172. Indoor play for now. Keep trips out short. Close windows and keep cool with aircon or a fan."

### Easing (one band down, still not Normal)

| to band | title | body |
|---|---|---|
| High (from Very High) | Haze easing {area} | Down to High (PM2.5 {pm25}). {verdictLong} |
| Elevated (from High) | Haze easing {area} | Down to Elevated (PM2.5 {pm25}). {verdictLong} |

### All clear (back to Normal)

| title | body |
|---|---|
| All clear {area} | Air's back to Normal (PM2.5 {pm25}). Fine to be out. Good time to open the windows. |

For `kids`: "Air's back to Normal (PM2.5 {pm25}). Fine for outdoor play again."
For `exercising`: "Air's back to Normal (PM2.5 {pm25}). Fine for your run."

### Morning catch-up (if something happened during quiet hours)
- Title: "Overnight air update"
- Body: "The haze reached {peakBand} overnight. Now: {band}, PM2.5 {pm25}, {trendWord}. {verdictLong}"

### Notification permission ask (after the first Elevated+ view, not on first launch)
> **Want a heads-up when the haze changes?**
> We'll only message when the band changes near you, and tell you when it's clear again. Never at night.
> [ Yes, notify me ]  ·  Not now

---

## 12. "How we calculate this" page

> ### How we calculate this
>
> **Where the numbers come from**
> Every number here comes from the National Environment Agency (NEA), published on data.gov.sg. We don't have our own sensors and we don't change NEA's readings.
>
> **The big number: 1-hr PM2.5**
> PM2.5 is tiny particles in the air, the main part of haze. NEA measures it every hour at five stations: North, South, East, West and Central. The big number is the latest hour, in micrograms per cubic metre (µg/m³). NEA recommends this reading for deciding what to do in the next hour or so.
>
> **Your spot**
> If you share your location, we estimate the reading for your spot from all of NEA's stations. Closer stations count more. If you're right next to a station, we use that station. If you don't share your location, we use the area you pick. Your location stays on your device.
>
> **The advice**
> We use NEA's four bands for 1-hr PM2.5: Normal (0–55), Elevated (56–150), High (151–250) and Very High (251 and above). The advice for each band follows NEA's personal guide for healthy and vulnerable people. Vulnerable means older adults, pregnant women, children, and people with chronic lung or heart disease. We only put it in everyday words.
>
> **NEA's 24-hr PSI**
> We also show NEA's official 24-hr PSI. It averages the last 24 hours, so it moves slowly. It's the right number for planning tomorrow, and schools and events use NEA's 24-hr PSI forecast. The chart shows both, so you can see how they move.
>
> **Trend**
> We compare this hour with the hour before. "Rising" means up by 5 or more. "Rising fast" means up by 20 or more.
>
> **When data is late or missing**
> NEA usually posts each hour's reading about 30 minutes later. Sometimes a station goes offline, and we then use the other stations and tell you. If readings are more than 2 hours old, we say so clearly.
>
> **What this app is not**
> It's not medical advice, and it's not an official NEA app. If you feel unwell, see a doctor. In an emergency, call 995.
>
> **Check our work**
> HazeNow is free and open source (MIT). All the maths is public, and every app uses the same rules. [View the code]

---

## 13. Privacy line and footer

- **Footer (one line; native apps and integrations, which send nothing new):** "Data: NEA via data.gov.sg · Free & open source · No ads, no tracking, no account"
- **Privacy line (web app and site):** "No ads, no accounts, and we never track you. We only count visits and downloads in total."
  The web app and site footer is then "Data: NEA via data.gov.sg · Free & open source" with this line under it. What is counted, all in total and with no identifiers: page visits (Cloudflare Web Analytics, cookieless), release downloads (GitHub's per-file counts), data-server requests per day, country and endpoint, and share-card landings per day, card and country. No IPs, user agents, coordinates or IDs are stored.
- **Privacy line (next to location permission and in Settings):** "Your location stays on your device. We never send it anywhere."
- **Location permission pre-prompt:**
  > **Get the reading for your exact spot?**
  > We use your location only on this device, to pick the nearest NEA stations. It's never sent or stored anywhere else.
  > [ Use my location ]  ·  Pick my area instead
- **Profile storage line:** "Saved on this device only."
- **Country hint line (SPEC v2.1; web and site only, wherever `/api/where` may be asked: the "Where are you checking?" card, the footer once it was asked, the site's privacy section and the How page):** "We use your country, from your connection, to pick a starting place. Nothing is stored."
- **First-run starting place (SPEC v2.1):**
  - Guessed place: "Showing {place} · Change" + "Use my precise location"
  - Guessed country not covered yet: "{Country} isn't available yet. Showing {place}, the nearest place we cover. Change"
  - Unsure guess (outside Southeast Asia, or signals that disagree), card under the reading: **"Where are you checking?"** / "Pick a country to see its places. You can change it any time." + country chips + "Use my precise location"
  - Site, outside Southeast Asia: "Not in Singapore? HazeNow also covers Thailand, with more of Southeast Asia in preview. Change"
  - Place sheet: step 1 "Where should we check?" (countries, each "Live" / "Preview" / "Not yet"); step 2 the country's name with "‹ Countries"; search label "Search every country", placeholder "Town, city or island, e.g. Tampines, Bali, KL".
  - Location explainer outside Singapore: "We only use this to find your nearest station. It stays on your phone."

---

## 14. Regions list

- Heading: "Across Singapore"
- Row: "{Region} · {pm25} · {bandLabel}" (plus the band icon)
- Offline row: "{Region} · offline"
- Your row gets: "(nearest)" or "(your area)"

---

## 15. Share text

"Air near me right now: {bandLabel} (PM2.5 {pm25}), {trendWord}. NEA 24-hr PSI: {psi}. Data: NEA via data.gov.sg. {shareUrl}"
Region or area mode: replace "near me" with "in the {Region}" / "in {Area}" (e.g. "Air in the South right now: …", "Air in Tampines right now: …"). "near me" only in location mode, so a forwarded message never implies the reader's location.

(The share text has no verdict. Advice depends on the reader's profile, not the sharer's.)

---

## 16. Compact surfaces

| surface | content |
|---|---|
| Menu bar / complication | `● 105 ▲` |
| Lock-screen / small widget | `● 105 ▲` + band word: "Elevated" |
| Medium widget | Short verdict ("Go easy outdoors") · `105` Elevated ▲ · "4pm · NEA" |
| Accessibility for compact | "PM2.5 105, Elevated, rising, measured 4pm" |

## 17. "I work outdoors" profile (SPEC v1.2 §6) — canonical, adopted from packages/core/src/experience.ts

Profile label: "I work outdoors" · for-label: "For outdoor work" · not a sensitive group by itself (combine with others; strictest wins).

| band | verdict (long) | short (≤28) |
|------|----------------|-------------|
| Normal | "Fine to be out." | "Fine to be out" |
| Elevated | "OK to work outside. Take breaks indoors if you can." | "Take breaks indoors" |
| High | "Take regular breaks indoors. Ask about lighter outdoor tasks." | "Take regular indoor breaks" |
| Very High | "Limit time outside for now. Ask about indoor work." | "Limit time outside" |

Actions (Elevated+): "Take breaks in the shade or indoors, and drink water." · "Ask your supervisor about indoor breaks and lighter tasks."
Needs review by a workplace-safety source (MOM haze guidelines for employers) before launch.

## 18. About (from "Made by Yong Quan Tan") — canonical, all platforms

Title: "About HazeNow"
Body 1: "I built HazeNow because the number most of us check during a haze, the 24-hr PSI, moves slowly. NEA also publishes the last hour's PM2.5, and recommends it for deciding what to do right now. HazeNow puts that number first, in plain words, using only NEA's data."
Body 2: "It's free and open source (MIT). No ads, no tracking, no account. Your location stays on your phone."
Signature: "— Yong Quan Tan"
Links, in order: "LinkedIn" → https://www.linkedin.com/in/yong-quan-tan · "Kairos Labs · kairoslabs.sg" → https://kairoslabs.sg (subtitle: "I run Kairos Labs, an applied AI studio.") · "Source code on GitHub" → https://github.com/yongquantan/hazenow
Status: Approved by Yong Quan (2026-09-28).

## 19. Stale share
If the reading is stale (SPEC: observedAt older than 2h15m), cards still share but the place/time line reads "{Area} · reading from {time} (latest available)" and the verdict headline is replaced by "Latest NEA reading is delayed." Never present stale data as "now". Two clocks keeps its fixed headline; its chart axis ends at the reading's hour (e.g. "3pm"), not "Now". Stale Now card: advice label "NEA's advice for that hour" (not "for the next hour"); PSI line "The 24-hr PSI ({psi}) averages the whole day. This reading is for the 3pm hour." Hide the trend (SPEC v1.7). Any "right now"/"this hour"/"the last hour" phrasing becomes "that hour"/"the {time} hour" when stale. Stale "For our group": replace "Next check at {time}." with "Check hazenow.pages.dev for NEA's next update."

## 20. Southeast Asia verdicts (SPEC v2.0), DRAFT, needs native review

Outside Singapore the headline follows the **local authority's own category** (never NEA's bands). Rows live in
`packages/core/src/countries/verdicts.ts` (`THAI_VERDICTS`, `CATEGORY_VERDICTS`), mirroring each authority's advice
(`CATEGORY_SEVERITY`, 0 none to 4 stay indoors). Tests assert every verdict is at least as strict as the authority's advice,
and that from the "Unhealthy" equivalent up (PCD เริ่มมีผลกระทบต่อสุขภาพ, DOE Tidak Sihat, ISPU Tidak Sehat, VN_AQI Kém,
DAO USG) no headline says "Fine" or "OK to be out".

| row | general | used for |
|---|---|---|
| fine | Fine to be out. | MY Baik/Sederhana, ID Baik, VN Tốt, PH Good |
| sensitiveEasy | Fine to be out. (sensitive: "Fine to be out. Keep hard exercise short.") | ID Sedang, VN Trung bình, PH Fair |
| goEasy | Go easy outdoors for now. Keep hard exercise short. | MY Tidak Sihat, VN Kém, PH USG |
| reduce | Cut back on long or hard activity outside for now. (sensitive: "Avoid outdoor activity for now. Keep your medicine close.") | ID Tidak Sehat, VN Xấu |
| avoid | Avoid long or hard activity outside. Keep trips out short. | MY Sangat Tidak Sihat, ID Sangat Tidak Sehat, VN Rất xấu, PH Very/Acutely Unhealthy |
| indoors | Stay indoors for now. Go out only if you need to. | MY Merbahaya, ID Berbahaya, VN Nguy hại, PH Emergency |

**Hedge (24-hr index only):** where the only official figure is a 24-hr index (Malaysia, ISPU-only cities), the headline
starts "Based on the 24-hr index: …" in neutral ink. If an in-country community sensor within 20 km is in a worse category,
add on its own line: "A community sensor nearby reads 104 µg/m³ right now. It's a community sensor, not an official reading."

**Tips ("What helps now") outside SG:** COPY §5's action set for the closest SG band by the authority's advice severity
(`adviceBand`): severity 0 → none, 1–2 → Elevated, 3 → High, 4 → Very High, and never below High from the "Unhealthy"
equivalent up (so "Check here before a long run" never appears there). Same profile filters: masks never first, no N95 for
kids. The Very High "call 995" line uses the local emergency number (TH 1669, MY 999, ID 112, VN 115, PH 911).

### 20.1 Community estimates and WHO-guidance verdicts (founder-approved defaults, 30 Sep 2026)

SPEC principle 1: the headline always answers "is it OK to be out?".

- **Community estimate, in a country with an official scale (TH, MY, ID, VN, PH):** the estimate is mapped to that
  authority's category and gets the category's normal verdict, prefixed **"Estimate: "** ("Estimate: fine to be out.").
  Compact surfaces use **"Est. "** ("Est. fine to be out"). Thai: "ค่าประมาณ: " (draft). The chip shows the category with a
  small **"estimate"** tag; its note reads "{Agency} category, applied to the community-sensor estimate". The lines
  underneath stay: "Community sensors · estimate · range a–b" and, where true, "There's no official station within 25 km
  to check these sensors against, so this is an estimate, not a measurement."
- **No official scale at all (KH, LA, MM, TL):** a verdict from WHO 2021 guidance on the hourly estimate, labelled as such.
  Chip: **"WHO guide: {low | moderate | high | very high}"** with the "estimate" tag. The "{x}× the WHO daily guideline."
  line stays.

| hourly estimate (µg/m³) | headline | compact | chip |
|---|---|---|---|
| under 25 | Likely fine to be out. | Likely fine | WHO guide: low |
| 25 – under 50 | Likely OK. Sensitive people, go easy. | Likely OK | WHO guide: moderate |
| 50 – under 100 | Go easy outdoors for now. | Go easy outdoors | WHO guide: high |
| 100 and up | Limit time outside for now. | Limit time outside | WHO guide: very high |


## 21. Install funnel: site hero, install hints, download page, native nudges (4 Oct 2026)

Calm and specific, like the rest of this file. Never block the reading to ask for an install.

**Site hero (hazenow.pages.dev).** The headline is unchanged (the founder decides it separately).
- Sub-line: "NEA's 1-hour PM2.5 for your area, turned into plain advice you can act on right now." Outside Singapore, the place's authority replaces NEA ("PCD's 1-hour PM2.5 for your area, …"); with community sensors only, "The 1-hour PM2.5 for your area, …".
- One primary button: "Open HazeNow" (carries the place). Under it, the three promises: "Data: NEA via data.gov.sg" · "Free & open source (MIT)" · "No ads, no accounts, never tracked". Lower down, a quiet text link: "View the code on GitHub".
- The PSI-vs-PM2.5 explanation lives in "Two clocks": "Both are from NEA. The 24-hr PSI averages the last 24 hours, so it changes slowly and is best for planning tomorrow. The 1-hr PM2.5 shows the last hour, and NEA recommends it for deciding what to do right now."
- Live card: button "Use my location" (while locating: "Finding your spot…"). Field label (screen readers): "Show the reading for"; placeholder "Type your area, e.g. Tampines". Under them, the v1.4 explainer, always visible so one tap goes straight to the OS prompt: "We only use this to find your nearest NEA station. It stays on your phone." (outside Singapore: "We only use this to find your nearest station. It stays on your phone.").
- List groups: "Singapore" · "NEA stations" · "Towns and planning areas" · "Southeast Asia". An alias match adds "Includes {alias}". No match: "No match. Try a town like Tampines, or a city like Bangkok."
- Location results: in Singapore the field reads "Near you" (the "Open HazeNow" link carries the nearest town's name, never the coordinates). Denied: the shared `locationDeniedLine` ("Showing {place}. Pick your area, or allow location for a closer reading."). Other errors: "Couldn't find your spot. Type your area instead." Outside Southeast Asia: "HazeNow doesn't cover where you are yet. Type a place to see its air."

**Web app and site, install hints.**
- "Add to Home Screen" row in the app: status link "How to add" → /download/#iphone (or #android on Android).
- Coach mark, Safari on iPhone and iPad only, once per device, after the first verdict: "**Add HazeNow to your Home Screen:** tap Share, then Add to Home Screen." Links: "Show me how" · button "Got it".
- In a chat app's built-in browser (WhatsApp, Instagram, Facebook, LinkedIn, Telegram), a slim strip at the top: "Open in Safari to add HazeNow to your Home Screen." ("Chrome" on Android) · "Copy link" · close (×). After copying: "Link copied. Paste it into Safari." If copying fails: "Couldn't copy. Use the ••• menu, then Open in Safari."

**Download page (/download/).**
- QR (computers only): "Scan to open HazeNow on your phone" / "Point your phone's camera at the code. It opens HazeNow{ for Tampines}, ready to add to your Home Screen." The code carries the place picked on the home page; a "Near you" spot is never put in it.
- Android intro: "Two ways, both free, no Play Store needed. Start with the first. Add the second if you want a widget."
  - "1. Install from Chrome": "**3 taps, no warnings.** The full HazeNow in its own window, on your Home Screen. It works offline." Button "Open HazeNow in Chrome".
  - "2. Full app with widget and Quick Settings tile": "Adds Home Screen widgets, a Quick Settings tile and calm band alerts. Android 8 or newer. It doesn't come from the Play Store, so Android checks with you before installing it. That's expected, and it only happens once." Steps name Allow from this source, Play Protect's "More details → Install anyway", and Samsung/Xiaomi's own check. "Why the checks? HazeNow is free, and we don't list it on the Play Store yet. The code is open, and every download is built from it."
- Mac intro: "{● 105 ▲} in your menu bar. Two ways, both free. Pick either one." Side by side: "The app" ("… macOS warns you once, because we don't pay Apple to verify it.") and "SwiftBar plugin, no warning" ("One small file with the same reading. It runs inside SwiftBar, a free, open-source menu bar app, so macOS doesn't ask."), button "Download the plugin".

**Android app.**
- One-time card after the first verdict (never over the first-run sheets): title "See the air without opening the app", body "Add the widget to your Home Screen, or a tile to Quick Settings.", buttons "Add the widget" · "Add the Quick Settings tile" (Android 13+) · "Not now". Any button retires it for good.
- Permanent card "Widget and tile" with the same two entries. Android 8–12, instead of the tile button: "To add the tile: swipe down twice, tap the pencil, then drag “Haze now” into your tiles."
- Toasts: "The tile is already in Quick Settings." · "Couldn't add the tile just now. {tile hint}" · "This launcher can't add widgets from apps. Long-press the Home Screen, tap Widgets, then pick HazeNow."

**Mac app.** First launch only, a small popover from the menu-bar item: "HazeNow lives up here." + on a notched Mac with the pill on, "On a MacBook with a notch, the pill beside it shows the same reading. Hover it to see more."; otherwise "Click the reading any time for the full picture." Button "Got it". It closes by itself after about 12 seconds.
