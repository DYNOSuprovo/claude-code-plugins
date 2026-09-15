# Visual artifacts

A plan is Markdown. A picture earns its place only where words fail: a screen the reviewer must see, a flow with several actors, a state machine. Then it is a file next to the plan, listed in the plan by path, kept after implementation for verification.

## Mockups

A rough HTML page of the actual screen settles what three paragraphs would only prolong. Plain HTML and CSS, no framework, real labels, the states that matter (empty, loading, error). One file per screen or per option when the reviewer chooses between options.

## Flows and states

A sequence with more than three actors, or a state machine, can be a Mermaid block in the plan. State the same facts in text next to it: a diagram supplements the prose, it is never the only place a fact lives. When the order of steps already tells the story, a numbered list beats a diagram.

## What stays text

Program design: types, signatures, call stacks, file trees. Diagrams for these have been tried and abandoned as exhausting to read; the pseudocode formats in `program-design.md` are lighter and precise.

## Rendering

The plan file is what the harness renders. A mockup opens in a browser. Do not inline a mockup into the plan.
