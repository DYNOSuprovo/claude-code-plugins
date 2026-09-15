# vellum

v1.0.0

Write a plan the way its reviewer reads it. The reviewer's judgment goes to the frontiers of the code, interfaces, types, files and the order of work, not to every line. The plan leads with what the reviewer is most likely to change and buries the mechanics.

Replaces `software-craft:thorough-plan`.

## Skill

`vellum:plan` triggers itself when a design choice is open, a change crosses several modules or interfaces, or a refactor reshapes a contract. Three moves:

1. Size the ceremony. A one-sentence diff gets no plan. A fuzzy idea gets a throwaway first, after the few questions that pin down what it must show.
2. Settle the open choices in question rounds, each question with a recommended answer. Only a question whose answer changes the architecture, an interface or the scope is asked; the rest becomes a recorded assumption. `assume` closes a round.
3. Enter plan mode and write the plan ordered by probability of revision: decisions, interfaces, files, slices with their check, out of scope, then mechanics.

References, loaded one at a time: `program-design.md` (signatures, call-stack and file trees, command interfaces, contracts), `slices.md` (vertical order, sizing, implementation notes), `visual.md` (when a mockup or a diagram earns its place).

## Agent

`plan-reviewer` reads a plan and its artifacts, read-only, and reports Approved or Issues found with a verdict: overengineered, underengineered or right. The skill calls it for a large change or a plan no human will read; call it yourself with the plan path otherwise.

## Reading a plan

Read in this order and stop where a section is wrong:

1. Decisions and assumptions. Is this what you asked, and what did the model decide in your place?
2. Interfaces and files. Would you be happy if the system had exactly these shapes?
3. Slices. Is each check something you would run?
4. The verdict, yours or the reviewer's: overengineered, underengineered or right.

During implementation, send one to three slices at a time. Read the result at each slice when the code matters; skim the check and move on when it does not. Re-steering after one slice costs less than after the whole plan.

Skip the mechanics unless a slice touches something you cannot recover. Before the pull request, read the implementation notes for deviations. For a change that matters, ask the implementer to quiz you on it and merge only when you pass.

## Sources

Thariq Shihipar (Anthropic) on ordering a plan by what the reviewer will tweak and on artifacts passed to a fresh session; Dex Horthy (HumanLayer) on program design formats and vertical slices; the OpenAI Codex plan-mode prompt on assumptions and on what to omit; Boris Cherny on the overengineered / underengineered verdict; Jesse Vincent's superpowers on the plan reviewer. Collected September 2026.

## Later

- Render the plan in the browser with the sections folded, the way plannotator does, and open it on approval.
- Attach the plan's artifacts to the pull request with the plan.
- Capture what the harness injects in plan mode and drop from the skill whatever it already says.

## License

MIT

## Author

Augustin BENGOLEA <bengous@protonmail.com>
