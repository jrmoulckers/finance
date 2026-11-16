---
applyTo: '**'
description: "Formatting rules for canonical files. Use for managed regions, sync markers, generated assets, line endings, and anything copied verbatim into a member repo's tree."
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Instructions for Canon Formatting

Canon is authored in `jrmoulckers/.github` and synced into this repository. This file states the
formatter obligation that follows from that, and the traps you will hit implementing a check for it.

Canon is authored upstream and is **not** formatted to any one member's Prettier config, so a member
running `prettier --check .` over its whole tree fails on files it does not own and must not fix —
editing them is drift, and the next sync skips the file. Every member that runs a formatter needs
its synced paths ignored:

```
# synced from jrmoulckers/.github — canonical source, not authored here
.github/agents/
.github/skills/
.github/prompts/
.github/instructions/
.github/copilot-instructions.md
AGENTS.md
```

That file is member-owned, so the sync cannot add the entry. **Introducing a canon kind that lands
in a formatted path is therefore a cross-repo event**: every affected member needs this line before
its sync PR can go green. The `copilot` kind's first distribution failed CI in four members for
exactly this reason. Machine-read files no formatter touches need no entry — resolved through
Prettier's own `getFileInfo` rather than by pattern-matching, that set is currently `agency.toml`
and `.gitattributes`, both of which Prettier core has no parser for. `libro` measured 81 of 83 lock
paths covered and those two unparseable, with **zero** gaps.

**Treat the list above as an example, not the specification.** The rule it illustrates is keyed to
`.studio-sync.lock.json`: a member's ignore file must cover every lock path its formatter can parse,
and must be re-checked whenever the sync starts emitting a new one. Written as a fixed list of paths,
this section would go stale on exactly the event the paragraph above warns about — the arrival of a
new kind — and would then read as complete while being wrong, which is why members should copy the
rule rather than the lines. libro states it in its own `.prettierignore` as a comment aimed at the
next reader of that file, which is the right place for it, since that is where the omission bites.

Being keyed to a machine-readable file, this is checkable rather than remembered: compare the lock's
`files` keys against what the formatter would consider, and fail when a parseable path is not ignored.
That check belongs in the member, because the ignore file is member-owned. The lock file itself is
emitted as two-space JSON and needs no entry.

**Enumerate from the lock, not from the provenance stamp — there are two stamps and one of them is
plan-derived.** A guard that walks tracked files and treats "carries the canon header" as the test
for ownership sees only half the surface:

| Source | Stamp |
| --- | --- |
| `sync/lib/provenance.mjs` | `synced from jrmoulckers/.github — canonical source; do not edit here` |
| `sync/lib/assets.mjs` | `` `generated + synced from ${plan.sourceRepo} ${plan.package} …` `` |

The second is built from the plan, so it is not a second constant to add — it renders today as
`generated + synced from jrmoulckers/studio @jrm/tokens` and would render differently for another
source or a renamed package. A guard hardcoding the first classifies every vendored token file as
member-owned and never examines the vendor tree, which is the largest canon-owned surface in a
consuming member and the one with a recorded drift incident behind it.

The failure is invisible in the repository where such a guard is most likely to be written. `studio`
has no `vendor/` tree at all, being the token source, so a guard correct there is silently
incomplete the moment it is copied to a consumer — and it reports success while omitting the
population. Enumerate `.studio-sync.lock.json`; it is what the engine maintains and it does not care
which stamp a file carries.

**Two Prettier API traps, both live, one silent.** A member check will hit these:

- **`inferredParser: null` is one value for two conditions.** `getFileInfo()` returns it both for a
  file with no parser and for a file that is *ignored*. So "no parser, therefore nothing to format,
  therefore safe" folds every correctly-ignored path into the safe bucket — and **inverting the
  ignore list leaves the result unchanged**, which is the tell. Make two calls: one with
  `resolveConfig` for the parser, one with `ignorePath` for `ignored`, and report a gap only when
  `parser && !ignored`. Build the inverted list **into** the check rather than running it by hand
  once: write an empty probe ignore-file, re-run the same coverage pass against it, and fail when the
  gap count did not increase. Run once at authoring time it certifies the check as it was that day;
  run every time it certifies the check that is about to report.
  Two cautions on that self-test. **Its negative has two preimages** — an unchanged count means
  either the check never read the ignore file or the real list excludes nothing, and those are
  indistinguishable from outside while needing opposite fixes, so name both rather than asserting
  one. And **the probe must not survive any exit path**: `process.exit()` inside a `try` skips the
  `finally`, so the first member implementation left a `.prettierignore.selftest-<pid>` file behind
  on exactly the failure path, dirtying the tree it was auditing. Remove the probe first, then exit.
