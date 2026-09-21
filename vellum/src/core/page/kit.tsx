import type { ComponentChildren, JSX } from "preact";

/**
 * The page's components, each one a class of `style.css` spelled in one place: what every
 * button, badge, chip, tag, banner, popover, chevron, handle and switch of the core and of the
 * extensions is drawn with.
 */

export type ButtonProps = Omit<
  JSX.IntrinsicElements["button"],
  "size" | "class" | "className" | "ref"
> & {
  readonly variant?: "default" | "send" | "grill";
  readonly size?: "md" | "sm";
  readonly class?: string | undefined;
};

function classes(...names: readonly (string | false | undefined)[]): string {
  return names.filter((name) => name !== false && name !== undefined && name !== "").join(" ");
}

export function Button(props: ButtonProps): JSX.Element {
  const { variant = "default", size = "md", class: extra, children, ...rest } = props;

  return (
    <button
      type="button"
      {...rest}
      class={classes("btn", variant !== "default" && variant, size === "sm" && "sm", extra)}
    >
      {children}
    </button>
  );
}

export function Badge(props: { readonly children: ComponentChildren }): JSX.Element {
  return <span class="badge">{props.children}</span>;
}

export type ChipProps = Omit<JSX.IntrinsicElements["button"], "class" | "className" | "ref"> & {
  readonly tone?: "default" | "del";
};

export function Chip(props: ChipProps): JSX.Element {
  const { tone = "default", children, ...rest } = props;

  return (
    <button type="button" {...rest} class={classes("chip", tone === "del" && "del")}>
      {children}
    </button>
  );
}

/** A chip that shows a label and takes no click: `Chip` is a button. */
export function Tag(props: { readonly children: ComponentChildren }): JSX.Element {
  return <span class="chip">{props.children}</span>;
}

export type BannerKind = "sent" | "ok" | "err";

export function Banner(props: {
  readonly kind: BannerKind;
  readonly children: ComponentChildren;
}): JSX.Element {
  return (
    <div class={`banner ${props.kind}`} role="status">
      {props.children}
    </div>
  );
}

export function Popover(props: {
  /** What the dialog is, for assistive technology. */
  readonly label: string;
  readonly top?: number;
  readonly left?: number;
  /** While a target is being added, the popover fades and lets the pointer through. */
  readonly through?: boolean;
  readonly class?: string | undefined;
  readonly children: ComponentChildren;
}): JSX.Element {
  const style: JSX.CSSProperties = {};

  if (props.top !== undefined) style.top = `${props.top}px`;

  if (props.left !== undefined) style.left = `${props.left}px`;

  return (
    <div
      class={classes("popover", props.through === true && "through", props.class)}
      role="dialog"
      aria-label={props.label}
      style={style}
    >
      {props.children}
    </div>
  );
}

/** A side panel's fold control, on the panel's edge: the panel's name above a chevron that points where the panel goes. */
export function Handle(props: {
  /** Which of the page's two panels: "left" follows `--rail-width`, "right" `--comments-width`. */
  readonly side: "left" | "right";
  readonly open: boolean;
  /** The id of the panel it folds. */
  readonly controls: string;
  /** The panel's name, written on the handle. */
  readonly name: string;
  /** The accessible name, when it says more than `name`: the comments' count. */
  readonly label?: string;
  readonly onToggle: () => void;
  /** What a folded panel still shows: the comments' badge. */
  readonly children?: ComponentChildren;
}): JSX.Element {
  return (
    <button
      type="button"
      class={`handle ${props.side}`}
      aria-controls={props.controls}
      aria-expanded={props.open}
      aria-label={props.label ?? props.name}
      onClick={props.onToggle}
    >
      {props.children}
      <span class="name">{props.name}</span>
      <Chevron />
    </button>
  );
}

/** The page's one icon: `currentColor`, the size of the text beside it unless its holder sets one, rotated to point. */
export function Chevron(): JSX.Element {
  return (
    <svg class="chevron" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M3.5 1.5 L7 5 L3.5 8.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** A state, on or off, where a `Button` is an action: its label names what it turns on. */
export function Switch(props: {
  readonly checked: boolean;
  readonly onChange: () => void;
  readonly children: ComponentChildren;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      class="switch"
      onClick={props.onChange}
    >
      <span class="track" />
      {props.children}
    </button>
  );
}

let brush: CanvasRenderingContext2D | null = null;

/**
 * A token resolved to sRGB, for every consumer that parses neither `color-mix()` nor `oklab()`:
 * `getPropertyValue` returns the `color-mix()` expression as written, and once computed on an
 * element Chrome serializes `oklab(…)`. Mermaid and the sandboxed frame refuse both; the pixel of
 * a 1×1 canvas is the one path that yields sRGB whatever the colour space.
 */
export function srgb(token: `--${string}`): string {
  brush ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });

  if (brush === null) throw new Error(`no 2d canvas context to resolve ${token} with`);
  const probe = document.createElement("div");
  probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(token).trim();

  if (probe.style.color === "") throw new Error(`${token} is not a colour token of :root`);
  document.body.append(probe);
  brush.fillStyle = getComputedStyle(probe).color;
  probe.remove();
  brush.fillRect(0, 0, 1, 1);
  const [r, g, b] = brush.getImageData(0, 0, 1, 1).data;

  return `rgb(${r}, ${g}, ${b})`;
}
