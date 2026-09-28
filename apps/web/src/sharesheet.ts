/**
 * Share sheet (SPEC v1.6): a large preview of the auto-picked card, a swipeable row of the other eligible
 * cards, and one "Send" button (Web Share with image + text + link). Fallbacks: download, copy text, copy link.
 */
import {
  pickShareCard,
  shareCardContent,
  shareCardText,
  shareFileName,
  type Profile,
  type ShareCardId,
  type ShareContext,
  type Snapshot,
} from "hazenow";
import { ensureCardFonts, renderCard } from "./cards";
import { esc } from "./util";

export interface ShareSheetOptions {
  snap: Snapshot;
  profile: Profile[];
  ctx: ShareContext;
  /** Printed place name for file names. */
  placeName: string;
  /** Link for a card (carries ?area= / ?region= and ?s=card). */
  linkFor: (card: ShareCardId) => string;
  /** Force the first card shown (e.g. "clocks" from the chart). */
  initial?: ShareCardId;
  toast: (msg: string) => void;
}

const CARD_NAMES: Record<ShareCardId, string> = {
  now: "Now",
  clocks: "Two clocks",
  group: "For our group",
  clear: "All clear",
};

let dialog: HTMLDialogElement | null = null;
const urls: string[] = [];

function blobOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

export async function openShareSheet(o: ShareSheetOptions): Promise<void> {
  const pick = pickShareCard(o.snap, o.profile, o.snap.history, o.ctx);
  const order: ShareCardId[] = [pick.card, ...pick.alternates];
  let selected: ShareCardId = o.initial && order.includes(o.initial) ? o.initial : pick.card;
  const blobs = new Map<ShareCardId, Blob>();
  const opener = document.activeElement as HTMLElement | null;

  dialog?.remove();
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  dialog = document.createElement("dialog");
  dialog.className = "share-sheet";
  dialog.setAttribute("aria-labelledby", "share-h");
  dialog.innerHTML = `
  <div class="ss-head"><h2 id="share-h">Share</h2><button class="link" data-ss="close">Close</button></div>
  <div class="ss-preview"><div class="ss-frame" data-ss-frame><p class="ss-wait">Drawing the card…</p></div></div>
  <div class="ss-row" role="group" aria-label="Pick a card">
    ${order
      .map(
        (c) => `<button class="ss-thumb" data-ss-card="${c}" aria-pressed="${c === selected}"><span class="ss-thumb-img" data-ss-thumb="${c}"></span><span class="ss-thumb-label">${esc(CARD_NAMES[c])}${c === pick.card ? " · suggested" : ""}</span></button>`,
      )
      .join("")}
  </div>
  <p class="ss-text" data-ss-text></p>
  <button class="btn btn-solid ss-send" data-ss="send">Send</button>
  <div class="ss-fallbacks"><button class="btn-quiet" data-ss="download">Download image</button><button class="btn-quiet" data-ss="copy-text">Copy text</button><button class="btn-quiet" data-ss="copy-link">Copy link</button></div>
  <p class="ss-status" role="status" data-ss-status></p>
  <p class="fine">The picture shows the time, your area and NEA as the source. Nothing about you is attached.</p>`;
  document.body.append(dialog);

  const frame = dialog.querySelector<HTMLElement>("[data-ss-frame]")!;
  const statusEl = dialog.querySelector<HTMLElement>("[data-ss-status]")!;
  const toast = (m: string) => {
    statusEl.textContent = m;
    o.toast(m);
  };
  const textEl = dialog.querySelector<HTMLElement>("[data-ss-text]")!;
  const textFor = (c: ShareCardId) => shareCardText(c, o.snap, o.profile, o.ctx);

  const render = async (c: ShareCardId): Promise<Blob> => {
    const hit = blobs.get(c);
    if (hit) return hit;
    await ensureCardFonts();
    const canvas = renderCard(shareCardContent(c, o.snap, o.profile, o.ctx));
    const b = await blobOf(canvas);
    blobs.set(c, b);
    return b;
  };
  const img = (b: Blob, alt: string) => {
    const u = URL.createObjectURL(b);
    urls.push(u);
    return `<img src="${u}" alt="${esc(alt)}" width="1080" height="1350"/>`;
  };
  const show = async (c: ShareCardId) => {
    selected = c;
    textEl.textContent = textFor(c);
    dialog!.querySelectorAll<HTMLElement>("[data-ss-card]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ssCard === c)));
    const b = await render(c);
    if (selected !== c) return;
    frame.innerHTML = img(b, `${CARD_NAMES[c]} card: ${textFor(c)}`);
  };

  dialog.addEventListener("click", async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-ss],[data-ss-card]");
    if (!t) {
      if (e.target === dialog) dialog!.close(); // backdrop
      return;
    }
    if (t.dataset.ssCard) return void show(t.dataset.ssCard as ShareCardId);
    const blob = await render(selected);
    const name = shareFileName(o.placeName, o.snap.observedAt, selected);
    const text = textFor(selected);
    const url = o.linkFor(selected);
    switch (t.dataset.ss) {
      case "close":
        dialog!.close();
        break;
      case "send": {
        const file = new File([blob], name, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text, url, title: "HazeNow" });
            return;
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
          }
        }
        if (navigator.share) {
          try {
            await navigator.share({ text, url, title: "HazeNow" });
            return;
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
          }
        }
        download(blob, name);
        await copyText(`${text}\n${url}`, toast, "Image saved and text copied. Paste it with the picture.");
        break;
      }
      case "download":
        download(blob, name);
        toast("Image saved.");
        break;
      case "copy-text":
        await copyText(text, toast, "Text copied.");
        break;
      case "copy-link":
        await copyText(url, toast, "Link copied.");
        break;
    }
  });
  dialog.addEventListener("close", () => {
    dialog?.remove();
    dialog = null;
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    opener?.focus();
  });

  dialog.showModal();
  await show(selected);
  // Thumbnails after the main preview, so the first card appears fast.
  for (const c of order) {
    const slot = dialog?.querySelector<HTMLElement>(`[data-ss-thumb="${c}"]`);
    if (!slot) break;
    slot.innerHTML = img(await render(c), "");
  }
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function copyText(text: string, toast: (m: string) => void, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast("Couldn't copy. Select the text instead.");
  }
}
