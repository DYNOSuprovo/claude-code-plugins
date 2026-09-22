import type { ElementRef } from "../../core/protocol.ts";

/** The contract across the sandbox: the page and the frame script both hold to it. */

export type PickBox = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

/**
 * `box` is in the frame's coordinates; the page adds the iframe's own rect. `vellum:switch` is
 * `C` pressed inside the mockup, whose keys never reach the page.
 */
export type FrameToPage =
  | {
      readonly type: "vellum:pick";
      readonly elements: readonly ElementRef[];
      readonly box: PickBox;
    }
  | { readonly type: "vellum:unpick" }
  | { readonly type: "vellum:holding"; readonly holding: boolean }
  | { readonly type: "vellum:switch" };

/** The page's tokens the frame's overlay draws with, resolved to sRGB: its shadow root reads none of the page's properties. */
export type FrameTheme = {
  readonly redline: string;
  readonly marker: string;
  readonly sheet: string;
  readonly ink: string;
  readonly outline: string;
};

/** A commented place: the element's selector, the text chosen in it and its context, which the mark boxes where the context fits best while the text is there. */
export type CommentedPlace = Pick<ElementRef, "selector" | "text" | "context">;

/** `vellum:leave` is the pointer leaving the iframe, which the frame's document never hears. */
export type PageToFrame =
  | { readonly type: "vellum:commenting"; readonly on: boolean }
  | { readonly type: "vellum:holding"; readonly holding: boolean }
  | { readonly type: "vellum:commented"; readonly places: readonly CommentedPlace[] }
  | { readonly type: "vellum:theme"; readonly theme: FrameTheme }
  | { readonly type: "vellum:clear" }
  | { readonly type: "vellum:leave" };
