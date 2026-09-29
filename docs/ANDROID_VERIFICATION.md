# Android developer verification and HazeNow

Researched 29 Sep 2026, the day before enforcement starts. Sources are official Google pages unless marked otherwise. Anything not confirmed on a primary source is marked **unverified**.

**The short answer.** The 30 Sep 2026 deadline does **not** block HazeNow's GitHub APK. In the first phase Google only checks installs from seven named app stores. Sideloads from GitHub, F-Droid and Obtainium are enforced from the **2027 global rollout**. No free route lets an individual distribute to an unlimited number of devices. The free options are a 20-device "limited distribution" account, or staying unregistered so that users must complete a 24-hour "advanced flow". Full verification costs a one-time US$25, the same as Play.

---

## 1. What is required, from when, where

**The requirement.** Apps must be *registered by a verified developer* before they can be installed on certified Android devices. The developer verifies their identity, registers each package name, and adds the SHA-256 fingerprint of the signing certificate. Google says this is an ID check on who the developer is, not a review of the app. ([ADC Help: Understanding Android developer verification](https://support.google.com/android-developer-console/answer/16561738?hl=en))

**Timeline** ([developer.android.com/developer-verification/guides](https://developer.android.com/developer-verification/guides), last updated 2026-08-18):

| When | What |
|---|---|
| Jun 2026 | System service rollout; limited distribution early access |
| Jul 2026 | Status API launches globally |
| Aug 2026 | Console API, limited distribution accounts and the advanced flow launch globally |
| **30 Sep 2026** | Regional enforcement in **Brazil, Indonesia, Singapore and Thailand** |
| 2027 onwards | Global rollout: "all apps on certified Android devices" |

**Singapore, Indonesia, Thailand and Brazil from 30 Sep 2026: confirmed.** However, the first phase only checks installs from these stores: Google Play, HONOR App Market, OPPO App Market, Galaxy Store, Palm Store (Transsion), V-Appstore (vivo) and GetApps (Xiaomi). (Same page; also [Android Help 17065026](https://support.google.com/android/answer/17065026?hl=en).)

**Does it apply to APKs sideloaded from GitHub?** Not yet. The developer FAQ says ([FAQ](https://developer.android.com/developer-verification/guides/faq), updated 15 Jul 2026):

> "The September 30, 2026 deadline only applies to the specific participating stores. If you distribute your app through other stores, or if users sideload your app directly, these new verification requirements won't apply to your app yet. While your users' install experiences won't change in September, we still recommend that you plan to complete your verification before the global rollout begins in 2027."

The FAQ also says the rule covers only phones and tablets outside Play (updated 15 Jul 2026).

Caveats:
- **Older pages use broader wording.** For example, the [limited distribution guide](https://developer.android.com/developer-verification/guides/limited-distribution) says unregistered package names "will become uninstallable on certified Android devices" in the four countries, and the FAQ entry "What happens if I don't comply" (dated 3 Sep 2025) says the same. The newer, specific FAQ entry above (15 Jul 2026) is the one to trust. It is **unverified** whether any OEM build in Singapore enforces the rule more widely than this.
- **Android versions.** The developer FAQ says "Android 7 or higher" (23 Mar 2026). The user help page says "Android 8 and up" ([17065026](https://support.google.com/android/answer/17065026?hl=en)). Google has not resolved this discrepancy.
- **Exemptions.** AOSP devices, non-certified devices, regions without Google Mobile Services, and sanctioned territories are exempt (17065026). Enforcement runs through a system service, `com.google.android.verifier` ("Android Developer Verifier"), which is updated via Google Play services.
- **2027 date.** The only official wording is "2027"; there is no exact date. The keepandroidopen.org countdown ("95 days until lockdown") does not come from Google and is **unverified**.

## 2. What users see if the developer is not verified

Once enforcement covers an install source (from 30 Sep 2026 for the seven stores; for GitHub, from the 2027 rollout), the install is **blocked by default**, with a notification: "you won't be able to install the app. However, you can choose to bypass this block by completing a one-time advanced flow" ([Android Help 17065026](https://support.google.com/android/answer/17065026?hl=en)). Registered apps install as they do today.

**The advanced flow.** This is a one-time setup on each device. The steps come from [Android Help 17588095 "Allow app installs from unverified developers"](https://support.google.com/android/answer/17588095?hl=en), the [FAQ](https://developer.android.com/developer-verification/guides/faq) and the [Android Developers Blog, 19 Mar 2026](https://android-developers.googleblog.com/2026/03/android-developer-verification.html):
1. Turn on Developer options (tap the build number seven times).
2. Go to Settings › System › Developer options and turn on **Allow apps from unverified developers**.
3. Confirm that nobody is coaching you (an anti-scam check).
4. Restart the phone and re-authenticate.
5. Wait the **24-hour** protective period, then confirm with a fingerprint, face or device PIN.
6. Choose whether to allow unverified installs for **7 days or indefinitely**.
7. Install the app. A warning about the unverified developer is still shown; tap **Install anyway**.

Developer options can be switched off afterwards and the setting stays on, which matters because some banking apps refuse to run with developer options enabled. **If the user turns the advanced flow off, updates to unregistered apps fail.** This also means that choosing "7 days" breaks HazeNow's updates once the 7 days end. (FAQ, 23 and 25 Mar 2026.)

**adb is exempt.** "As a developer, you are free to install apps without verification with ADB", and "No changes to ADB … waiting period doesn't apply" (FAQ, 3 Sep 2025 and 23 Mar 2026; [guides](https://developer.android.com/developer-verification/guides): "ADB workflow and experience stays the same"). This does not help ordinary users.

## 3. The free options

### 3a. Limited distribution account ("student/hobbyist")
Source: [developer.android.com limited-distribution](https://developer.android.com/developer-verification/guides/limited-distribution) and [ADC Help 17131204](https://support.google.com/android-developer-console/answer/17131204?hl=en).
- **Fee:** none ("completely free").
- **Identity:** **no government ID.** You need a Google Account with 2-Step Verification, a linked Google payments profile (for legal name and address), and a contact email.
- **Eligibility:** hobbyists, learners and classrooms: "a closed group of trusted connections". It must be a **personal** account ([16604405](https://support.google.com/android-developer-console/answer/16604405?hl=en)).
- **Device limit:** **20 authorised devices at any one time.** The developer invites each device: the device owner scans a QR code or opens a link, which generates an authorisation code, and the developer enters that code in the console. Removing a device stops its installs and updates, and removal "cannot be undone".
- **Package names:** "You can only register new package names that have never been seen before on Android."
- **Switching to full distribution:** the sources conflict. The FAQ (8 Jun 2026) says limited accounts "can be migrated to full accounts". [Choose a distribution (16640817)](https://support.google.com/android-developer-console/answer/16640817?hl=en) says "You can't change your plan… you'll need to create a new account and transfer your package names." Either way, package names can be moved to a paid account later.
- **Verdict:** useless for a public civic app, but useful as a free way to **reserve `sg.hazenow`** (see §5).

### 3b. Can an individual verify for free for unlimited distribution outside Play?
**No.** Full distribution in the Android Developer Console costs a **one-time US$25**, paid by credit or debit card. Prepaid cards are not accepted. ([Get started 16604405](https://support.google.com/android-developer-console/answer/16604405?hl=en); [Choose a distribution 16640817](https://support.google.com/android-developer-console/answer/16640817?hl=en); FAQ, 25 Mar 2026.) The Play Console route also costs US$25. No official fee waiver exists for open-source or non-profit developers (**unverified**: none found on any page listed here).

### 3c. Staying unregistered (free, no ID)
Keep shipping the APK. From 2027, users must complete the advanced flow in §2 or install with adb. Google's own FAQ lists this as the option for developers who want to stay anonymous (18 Jun 2026).

### 3d. Identity documents (full distribution, personal account, Singapore)
From [Required documents by country: Singapore](https://support.google.com/android-developer-console/answer/16501669?hl=en&co=GENIE.CountryCode%3DSG):
- **A Singaporean government-issued photo ID:** passport, Identity Card (NRIC), driver's licence or residence permit.
- **Proof of address** showing the name and address exactly as they appear on the payments profile: a government ID with the address on it, a utility bill, an insurance statement, or a credit card or bank statement. The NRIC shows the address, so it may cover both.
- Plus a contact email and phone number, each verified by one-time password, and a legal name and address taken from the Google payments profile ([16640818](https://support.google.com/android-developer-console/answer/16640818?hl=en)). The developer name can differ from the legal name. The fee is not refunded if the ID or payment details turn out to be invalid.
- The form takes about 10 minutes ([full-distribution guide](https://developer.android.com/developer-verification/guides/full-distribution)). How long Google takes to review it is **unverified**.

### 3e. Registering `sg.hazenow` and the signing key
From the [ADC guide](https://developer.android.com/developer-verification/guides/android-developer-console) and [Registering package names (16640821)](https://support.google.com/android-developer-console/answer/16640821?hl=en):
1. Go to **Package names** › **Register package name**, enter `sg.hazenow` and a friendly name ("HazeNow").
2. **Add key:** paste the public key certificate or its SHA-256 fingerprint. The status changes to *In review*.
3. **Existing package names** also need proof of ownership. Paste the console's snippet into `app/src/main/assets/adi-registration.properties` (that exact file name), build a release APK signed with the release key, and upload it. The status then changes to *Registered*, and Google sends an email.
4. **Who gets a name that is already in use:** if one key has more than 50% of installs, its developer gets the name. If no key has a majority, every key with 50 or more installs is eligible. If every key has fewer than 50 installs, the first developer to register gets it.
5. More than one key per package is allowed. **A lost key cannot be recovered, and without it you can't register.** (FAQ, 23 Mar 2026.)

**HazeNow's release certificate.** This was computed with `keytool` from `~/.config/hazenow/hazenow-release.jks`, alias `hazenow`, `CN=HazeNow, O=HazeNow, C=SG`, 4096-bit RSA, valid until 2054. It matches the signer of `HazeNow-android.apk` in GitHub release `v0.3.0-rc1`, checked with `apksigner` (v2 scheme):

```
SHA-256: E7:4C:5F:E9:B9:28:9B:08:5E:14:57:6D:99:0D:03:6E:3A:FD:C2:C7:D7:56:E0:1B:13:30:6C:1B:55:2D:58:D0
```

### 3f. Timeline for HazeNow
- Now to 2027: GitHub installs keep working as today.
- Accounts and registration have been open since Aug 2026, so the founder can register at any time.
- Register before the 2027 global rollout; Google's wording is "plan to complete your verification before the global rollout".

## 4. F-Droid and Obtainium

- **30 Sep 2026:** neither F-Droid nor Obtainium is on the list of participating stores, so installs through them are unaffected until 2027 (FAQ, 18 Jun and 15 Jul 2026).
- **From 2027:** Google says enforcement applies "regardless of your app's download source" ([guides](https://developer.android.com/developer-verification/guides)). Registration is tied to the package name plus the signing key, so installs of an F-Droid-signed build count as registered only if that key is registered for the package. F-Droid can't do that for developers. Whether F-Droid will register its own signing keys is **unverified**. Unregistered apps will need the advanced flow; Google says this also applies to independent stores (FAQ, 8 Jun 2026).
- **What F-Droid has said:**
  - [F-Droid and Google's Developer Registration Decree, 29 Sep 2025](https://f-droid.org/2025/09/29/google-developer-registration-decree.html): the requirement "will end the F-Droid project and other free/open-source app distribution sources as we know them today". F-Droid "cannot require that developers register their apps through Google, but … cannot 'take over' the application identifiers". It asks users to write to their representatives and sign petitions.
  - F-Droid's current homepage banner (Sep 2026): "F-Droid is under threat. Google is changing the way you install apps on your device", with a link to keepandroidopen.org. That campaign has an open letter signed by 71 organisations, including F-Droid, EFF, FSFE, KDE and Signal (as the campaign site claims).
  - The F-Droid 2.0 announcement (24 Sep 2026) does not discuss verification in any detail.
- **The best case for HazeNow on F-Droid:** HazeNow already aims for reproducible builds. If F-Droid ships the **upstream-signed** APK, installs from F-Droid carry HazeNow's key, so a single registration covers GitHub, Obtainium and F-Droid. F-Droid describes this "host the upstream package after we verify it to be reproducible" mode in [TWIF, 18 Sep 2026](https://f-droid.org/en/2026/09/18/twif.html). **Recommendation:** set `Binaries:` or `AllowedAPKSigningKeys` in the fdroiddata metadata so F-Droid uses our signature. That this avoids an F-Droid-key problem is an inference, **unverified** with F-Droid.
- **Obtainium:** it downloads the APK from GitHub Releases and installs it with the system installer. That makes it an ordinary sideload, so the same rules apply: nothing changes in 2026, and in 2027 the app needs to be registered or the user needs the advanced flow. Obtainium has published no statement about this in its README or issues (checked 29 Sep 2026; **unverified** whether one exists elsewhere).

## 5. Recommendation for HazeNow

**Reality check.** No free option gives ordinary Singaporeans a no-friction install. The possible paths, in order of friction for users:

| Path | Cost | Friction for users in 2027+ |
|---|---|---|
| ADC full distribution (or Play) | US$25 once, plus NRIC | None: installs like any app |
| Unregistered APK on GitHub | Free | Developer options, a 24-hour wait, then "Install anyway". Most people will give up |
| Limited distribution | Free | Blocked beyond 20 invited devices |
| **PWA (hazenow.pages.dev)** | Free | None: already works in Chrome |

**Recommended free path:**
1. **For ordinary Singaporeans, lead with the PWA.** The download page should say "Add to Home screen" first. It needs no store and no verification.
2. **Keep the signed APK on GitHub for Android power users** (widgets, QS tile, alerts). It is unaffected by the 30 Sep 2026 enforcement.
3. **Reserve `sg.hazenow` now, for free, with a limited distribution account.** Under the "first come" rule for names with fewer than 50 installs, this stops anyone else from claiming it, and it can be moved to a paid account later. Limited distribution accepts only never-seen names, so if Google says `sg.hazenow` has already been seen (after the 28 Sep RC upload), that step will fail. The outcome is **unverified** until he tries.
4. **Revisit before the 2027 rollout.** If the Android app has a real user base, spending the US$25 on ADC full distribution is the only way to remove the 24-hour wall. It costs the same as Play but needs no Play listing, review or policy declarations.

### Steps only the founder can do (identity)
1. Sign in at <https://android.google.com/developerconsole> with the Google Account he wants to own the app long-term. Turn on 2-Step Verification.
2. Choose **Limited distribution**, then **Personal**. Create or link a Google payments profile with his **legal name and SG address**. Accept the ADC Terms of Service.
3. Verify the contact email and phone number by one-time password.
4. Go to **Package names › Register package name**, enter `sg.hazenow`, **Add key**, and paste the SHA-256 above.
5. If the console asks for proof of ownership, send us the `adi-registration.properties` snippet. We will build a signed APK for him to upload.
6. *(Later, if he pays.)* Create a Full distribution personal account, pay US$25 by card, upload the NRIC or passport plus proof of address, and transfer `sg.hazenow` to it.

### What we change

In the app:
- Nothing is needed for 30 Sep 2026.
- **Never change `applicationId` (`sg.hazenow`) or the signing key.**
- Back up the `.jks` file and its password offline, in two places: a lost key means we can't register.
- If ownership proof is requested, add `app/src/main/assets/adi-registration.properties`, which contains no secrets, and ship it in the next release.
- Optionally enable v3 signing alongside v2 so the key can be rotated later (**unverified** whether rotation interacts with registration; add the new key in ADC first).

In `apps/android/README.md`:
- Add an "Install and verification" section. It should say: the published certificate SHA-256 (above); that GitHub, Obtainium and F-Droid installs are unaffected by the 30 Sep 2026 regional enforcement; the 2027 status (registered or not); and adb as the developer route.
- Update the F-Droid section to ask F-Droid to ship the upstream-signed APK (`AllowedAPKSigningKeys: e74c5fe9b9289b085e14576d990d036e3afdc2c7d756e01b13306c1b552d58d0`).

On the download page (`apps/site/download/index.html`):
- Put the PWA first for most people.
- Keep the APK with its SHA-256 checksum and the certificate fingerprint, so users can check it with AppVerifier or Obtainium.
- Add a calm line: "HazeNow isn't on Google Play. Android may show an 'unknown app' prompt; from 2027, if we are not yet registered, you'd need Android's one-time 'Allow apps from unverified developers' setting (Settings › System › Developer options, 24-hour wait)", linking [Android Help 17588095](https://support.google.com/android/answer/17588095?hl=en).
- Tell users who enable the advanced flow to pick **"indefinitely"**, because updates fail when it expires.
- Keep the wording factual and without fear, in line with DISTRIBUTION.md §1.

---

## Summary

Google's developer verification begins on 30 Sep 2026 in Singapore, Indonesia, Thailand and Brazil. In this first phase it only checks installs from Google Play and six OEM stores. GitHub, Obtainium and F-Droid sideloads are unaffected until the global rollout in 2027 (Google FAQ, 15 Jul 2026).

Once a source is enforced, unregistered apps are blocked unless the user completes a one-time "advanced flow": turn on developer options, restart, wait 24 hours, then tap "Install anyway". adb is exempt.

There is no free unlimited route. Full verification costs US$25 and needs NRIC or passport plus proof of address. The free "limited distribution" account needs no ID but covers only 20 invited devices, and only never-seen package names.

For HazeNow:
- Lead ordinary users to the PWA.
- Keep the signed GitHub APK for power users.
- Have the founder open a free limited account now to reserve `sg.hazenow` with certificate SHA-256 `E7:4C:5F:E9:…:58:D0`.
- Reconsider paying US$25 before 2027.
- Ask F-Droid to ship the upstream-signed APK so that one registration covers every channel.
- Never change the package name or the key.
