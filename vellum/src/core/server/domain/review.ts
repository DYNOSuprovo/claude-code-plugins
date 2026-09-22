import type { Annotation } from "./feedback.ts";
import { formatNotes, retargetAnnotations } from "./feedback.ts";
import type { FinalDir, ParseResult, ProjectPath, Slug, Version, WipDir } from "./paths.ts";
import { parseVersion } from "./paths.ts";
import { slugFromFileName, slugFromTitle } from "./slug.ts";
import type { PlanWorkspace } from "./workspace.ts";
import {
  draftFeedbackFile,
  feedbackFile,
  notesFile,
  PLAN_FILE,
  projectPath,
  versionFile,
} from "./workspace.ts";

/**
 * The decisions of a review, as pure functions of plain values. The application reads the
 * directory, calls one of these, then applies what it says: a file to write, a memory to
 * keep. Nothing here touches the disk, so every case is a plain call in a test.
 */

/**
 * The reviewer's own text of the plan, with the version it edits: a bare text could not say
 * that Claude recorded a newer version since, and would overwrite it.
 */
export type Edit = { readonly version: Version; readonly text: string };

/** What the reviewer typed and has not submitted: visible on screen, so never thrown in silence. */
export type Typed = {
  readonly general: string;
  /** The composer open on `doc`: its text, given back to the next composer on the same document. */
  readonly composer: { readonly doc: ProjectPath; readonly body: string } | null;
  /** By transcript path: the answers by question id, and the note. */
  readonly grill: Readonly<
    Record<string, { readonly answers: Readonly<Record<string, string>>; readonly note: string }>
  >;
  /** The open editor's typing, with the version edited; given back to the next Edit on that version. */
  readonly editor: { readonly version: Version; readonly text: string } | null;
};

export const EMPTY_TYPED: Typed = { general: "", composer: null, grill: {}, editor: null };

/**
 * The page's unsent work: the comments, the reviewer's edit with the version it edits, and what
 * is typed. The approval note alone stays out of it: its popover closes on success only.
 */
export type Draft = {
  readonly annotations: readonly Annotation[];
  readonly edit: Edit | null;
  readonly typed: Typed;
};

function typedIsEmpty(typed: Typed): boolean {
  return (
    typed.general === "" &&
    typed.composer === null &&
    typed.editor === null &&
    Object.values(typed.grill).every(
      (entry) => entry.note === "" && Object.values(entry.answers).every((text) => text === ""),
    )
  );
}

/** A draft with nothing in it is no draft: the server removes the file instead of writing it. */
export function draftIsEmpty(draft: Draft): boolean {
  return draft.annotations.length === 0 && draft.edit === null && typedIsEmpty(draft.typed);
}

/** `edit` is `null` when the reviewer changed nothing, `notes` empty when they left none. */
export type Decision =
  | { readonly kind: "approve"; readonly edit: Edit | null; readonly notes: string }
  | {
      readonly kind: "feedback";
      readonly edit: Edit | null;
      readonly annotations: readonly Annotation[];
    };

/**
 * What a reload makes of the page's unsent edit. `landed`: the loaded version is the edit
 * itself, written before a rename or a later write failed. `stale`: another version arrived.
 */
export function editOnLoad(
  edit: Edit,
  loaded: { readonly version: Version; readonly text: string } | null,
): "pending" | "landed" | "stale" {
  if (loaded?.version === edit.version) return "pending";

  return loaded?.version === edit.version + 1 && loaded.text === edit.text ? "landed" : "stale";
}

function nextVersion(after: Version | null): Version {
  const next = parseVersion((after ?? 0) + 1);

  if (!next.ok) throw new Error(next.error);

  return next.value;
}

function versionPath(dir: WipDir | FinalDir, version: Version): ProjectPath {
  return projectPath(`${dir}${versionFile(version)}`);
}

/**
 * The comments of an edit that landed: written on `vN.md` with the edit's lines, they are
 * `vN+1.md`'s. Read from the edit's version, not from what the page showed before: a first load
 * has no before.
 */
