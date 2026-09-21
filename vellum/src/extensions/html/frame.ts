import { dragRange, isSwitchKey, keyPressOf, toggled } from "../../core/page/selection.ts";
import type { ElementRef } from "../../core/protocol.ts";
import type { FrameToPage, PageToFrame } from "./messages.ts";
import type { Step } from "./pick.ts";
import { labelOf, selectorOf, targetIndex } from "./pick.ts";

/**
 * Injected into every HTML file the server serves, so it runs inside the sandboxed mockup:
 * it owns hovering and selection there, and reports the chosen elements and the `C` key to the
 * page.
 */

const TEXT_LIMIT = 120;

/** The colours are the page's tokens, posted resolved with `vellum:theme` and set on the layer. */
const STYLE = `
.box { position: absolute; box-sizing: border-box; }
.wash { background: color-mix(in srgb, var(--redline) 10%, transparent); }
.adding { border: 2px dashed var(--redline); }
.chosen { border: 2px solid var(--redline); background: color-mix(in srgb, var(--redline) 6%, transparent); }
.comment { border: 2px solid color-mix(in srgb, var(--marker) 70%, var(--ink)); background: color-mix(in srgb, var(--marker) 25%, transparent); }
.label { position: absolute; left: -2px; top: -20px; padding: 3px 6px; border-radius: 3px;
  font: 600 11px/1 ui-monospace, Menlo, monospace; background: var(--redline); color: var(--sheet); white-space: nowrap; }
`;

/** The element a comment names, and what of it was chosen: all of it on a click, the text on a drag. */
type Pick = { readonly element: Element; readonly range: Range; readonly text: string };

let commenting = false;

let chosen: readonly Pick[] = [];

let hovered: Element | null = null;

let holding = false;

let commented: readonly string[] = [];

// The click that ends a drag, which picks nothing whether the drag made a place or not.
let swallow = false;

const layer = document.createElement("div");

function mount(): void {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  shadow.append(style, layer);
  document.documentElement.append(host);
}

function post(message: FrameToPage): void {
  window.parent.postMessage(message, "*");
}

function chainOf(element: Element): readonly Element[] {
  const chain: Element[] = [];

  for (let at: Element | null = element; at !== null; at = at.parentElement) chain.push(at);

  return chain;
}

function targetFrom(from: EventTarget | null): Element | null {
  if (!(from instanceof Element)) return null;
  const chain = chainOf(from);
  const index = targetIndex(chain.map((element) => element.tagName.toLowerCase()));

  return index === null ? null : (chain[index] ?? null);
}

function stepOf(element: Element): Step {
  const siblings = [...(element.parentElement?.children ?? [])].filter(
    (other) => other.tagName === element.tagName,
  );

  return {
    tag: element.tagName.toLowerCase(),
    id: element.id === "" ? null : element.id,
    classes: [...element.classList],
    nthOfType: siblings.indexOf(element) + 1,
    sameTagSiblings: siblings.length,
  };
}

function quoted(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim().slice(0, TEXT_LIMIT);
}

function refOf(pick: Pick): ElementRef {
  const steps = chainOf(pick.element)
    .filter((one) => one !== document.body && one !== document.documentElement)
    .toReversed()
    .map((one) => stepOf(one));

  return { selector: selectorOf(steps), text: pick.text, label: labelOf(stepOf(pick.element)) };
}

/** A click picks the whole element: its range holds any drag inside it, so the two overlap. */
function clickPick(element: Element): Pick {
  const range = document.createRange();
  range.selectNode(element);
  const shown = element instanceof HTMLElement ? element.innerText : (element.textContent ?? "");

  return { element, range, text: quoted(shown) };
}

function boxFor(of: Element | Range, kind: string, label: string | null): HTMLElement {
  const rect = of.getBoundingClientRect();
  const box = document.createElement("div");
  box.className = `box ${kind}`;
  box.style.cssText = `top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px`;

  if (label !== null) {
    const tag = document.createElement("span");
    tag.className = "label";
    tag.textContent = label;
    box.append(tag);
  }

  return box;
}

/** A selector crosses `postMessage` and may no longer match the document; the overlay survives it. */
function commentedElements(): readonly Element[] {
  return commented.flatMap((selector) => {
    try {
      return [...document.querySelectorAll(selector)];
    } catch {
      return [];
    }
  });
}

function draw(): void {
  const adding = holding && chosen.length > 0;

  layer.replaceChildren(
    ...commentedElements().map((element) => boxFor(element, "comment", null)),
    ...chosen.map((pick) => boxFor(pick.range, "chosen", null)),
    ...(hovered === null
      ? []
      : [boxFor(hovered, adding ? "wash adding" : "wash", labelOf(stepOf(hovered)))]),
  );
}

