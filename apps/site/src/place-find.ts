/**
 * The hero card's "Your area" field: a type-ahead combobox (ARIA 1.2 combobox + listbox) over the bundled place list.
 * Typing never touches the network (SPEC v1.4): the options come from packages/core, on the device.
 */

export interface FindOption {
  /** Place value, as main.ts encodes it ("island", "r:west", "a:Tampines", "c:TH:bangkok"). */
  value: string;
  label: string;
  /** Group heading shown before the first option of each group. */
  group: string;
  /** Small second line, e.g. the alias that matched. */
  sub?: string;
}

export interface Find {
  /** Show a place in the field without opening the list. */
  set(value: string, label: string): void;
  /** Re-run the search (after more places have loaded). */
  refresh(): void;
  /** Move focus to the field and open the list. */
  focus(): void;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function initFind(
  input: HTMLInputElement,
  list: HTMLUListElement,
  options: (query: string) => FindOption[],
  onPick: (value: string) => void,
): Find {
  let current = { value: input.dataset.value ?? "", label: input.value };
  let shown: FindOption[] = [];
  let active = -1;
  let open = false;
  let typed = false;

  const optId = (i: number) => `place-opt-${i}`;

  function draw() {
    const q = typed ? input.value : "";
    shown = options(q).slice(0, q ? 12 : 200);
    if (!shown.length) {
      list.innerHTML = `<li class="find-empty" role="presentation">No match. Try a town like Tampines, or a city like Bangkok.</li>`;
    } else {
      let group = "";
      list.innerHTML = shown
        .map((o, i) => {
          const head = o.group !== group ? `<li class="find-group" role="presentation">${esc(o.group)}</li>` : "";
          group = o.group;
          const sel = o.value === current.value;
          return `${head}<li class="find-opt" role="option" id="${optId(i)}" data-i="${i}" aria-selected="${i === active}"${sel ? ' data-current=""' : ""}>${esc(o.label)}${
            o.sub ? `<span>${esc(o.sub)}</span>` : ""
          }</li>`;
        })
        .join("");
    }
    input.setAttribute("aria-activedescendant", active >= 0 && shown[active] ? optId(active) : "");
  }

  function show() {
    if (!open) {
      open = true;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    draw();
  }

  function hide(restore: boolean) {
    open = false;
    typed = false;
    active = -1;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    if (restore) input.value = current.label;
  }

  function pick(o: FindOption | undefined, byKey = false) {
    if (!o) return;
    current = { value: o.value, label: o.label };
    input.value = o.label;
    input.dataset.value = o.value;
    hide(false);
    // A tap closes the phone keyboard so the new reading is in view; Enter keeps focus, ready for another search.
    if (byKey) input.select();
    else input.blur();
    onPick(o.value);
  }

  function moveTo(i: number) {
    if (!shown.length) return;
    active = (i + shown.length) % shown.length;
    draw();
    list.querySelector(`#${optId(active)}`)?.scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("focus", () => {
    input.select();
    show();
  });
  // Already focused with the list closed (just after a pick): a tap starts a fresh search, so select the text
  // instead of letting the tap place the caret.
  input.addEventListener("mousedown", (e) => {
    if (open || document.activeElement !== input) return;
    e.preventDefault();
    input.select();
    show();
  });
  input.addEventListener("click", () => {
    if (open) return;
    input.select();
    show();
  });
  input.addEventListener("input", () => {
    // Typing straight after the current place's name (the caret was left at its end) starts a new search.
    if (!typed && input.value.length > current.label.length && input.value.startsWith(current.label)) {
      input.value = input.value.slice(current.label.length);
    }
    typed = true;
    active = input.value.trim() ? 0 : -1;
    show();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) show();
      moveTo(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) show();
      moveTo(active - 1);
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      pick(shown[active >= 0 ? active : 0], true);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        hide(true);
      }
    } else if (e.key === "Tab") {
      if (open) hide(true);
    }
  });
  input.addEventListener("blur", () => {
    // Let a tap on an option land first.
    setTimeout(() => {
      if (document.activeElement !== input && open) hide(true);
    }, 150);
  });
  // pointerdown + preventDefault keeps focus in the field, so the list doesn't close before the tap.
  list.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest(".find-opt")) e.preventDefault();
  });
  list.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>(".find-opt");
    if (li) pick(shown[Number(li.dataset.i)]);
  });

  return {
    set(value, label) {
      current = { value, label };
      input.dataset.value = value;
      if (!open && input.value !== label) input.value = label;
    },
    refresh() {
      if (open) draw();
    },
    focus() {
      input.focus();
    },
  };
}