export function landedAnnotations(
  annotations: readonly Annotation[],
  dir: WipDir | FinalDir,
  edit: Edit,
): readonly Annotation[] {
  const landed = versionPath(dir, nextVersion(edit.version));

  return retargetAnnotations(annotations, versionPath(dir, edit.version), landed);
}

export type Gated =
  | { readonly kind: "kept"; readonly version: Version }
  | { readonly kind: "recorded"; readonly version: Version };

/**
 * Which version a submitted plan is: the one under review keeps its number when the text is
 * the same. After a feedback the submission is a new version even with the same text: the
 * page stays locked until one arrives, and an artifact revised alone must reopen the review.
 */
export function gateVersion(
  workspace: PlanWorkspace,
  latestText: string | null,
  plan: string,
): Gated {
  const latest = workspace.kind === "drafting" ? null : workspace.version;
  const kept = latest !== null && workspace.kind !== "changesRequested" && latestText === plan;

  return latest !== null && kept
    ? { kind: "kept", version: latest }
    : { kind: "recorded", version: nextVersion(latest) };
}

type Written = { readonly path: ProjectPath; readonly text: string };

export type Decided =
  | { readonly kind: "refused" }
  | {
      readonly kind: "approve";
      readonly version: Version;
      readonly edit: Written | null;
      /** `null` writes nothing, so a retry keeps the notes file the first attempt wrote. */
      readonly notes: Written | null;
    }
  | {
      readonly kind: "feedback";
      readonly version: Version;
      readonly edit: Written | null;
      readonly path: ProjectPath;
      readonly editedFrom: Version | null;
      /** The decision's annotations, the plan's retargeted to `vN+1.md` when `edit` is not `null`. */
      readonly annotations: readonly Annotation[];
    }
  | { readonly kind: "draftFeedback"; readonly path: ProjectPath; readonly batch: number };

/**
 * A plan is approved under review and nowhere else. A feedback is taken there too, and while
 * drafting, where it opens the next batch: the reviewer speaks before the first version.
 * The reviewer's edit is the next version, and the decision applies to it: `vN.md` stays what
 * Claude submitted. An edit equal to the version's text is no edit, no version exists to edit
 * while drafting, and an edit of another version than the one under review is refused.
 * An approval's notes file says the plan was edited, then what the reviewer noted.
 */
export function decideOn(
  workspace: PlanWorkspace,
  latestText: string | null,
  decision: Decision,
): Decided {
  if (workspace.kind === "drafting" && decision.kind === "feedback" && decision.edit === null) {
    const batch = workspace.batches + 1;

    return {
      kind: "draftFeedback",
      path: projectPath(`${workspace.dir}${draftFeedbackFile(batch)}`),
      batch,
    };
  }

  if (workspace.kind !== "inReview") return { kind: "refused" };
  const { dir, version: reviewed } = workspace;

  if (decision.edit !== null && decision.edit.version !== reviewed) return { kind: "refused" };
  const edited = decision.edit?.text === latestText ? null : (decision.edit?.text ?? null);
  const version = edited === null ? reviewed : nextVersion(reviewed);
  const edit = edited === null ? null : { path: versionPath(dir, version), text: edited };
  const editedFrom = edit === null ? null : reviewed;

  if (decision.kind === "approve") {
    const text = formatNotes(version, editedFrom, decision.notes);
    const path = projectPath(`${dir}${notesFile(version)}`);

    return { kind: "approve", version, edit, notes: text === null ? null : { path, text } };
  }

  return {
    kind: "feedback",
    version,
    edit,
    path: projectPath(`${dir}${feedbackFile(version)}`),
    editedFrom,
    annotations: retargetAnnotations(
      decision.annotations,
      versionPath(dir, reviewed),
      versionPath(dir, version),
    ),
  };
}

/** The final directory's name: the plan's title, else the plan file's own name. */
export function slugFor(plan: string): ParseResult<Slug> {
  const fromTitle = slugFromTitle(plan);

  return fromTitle.ok ? fromTitle : slugFromFileName(PLAN_FILE);
}
