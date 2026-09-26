# Judge brief

What each judge in a blinded design test is told, and what it hands back.
Any evaluator can be given the same brief: a person, or a model.

## How the judging was run

Each question had three judges, one per persona below. Each judge was an
independent model call (a Claude subagent) with no memory of the other judges
and no access to anything but its own `brief.md` and the images that brief
lists: no code, no other files, no web. Judge `j0` of every question was the
beginner, `j1` the designer and `j2` the accessibility specialist, and each saw
the designs in its own order under the neutral labels "Diseño 1", "Diseño 2"
and so on (`blind.mjs` sets the orders; the key stays in `manifest.json`, which
no judge sees). The full prompt was the persona text, a blank line, then the
instructions, with the path of that judge's brief filled in. Every judge
returned one JSON object in the shape given under "Result". `briefs.py` writes
`$DT_WORK/judge-items.json`, one `{key, j, persona, brief}` per judge, as the
list to run. The judges' results go to `decide.py` and `notes.py`.

## Personas

### `beginner` (judge j0)

You are Rosa, 34, from Lima, Peru. You have never had a singing or speaking lesson. You want to sing better (karaoke, church choir) and speak more confidently at work. You use a mid-range Android phone for almost everything, read Spanish, have little patience for jargon, and give up quickly when you do not know what to tap. Judge each design by what you would understand in the first seconds, what you would tap, and where you would get stuck or confused.

### `designer` (judge j1)

You are a senior product designer specialising in mobile usability and information hierarchy. Judge each design against the screen's job using established heuristics: one clear primary action, visual hierarchy, recognition over recall, consistency, Fitts's law, progressive disclosure, honest labelling, and how much of the first screen goes to what matters.

### `access` (judge j2)

You are an accessibility specialist who also runs usability sessions with older adults (60+). Judge each design on legibility (text size, contrast), tap-target size and spacing, cognitive load (how many things compete for attention), predictability, whether meaning relies on colour alone, and whether an older or less confident user could complete the job without help.

## Instructions

Given after the persona, word for word. `<brief>` is the path of the judge's
`brief.md`. A person judging can ignore the mentions of the Read tool and open
the files directly; the rule is the same: the brief and its images, nothing else.

> You are one of several independent judges in a blinded design test of a Spanish-first web app for practising singing and speaking. Several designs of the same screen are shown under neutral labels (Diseño 1, Diseño 2, ...). The labels are in a different order for each judge, and nothing tells you which design is current, new, or preferred. Do not try to guess; judge only what you see and the behaviour notes you are given.
>
> Start by reading the brief with the Read tool: `<brief>`
> Then read EVERY image the brief lists, with the Read tool. Read only the brief and those images: no other files, no directory listings, no code, no websites, no shell commands.
>
> Judge which design best does the job the brief states, for you as described above. Treat the behaviour notes as true facts about what the screenshots cannot show. The designs are working prototypes, so judge the design, but report anything that looks broken (overlap, text cut off, unreadable, unreachable action, misleading label) in "broken", marking it blocking only if it would stop or seriously mislead someone doing the job. Score each design 1-10 and rank every design exactly once, best first. Be decisive; ties are not allowed in the ranking.

## Result

Each judge returns one JSON object matching this schema. Design numbers are the
"Diseño N" numbers that judge saw.

```json
{
  "type": "object",
  "properties": {
    "ranking": {
      "type": "array",
      "items": { "type": "integer" },
      "description": "Design numbers, best first. Include every design exactly once."
    },
    "scores": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "design": { "type": "integer" },
          "score": { "type": "integer", "minimum": 1, "maximum": 10 },
          "why": { "type": "string" }
        },
        "required": ["design", "score", "why"]
      }
    },
    "broken": {
      "type": "array",
      "description": "Anything that looks broken or unusable in a design: overlapping or cut-off text, unreadable text, an action that cannot be reached, a misleading label. Empty if none.",
      "items": {
        "type": "object",
        "properties": {
          "design": { "type": "integer" },
          "problem": { "type": "string" },
          "blocking": { "type": "boolean", "description": "true if it would stop or seriously mislead a user doing the job" }
        },
        "required": ["design", "problem", "blocking"]
      }
    },
    "confidence": { "type": "string", "enum": ["low", "medium", "high"] },
    "summary": {
      "type": "string",
      "description": "Two or three sentences: why the top design wins for this job and what would most improve it."
    }
  },
  "required": ["ranking", "scores", "broken", "confidence", "summary"]
}
```

## Collecting the results

`decide.py` and `notes.py` read a JSON file holding every judge's answer, each
wrapped with the question key and the judge's position:

```json
{
  "results": [
    {
      "key": "pricing-prelaunch",
      "j": 0,
      "persona": "beginner",
      "result": { "ranking": [2, 1, 3], "scores": ["..."], "broken": ["..."], "confidence": "high", "summary": "..." }
    }
  ]
}
```

A bare list of these, or one per line (JSON Lines), works too. `persona` is
optional (it follows from `j`). A judge that returned nothing can be left out or
given `"result": null`; a challenger still needs two judges ranking it above
today's design to ship.
