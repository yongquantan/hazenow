# HazeNow: UX psychology and trust

The evidence behind the "Experience & trust (v1.1)" section of SPEC.md: where it holds up, where it needs changing, and what comparable apps teach us.
The final copy is in `docs/COPY.md`. The build review is at the end of this doc.

Every source cited here is real and was checked on 2026-09-28; full references are in §8.
Where the evidence is thin or mixed, this doc says so.

---

## 0. Summary

The SPEC's core ideas hold up well against the evidence:
- verdict first
- threat paired with efficacy
- calm defaults
- showing provenance
- personalising the advice
- sending all-clears

The research supports all of them.

**The biggest risk is the "Instant PSI".** In 2015 NEA explicitly declined to publish an hourly PSI, saying no health studies support converting 1-hr PM2.5 into a PSI.
HazeNow's "Instant PSI" is exactly that conversion. It also puts a third label on the same air: NEA's band says "Elevated", the official PSI says "Moderate", and the Instant PSI says "Unhealthy".
That repeats the 2013 3-hr vs 24-hr PSI confusion that NEA spent three years undoing. It also makes HazeNow look like it contradicts NEA, which the SPEC's own brand rules forbid.

The second biggest issue is that the SPEC's advice drifts from **NEA's current (June 2026) 1-hr guide** and **MOH's mask guidance** in a few places. Examples: "Stay indoors *today*", and "Going out? Wear an N95" without MOH's caveats for children, pregnancy and heart/lung disease.

### Recommended SPEC changes (most important first)

| # | Change | Why (section) |
|---|---|---|
| R1 | **Remove "Instant PSI" from the display hierarchy and every compact surface.** At most, keep it as "PSI-style estimate" in a detail sheet, never beside a PSI descriptor. Rewrite the problem statement: the air right now is "Elevated", NEA's own word, not "Unhealthy". | §3.4, §4.2 |
| R2 | **Align verdicts and §5 advice with NEA's June 2026 1-hr guide:** its verbs (reduce / avoid / minimise), its vulnerable-group split, and its time scope ("for the next hour"). Replace "Stay indoors today" with "Stay indoors for now". | §3.1, §4.1 |
| R3 | **Make mask advice follow MOH.** N95 isn't needed for short trips. It isn't certified for children. Pregnant women (2nd/3rd trimester) should wear one only briefly. People with heart/lung disease should ask a doctor. Never lead with masks, since mask runs happened in 2013 and 2019. | §3.2, §4.3 |
| R4 | **Add a "Planning tomorrow?" pointer to NEA's 24-hr PSI forecast.** It is NEA's tool for next-day decisions, and MOE uses it for school closures. This serves the parent use case honestly. | §4.1 |
| R5 | **Replace "about N× a typical clear day" with a harm anchor** ("Elevated band · High starts at 151"). Multiples inflate urgency. During a long episode, a rolling 7-day median gets polluted by haze days and the multiple shrinks. | §3.6 |
| R6 | **Notifications: default Elevated alerts off for the `general` profile** (on for sensitive and exercise profiles), cap at 3 per day, and always send the all-clear. The alert-fatigue evidence is about repeated days of alerts, not false alarms. | §3.8 |
| R7 | **Be honest about how much indoors helps.** Windows shut alone cut indoor PM2.5 only modestly in a Singapore flat during the 2015 haze (indoor/outdoor ratio ≈0.7). A purifier cut it a lot (≈0.3). Pair "close windows" with "keep cool", because of heat risk for older people. | §3.7 |
| R8 | **Verify the band colours against NEA's published palette** before claiming "same colours as NEA". Check Elevated amber for contrast (see §7). | §3.3 |
| R9 | **Show uncertainty as a numeric range, not only "~"**. Ranges barely dent trust; vague verbal hedges dent it more. | §3.5 |
| R10 | **Add an "I work outdoors" profile.** These people can't simply stay indoors. Their actions are breaks and shade indoors, and asking their employer. (Copy to be added once the SPEC agrees.) | §3.1 |
| R11 | Soften principle 2's claim that "fear without action → **panic**". The evidence supports *defensive avoidance*; mass panic is rare. This matters because designing against imagined panic leads to withholding information. | §2.1 |

---

## 1. Who we design for, and the 3-second moment

The user is anxious and holding a phone. They're asking: *"Is it OK for me or my kid to be outside right now?"*
Three findings shape everything else:

- **People use numbers badly without evaluative meaning.** Adding category labels and boundary lines to numeric health data made people use the numbers more, and made less numerate people rely less on irrelevant feelings (Peters et al., 2009).
  **Implication:** the verdict and band label come first, and the number is the evidence under them. *Supports SPEC principle 1.*