- **Patterns anchor to the ignore file's own directory.** Passing an `ignorePath` from outside the
  repository root stops slash-containing patterns such as `.github/agents/` matching, while bare
  patterns such as `AGENTS.md` and `vendor/` keep matching at any depth. The mixed result reads as
  partial coverage rather than as a broken harness; one member measured 57 false gaps this way.
- **A nullish default erases the distinction it is standing in for.** `lock.entries ?? {}` is the
  same defect as `inferredParser: null` one layer up, and it is worse for being an idiom: a member's
  guard hard-failed correctly on both a missing `entries` key and a genuinely empty one, but reported
  *"lists no entries"* for each — a schema change and an empty lock, needing opposite fixes, arriving
  as one message. The default converts **absent** into **empty** at the moment of reading, which
  destroys the evidence before any check can consult it, so no amount of care downstream can recover
  the distinction. The remedy is not to abandon the idiom but to **decide presence once, at the
  boundary, and default freely afterwards**: this engine validates that `members` must be an array in
  `sync/lib/manifest.mjs` before any of its `?? []` sites run, which is why the same idiom is safe
  there. A default is safe exactly when something upstream has already refused the absent case.
- **An error handler that returns empty is the same defect one register up, and defensiveness is
  what makes it permanent.** The sibling above erases *absence*; this one erases *failure*. A
  backbone session built a lookup for open sync PRs from other waves and had it degrade to `[]` on
  any error — deliberately, so that a reporting nicety could never break a sync run. The query was
  malformed and GitHub rejected it outright (`up to 505,050 possible nodes… exceeds the maximum limit
  of 500,000`, at `--limit 50`; `49` passes, a 1% margin against a ceiling this repository does not
  control). Because the handler answered `[]`, **"no other waves exist" and "I could not look" were
  the same output**, so the feature would have reported all-clear forever, on every member, and
  nothing would ever have failed.

  Note where it came from: not carelessness, but a correct instinct to keep an accessory from
  breaking the main job. **The defensiveness converted a transient failure into a permanent silence**,
  and that is a property of the fallback's shape rather than of the bug behind it — any future error
  in that path would have been swallowed identically. A subordinate feature may absolutely decline to
  fail the run; what it may not do is report a *result* it did not obtain. Degrade to a distinct
  third state — warn, or return a value that says *unknown* — so the run survives and the silence is
  still audible. Audited here: every `catch` in `sync/lib/` either rethrows with context or records an
  explicit failure on `runner.mjs`'s failure list; none answers with an empty success.

- **A conformance check keyed on names erases the comparison it did not make, and the change it is
  least able to see is the one that matters most.** Third of the family: the two above erase
  *absence* and *failure*; this one erases *the check*. A member vendors five of this engine's
  constants into a Python asset checker — a copy with no link back, so canon moving makes it wrong
  quietly and in the passing direction. Knowing that, they built a comparator that parses the
  `new Set([…])` literals out of the engine and set-diffs them against their copy, re-ran it after
  three canon PRs landed, and got five `OK … identical` lines. One of the five was
  `HASH_MARKER_TARGETS`, which **this engine had deleted** in the same window: `git grep` for it at
  `HEAD` exits 1, and the constant last existed at `e4b4ba6^`. The comparator found no literal to
  parse, compared nothing, and printed the same word it prints for agreement.

  The consequence was not confined to one row. That checker also derives an invariant from those
  sets, and it reported provenance-hash `{.gitattributes, .gitignore}` against managed-hash
  `{.gitattributes}` — *holds, not converged*. At `HEAD` the managed side is seven basenames and six
  extensions, and `markersFor` returns hash syntax for `.gitignore`, `.editorconfig`, `.npmrc` and
  `agency.toml` alike. **The relation had not merely drifted, it had inverted** — provenance-hash is
  now a strict subset of managed-hash — and the instrument built to detect exactly that reported the
  old direction with the old cardinality.

  Two rules come out of it, and the second is the load-bearing one. **A comparator must assert the
  population it compared, not only the mismatches it found**; a name it could not resolve is a
  failure, never a pass, because *nothing to compare* and *compared and equal* are the same output
  otherwise. And **a name-keyed check verifies values, not concepts**: replacing an enumeration with
  a derivation is both the change most likely to alter behaviour and the change that removes the name
  the checker keys on, so such a check is blindest precisely where the delta is largest. That defeats
  the obvious remedy of publishing the tables as JSON for members to conform against — the key would
  simply have stopped being present, and the failure would be identical. Conform against the
  **derivation** instead: call `markersFor(path)` over a list of paths and compare answers. Paths
  outlive the constants that classify them, an inverted relation shows up as changed answers, and a
  concept that has been replaced rather than edited still returns something to disagree with.

