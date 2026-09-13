import { describe, expect, test } from "bun:test";
import {
  buildBody,
  findPlanComment,
  isPrCreate,
  parsePayload,
  PLAN_MARKER,
  planKey,
  planPath,
  planText,
  prNumberFrom,
  withSessionLine,
} from "./plan-comment.ts";

describe("parsePayload", () => {
  test("reads the fields the hooks use", () => {
    const payload = parsePayload(
      JSON.stringify({
        cwd: "/repo",
        session_id: "abc123",
        tool_input: { command: "gh pr create", plan: "# Plan" },
        tool_response: { plan: "# Approved" },
      }),
    );

    expect(payload?.cwd).toBe("/repo");
    expect(payload?.session_id).toBe("abc123");
    expect(payload?.tool_input?.command).toBe("gh pr create");
    expect(payload?.tool_response?.plan).toBe("# Approved");
  });

  test("malformed JSON yields null", () => {
    expect(parsePayload("")).toBeNull();
    expect(parsePayload("{oops")).toBeNull();
  });
});

describe("planText", () => {
  test("PreToolUse carries the plan in tool_input", () => {
    expect(planText({ tool_input: { plan: "# Plan\n1. Do it" } })).toBe("# Plan\n1. Do it");
  });

  test("a PostToolUse response wins over the input", () => {
    expect(planText({ tool_input: { plan: "draft" }, tool_response: { plan: "approved" } })).toBe(
      "approved",
    );
  });

  test("no plan, or a blank one, yields null", () => {
    expect(planText({})).toBeNull();
    expect(planText({ tool_input: {} })).toBeNull();
    expect(planText({ tool_input: { plan: "  \n " } })).toBeNull();
  });
});

describe("isPrCreate", () => {
  test("matches the command whatever wraps it", () => {
    expect(isPrCreate("gh pr create --base dev")).toBe(true);
    expect(isPrCreate("cd /repo && gh  pr\tcreate --fill")).toBe(true);
  });

  test("ignores every other gh call", () => {
    expect(isPrCreate("")).toBe(false);
    expect(isPrCreate("gh pr view --json number")).toBe(false);
    expect(isPrCreate("gh pr comment 12 --body x")).toBe(false);
    expect(isPrCreate("gh issue create")).toBe(false);
  });
});

describe("prNumberFrom", () => {
  test("takes the first pull URL of the response", () => {
    expect(prNumberFrom('{"stdout":"https://github.com/o/r/pull/42\\n"}')).toBe(42);
    expect(prNumberFrom("https://github.com/o/r/pull/7 https://github.com/o/r/pull/9")).toBe(7);
  });

  test("no URL yields null", () => {
    expect(prNumberFrom("")).toBeNull();
    expect(prNumberFrom("https://github.com/o/r/issues/42")).toBeNull();
  });
});

describe("planKey", () => {
  test("names the main checkout, from the checkout or from a worktree", () => {
    expect(planKey("/w/ideas/.git", "main")).toBe("ideas/main");
    expect(planKey("/w/ideas/.git", "feature/plan-on-pr")).toBe("ideas/feature/plan-on-pr");
  });

  test("an empty branch or an unusable git dir yields null", () => {
    expect(planKey("/w/ideas/.git", "")).toBeNull();
    expect(planKey(".git", "main")).toBeNull();
    expect(planKey("", "main")).toBeNull();
  });
});

describe("planPath", () => {
  test("nests the branch under the repository", () => {
    expect(planPath("/h", "ideas/feature/x")).toBe("/h/.claude/plans/by-branch/ideas/feature/x.md");
  });
});

describe("withSessionLine", () => {
  test("the session line opens the file, the plan follows", () => {
    expect(withSessionLine("# Plan", "abc123")).toBe("<!-- session_id: abc123 -->\n# Plan\n");
    expect(withSessionLine("# Plan\n", "abc123")).toBe("<!-- session_id: abc123 -->\n# Plan\n");
  });

  test("no session id writes the plan alone, with no empty marker", () => {
    expect(withSessionLine("# Plan", undefined)).toBe("# Plan\n");
    expect(withSessionLine("# Plan", "")).toBe("# Plan\n");
  });
});

describe("buildBody", () => {
  test("marker first, plan inside a details block", () => {
    expect(buildBody("# Plan\n1. Do it\n")).toBe(
      `${PLAN_MARKER}\n<details><summary>Plan</summary>\n\n# Plan\n1. Do it\n\n</details>\n`,
    );
  });

  test("a session line is hoisted next to the marker, out of the details block", () => {
    expect(buildBody(withSessionLine("# Plan", "abc123"))).toBe(
      `${PLAN_MARKER}\n<!-- session_id: abc123 -->\n<details><summary>Plan</summary>\n\n# Plan\n\n</details>\n`,
    );
  });

  test("a hoisted session line still opens a matching plan comment", () => {
    const body = buildBody(withSessionLine("# Plan", "abc123"));
    expect(findPlanComment(JSON.stringify({ id: 5, login: "me", body }), "me")).toBe(5);
  });

  test("its own output is recognised as a plan comment", () => {
    const body = buildBody("# Plan");
    expect(findPlanComment(JSON.stringify({ id: 1, login: "me", body }), "me")).toBe(1);
  });
});

describe("findPlanComment", () => {
  const lines = [
    JSON.stringify({ id: 1, login: "me", body: "LGTM" }),
    JSON.stringify({ id: 2, login: "other", body: `${PLAN_MARKER}\nsomeone else's` }),
    JSON.stringify({ id: 3, login: "me", body: `${PLAN_MARKER}\nmine` }),
    "",
  ].join("\n");

  test("takes the caller's own marked comment", () => {
    expect(findPlanComment(lines, "me")).toBe(3);
  });

  test("no marked comment of ours yields null", () => {
    expect(findPlanComment(lines, "nobody")).toBeNull();
    expect(findPlanComment("", "me")).toBeNull();
  });

  test("the marker must open the body", () => {
    const late = JSON.stringify({ id: 4, login: "me", body: `text\n${PLAN_MARKER}` });
    expect(findPlanComment(late, "me")).toBeNull();
  });
});
