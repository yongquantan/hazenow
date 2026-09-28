# DIY and off-the-shelf sensors: the "right here" answer

Research date 2026-09-28, during a haze episode. Prices are rough SGD street prices and move around;
verify before you buy.

NEA gives 5 regional hourly numbers. A sensor on your own balcony gives a reading every few
seconds for *your* air, with no publication delay. This is the only way to get true "right here,
right now". The catch: low-cost optical sensors need correction (see
[DATA_SOURCES.md § Correction](DATA_SOURCES.md#correction-factors-pms5003--humidity)), and
indoor sensors measure your room, not the outdoor haze.

---

## 1. Recommendation in one paragraph

- **Buy, don't build, unless you enjoy soldering.** The **AirGradient Open Air** (outdoor) or
  **AirGradient ONE** (indoor) is the best fit for HazeNow. It is open-source hardware, has a
  documented **local HTTP API** with mDNS discovery (`_airgradient._tcp`), applies the EPA
  correction on the device when asked (`pm02Compensated`), and it can also publish to the AirGradient
  public map. That map is the crowd layer we already use (see ARCHITECTURE_V2).
- **Build** an ESP32 + PMS5003 + SHT31 board running ESPHome if you want about S$60 and full control.
  Make it speak the same JSON as AirGradient, so our apps need only one integration.
- **Skip for v2:** IKEA VINDSTYRKA (Zigbee only, indoor), Xiaomi/Mi (cloud or encrypted BLE),
  IQAir/Kaiterra/uHoo (cloud APIs with keys).

---

## 2. DIY bill of materials (outdoor balcony node)

| # | Part | Why | Rough SGD | Where in SG |
|---|------|-----|-----------|-------------|
| 1 | ESP32 dev board (ESP32-C3/S3 "SuperMini" or DevKitC) | Wi-Fi, runs ESPHome/Arduino | 6–15 | Shopee/Lazada, AliExpress, Sim Lim Tower (Continental Electronics, Hwa Yang) |
| 2a | **Plantower PMS5003** (or PMS5003T with built-in T/RH) | Same sensor as PurpleAir/AirGradient, so the EPA correction applies directly | 22–35 | Shopee/AliExpress. Beware fakes and old stock. Buy from a seller with reviews |
| 2b | *or* **Sensirion SPS30** | Better long-term stability, lower humidity sensitivity, I²C + UART, 8-yr lifetime claim, self-cleaning | 55–75 | Mouser.sg, element14 SG, Digi-Key (free shipping over the threshold) |
| 3 | SHT31/SHT40 (or BME280) T/RH breakout | The correction needs RH. SHT4x is more accurate than BME280 | 5–12 | Shopee, Sim Lim |
| 4 | 5V 1A USB supply + cable | PMS5003 fan draws ~100 mA | 5–10 | anywhere |
| 5 | Weather shield: 2 stacked PVC pipe elbows, or a small louvered "Stevenson" radiation shield | Keep rain and direct sun off. Leave air free to flow. **Never** seal the sensor in a box | 8–20 | Hardware shop / Shopee "radiation shield" |
| 6 | Jumper wires, PMS5003 adapter board (1.25 mm 8-pin to 2.54 mm) | The PMS5003 connector is fiddly | 3–5 | Shopee |
| | **Total** | | **~S$50–80 (PMS5003) / ~S$85–120 (SPS30)** | |

### Firmware choice

1. **ESPHome** (recommended). It has native `pmsx003`, `sps30`, `sht3xd`/`sht4x` components, a
   `web_server` that exposes REST (`GET /sensor/pm_2_5`), and Home Assistant auto-discovery. Add a
   `template` sensor that applies the EPA formula on the device.
2. **AirGradient's Arduino firmware** (`github.com/airgradienthq/arduino`, `examples/DiyPro*`) gives
   you the **exact AirGradient local API** for free (see §4), and you can upload to their map.
3. **Sensor.Community airRohr** firmware (supports SDS011/PMS/SPS30). It publishes to
   Sensor.Community and exposes `http://<ip>/data.json`. Singapore currently has **0** such sensors
   (verified: `data.sensor.community/airrohr/v1/filter/area=1.3521,103.8198,40` returned `[]`), so a
   few HazeNow users would put SG on that map.

### Minimal ESPHome sketch (PMS5003 + SHT31, with EPA correction)

```yaml
esphome: { name: hazenow-balcony }
esp32: { board: esp32-c3-devkitm-1 }
wifi: { ssid: !secret ssid, password: !secret pw }
web_server: { port: 80 }           # GET http://hazenow-balcony.local/sensor/pm25_corrected
api:                                # Home Assistant
uart: { rx_pin: GPIO20, tx_pin: GPIO21, baud_rate: 9600 }
i2c:  { sda: GPIO8, scl: GPIO9 }
sensor:
  - platform: sht3xd
    temperature: { name: "Temperature" }
    humidity:    { name: "Humidity", id: rh }
  - platform: pmsx003
    type: PMSX003
    pm_2_5_std: { name: "PM2.5 CF1", id: pm25_cf1 }   # EPA formula expects CF=1 values
    pm_2_5:     { name: "PM2.5 ATM" }
    update_interval: 120s        # spin the fan down between reads; extends laser/fan life
  - platform: template
    name: "PM2.5 corrected"
    id: pm25_corrected
    unit_of_measurement: "µg/m³"
    update_interval: 120s
    lambda: |-
      float pa = id(pm25_cf1).state, h = id(rh).state;
      if (isnan(pa) || isnan(h)) return NAN;
      float v;
      if (pa < 30)       v = 0.524f*pa - 0.0862f*h + 5.75f;
      else if (pa < 50)  { float w = pa/20 - 1.5f; v = (0.786f*w + 0.524f*(1-w))*pa - 0.0862f*h + 5.75f; }
      else if (pa < 210) v = 0.786f*pa - 0.0862f*h + 5.75f;
      else if (pa < 260) { float w = pa/50 - 4.2f;
                           v = (0.69f*w + 0.786f*(1-w))*pa - 0.0862f*h*(1-w) + 2.966f*w + 5.75f*(1-w) + 8.84e-4f*pa*pa*w; }
      else               v = 2.966f + 0.69f*pa + 8.84e-4f*pa*pa;
      return v < 0 ? 0 : v;
```

### Siting rules (these matter more than the sensor)

- Outdoor, shaded, at least 1 m from walls and AC condensers, away from kitchen exhausts, BBQ pits,
  smokers and the car park. On an HDB corridor or balcony, mount it on the railing, not against the wall.
- Leave airflow unobstructed. Point the inlet down or sideways, never up into rain.
- Keep the RH sensor **outside** the warm electronics enclosure. Otherwise it reads 10–25 %RH low.
  AirGradient's Open Air shows exactly this: the public API reports RH 51–64 % on a ~28–31 °C
  Singapore afternoon, and its firmware applies `rh*1.259+7.34` to compensate.
- Run a new unit next to an NEA-reported period for 2–3 days (or next to another
  corrected sensor) before trusting it. HazeNow v2 does this automatically (ARCHITECTURE_V2 §3).
- Plantower lasers degrade. Expect drift after 1–3 years of 24/7 use, sooner in haze. SPS30 lasts longer.

---

## 3. Off-the-shelf devices: can HazeNow read them?

| Device | Measures | SGD approx | Indoor/outdoor | Local data path | Practical for HazeNow? |
|--------|----------|-----------|----------------|-----------------|------------------------|
| **AirGradient Open Air** (O-1PST, 2× PMS5003T) | PM1/2.5/10, T, RH, (CO₂/TVOC/NOx on some models) | ~S$270–300 incl. shipping (US$~200 list) | **Outdoor** | `http://airgradient_<serial>.local/measures/current` (JSON), mDNS `_airgradient._tcp`, Prometheus `/metrics`, MQTT, plus the public map API | **Yes, best option.** Native apps: LAN plus public map. Web: map via proxy |
| **AirGradient ONE** (I-9PSL) | PM, CO₂, TVOC, NOx, T, RH | ~S$200–320 (kit vs assembled) | Indoor | Same local API | Yes, labelled "indoor" |
| **PurpleAir Zen / Classic / Flex** | PM (2× PMS5003/6003), T, RH, P | ~S$350–450 | Outdoor | `http://<ip>/json` (fields `pm2_5_cf_1`, `pm2_5_cf_1_b`, `current_humidity`, `pm2.5_aqi`, ...) with no key | Yes (LAN). Owners also get free API access to their own sensor |
| **DIY ESPHome** (above) | PM, T, RH | ~S$50–120 | Either | REST `/sensor/<id>`, SSE `/events`, HA API | Yes. Or run AirGradient firmware for a uniform API |
| **Sensor.Community airRohr** | PM (SDS011/SPS30), T, RH | ~S$60 | Outdoor | `http://<ip>/data.json` | Yes (LAN) |
| **Awair Element** | PM2.5, CO₂, VOC, T, RH | ~S$250–300 | Indoor | "Local API" toggle in the app → `http://<ip>/air-data/latest` (`pm25`) | Possible. Indoor only |
| **IKEA VINDSTYRKA** (Sensirion SEN54 inside) | PM2.5, TVOC index, T, RH | **S$60** (Plus ~S$79) | Indoor | **Zigbee only.** Needs a DIRIGERA hub (unofficial local REST with token) or HA ZHA/Zigbee2MQTT | Only through Home Assistant. Not direct from a phone |
| **Xiaomi Mi / Mijia PM2.5 monitor, Mi Air Purifier** | PM2.5 (purifier = indoor, recirculated) | S$40–300 | Indoor | Purifiers: miIO LAN protocol, needs a device token extracted from the Mi cloud. BLE sensors: MiBeacon, encrypted with a per-device bindkey | Not practical for normal users. HA users only |
| **Qingping Air Monitor (Lite/2)** | PM2.5/10, CO₂, T, RH | S$100–200 | Indoor | HomeKit (Lite), Qingping cloud/MQTT via developer config | HomeKit read on Apple is possible. Otherwise no |
| **IQAir AirVisual Pro/Outdoor** | PM2.5, CO₂ | S$400–900 | Both | Samba/SMB share of the device, plus a cloud API (key) | Awkward. Cloud API with a per-user key only |
| **Kaiterra Laser Egg, uHoo, Temtop** | PM2.5 etc. | S$100–400 | Indoor | Cloud APIs (keys, some paid) | No |

### Integration constraints by platform

- **Web/PWA (https):** cannot fetch `http://*.local` or LAN IPs. Browsers block this as mixed content
  and through Private Network Access. The AirGradient local server also sends **no CORS headers**
  (checked in firmware: `examples/OneOpenAir/LocalServer.cpp` calls `server.send(...)` with no
  `Access-Control-*`). The web app can only show a personal sensor through the public
  AirGradient/PurpleAir cloud, with a proxy (see ARCHITECTURE_V2 §5).
- **iOS/macOS:** allowed. Needs `NSLocalNetworkUsageDescription` and
  `NSBonjourServices = ["_airgradient._tcp", "_http._tcp"]` in Info.plist, then NWBrowser for
  discovery and URLSession to `http://<host>/measures/current`. ATS needs
  `NSAllowsLocalNetworking = true`. Widgets cannot browse Bonjour, so the host app caches the last
  reading in the App Group.
- **Android:** `NsdManager` for `_airgradient._tcp`. Add a cleartext exception for local hosts in
  `network_security_config.xml`.
- **Home Assistant / SwiftBar / Raycast:** trivial. HA already has an AirGradient integration.
- **BLE:** none of the practical devices exposes a clean, unencrypted PM2.5 BLE characteristic. We
  deliberately skip BLE in v2.

### AirGradient local API: fields HazeNow uses

Source: `github.com/airgradienthq/arduino/docs/local-server.md` (firmware ≥ 3.0.10; `pm02Compensated` ≥ 3.1.4).

```jsonc
GET http://airgradient_<serial>.local/measures/current
{
  "serialno": "ecda3b1eaaaf", "model": "O-1PST", "firmware": "3.7.0",
  "pm02": 7,                 // PM2.5 µg/m³, "atmospheric environment" (raw, uncorrected)
  "pm02Standard": 7,         // PM2.5 CF=1 ("standard particle"): the EPA formula's intended input
  "pm02Compensated": 6.1,    // on-device correction per /config corrections.pm02.correctionAlgorithm (e.g. "epa_2021")
  "pm003Count": 442,
  "atmp": 25.87, "atmpCompensated": 24.47,
  "rhum": 43,    "rhumCompensated": 49,    // compensation only meaningful on Open Air (outdoor)
  "boot": 6, "wifi": -46
  // Open Air dual-sensor models may also include "channels": {"1": {...}, "2": {...}}
}
```

HazeNow rule: use `pm02Compensated` if present. Otherwise apply the EPA formula to `pm02Standard`
(falling back to `pm02`) with `rhumCompensated ?? rhum`. Treat a model starting with `I-` as
**indoor**. Check `GET /config` → `corrections.pm02.correctionAlgorithm`. If it is `"none"`,
compensated equals raw.