- **A conformance check with no trigger is inert, and "someone mentioned canon moved" is not one.**
  The member who owns the comparator above made this point against their own work, and it is the
  unsolved half: both times they re-ran it, the prompt was a passing remark in conversation that
  canon had changed. A comparator that is correct and never runs is worth exactly what a comparator
  that runs and answers wrongly is worth, and the two failures are hard to tell apart afterwards
  because both leave the same evidence — a green check and a stale copy. Publishing the tables as
  data would harden the parse and leave this untouched. **A vendored copy needs a scheduled or
  hooked re-derivation, not an attentive owner**; if it only runs when someone remembers, the copy's
  correctness is a property of the conversation rather than of the repository.

- **Absence at a remembered location has at least two causes, and the confirming evidence is the
  same for both.** Chasing that same trigger, the member searched `sync/lib/copier.mjs` for
  `canonicalizeInner`, found nothing, briefly read it as a removal, then saw it in the
  `./basemerge.mjs` import list at the top of `copier.mjs` and concluded it had been refactored into
  `basemerge.mjs`. The conclusion — *this
  change does not reach me* — was right. The story was invented: `git log -S "function
  canonicalizeInner" -- sync/lib/copier.mjs` returns nothing at all, because it was defined in
  `basemerge.mjs` by the engine's first commit `5f18f19` and has never lived anywhere else. There
  was no refactor to survive.

  What makes this worth keeping is that **the import line confirms both hypotheses equally**. A
  symbol that moved and a symbol that was always imported produce byte-identical evidence at the call
  site, so the observation that felt decisive could not discriminate. Worse than neutral, it is the
  **most specific-looking evidence available** — it names the symbol *and* the destination file, so
  it reads like a receipt for a move that never happened. Ambiguous evidence that looks highly
  specific is more dangerous than ambiguous evidence that looks weak, because specificity is what
  stops the search. This is the discriminator rule arriving in the search layer: a negative result at
  a location has causes needing different
  conclusions, and the instrument that separates them is history on the **symbol** (`git log -S`),
  not a current-state search of the file that raised the question. And there is a cheaper
  containment step before any of it — **ask what the change touched before deriving what it means**.
  The PR in question modified two files, both under `docs/`, zero `.mjs`; `gh pr view N --json files`
  settles *does this reach my code* in one call, with certainty, before a line of equivalence
  reasoning is written. The member had used that same instrument earlier the same night on a
  different PR, which locates the gap precisely: **possessing an instrument and failing to trigger it
  is a distinct failure from lacking it**, and documenting the instrument again does not fix it —
  only attaching it to the moment that should fire it does. Note the asymmetry the member drew
  correctly: the version they hit fails loudly, while the mirror case — finding a stale definition
  that still exists at the remembered location after the live one moved — returns a confident wrong
  answer and is the one to fear.

Note that these exclusions are **whole-file even for managed-region targets**. `AGENTS.md` and
`.github/copilot-instructions.md` are only partly canonical, but a formatter cannot be pointed at
half a file, and the region must stay byte-identical to canon or the sync stops matching. Excluding
the whole path is therefore correct — it costs formatting on the member-owned remainder, which is a
smaller price than perpetual drift.

**A member instrument that re-implements a parse this engine already performs inherits none of its
fixes.** Validating a citation to this section, a member's naive `^#{1,4} ` scan reported it as **8
lines** and placed the Prettier traps outside it — a reading on which the citation is broken. Measured
here at HEAD, `docs/sync.md` has **40** naive headings against **28** real ones: 12 false, a 42.9%
inflation, and the naive section end is the `# synced from jrmoulckers/.github` comment quoted inside
the example block at L479, which is exactly the 8 lines reported.

