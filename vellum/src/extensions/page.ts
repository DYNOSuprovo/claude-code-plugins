import type { PageExtension } from "../core/extension.ts";
import { htmlPage } from "./html/page.tsx";
import { imagePage } from "./image/page.tsx";
import { markdownPage } from "./markdown/page.tsx";

/** Every page extension, in match order; the page bundles them all. */
export const pageExtensions: readonly PageExtension[] = [markdownPage, htmlPage, imagePage];
