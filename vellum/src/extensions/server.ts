import type { ServerExtension } from "../core/protocol.ts";
import { markdownServer } from "./markdown/server.ts";

export const serverExtensions: readonly ServerExtension[] = [markdownServer];
