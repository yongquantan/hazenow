## How to install

Every file below has a stable link that always points at the newest release:
`https://github.com/{{REPO}}/releases/latest/download/<file name>`. Step-by-step guide with pictures: https://hazenow.pages.dev/download/

**iPhone.** Open the web app in Safari, tap Share, then **Add to Home Screen**. For a Home Screen or Lock Screen widget: install the free **Scriptable** app, open [`HazeNow-scriptable.js`](https://github.com/{{REPO}}/releases/latest/download/HazeNow-scriptable.js), copy it into a new Scriptable script named HazeNow, then add a Scriptable widget and pick **Script: HazeNow**.

**Android.** Download [`HazeNow-android.apk`](https://github.com/{{REPO}}/releases/latest/download/HazeNow-android.apk) and open it. When asked, allow your browser to install apps (once), then tap **Install**. For automatic updates, use [Obtainium](https://github.com/ImranR98/Obtainium): add `https://github.com/{{REPO}}` or tap `obtainium://add/https://github.com/{{REPO}}`.

**Mac.** Download [`HazeNow-mac.zip`](https://github.com/{{REPO}}/releases/latest/download/HazeNow-mac.zip), double-click to unzip, and drag **HazeNow** to Applications. The first time you open it, macOS says it "could not verify" the app, because HazeNow is free and not registered with Apple. Click **Done**, go to **System Settings → Privacy & Security**, scroll to Security and click **Open Anyway** next to "HazeNow" was blocked, then confirm with your password. No warning at all: use [SwiftBar](https://swiftbar.app) with [`hazenow.2m.py`](https://github.com/{{REPO}}/releases/latest/download/hazenow.2m.py).

**Command line** (Node 18+): `npm i -g https://github.com/{{REPO}}/releases/latest/download/hazenow-cli.tgz`, then run `hazenow`.

**Home Assistant.** Download [`hazenow-home-assistant.zip`](https://github.com/{{REPO}}/releases/latest/download/hazenow-home-assistant.zip), unzip it into your config folder so you get `config/custom_components/hazenow`, and restart. HACS (custom repository) steps are in `integrations/home-assistant/README.md`.

**Check your download:** `shasum -a 256 -c SHA256SUMS.txt --ignore-missing`. The Android APK is signed with HazeNow's own key; certificate SHA-256 `e7:4c:5f:e9:b9:28:9b:08:5e:14:57:6d:99:0d:03:6e:3a:fd:c2:c7:d7:56:e0:1b:13:30:6c:1b:55:2d:58:d0`.

Free and open source (MIT). Data: NEA via data.gov.sg. HazeNow is not affiliated with NEA.
