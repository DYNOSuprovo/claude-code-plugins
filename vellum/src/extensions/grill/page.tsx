import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";

import type { PageExtension, RendererProps } from "../../core/extension.ts";
import { extensionRequest } from "../../core/page/api.ts";
import { Button } from "../../core/page/kit.tsx";
import { error, review, select, setTyped, typed } from "../../core/page/state.ts";
import type { Typed } from "../../core/protocol.ts";
import { grillNumber } from "./parse.ts";
import type { Block, GrillPosts, GrillState, Opened } from "./protocol.ts";

const ID = "grill";

/** What "Take it" answers: Claude wrote the recommendation, so its text never goes back to it. */
const TAKEN = "As recommended.";

/** The server's word on the grill, loaded again at every workspace event; `null` before the first answer. */
const grill = signal<GrillState | null>(null);

function nameOf(path: string): string {
  return path.split("/").at(-1) ?? path;
}

async function loadState(): Promise<void> {
  const response = await extensionRequest(ID, "state");

  // SAFETY: the server's own `GrillState`, serialized by `Response.json` in grill/server.ts.
  grill.value = response.ok ? ((await response.json()) as GrillState) : null;
}

/** The transcript's blocks, or `null` with the failure in the banner: the reviewer waits on them. */
async function blocksOf(path: string): Promise<Block[] | null> {
  try {
    const response = await extensionRequest(ID, `blocks?file=${encodeURIComponent(path)}`);

    if (response.ok) {
      // SAFETY: the server's own `Block[]`, serialized by `Response.json` in grill/server.ts.
      return (await response.json()) as Block[];
    }

    error.value = `GET ${path} failed: ${response.status}`;
  } catch (cause) {
    error.value = `GET ${path} failed: ${String(cause)}`;
  }

  return null;
}

async function post<Name extends keyof GrillPosts>(
  path: Name,
  body: GrillPosts[Name],
): Promise<Response> {
  const response = await extensionRequest(ID, path, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.ok) error.value = `POST ${ID}/${path} failed: ${response.status}`;

  return response;
}

async function openGrill(subject: string): Promise<void> {
  const response = await post("open", { subject });

  if (!response.ok) return;
  // SAFETY: the server's own `Opened`, a `ProjectPath` it built, serialized in grill/server.ts.
  const { file } = (await response.json()) as Opened;
  select(file);
}

/** `true` once the server took it: the typing it carried can go. */
async function reply(
  answers: readonly { id: string; text: string }[],
  note: string,
): Promise<boolean> {
  return (await post("reply", { answers, note })).ok;
}

/** What the reviewer did with the banner: `auto` shows it while Claude suggests a grill. */
type Banner = "auto" | "open" | "dismissed";

function GrillAction(): preact.JSX.Element {
  const view = review.value;
  const state = grill.value;
  const [banner, setBanner] = useState<Banner>("auto");
  const [subjectTyped, setSubjectTyped] = useState<string | null>(null);
  const suggestion = state?.kind === "none" ? state.suggestion : null;
  const subject = subjectTyped ?? suggestion?.subject ?? "";

  const shown =
    state?.kind === "none" && (banner === "open" || (banner === "auto" && suggestion !== null));

  useEffect(() => {
    void loadState();
  }, [view]);

  const start = (): void => {
    setBanner("auto");
    setSubjectTyped(null);
    void openGrill(subject.trim());
  };

  return (
    <>
      {state?.kind === "open" && (
        <span class="status">
          Grill open · {state.phase === "working" ? "Claude is working" : nameOf(state.file)}
        </span>
      )}
      <Button
        variant="grill"
        class={suggestion === null ? undefined : "lit"}
        disabled={state?.kind !== "none" || view?.workspace.kind === "approved"}
        onClick={() => setBanner(shown ? "dismissed" : "open")}
      >
        Grill
      </Button>
      {shown && (
        <div class="grill-banner">
          {suggestion !== null && (
            <span>
              <strong>Claude suggests a grill:</strong> {suggestion.reason}
            </span>
          )}
          <input
            aria-label="Subject of the grill"
            placeholder="What should Claude grill you on?"
            value={subject}
            onInput={(event) => setSubjectTyped(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && subject.trim() !== "") start();
            }}
          />
          <Button size="sm" variant="send" disabled={subject.trim() === ""} onClick={start}>
            Start grilling
          </Button>
          <Button size="sm" onClick={() => setBanner("dismissed")}>
            Dismiss
          </Button>
        </div>
      )}
    </>
  );
}

type CardProps = {
  readonly block: Extract<Block, { kind: "question" }>;
  readonly answer: string;
  /** `null` once the question is answered, or the grill closed: the card takes nothing. */
  readonly onAnswer: ((text: string) => void) | null;
};