- **Understanding the index predicts action.** In a systematic review of adherence to air-quality alert advice, "lack of understanding of the indices" was a barrier. "Knowledge on where to check air quality" was a facilitator (D'Antoni et al., 2017).
  In Singapore, knowledge was the strongest predictor of haze-protective behaviour (β = 0.45), directly and through perceived risk. Yet only 39% correctly identified particulate matter as the main pollutant (Ng et al., 2021).
- **Adherence is modest even when people are informed.** Actual adherence to "reduce or reschedule outdoor activity" advice ranged from 9.7% to 57% (median 31%) across studies (D'Antoni et al., 2017).
  Only 49% of US adults were aware of air-quality alerts at all (Mirabelli et al., 2018).
  **Implication:** don't expect the app to change behaviour through alarm. Make the right action *easy and specific*.

---

## 2. Risk communication theory

### 2.1 Protection Motivation Theory and EPPM: threat + efficacy
*Supported, with a caveat about the strength of the evidence.*

- PMT (Rogers, 1975) and the EPPM (Witte, 1992) predict that people act on a threat only when they also believe:
  - that the recommended response works (response efficacy), and
  - that they can do it (self-efficacy).
- Otherwise they manage their *fear* instead of the *danger*: denial, avoidance, reactance.
- Witte & Allen's (2000) meta-analysis found that strong fear plus high efficacy produced the most behaviour change. Strong fear plus low efficacy produced the most defensive responses.
- Peters, Ruiter & Kok (2013) re-analysed only full-factorial studies with behavioural outcomes. Threat had an effect **only under high efficacy**, and they warn that without efficacy it "will have no effect, or worse, backfire."
- There is an honest disagreement:
  - Tannenbaum et al. (2015) found fear appeals broadly effective and found no conditions where they backfired.
  - Kok et al. (2018) dispute that reading.
- **Both camps agree that adding efficacy never hurts.** So HazeNow should *never raise threat without raising efficacy*: every Elevated+ state ships with a concrete, doable action (SPEC principle 2).
- **Caveat on "panic".** SPEC principle 2 says fear without action leads to "denial or panic". The denial half is well supported. The panic half isn't: fifty years of disaster research find mass panic rare; people mostly report fear, not panicked behaviour (Clarke, 2002).
  - The 2013 N95 run in Singapore looks more like a rational individual response to a scarcity signal: the government called it an "artificial shortage" and "supply-chain bottlenecks" (NLB Infopedia; NBC News, 2013).
  - **Design consequence:** don't withhold or soften information for fear of panic. Do avoid *scarcity cues* like "buy masks now", and route people to actions that don't need buying anything (R3).
- **Self-efficacy in practice.** D'Antoni et al.'s (2019) RCT sent UK DAQI alerts via a smartphone app. "Behaviourally enhanced" messages targeted specificity, perceived efficacy and self-efficacy. They raised intentions to make lasting changes.
  Among people with lung conditions, more in the enhanced group reported using their preventer inhaler after a real moderate alert.
  Worry, perceived severity, response efficacy and self-efficacy predicted self-reported behaviour change at four weeks.
  **Implication:** specific actions ("Keep your inhaler with you", "Swap running games for calm play") beat generic ones ("Reduce exposure"). COPY.md §5 is written this way.

### 2.2 Sandman: Risk = Hazard + Outrage
*Supported. It's the reason for the "never contradict NEA" rule.*

- Sandman (1987, and later) separates *hazard*, the technical risk, from *outrage*, the things that make a risk feel worse: unfair, imposed, uncontrollable, covered up, untrustworthy source.
- Haze scores high on outrage: it's imposed from outside, it's involuntary, and it's hard to control.
- Online, the 24-hr PSI has repeatedly drawn "useless" criticism in 2013, 2015 and again on 16 Sep 2026 (planb.sg, 2026). That is outrage about the *messenger*, not the air.
- Two consequences for us:
  1. **Don't feed outrage.** Copy like "what NEA won't tell you" or "the real number" raises outrage without changing the hazard. IQAir's 2019 Singapore article is headlined "Why Singapore's air quality index won't tell you what the haze is like right now", and it sits beside purifier and mask promotions (see §5). That is the pattern to avoid.
  2. **Reduce outrage by giving control.** Actions, the indoor lever, and all-clears are "outrage management": they return control to the person.
- Sandman's point also cuts the other way. When *hazard* is low (Normal), people can still feel high *outrage*, because haze is visible or smelly.
  So the Normal state needs positive reassurance ("Fine to be out" / "Enjoy the fresh air"), not a blank screen.

### 2.3 Evaluative labels and harm anchors
- Peters et al. (2009) show that evaluative categories make numbers usable.
- Zikmund-Fisher et al. (2018) add that a **harm anchor**, a marker of where values start to matter ("Many doctors are not concerned until here"), sharply reduced perceived urgency for near-normal results. It did *not* blunt concern for genuinely harmful values.
- That's exactly the calibration we want: calm at 70 µg/m³, still serious at 260. See §3.6 and R5.

---

## 3. The SPEC's principles, one by one

### 3.1 Verdict first; personalise the verdict (principles 1 and 8)
*Supported, but align with NEA's wording and time scope (R2).*

NEA's current poster, "How to plan your outdoor activities during haze" (June 2026), gives 1-hr PM2.5 advice **"for the next hour"**. Healthy and vulnerable persons get separate advice. Vulnerable means the elderly, pregnant women, children, and persons with chronic lung or heart disease.

| band | NEA healthy | NEA vulnerable | SPEC v1.1 general | SPEC v1.1 sensitive | Issue |
|---|---|---|---|---|---|
| Normal | Continue normal | Continue normal | Fine to be out | Fine to be out | ✓ |
| Elevated | **Reduce** strenuous | **Avoid** strenuous | OK… go easy on long, hard exercise | Keep outdoor time light. Skip strenuous | Sensitive "keep outdoor time light" is stricter than NEA. NEA doesn't restrict gentle activity. |
| High | **Avoid** strenuous | **Avoid all** outdoor | Keep outdoor time short. Exercise indoors | Stay indoors if you can | General "keep time short" goes beyond NEA; acceptable but unnecessary. |
| Very High | **Minimise all** outdoor | **Avoid all** outdoor | Stay indoors **today** | Stay indoors **today** | "Today" is wrong. NEA's 1-hr guide is about the next hour, and the reading can drop fast. |

SPEC §5 (short advice) also uses older wording. For example, Elevated says "Elderly, kids, heart/lung: minimise outdoor exertion", but NEA now says vulnerable persons *avoid strenuous* activity.
**Fix:** COPY.md §2 maps each cell to NEA's verbs in everyday words. Staying close to NEA is also a trust move, because users can corroborate us against haze.gov.sg (see §3.4, Sillence et al., 2019).

Profiles: the SPEC's list matches NEA's vulnerable groups. Two gaps:
- "Exercising outdoors" is a modifier, not a vulnerability. Keep it, since NEA's verbs are about *strenuous* activity.
- **Add "I work outdoors" (R10).** Outdoor workers can't "stay indoors", so a verdict they can't follow is pure threat with no efficacy.

### 3.2 Threat + efficacy: the action list (principle 2)
*Supported. Fix the mask action (R3).*

- The SPEC's High action is "Going out? Wear an N95 (surgical masks don't filter haze)". This conflicts with MOH's current haze page (updated 24 Sep 2026) and MOH's mask FAQs:
  - "N95 masks are not needed for such short-term exposure, like commuting."
  - N95 masks are not certified for use in children.
  - Women in the 2nd and 3rd trimesters shouldn't wear one for more than a short time.
  - People with severe heart or lung problems who have difficulty breathing shouldn't wear one; they should ask a doctor.
  - For healthy people, MOH frames N95 use for when they're outdoors for several hours at hazardous levels.
- Pushing N95s at every High reading, across a whole haze season, risks repeating the June 2013 and September 2019 retail sell-outs (NLB Infopedia; Mothership, 2019). COPY.md §5 makes the mask action conditional ("Out for hours?"), profile-aware, and never first.
- Other actions are strengthened by the evidence:
  - **Inhaler reminder** for asthma/COPD (D'Antoni et al., 2019).
  - **"See a doctor if unwell; 995 in an emergency"**, which echoes NEA's "Persons who are not feeling well should seek medical attention".
  - **"Check on older family and neighbours"**. This is collective efficacy, and the Chong Pang mask-distribution story (AsiaOne, 2019) shows the community frame lands locally.

### 3.3 Calm by default; same bands as NEA (principle 3)
*Supported.*

- Using NEA's band names avoids a second system. That matters because the main complaint about third-party apps is conflicting scales (§5).
- **R8:** the SPEC hex colours (`#2E9E5B`, `#E8A317`, `#E4572E`, `#7B2D8E`) are described as "same colours as NEA". This review could not confirm NEA's exact 1-hr band palette. The June 2026 poster renders the 1-hr table in greys and uses colour only for the 24-hr PSI table.
  Either verify the colours or reword the claim to "same band names as NEA".
- Muted colours and "motion only on change" are right. Alarm red for Elevated would signal a threat that NEA's advice ("reduce strenuous activity") doesn't match.

### 3.4 Radical transparency; show the official number; never contradict NEA (principle 4)
*Strongly supported. The Instant PSI undermines it (R1).*

- **Corroboration drives trust.** In a 1,123-person UK/US study, credibility and impartiality were the key predictors of trust in health websites, and information corroboration mattered (Sillence et al., 2019).
  Showing NEA's 24-hr PSI next to our number lets users corroborate on the spot. Using NEA's own words lets them corroborate against haze.gov.sg.
- **Impartiality:** no ads, no shop, no tracking. This is a genuine differentiator from IQAir (§5).
- **What NEA itself has said about hourly numbers:**
  - 2015: NEA's chief scientific officer declined to convert hourly PM2.5 into a 1-hour PSI: "the studies out there don't give you a number that is supported by health studies." She said 3-hr PSI readings "are not tied to health advisories" (Today / Straits Times / CNA, 8–9 Oct 2015, collected by wildsingapore news).
  - 2014: PM2.5 was added to the PSI (1 April 2014).
  - 2016: NEA introduced the four 1-hr PM2.5 bands and phased out the 3-hr PSI (27 Jun 2016), saying the 1-hr PM2.5 was the better indicator of current air.
  - So NEA's settled answer to "what's the air now?" is **1-hr PM2.5 + bands**, not an hourly PSI.
- **The Instant PSI is the one thing NEA has explicitly declined to publish.** On our own test vector (105 µg/m³), the screen would show:
  - "Elevated" (NEA 1-hr band)
  - "Moderate" (NEA 24-hr PSI)
  - "Unhealthy" (our Instant PSI)

  That's three labels on one screen. The SPEC's problem statement already makes this move ("The air you're breathing right now is 'Unhealthy'"), contradicting NEA's own label for that reading.
  **Recommendation R1:** drop the Instant PSI from the hierarchy. If it stays for PSI-literate users, put it in a detail sheet as "PSI-style estimate", never next to a PSI descriptor, with COPY.md §9's disclaimer.
- **Drop "lagging" from the official label** ("Official 24-hr PSI — lagging"). It reads as a judgment of NEA. The chart shows the lag without asserting it, which is the SPEC's own principle 7. Use "NEA 24-hr PSI · 24-hour average".

### 3.5 Honest uncertainty (principle 5)
*Supported. Prefer numbers to hedges (R9).*

- Van der Bles et al. (2020) ran five experiments, including a BBC News field experiment (n = 5,780).
  Communicating uncertainty produced "only a small decrease in trust in numbers and trustworthiness of the source, and **mostly for verbal** uncertainty". Numeric ranges preserved trust.
- So "~105" alone is a mild verbal-style hedge. **"~105 · nearby stations read 83–117"** is better: it's concrete and checkable.
- State missing data in words and never show −1. This follows the same logic.

### 3.6 Anchor to normal (principle 6)
*Partly contradicted. Replace with a harm anchor (R5).*

- "About 5× a typical clear day" is a *relative* frame.
  - It makes 105 µg/m³ sound alarming while the verdict says "OK to be out". That's a mixed message: a high-threat cue with a low-threat instruction.
  - It also measures distance from *clean*, not distance from *where action is needed*.
- The harm-anchor evidence (Zikmund-Fisher et al., 2018) shows that marking where concern starts calms near-normal results without dulling truly high ones. That's what we want.
- A practical bug: "typical = median of ≥7 days of history". In week two of a haze episode, that median is itself hazy, so the multiple shrinks just when it's high. That quietly normalises the haze.
  If a "typical" figure is kept, use a fixed constant. Singapore's annual mean PM2.5 is low teens µg/m³: IQAir reports 11.4 for 2024; NEA's own annual figure should be checked before use. Show it only in the detail sheet.
- Main screen: "Elevated band (56–150). High starts at 151." (COPY.md §3). Avoiding cigarette equivalents is correct.

### 3.7 Indoors is a lever (principle 9)
*Supported, with honest magnitudes (R7).*

- Sharma & Balasubramanian (2017) measured inside and outside a naturally ventilated Singapore flat during the 2015 haze:
  - windows open: indoor/outdoor PM2.5 ratio ≈ 0.76
  - windows closed: ≈ 0.69
  - windows closed with an air cleaner: ≈ 0.32
- Field studies of portable HEPA cleaners elsewhere typically report 50–60% reductions (range roughly 23–92%) (reviewed in Aerosol & Air Quality Research, 2023).
- So: **"windows shut helps a bit; a purifier running helps a lot."** Saying "closed windows make indoors much cleaner" would overpromise.
- Two cautions:
  - **Heat.** Many Singapore homes rely on open windows for cooling. Telling an older person to shut windows with no cooling plan trades one risk for another, so the copy pairs it with "use aircon or a fan to keep cool".
  - **Commerce.** "Purifier" must never become a buy prompt. Always say "if you have one".

### 3.8 Notifications earn trust by being rare (principle 10)
*Supported, but for a different reason than "crying wolf" (R6).*

- **Alerts do change behaviour:**
  - Smog alerts cut LA Zoo attendance by 15% and Griffith Observatory by 8% on single alert days (Neidell, 2009).
  - Sydney air-quality alerts cut cycling by 14–35% (Saberian, Heyes & Rivers, 2017).
- **Response fades with repetition:**
  - When alerts ran two days in a row, most of the first day's response was gone by the second. "Small reprieves from alerts … reset these costs" (Graff Zivin & Neidell, 2009).
  - Saberian et al. (2017) also report alert fatigue.
  - Singapore haze episodes last weeks, so this is the realistic scenario.
- **But false alarms matter less than assumed.** In a controlled experiment, lowering the false-alarm rate barely changed compliance (LeClerc & Joslyn, 2015).
  So the reason for rarity is fatigue and annoyance. Poorly timed or irrelevant notifications frustrate people (Mehrotra et al., 2016). It isn't mainly "cry wolf".
- **Health effects of alerts alone are limited.** In Toronto, an alert programme reduced some respiratory morbidity (asthma ED visits) but not other outcomes (Chen et al., 2018).
  Alerts are worth sending to sensitive people, but they aren't a cure-all.
- **Design:**
  - Hysteresis and quiet hours, as in the SPEC.
  - **Elevated alerts default off for healthy general users**, since NEA's advice to them is only "reduce strenuous activity".
  - A daily cap.
  - **The all-clear always gets through.** Graff Zivin & Neidell's "reprieve resets fatigue" finding supports the SPEC's all-clear idea directly.

### 3.9 Glanceable and accessible (principle 11)
*Supported.*

- Never rely on colour alone. About 8% of men have red-green colour-vision deficiency, and amber vs orange-red is a hard pair.
- The band chip needs text plus a distinct *shape*. Don't reuse the ▲ used for the trend.
- Screen-reader strings are in COPY.md.

### 3.10 Credibility signals (principle 12)
*Supported.* Impartiality and credibility are the top trust predictors (Sillence et al., 2019). Keep the footer. Put "Data: NEA via data.gov.sg" in the provenance line on the main screen, not only in the footer.

---

## 4. Singapore context

### 4.1 Which number, for what (the settled official position)
- NEA's framework is two tools for two jobs:
  - **1-hr PM2.5 + bands** for immediate activities ("within the next few hours").
  - **24-hr PSI forecast + advisory** for next-day planning (NEA poster, June 2026; NEA press release, 13 Jul 2020).
- MOE's 25 Sep 2015 school closure followed NEA's forecast that the 24-hr PSI would be Very Unhealthy and possibly Hazardous (CNN, 2015; MOE school notices).
- The parent deciding about *recess now* should use our number. The parent deciding about *school tomorrow* should look at NEA's forecast. **R4:** say so in the app. This is honest, it's useful, and it shows we're not competing with NEA.

### 4.2 History of the confusion
- **June 2013:** 3-hr PSI hit 401, the first time Singapore's air entered the Hazardous range (NLB Infopedia; Yahoo, 2013).
  - The public was confused by three numbers: 3-hr PSI, 24-hr PSI, and PM2.5 not yet in the PSI.
  - The 3-hr PSI wasn't tied to health advisories (MOH FAQ, 28 Jun 2013).
  - During the 2013 haze, perceived "dangerous PSI level" and physical symptoms were associated with psychological distress; the average reaction was mild (Ho et al., 2014).
- **2014–2016:** PM2.5 was added to the PSI (Apr 2014). NEA declined an hourly PSI (Oct 2015). The 1-hr PM2.5 bands arrived and the 3-hr PSI was phased out (Jun 2016).
- **September 2019:** the 24-hr PSI entered the Unhealthy range islandwide on 15 Sep. N95s sold out at some shops. MOH said the national stockpile was 16 million (Mothership, 2019).
- **September 2026 (now):** central 1-hr PM2.5 reached 113 on 14 Sep while the 24-hr PSI was 78–99 (Mothership, 2026). Online, people again called the 24-hr PSI "useless", and NEA again pointed to the 1-hr PM2.5 for same-day decisions (planb.sg, 16 Sep 2026).
  **HazeNow's niche is real, and NEA's own guidance supports it.** The risk is only in *how* we frame it.

### 4.3 Masks and scarcity
- 2013: queues, sell-outs within minutes and online scalping. The government released stockpiled N95s and called it an "artificial shortage" (NLB; NBC News, 2013).
- 2019: sell-outs again (Mothership, 2019).
- MOH's advice has stayed the same: N95 isn't needed for short exposures, and there are cautions for children, pregnancy and heart/lung disease.
- Our copy never tells people to buy anything and never leads with masks.

---

## 5. How comparable apps handle this

| Product | Scale shown in SG | Advice style | Provenance | Money | Trust notes |
|---|---|---|---|---|---|
| **IQAir AirVisual** | US AQI ("AQI⁺ US"), which runs much stricter than PSI. PM2.5 of 35.5–55.4 is "Unhealthy for Sensitive Groups" in US AQI but Moderate in PSI and Normal in NEA's 1-hr band. | Store listing: "Follow our advice to lower your health risk". | Blends NEA stations with named and anonymous private sensors ("22 stations from 18 contributors"). | Sells purifiers, masks and monitors. The app controls IQAir purifiers. Privacy labels include tracking. | IQAir's 2019 SG article sets the PSI against AirVisual's number alongside product promotion. In Vietnam (2019), users accused it of inflating readings to sell masks and purifiers, and it was pulled from local stores (The ASEAN Post). |
| **Apple Weather** | Provider is BreezoMeter for Singapore (Apple support 105038). The index shown in SG is **unverified**. | Not verified. | Index name and source are hard to find. | None. | Apple Community threads report mismatches with local readings. |
| **Google (Maps/Search, ex-BreezoMeter)** | Universal AQI, where 100 = best (inverted vs PSI), or local "PSI (SG)" via LAQI. | Defers to local agencies. | Blends stations, commercial sensors, satellite and models; admits station delays up to 12 h (Google Help). | Platform. | Offering the local index is good. The inverted scale is confusing. |
| **Plume Labs / Flow** (AccuWeather since 2021–22; Flow discontinued Apr 2023) | Proprietary Plume AQI framed as "safe exposure time". | Exposure-time framing. | Model plus sensors. | Hardware (now ended). | A third scale again. |
| **PurpleAir** | Raw low-cost sensor PM2.5. EPA correction is available. | Minimal. | Hyperlocal home sensors. Raw values overestimate (EPA correction; Barkjohn et al., 2022). | Sensors. | Clashed with official AirNow numbers during the 2020 US fires. EPA now blends the two and corrects the sensors. |
| **NEA myENV / haze.gov.sg** | 24-hr PSI + 1-hr PM2.5 bands. | NEA's verbs: healthy vs vulnerable persons. | Official stations. | None. | Opt-in alerts by topic. Authoritative, but the headline is the 24-hr PSI. |

Research on app vs official disagreement:
- The one relevant engagement study found that an air-quality app (AirForU, n = 2,740) engaged mostly intrinsically motivated users, such as people with heart/lung conditions and frequent exercisers. It prompted some protective action (Delmas & Kohli, 2020).
- **No peer-reviewed study was found on how users react when an app contradicts official readings.** The PurpleAir/AirNow episode and the Vietnam AirVisual backlash are case evidence, not trials.

### What builds trust (steal these)
1. **NEA's own verbs and vulnerable-group split**, time-boxed "for the next hour" (NEA poster).
2. **Explain up front why other numbers differ.** Our 2-sentence explainer does this without blame.
3. **Per-station provenance with timestamps** (IQAir's station list, without the anonymous blending).
4. **Local index by default** (Google's LAQI option). We go further: NEA bands only.
5. **Opt-in, topic-level alerts** (myENV).
6. **Treat disagreement as a correction problem, in the open** (EPA's PurpleAir correction). If we ever add DIY sensors (docs/DIY_SENSOR.md), keep them visually separate from NEA data, never blended silently.

### Dark patterns to avoid
1. **Foreign or stricter scales with no disclosure.** Showing "Unhealthy" when NEA says "Elevated" or "Normal" is the IQAir/US-AQI problem, and the Instant PSI would be our own version of it (R1).
2. **Health advice next to a shop.** Purifier and mask links beside a fear-inducing number is the exact conflict of interest behind the Vietnam backlash.
3. **"What the government won't tell you" framing.** It raises outrage and sells anxiety.
4. **Hidden index names, hidden delays, anonymous sensors blended with official ones.**
5. **Tracking SDKs in a health app.**
6. **Streaks, badges, "you've been exposed to X cigarettes"**, or any engagement mechanic that makes people check more often out of anxiety.
7. **Pre-checked notification opt-ins and fear-based permission prompts** ("Turn on alerts to protect your family").

---

## 6. Principles checklist for builders (quick reference)
1. Verdict (NEA-aligned, "for now") → number + band chip with icon → harm anchor → trend words → provenance.
2. Every Elevated+ screen has 1–3 specific actions. The mask action is conditional.
3. One scale on the main screen: NEA's 1-hr band. The NEA 24-hr PSI is shown and labelled neutrally. No Instant PSI on the main screen.
4. Uncertainty is a numeric range. Stale data is stated in words.
5. No commerce, no alarm words, no exclamation marks, no government-bashing.
6. Colour is never the only signal. Text contrast is ≥ 4.5:1.
7. Notifications: rare, actionable, capped, always with an all-clear.

---

## 7. Review of web build

**What was reviewed:** `apps/web` at 2026-09-28 ~16:55 SGT, run with `npx vite` (no files changed).
- Screenshots were taken with headless Chromium at 390×844 @2x.
- Three runs:
  - live NEA data: Central, 105 µg/m³, Elevated, light mode, general profile
  - mocked High: readings ×1.6, giving 168, with the kids profile
  - mocked Very High: readings ×2.5, giving 263, in dark mode
- Contrast was computed from the CSS tokens using WCAG 2.x relative luminance.

### What already works
- **Verdict first.** "OK to be out." is the first large text, the number follows, and the band chip carries both text and shape.
- **Profile prompt.** "for you · checking for kids or someone sensitive?" is a low-friction way to invite a profile without a blocking first-run modal. Keep it.
- **Provenance on the main screen.** "Measured by NEA's Central station · 51 min ago" is there, and stale or offline states are stated in words.
- **Actions under every Elevated+ verdict**, and a calm "no special precautions" line at Normal.
- **The footer credibility line** and "not affiliated with NEA".
- **3-second glance test:** partial pass. The verdict and number are readable within a glance. But the colour bug (P0-1) makes an Elevated, *rising fast* reading look green and "all clear".

### Fixes, in priority order

**P0: fix before anyone sees it**

1. **Band colours invert in the headline and trend arrow.**
   - At Elevated, "OK to be out." and the ▲ "Rising fast" arrow render **green**, oklch(0.55 0.10 152). At High, the headline renders **magenta** (hue 337).
   - Cause: `--band-ink: color-mix(in oklch, var(--band) 58%, var(--ink))`. Amber (hue ≈75) and the blue-grey ink (hue 255) are about 180° apart, so oklch hue interpolation passes through green. Orange-red passes through magenta.
   - Result: a green "rising fast" is a direct safety and trust error.
   - **Fix:** mix `in oklab` (no hue interpolation), or define explicit per-band ink tokens. Then re-check every band in both themes.
2. **Instant PSI contradicts NEA on the screen (R1).**
   - The "Now vs the 24-hr average" block puts "~153 **Unhealthy**" beside "81 Moderate · **lagging**". Our band chip above says "Elevated". The chart plots hourly bars "on the PSI scale (Instant PSI est.)".
   - The Instant PSI also reaches the share text, the badge (`PSI~153`), the embed card and the share image.
   - **Fix:**
     - Remove the Instant PSI from the main screen, share text, badge, embed and share image.
     - Re-draw the chart in one unit, µg/m³: hourly PM2.5 bars with dashed band lines at 56 and 151, and NEA's own 24-hr PM2.5 average as the line. The PSI API returns `pm25_twenty_four_hourly`, so it's NEA data, the same unit, and it still shows the lag.
     - Drop "lagging" from the label.
3. **Kids get N95 advice.** With the `kids` profile at High, the actions say "Going out? Wear an N95". MOH says N95 masks are not certified for children.
   - Actions are not filtered by profile.
   - **Fix:** use COPY.md §5, which filters actions by profile and makes the mask action conditional ("Out for hours?").

**P1: before launch**

4. **Advice wording and time scope (R2).** Very High says "Stay indoors **today**". NEA's 1-hr guide is "for the next hour". Elevated sensitive says "Keep outdoor time light", which is stricter than NEA. **Fix:** swap in the COPY.md §2 matrix.
5. **The official number is not visible at a glance.** The NEA 24-hr PSI first appears about 1.5 screens down, below the share button. Users can't corroborate our number without scrolling (§3.4).
   **Fix:** add one line under provenance: "NEA 24-hr PSI: 81 (Moderate) · 24-hour average · *Why two numbers?*"
6. **"about 5× / 8× / 13× a typical clear day".** At Very High, "13×" is the most alarming string on the page, and it sits under a verdict that already says stay indoors. **Fix:** use the harm anchor from COPY.md §3 (R5).
7. **The haze "veil" amplifies fear.** At Very High in dark mode, the page turns into a purple smoke texture with a pink headline. It's atmospheric, but it's a visual fear appeal that adds threat without adding efficacy, and it breaks "calm by default".
   **Fix:** cap the veil at the Elevated level of intensity, or limit it to a faint tint of the top band only. No texture beyond that.
8. **Contrast and colour.** The chip always carries text, so the design doesn't rely on colour alone. But:
   - The band **icons** fail WCAG 1.4.11 (3:1 for non-text):
     - Elevated amber `#E8A317` on paper: **1.94:1**
     - Normal green `#2E9E5B`: **3.05:1** (borderline)
     - Very High purple `#7B2D8E` on dark paper: **2.29:1**
   - The "This is outdoor air…" line (`--ink-3` at 13.8 px) is **4.16:1**, under the 4.5:1 minimum.
   - **Fix:** add a darker outline to the icons (or a dark-mode band palette), and use `--ink-2` for body-size helper text.
9. **The screen reader re-reads the whole page.** `#app` has `aria-live="polite"`, so every re-render (polls, profile changes) announces the entire page.
   **Fix:** remove it from `#app`. Add a small `role="status"` region that announces only band changes and errors, for example "Now High, PM2.5 168, rising fast".
10. **The indoor line overpromises (R7).** "With windows shut and a purifier on, it can be much cleaner" bundles both levers together. In a Singapore flat, windows shut alone gave only a modest cut.
    **Fix:** "Indoors helps. Windows shut helps a bit; a purifier running helps a lot."
    Also replace "Close windows if it smells hazy": relying on sensory cues is a known barrier (D'Antoni et al., 2017). Use COPY.md §5.

**P2: polish**

11. **Map labels overlap.** "105" collides with "North" and "Central", and South's "105" overlaps the Central marker. Offset the labels, or show values only in the table.
12. **"No tracking" vs Google Fonts.** The page loads fonts from fonts.googleapis.com, which sends every visitor's IP to Google. Self-host Instrument Sans and Instrument Serif so the privacy claim is literally true. Also remove "lagging" from the meta and OG descriptions.
13. **Developer promos on the page an anxious parent reads.** "HazeNow, wherever you look" (terminal command, embed code, badge) takes about a third of the page. Move it to `/apps` and link it from the footer.
14. **Add the "Planning tomorrow?" line (R4)** under the actions, linking to haze.gov.sg's 24-hr PSI forecast.
15. **Put the clock time in the main provenance line:** "measured 4pm · 51 min ago". Relative time alone becomes ambiguous in a screenshot someone shares.
16. **Handle history errors gracefully.** One run logged CORS failures on the `?date=` history calls; `curl` from the same machine showed `access-control-allow-origin: *`, so this was probably transient, for example rate-limit responses without CORS headers. Make sure missing history degrades to "Trend not available yet", not a wrong trend. It rendered correctly in this run.

---

## 8. References

**Risk communication and behaviour**
- Rogers, R. W. (1975). A protection motivation theory of fear appeals and attitude change. *Journal of Psychology*, 91(1), 93–114.
- Witte, K. (1992). Putting the fear back into fear appeals: The extended parallel process model. *Communication Monographs*, 59(4), 329–349.
- Witte, K., & Allen, M. (2000). A meta-analysis of fear appeals: implications for effective public health campaigns. *Health Education & Behavior*, 27(5), 591–615. PMID 11009129.
- Peters, G.-J. Y., Ruiter, R. A. C., & Kok, G. (2013). Threatening communication: a critical re-analysis and a revised meta-analytic test of fear appeal theory. *Health Psychology Review*, 7(S1), S8–S31. PMID 23772231.
- Tannenbaum, M. B., et al. (2015). Appealing to fear: A meta-analysis of fear appeal effectiveness and theories. *Psychological Bulletin*, 141(6), 1178–1204.
- Kok, G., Peters, G.-J. Y., Kessels, L. T. E., ten Hoor, G. A., & Ruiter, R. A. C. (2018). Ignoring theory and misinterpreting evidence: the false belief in fear appeals. *Health Psychology Review*, 12(2), 111–125. PMID 29233060.
- Sandman, P. M. (1987). Risk communication: Facing public outrage. *EPA Journal* (Nov 1987). See also psandman.com.
- Clarke, L. (2002). Panic: Myth or reality? *Contexts*, 1(3), 21–26.
- Peters, E., Dieckmann, N. F., Västfjäll, D., Mertz, C. K., Slovic, P., & Hibbard, J. H. (2009). Bringing meaning to numbers: The impact of evaluative categories on decisions. *Journal of Experimental Psychology: Applied*, 15(3), 213–227. PMID 19751072.
- Zikmund-Fisher, B. J., et al. (2018). Effect of harm anchors in visual displays of test results on patient perceptions of urgency about near-normal values. *Journal of Medical Internet Research*, 20(3), e98. PMID 29581088.
- van der Bles, A. M., van der Linden, S., Freeman, A. L. J., & Spiegelhalter, D. J. (2020). The effects of communicating uncertainty on public trust in facts and numbers. *PNAS*, 117(14), 7672–7683. PMID 32205438.
- Sillence, E., Blythe, J. M., Briggs, P., & Moss, M. (2019). A revised model of trust in internet-based health information and advice. *Journal of Medical Internet Research*, 21(11), e11125. PMID 31710297.
- LeClerc, J., & Joslyn, S. (2015). The cry wolf effect and weather-related decision making. *Risk Analysis*, 35(3). PMID 25627345.
- Mehrotra, A., Pejovic, V., Vermeulen, J., Hendley, R., & Musolesi, M. (2016). My phone and me: Understanding people's receptivity to mobile notifications. *CHI '16*. doi:10.1145/2858036.2858566.

**Air-quality alerts and indices**
- D'Antoni, D., Smith, L., Auyeung, V., & Weinman, J. (2017). Psychosocial and demographic predictors of adherence and non-adherence to health advice accompanying air quality warning systems: a systematic review. *Environmental Health*, 16, 100. PMID 28938911.
- D'Antoni, D., Auyeung, V., Walton, H., Fuller, G. W., Grieve, A., & Weinman, J. (2019). The effect of evidence and theory-based health advice accompanying smartphone air quality alerts on adherence to preventative recommendations during poor air quality days: A randomised controlled trial. *Environment International*, 124, 216–235. PMID 30654328.
- Mirabelli, M. C., et al. (2018). Air quality awareness among U.S. adults with respiratory and heart disease. *American Journal of Preventive Medicine*, 54(5), 679–687. PMID 29551329.
- Neidell, M. (2009). Information, avoidance behavior, and health: The effect of ozone on asthma hospitalizations. *Journal of Human Resources*, 44(2), 450–478.
- Graff Zivin, J., & Neidell, M. (2009). Days of haze: Environmental information disclosure and intertemporal avoidance behavior. *Journal of Environmental Economics and Management*, 58(2), 119–128.
- Saberian, S., Heyes, A., & Rivers, N. (2017). Alerts work! Air quality warnings and cycling. *Resource and Energy Economics*, 49, 165–185.
- Chen, H., et al. (2018). Effect of air quality alerts on human health: a regression discontinuity analysis in Toronto, Canada. *Lancet Planetary Health*, 2(1), e19–e26. PMID 29615204.
- COMEAP (2011). *Review of the UK Air Quality Index.* https://assets.publishing.service.gov.uk/media/5a749a66e5274a44083b8003/COMEAP_review_of_the_uk_air_quality_index.pdf
- Delmas, M. A., & Kohli, A. (2020). Can apps make air pollution visible? Learning about health impacts through engagement with air quality information. *Journal of Business Ethics*. https://link.springer.com/article/10.1007/s10551-019-04215-7
- Barkjohn, K. K., et al. (2022). Correction and accuracy of PurpleAir PM2.5 measurements for extreme wildfire smoke. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9784900/ ; EPA US-wide correction: https://www.epa.gov/research-states/airnow-fire-and-smoke-map-extension-us-wide-correction-purpleair-pm25-sensors

**Singapore**
- NEA (June 2026). *How to plan your outdoor activities during haze* (poster). https://www.haze.gov.sg/docs/default-source/posters/haze-pm-psi-guide-a4-english.pdf
- NEA (13 Jul 2020). New personal guide based on 1-hr PM2.5 concentration readings. https://www.nea.gov.sg/media/news/news/index/new-personal-guide-based-on-1-hr-pm2.5-concentration-readings-to-guide-the-public-during-haze-season
- MOH. Haze (updated 24 Sep 2026). https://www.moh.gov.sg/others/haze/ ; FAQ: Use of masks and availability of masks, https://www.moh.gov.sg/newsroom/faq-use-of-masks-and-availability-of-masks/ ; FAQs on Haze (28 Jun 2013), https://www.moh.gov.sg/newsroom/frequently-asked-questions-(faqs)-on-haze-(updated-28-june-2013)/
- "NEA explains why it does not give hourly PSI readings" (Today / Straits Times / CNA, 8–9 Oct 2015, compiled). https://wildsingaporenews.blogspot.com/2015/10/nea-explains-why-it-does-not-give.html
- Pollutant Standards Index (Wikipedia, for timeline: PM2.5 into PSI Apr 2014; 3-hr PSI phased out 2016). https://en.wikipedia.org/wiki/Pollutant_Standards_Index
- NLB Infopedia, Haze pollution. https://www.nlb.gov.sg/main/article-detail?cmsuuid=0a5ea199-00be-4eda-b017-9cc0553c8819
- NBC News (2013). Face masks fly off shelves as thick haze descends on Singapore. https://www.nbcnews.com/business/business-news/face-masks-fly-shelves-thick-haze-descends-singapore-flna6C10409283
- CNN (25 Sep 2015). Singapore closes schools as haze worsens. https://www.cnn.com/2015/09/25/asia/singapore-haze-indonesia-schools
- Mothership (Sep 2019). S'pore has national stockpile of 16 million N95 masks. https://mothership.sg/2019/09/masks-n95-haze-singapore/
- AsiaOne (2019). Chong Pang distributes N95 masks amid haze concerns. https://www.asiaone.com/lifestyle/singapore-psi-haze-n95-mask-care-pack
- Mothership (14 Sep 2026). 1-hour PM2.5 in central Singapore hits 113. https://mothership.sg/2026/09/haze-september-reading-113/
- planb.sg (16 Sep 2026). Singapore's use of 24-hour PSI draws criticism amid haze. https://www.planb.sg/post/singapore-s-use-of-24-hour-psidraws-criticism-amid-haze
- Ho, R. C., et al. (2014). Impact of 2013 south Asian haze crisis: study of physical and psychological symptoms and perceived dangerousness of pollution level. *BMC Psychiatry*, 14, 81. PMID 24642046.
- Ng, K. Y. Y., et al. (2021). Factors influencing protective behaviours during haze episodes in Singapore: A population-based study. *Annals of the Academy of Medicine, Singapore*, 50(7), 514–526.
- Sharma, R., & Balasubramanian, R. (2017). Indoor human exposure to size-fractionated aerosols during the 2015 Southeast Asian smoke haze and assessment of exposure mitigation strategies. *Environmental Research Letters*, 12(11), 114026.
- Real-world effectiveness of portable air cleaners in reducing home particulate matter concentrations. *Aerosol and Air Quality Research* (2023). https://aaqr.org/articles/aaqr-23-08-oa-0202

**Apps**
- IQAir (2019). Why Singapore's air quality index won't tell you what the haze is like right now. https://www.iqair.com/sg/newsroom/why-singapore-s-air-quality-index-won-t-tell-you-what-the-haze-is-like-right-now
- The ASEAN Post (2019). Pollution app under attack in Vietnam. https://theaseanpost.com/article/pollution-app-under-attack-vietnam
- Apple Support 105038 (Weather data providers). https://support.apple.com/en-us/105038
- Google Maps Platform Air Quality API, local AQIs incl. `sgp_nea`. https://developers.google.com/maps/documentation/air-quality/laqis ; Google Maps help on air quality data delays: https://support.google.com/maps/answer/11270845
- Plume Labs, What is the Plume AQI. https://plumelabs.zendesk.com/hc/en-us/articles/360008268434-What-is-the-Plume-AQI ; Flow sales closed: https://blog.plumelabs.com/2023/04/24/flow-sales-closed-30-04-2023/
- NEA myENV feature guide (2024). https://www.nea.gov.sg/docs/default-source/default-document-library/myenv---guide-to-using-the-features-in-the-app-(updated-5-feb-2024)993f1371ecde425eaa516f4de597e329.pdf
