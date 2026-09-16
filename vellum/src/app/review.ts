import {
  exists,
  finalize as renameWorkspace,
  listFiles,
  readPlan,
  readText,
  readWorkspace,
  writeText,
} from "../adapters/fs.ts";
import type { FeedbackHeading } from "../domain/feedback.ts";
import { formatFeedback } from "../domain/feedback.ts";
import type { FinalDir, ProjectPath, Version, WipDir } from "../domain/paths.ts";
import type { Decision } from "../domain/review.ts";
import { decideOn, gateVersion, slugFor } from "../domain/review.ts";
import type { Memory, Pending, PlanWorkspace } from "../domain/workspace.ts";
import {
  PLAN_FILE,
  pendingOf,
  projectPath,
  versionFile,
  workspaceOf,
} from "../domain/workspace.ts";
import type { DocRef, ReviewView, ServerPlugin } from "../protocol.ts";

export type ReviewOptions = {
  readonly project: string;
  readonly workdir: WipDir;
  readonly plugins: readonly ServerPlugin[];
};

export type DecisionResult =
  | { readonly ok: true; readonly workspace: PlanWorkspace }
  | { readonly ok: false; readonly workspace: PlanWorkspace };

/** What `submit` reads: the version the plan is, or why the browser has nothing to show. */
export type GateResult =
  | { readonly ok: true; readonly version: Version; readonly kept: boolean }
  | { readonly ok: false; readonly error: string };

/** The use case: reads the directory, lets the domain decide, applies: files, memory, listeners. */
export class Review {
  private memory: Memory = { kind: "none" };

  private readonly listeners = new Set<(workspace: PlanWorkspace) => void>();

  public constructor(private readonly options: ReviewOptions) {}

  public subscribe(listener: (workspace: PlanWorkspace) => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  public get listenerCount(): number {
    return this.listeners.size;
  }

  public async workspace(): Promise<PlanWorkspace> {
    const disk = await readWorkspace(this.options.project, this.options.workdir);

    if (!disk.ok) throw new Error(disk.error);

    return workspaceOf(disk.value, this.memory);
  }

  public async pending(): Promise<Pending> {
    return pendingOf(await this.workspace());
  }

  private planDoc(version: Version, dir: WipDir | FinalDir = this.options.workdir): ProjectPath {
    return projectPath(`${dir}${versionFile(version)}`);
  }

  private planText(version: Version, dir?: WipDir | FinalDir): Promise<string> {
    return readText(this.options.project, this.planDoc(version, dir));
  }

  private async notify(): Promise<PlanWorkspace> {
    const workspace = await this.workspace();

    for (const listener of this.listeners) listener(workspace);

    return workspace;
  }

  /** The plan the model wrote is the version under review; the same text keeps its number. */
  public async gate(): Promise<GateResult> {
    const workspace = await this.workspace();

    if (workspace.kind === "approved") {
      return { ok: false, error: `plan v${workspace.version} is already approved` };
    }

    const plan = await readPlan(this.options.project, this.options.workdir);

    if (plan === null) {
      return { ok: false, error: `write ${PLAN_FILE} in ${this.options.workdir} first` };
    }

    const latestText =
      workspace.kind === "drafting" ? null : await this.planText(workspace.version, workspace.dir);

    const gated = gateVersion(workspace, latestText, plan);

    if (gated.kind === "kept") return { ok: true, version: gated.version, kept: true };
    await writeText(this.options.project, this.planDoc(gated.version), plan);
    this.memory = { kind: "none" };
    await this.notify();

    return { ok: true, version: gated.version, kept: false };
  }

  public async decide(decision: Decision): Promise<DecisionResult> {
    const workspace = await this.workspace();
    const decided = decideOn(workspace, decision);

    if (decided.kind === "refused") return { ok: false, workspace };

    if (decided.kind === "approve") return await this.approve(decided.version);

    if (decision.kind === "feedback") {
      const heading: FeedbackHeading =
        decided.kind === "draftFeedback"
          ? { kind: "draft", batch: decided.batch }
          : { kind: "review", version: decided.version };

      await writeText(
        this.options.project,
        decided.path,
        formatFeedback(decision.annotations, heading),
      );
    }

    return { ok: true, workspace: await this.notify() };
  }

  /** Approve is the whole finalization: links rewritten, directory renamed, nothing pending after. */
  private async approve(version: Version): Promise<DecisionResult> {
    const { project, workdir } = this.options;
    const slug = slugFor(await this.planText(version));

    if (!slug.ok) return await this.failApprove(version, slug.error);
    const renamed = await renameWorkspace(project, workdir, slug.value);

    if (!renamed.ok) return await this.failApprove(version, renamed.error);
    this.memory = { kind: "approved", version, dir: renamed.value };

    return { ok: true, workspace: await this.notify() };
  }

  /** The reviewer sees the error and retries from the page; until then nothing is pending. */
  private async failApprove(version: Version, error: string): Promise<DecisionResult> {
    this.memory = { kind: "finalizeError", version, error };

    return { ok: false, workspace: await this.notify() };
  }

  /**
   * The working directory's files in every state, the linked docs that live outside it after.
   * Once a version exists the reviewer decides on it, so the working copy `plan.md` leaves the
   * list; while drafting it is the draft the reviewer may comment on.
   */
  public async view(): Promise<ReviewView> {
    const workspace = await this.workspace();
    const listed = await listFiles(this.options.project, this.options.workdir);

    if (workspace.kind === "drafting") return { workspace, plan: null, docs: listed };

    const doc = this.planDoc(workspace.version, workspace.dir);
    const text = await this.planText(workspace.version, workspace.dir);
    const draft = projectPath(`${this.options.workdir}${PLAN_FILE}`);
    const files = listed.filter((file) => file.path !== draft);
    const linked = await this.linkedDocs(text, doc, workspace.dir, files);

    return { workspace, plan: { doc, text }, docs: [...files, ...linked] };
  }

  private async linkedDocs(
    plan: string,
    planDoc: ProjectPath,
    dir: WipDir | FinalDir,
    listed: readonly DocRef[],
  ): Promise<DocRef[]> {
    const { project } = this.options;
    const roots = { project, planDir: dir };
    const seen = new Set<string>([planDoc, ...listed.map((doc) => doc.path)]);
    const docs: DocRef[] = [];

    for (const plugin of this.options.plugins) {
      for (const doc of plugin.linkedDocs?.(plan, roots) ?? []) {
        if (seen.has(doc.path)) continue;

        if (!(await exists(project, doc.path))) continue;
        seen.add(doc.path);
        docs.push(doc);
      }
    }

    return docs;
  }
}