function QuestionCard(props: CardProps): preact.JSX.Element {
  const { block } = props;

  return (
    <div class="grill-q">
      <div class="head">
        <span class="num">{block.id}</span>
        <span class="topic">{block.title}</span>
      </div>
      <p class="ask">{block.ask}</p>
      {block.rec !== "" && (
        <div class="rec">
          <span class="label">Recommended</span>
          <span class="text">{block.rec}</span>
          {props.onAnswer !== null && (
            <Button size="sm" onClick={() => props.onAnswer?.(TAKEN)}>
              Take it
            </Button>
          )}
        </div>
      )}
      {block.answer !== null && (
        <div class="answer">
          <span class="label">Your answer</span>
          <span class="text">{block.answer}</span>
        </div>
      )}
      {props.onAnswer !== null && (
        <textarea
          aria-label={`Answer to ${block.id}`}
          placeholder={`Answer ${block.id}, or leave empty to take the recommendation`}
          value={props.answer}
          onInput={(event) => props.onAnswer?.(event.currentTarget.value)}
        />
      )}
    </div>
  );
}

const NOTHING_TYPED: Typed["grill"][string] = { answers: {}, note: "" };

function GrillDoc(props: RendererProps): preact.JSX.Element {
  const { path, modified } = props.doc;
  const [blocks, setBlocks] = useState<readonly Block[]>([]);
  /** The reviewer's typing on this transcript, in the draft: it survives the pane and a reload. */
  const own = typed.value.grill[path] ?? NOTHING_TYPED;
  const state = grill.value;
  const current = state?.kind === "open" && state.file === path ? state : null;

  const answer = (id: string, text: string): void =>
    setTyped({
      grill: { ...typed.value.grill, [path]: { ...own, answers: { ...own.answers, [id]: text } } },
    });

  const note = (text: string): void =>
    setTyped({ grill: { ...typed.value.grill, [path]: { ...own, note: text } } });

  const forget = (): void => {
    const { [path]: _gone, ...rest } = typed.value.grill;
    setTyped({ grill: rest });
  };

  const answered = (id: string): string => own.answers[id]?.trim() ?? "";

  const open = blocks.flatMap((block) =>
    block.kind === "question" && block.answer === null ? [block.id] : [],
  );

  const sendable = current !== null && (open.length > 0 || own.note.trim() !== "");

  const send = async (): Promise<boolean> => {
    const taken = await reply(
      open.map((id) => ({ id, text: answered(id) })),
      own.note.trim(),
    );

    if (taken) forget();

    return taken;
  };

  /** What is typed goes first, as a reply; an empty field takes the recommendation, as a send does. */
  const end = async (): Promise<void> => {
    if (sendable && !(await send())) return;
    await post("close", { reason: "page" });
  };

  useEffect(() => {
    void blocksOf(path).then((loaded) => {
      if (loaded !== null) setBlocks(loaded);
    });
  }, [path, modified]);

  return (
    <div class="grill-doc">
      <div class="plan">
        {blocks.map((block, index) =>
          block.kind === "html" ? (
            // The server rendered it with raw HTML escaped and unsafe links cut: `toHtml`.
            // oxlint-disable-next-line react/no-danger -- the transcript's Markdown arrives rendered, since the page bundles no Markdown parser for it; `toHtml` in grill/server.ts is what makes it safe to insert.
            <div key={index} dangerouslySetInnerHTML={{ __html: block.html }} />
          ) : (
            <QuestionCard
              key={block.id}
              block={block}
              answer={own.answers[block.id] ?? ""}
              onAnswer={
                current !== null && block.answer === null ? (text) => answer(block.id, text) : null
              }
            />
          ),
        )}
      </div>
      {current !== null && (
        <div class="grill-foot">
          <textarea
            aria-label="Anything else for Claude"
            placeholder="Anything else. Ctrl+Enter sends."
            value={own.note}
            onInput={(event) => note(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && sendable) {
                void send();
              }
            }}
          />
          <div class="row">
            <span class="note">
              {open.length > 0
                ? "An empty field takes the recommendation. Answers go to Claude once its turn ends."
                : "No question is open. A note goes to Claude once its turn ends."}
            </span>
            <Button onClick={() => void end()}>End grill</Button>
            <Button variant="send" disabled={!sendable} onClick={() => void send()}>
              Send answers
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const grillPage: PageExtension = {
  id: "grill",
  renderers: [
    {
      accepts: (doc) => doc.mediaType === "text/markdown" && grillNumber(nameOf(doc.path)) !== null,
      component: GrillDoc,
      comments: false,
    },
  ],
  actions: [GrillAction],
};
