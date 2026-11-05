# Claude project instructions

**See [`AGENTS.md`](./AGENTS.md)** — repository path
**`vocal-singing-training/AGENTS.md`** — and read it before any task. It is
the canonical agent contract. The requested `agent.md` lives at
**`vocal-singing-training/agent.md`** and points to the same file.

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
