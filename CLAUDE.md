# Claude project instructions

**See [`AGENTS.md`](./AGENTS.md)** — repository path
**`vocal-singing-training/AGENTS.md`** — and read it before any task. It is
the canonical agent contract. The requested [`agent.md`](./agent.md) lives at
**`vocal-singing-training/agent.md`** and points to the same file. Read that path directly for the [BreathFlow scientific design](./docs/56-BREATHFLOW-EVIDENCE-BASED-DESIGN.md), its research gates and counterexample tests.

The rules you will be held to, in short (AGENTS.md has the detail and code):

- For every feature and decision, ask what the best expert in that field
  would do, backed by evidence, and why they would reject your choice; if
  you can name the reason, do not make the choice. Weight scientific and
  methodological correctness, state-of-the-art technique, and the usability
  and intuitiveness of the user flow. State every trade-off to the user.
- A falsifiable test for every task and every round: model both the correct
  and the wrong behaviour, prove it turns red on the defect
  (`node qa/mutate.mjs`), never write a tautological test.
- `chore(lint)`: cyclomatic complexity <= 15 for new or edited functions
  (`npm run lint`); the legacy baseline may only shrink.
- If a fix hypothesis fails once, research the error online and find how
  others solved it before trying again.
- Five red-team passes and four aesthetic passes per round; a blocked test
  is unverified, never passed.

Before execution compare alternative routes; after each round record the
observed root cause, shared-path regressions and simulated source drift, as
required by [`AGENTS.md`](./AGENTS.md), repository path `vocal-singing-training/AGENTS.md`.

For focused skills read [agent.md](./agent.md) (repository path vocal-singing-training/agent.md) and [docs/57-SKILL-FOCUSED-SETS.md](./docs/57-SKILL-FOCUSED-SETS.md). Apply independent negative controls for every round, never award mastery from a set or mic-only score.

For discovery/trial/curriculum changes, read the skill policy in [`AGENTS.md`](./AGENTS.md), repository path `vocal-singing-training/AGENTS.md`, and its linked docs/61.