function sendPick(): void {
  const [first, ...rest] = chosen.map((pick) => refOf(pick));
  const last = chosen.at(-1);

  if (first === undefined || last === undefined) {
    post({ type: "vellum:unpick" });

    return;
  }

  const rect = last.range.getBoundingClientRect();

  post({
    type: "vellum:pick",
    elements: [first, ...rest],
    box: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
  });
}

function setHolding(next: boolean): void {
  if (next === holding) return;
  holding = next;
  draw();
}

/** The frame's own Ctrl state changed: the page mirrors it, so its Composer lets clicks through or not. */
function hold(next: boolean): void {
  if (next === holding) return;
  setHolding(next);
  post({ type: "vellum:holding", holding: next });
}

function onKey(event: KeyboardEvent): void {
  hold(event.ctrlKey || event.metaKey);
}

function choose(one: Pick, event: MouseEvent): void {
  chosen = (event.ctrlKey || event.metaKey) && chosen.length > 0 ? toggled(chosen, one) : [one];
  sendPick();
  draw();
}

function onMove(event: PointerEvent): void {
  const target = commenting && event.buttons === 0 ? targetFrom(event.target) : null;

  if (target === hovered) return;
  hovered = target;
  draw();
}

/** A drag picks the innermost element that holds the whole selection, with the dragged text. */
function onMouseUp(event: MouseEvent): void {
  const range = commenting ? dragRange(event) : null;

  if (range === null) return;
  swallow = true;
  const ancestor = range.commonAncestorContainer;
  // A phrase inside one text node has that node as its ancestor, and `targetFrom` takes elements.
  const element = targetFrom(ancestor instanceof Element ? ancestor : ancestor.parentElement);
  const text = quoted(range.toString());

  if (element === null || text === "") return;
  document.getSelection()?.removeAllRanges();
  choose({ element, range, text }, event);
}

/**
 * The click that ends a drag is stopped too, then swallowed: a drag that ends on a mockup's
 * button never runs it.
 */
function onClick(event: MouseEvent): void {
  if (!commenting) return;
  event.preventDefault();
  event.stopPropagation();

  if (swallow) {
    swallow = false;

    return;
  }

  const target = targetFrom(event.target);

  if (target !== null) choose(clickPick(target), event);
}

/**
 * `C` inside the mockup flips the page's switch. While on, the key stops here, before every
 * listener of the mockup's document; a `window` listener that the mockup adds before this script,
 * which the server appends at the end of `body`, still hears it.
 */
function onSwitchKey(event: KeyboardEvent): void {
  if (!isSwitchKey(keyPressOf(event))) return;
  post({ type: "vellum:switch" });

  if (commenting) event.stopImmediatePropagation();
}

function onMessage(event: MessageEvent): void {
  if (event.source !== window.parent) return;
  // SAFETY: the page's own `PageToFrame`, posted across the sandbox; an unknown type does nothing.
  const message = event.data as PageToFrame;

  if (message.type === "vellum:commenting") {
    commenting = message.on;

    if (!commenting) {
      chosen = [];
      hovered = null;
    }
  }

  if (message.type === "vellum:holding") setHolding(message.holding);

  if (message.type === "vellum:comments") commented = message.selectors;

  if (message.type === "vellum:theme") {
    for (const [name, value] of Object.entries(message.theme)) {
      layer.style.setProperty(`--${name}`, value);
    }
  }

  if (message.type === "vellum:clear") chosen = [];
  draw();
}

mount();

document.addEventListener("pointermove", onMove, true);

document.addEventListener("pointerleave", () => {
  hovered = null;
  draw();
});

// A drag that no click follows would otherwise swallow the next real click.
document.addEventListener(
  "pointerdown",
  () => {
    swallow = false;
  },
  true,
);

document.addEventListener("mouseup", onMouseUp, true);

document.addEventListener("click", onClick, true);

window.addEventListener("keydown", onSwitchKey, true);

document.addEventListener("keydown", onKey);

document.addEventListener("keyup", onKey);

// The keyup never arrives once the focus left: the page must hear the release from here.
window.addEventListener("blur", () => hold(false));

window.addEventListener("scroll", draw, true);

// The page places its composer from the box of a pick: a reflow moves the box, so it is sent again.
window.addEventListener("resize", () => {
  draw();

  if (chosen.length > 0) sendPick();
});

window.addEventListener("message", onMessage);