The hazard is the familiar one — `#` is a heading in Markdown and a comment in `.prettierignore`,
`.gitattributes` and TOML — and **this engine already solves it**: `maskFences` in `basemerge.mjs`
blanks fenced blocks before marker matching, `sync/README.md` explains it, and
`markers shown inside a fenced example do not form a block` pins it in `basemerge.test.mjs`.
`agency-integrity.mjs` reads `#` as a comment because TOML has no fences, which is correct in its own
domain. So nothing was undiscovered; the discovery was re-made outside the code that already knew.

Generalize it: the vendored-constant family covers duplicated **data**, and this is duplicated
**behaviour**. Behaviour is the worse case, because a constant at least looks copied while a
re-implementation looks like ordinary work, and the engine's tests never run against it. Where a
member needs a parse the engine performs, the durable answer is to conform against the engine's
**output** rather than to reproduce its logic.

**And the wrong answer was self-consistent, which is why it nearly shipped.** An 8-line section with
the traps just outside it is a coherent story that would have been reported as a defect in someone
else's citation. What triggered the re-run was that 8 lines *felt* too short for the material — a
smell, not a check. Record it as the case where **the instrument's wrong output was more plausible
than its right one**: plausibility is a property of the story a measurement tells, and a broken
instrument is free to tell a better one.

**The corrected measurement was also wrong, and that error survived the correction.** The member's
fence-aware span came out as `L471–L557`; measured here from line 0, the next real heading after L471
is at **L649**, with nothing at all between L550 and L575. It changes no conclusion — every trap line
falls inside the section under either endpoint — and that is the reason it lasted. **An error that
does not move the verdict is the one least likely to be found**, because the re-run that fixes the
loud error stops as soon as the answer becomes acceptable rather than when it becomes right.

#### Phantom formatter failures on a pre-`.gitattributes` Windows worktree

The `attributes` kind delivers `* text=auto eol=lf`. On a Windows worktree created **before** that
landed, files checked out under `core.autocrlf=true` keep their CRLF bytes on disk, and the result
is a formatter failure git will not show you:

- `git status` and `git diff` report the file **clean**, because `text=auto eol=lf` normalizes
  worktree→index on read — git compares the normalized form and sees no change.
- `git add --renormalize .` stages **nothing**, for the same reason: the index is already correct.
  Renormalization fixes files whose *index* content is wrong, not a worktree that is stale.
- Prettier reads raw bytes, sees the CRs, and fails.

So the file is simultaneously clean to git and failing to the formatter, and it will never
self-heal. **Adding `.gitattributes` does not rewrite an existing working tree** — expect the fix to
land and change nothing for anyone who already has a clone. That is the shape most likely to be
misread as "the fix didn't work":

| Stage (scratch repo, `core.autocrlf=true`, index already pure LF) | worktree bytes |
| --- | --- |
| fresh checkout, no `.gitattributes` | `CR=3 LF=3` (`i/lf w/crlf`) |
| after committing `* text=auto eol=lf` | `CR=3 LF=3` — **unchanged** |
| after forcing a re-checkout | `CR=0 LF=3` |

The fix is to force the worktree to be rewritten from the index — delete the offending files and
check them out again, or clone fresh. `git rm --cached -r . && git reset --hard` also works, but
**it discards every uncommitted change in the repo**; commit or stash first. Fresh clones and CI are
unaffected, which is why CI never reproduces this.

Where the index is already clean, note that **`eol=lf` is the clause doing the work, not
`text=auto`.** With a correct index there is nothing for `text=auto` to normalize; `eol=lf` is what
overrides a repo-local `core.autocrlf=true` at checkout time. Canon carries both, so this is a "why
it works" note rather than a change — but it also means adopting canon in a member whose index is
already clean produces **no renormalization commit at all**, and the `.gitattributes` addition is
the entire diff. Check with `git ls-files --eol` before planning one: where the index is dirty you
get the large mechanical commit and the fixture/snapshot/`.bat` audit genuinely matters, and where
it is clean neither applies. Confirmed in `jrmoulckers/jrm-recipes` (1237 files, `i/crlf: 0`) and
`jrmoulckers/studio` (199 files, `i/lf: 199`).

Confirmed in `jrmoulckers/jrm-recipes`, where `.studio-sync.lock.json` held 302 stray CRs
while reporting clean.

Worth recognizing by shape: a formatter failing on a file `git diff` says is unmodified is almost
always this, not content. CI never reproduces it, because CI always clones fresh.
