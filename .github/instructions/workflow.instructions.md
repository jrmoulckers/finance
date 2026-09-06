---
applyTo: '**'
description: 'Change delivery workflow. Use for issues, branches, conventional commits, pull requests, required quality gates, reusable workflow calls, human-gated operations, and fleet coordination.'
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Change Delivery Workflow

Read-only research, audits, and planning do not require an issue when they make no repository
change. Before the first repository change, verify or create an issue; every repository change must
trace to that issue and land through a feature branch and PR.

## Default Workflow

1. Verify or create the GitHub issue.
2. Scan for an existing worktree for the issue; resume it if found.
3. Otherwise prefer an app-native isolated project session/worktree from the default branch. If that
   capability is unavailable, require a runtime-provided, explicitly approved location allowed by
   root/scoped authority.
4. Implement scoped changes on a feature branch.
5. Commit as `type(scope): description (#N)`.
6. Run the repo's documented format, lint, type-check, test, and build commands for the affected surface.
7. Fetch and rebase onto the default branch.
8. Push the feature branch and create a PR with `Closes #N`.
9. Verify the PR exists with `gh pr view`.
10. Monitor CI and mergeability until checks are green and the PR is `MERGEABLE`.
11. Self-merge only PRs you authored when the quality gate passes and local `AGENTS.md` permits it.
12. Remove the worktree after merge.

Stopping at a local commit is incomplete. A change is done only when the PR is merged, or when a
green, mergeable PR clearly documents a `## Needs Human Action` blocker. Local `AGENTS.md` decides
self-merge and operational authority; this instruction never expands either.

## Definition of Done

| Gate | Verification | Pass criteria |
| --- | --- | --- |
| Clean tree | `git status` | No uncommitted changes. |
| Pushed | `git log origin/<branch>..HEAD` | Empty. |
| PR exists | `gh pr view <branch> --json number` | Returns a PR number. |
| CI green | `gh pr checks <number>` | Every required check reports `success`, or reaches a no-assertion state (`skipped`, `neutral`) **consistent with an independently computed precondition**. Absence of red is **not** the criterion: a `skipping` check is neither failing nor pending, so a job that was never scheduled passes a not-red test. Never allowlist a no-assertion state beside `success` — see the resolution rule below. |
| Mergeable | `gh pr view <number> --json mergeable,mergeStateStatus` | `MERGEABLE`, not dirty/behind. Note this is a reading and not a gate — `UNSTABLE` does not distinguish a check that failed from one that never started. |
| Issue linked | PR body | `Closes #N` for each resolved issue. |
| Landed | `gh pr view <number> --json state` | `MERGED`, or a documented human-gated blocker. |

**A `CLEAN` reading is a timestamp, not a property of the merge that followed.** With auto-merge
disabled you find the merge window by polling, so the sequence is *read, then submit*, and the state
can change in between — during one exchange the backbone moved five times in twenty minutes. What
the outcome establishes is only that the merge was clean **at submit**, which is the unit that
counts; it does not retroactively confirm the reading. Keep the two claims separate when reporting:
*I observed `CLEAN` and then merged successfully* is supported, *the merge was clean because I
verified it* is not, and the distinction matters the moment a merge fails after a `CLEAN` read —
that is the expected behaviour of a stale reading, not evidence of a broken instrument.

**When checking runs rather than a PR, sort on `run_started_at`.** `gh run list` orders by
`created_at`, and a rerun keeps its original `created_at` while advancing `run_started_at` — so the
most recently *executed* run can sit arbitrarily far down the listing, or outside a short one
entirely. Measured on a member: the freshest execution in the repository ranked twelfth, and a
`--limit 3` read did not contain it.

```sh
gh run list --repo OWNER/REPO --limit 100 \
  --json databaseId,createdAt,startedAt,status,conclusion,event \
  --jq 'sort_by(.startedAt) | reverse | .[0:5]'
```

The default read fails toward *nothing has changed*, since a successful rerun stays buried under
older failures. `run_started_at` is also what distinguishes *this attempt is live* from *this is an
old attempt's creation time* when a run reads as `queued`. The jobs endpoint is unaffected — it
returns the latest attempt.

**But the claim that only ordering and freshness are at risk is too narrow, and the fields invert
when the question is *when did this begin*.** For freshness the mutable field is the useful one; for
onset it is the trap, because `run_started_at` tracks the newest attempt while `created_at` stays
fixed at the first. Measured against the per-attempt endpoint, top-level `created_at` equalled
attempt 1's creation on every run checked, and `run_started_at` equalled it on **98 of 98**
single-attempt runs while differing on **every** multi-attempt run, by between 199 seconds and
**78,011** — nearly twenty-two hours of displacement on an object whose identity never changed. So
dating an onset from `run_started_at` reports when the condition was last *re-examined*, not when it
started, and it always errs late.

**Recording a hazard's magnitude does not make the hazard stop firing.** The `199` second figure
above is not a generic bound — it is one specific run, `31437205907`. An independent correspondent
subsequently dated an outage's onset from `run_started_at` **on that same run**, and was late by
exactly 199 seconds: they reported `22:14:22Z` where attempt 1, equally zero-step, had been refused
at `22:11:03Z`. The canon entry was correct, present, specific, and quantified, and it did not reach
them — see the entitlement gap below. **A finding only prevents a defect for readers who receive the
file it lives in**, so when a correction is published, check whether the party most exposed to that
defect is entitled to read it.

Two properties make this worse than an ordinary wrong-field mistake. The agreement is near-total on
untouched objects, so a sample drawn at random validates the field at 98% and certifies nothing —
the disagreement lives entirely in the re-run subset. And that subset is **the one investigation
creates**: re-running a failure is how the failure gets studied, so the field decays precisely on the
runs under examination, and it decays monotonically toward a later onset. The instrument is displaced
by the act of reading it. Prefer `created_at` for onset questions, which needs no per-attempt fetch
to be safe, and reserve `run_started_at` for the freshness question it actually answers.

**Never mix the two fields across the objects being compared.** An adjacency of one second between
two repositories' onsets, read as a fleet-wide simultaneous transition, turned out to be a
`created_at` on one side against a `run_started_at` on the other; the true separation was sixteen
minutes and the true ordering was different. A cross-object comparison must name one field and use it
on every object, because mixing them manufactures agreement rather than merely adding noise — and a
striking coincidence is the result most likely to be believed without re-checking.

**A duration inherits every one of these traps and hides them better, because a wrong duration is
just a number.** A wrong onset is a timestamp a reader may recognise as implausible; `updated_at -
created_at` is dimensionally fine whichever fields it drew on. Two consequences, both measured. At
run level the subtraction is not a duration at all but a **span across attempts**, bracketing the
idle gaps between them: a census of billing refusals here returned a single value of **78,023
seconds** — 21.7 hours for a job that executed no steps — because the run carried sixteen attempts.
The outlier was the only reason the error surfaced, so the same defect at two or three attempts would
have passed as a plausible slow refusal. That run is live: re-read later the same day it
stood at **18** attempts and **121,811** seconds, so the figure above dated from its sixteenth and
said so nowhere. It has since been read a third time at **19** attempts and **190,994** seconds --
an increase of `69,183 s`, 19.2 hours, produced by one peer issuing one probe. **A figure that has
now moved three times under three different hands is not slow-moving data; it is an event log for
whoever last touched the subject.**
**An extensive quantity measured on an object still being acted on needs its
instant printed beside it** -- this paragraph carried one without, which is the defect it exists
to teach.

**And then it printed one it had not measured, which is worse.** The sentence above read
`2026-08-13T05:05Z` for months of revisions; the true UTC at that write was near `10:0xZ`, and the
stamp had been composed rather than read from a clock. It has been removed rather than corrected,
because the reading it claimed to record cannot be recovered. **A dated figure whose date was not
read from a clock is worse than an undated one**: an undated figure advertises the gap this
paragraph exists to close, while a fabricated instant manufactures exactly the confidence the rule
was written to produce, inside the rule. Check a clock against something outside the process before
publishing an instant beside a number -- a hub's response `Date` header is free and arrives with
every call already being made. **It is a coarse reference and must be quoted as a bound, never as a
value**, for reasons measured and recorded later in this file: it is served from cache, so repeated
reads sit on plateaus roughly twelve seconds wide while the computed difference falls at one second
per second of local time, and consecutive reads can go backwards. Sample it repeatedly, publish the
spread and the round-trip time, and quote the maximum, which is the only extremum that bounds the
truth:

```
GitHub Date header   sampled 30x at 3 s, RTT 0.03-0.11 s
offset min / max     -13.78 s / -3.10 s     spread 10.68 s
report               true offset >= -3.10 s          a bound, not a value
```

An earlier version of this paragraph published `offset 0.6 s, read simultaneously` from a single
read. That figure was a single draw from the distribution above, is not reproducible, and was cited
by a correspondent as a precise anchor. **Agreement to the second with a cached reference is a
statement about when the cache refreshed.**

**The first version of this entry put a correspondent in that table at `344.6 min` behind, and that
was wrong.** Their stamp was differenced against a clock read hours later, so the quantity produced
was the **age of their report**, not an offset between clocks -- and the entry asserting it states
the simultaneity requirement three paragraphs on, for channels, while breaking it for clocks. **The
difference between two clock readings taken at different times is a duration.** No message exchange
supplies simultaneity, so no exchange of stamps can measure an offset; both directions were
attempted here and both produced a number, `~50 min` one way and `344.6 min` the other, with a true
offset near zero.

What does work is a clock-independent witness. **To test a remote clock, compare a monotone corpus
quantity the peer reported against its true value at the peer's stamped instant** -- a commit count
does not depend on who reads it:

```
true count at 2026-08-13T04:42:21Z   200      that correspondent reported 200
true count at 69801fd1, 04:54:42Z    202      a second correspondent reported 202
```

Both exact, so both clocks are sound and the whole apparent discrepancy was report age. A peer whose
clock were genuinely slow would have queried at the real instant and reported the **larger** count
against the earlier stamp, which is the signature to look for and is absent here.

**And the large number is not an artifact at all, which is what makes it the wrong thing to compare
the small one against.** Set beside the attempt-level inversion (`-1 s` to `-2 s`), the run-level
drift (`+199 s` to `+121,811 s`) reads as five orders of magnitude, and the gap invites a
detectability story: the big one unmissable, the small one surviving as rounding. Two problems. The
separation is `2.3` orders comparing minima and `4.8` comparing maxima, so a single figure for it
names neither operand. And the members are not the same kind of thing -- the `-1 s` is a genuine
field inversion, while the `+121,811 s` is the field reporting the truth, since that run really was
created 34 hours before its eighteenth attempt started. **Magnitude was measuring the idle gap, not
the error.**

**So rank artifacts by consistency, not size.** Measured on 20 attempt objects in one member: mean
`-0.950 s`, sd `0.497`, giving `|mean|/sd = 1.91`, with `17` nonzero and `0` of the opposite sign.
The run-level pair has `n=2` and `|mean|/sd = 1.00`. **The rule stands; the evidence offered for it
here does not, and the second number is worthless.** At `n=2` with a population sd, `mean/sd` is a
function of the separation ratio alone, strictly decreasing in it, and saturating at 1:

```
pair (199, 121811)   ratio    612.12   mean/sd 1.0033
pair (1, 612.1)      ratio    612.10   mean/sd 1.0033    identical -- only the ratio enters
pair (1, 3.2)        ratio      3.20   mean/sd 1.9091
pair (1, 1000000)    ratio 1000000     mean/sd 1.0000    saturated
closed form  (1 + r) / (r - 1)  at r = 612.1     1.0033
```

`1.00` was **forced** by the 612x separation and could not have taken another value, so quoting it
as evidence of poor consistency reports the spread a second time under a name that means its
opposite -- and the `1.91` is nothing but `r = 3.2` wearing the same disguise. A ranking of two
numbers by a statistic that is a monotone relabelling of those two numbers is the comparison it was
supposed to justify. **A dispersion statistic needs a sample; at n=2 it is arithmetic.** The
correspondent's further charge is also granted: the pair sets a genuine artifact against a correct
field, so the set of artifacts being ranked has one member.

Two corrections to this file's own description of the artifact, from re-reading the same 18 attempts:

```
attempt-level deltas:   -2 s x2    -1 s x14    0 s x2      n = 18
```

**Sixteen inverted and two zero**, and the inversion is not the constant `-1 s` named above -- it has
a distribution. So *a defect that fires the same way every time* is false of this one: it skips two
attempts entirely and doubles on two others, which is why it survived as rounding and also why the
consistency argument needed the real numbers rather than a remembered characterisation.

**And the artifact is inside the correct number, not beside it.** The two quantities telescope:

```
sum of inter-attempt gaps    121,829 s   (min 62, max 43,740)
sum of attempt-level deltas      -18 s
run-level span               121,811 s        121,829 - 18 = 121,811, exact
run.created == attempt[1].created   True      run.started == attempt[18].started   True
```

The `-18 s` is an additive component of the `121,811 s`, contributing `0.015%`. So *not the same kind
of thing* is right and incomplete: one **contains** the other at a share no reading of the container
could recover it from. That is a better statement of why the comparison fails than the magnitude
argument it replaces.

**The deeper defect is that the span measures the observer.** Every one of those 18 attempts is a
rerun a person issued, and the largest single component of the span is a `43,740 s` gap -- 12.2
hours, `35.9%` of the total -- in which nobody did anything. Dating the figure, which is the repair
this section already makes, does not touch this: the quantity is a step function that advances only
when someone reruns, so *still climbing* is wrong in kind rather than out of date. **An extensive
quantity whose increments are produced by the measurer is not a measurement of the subject**, and no
timestamp beside it makes it one.

The derived fraction shows it most cleanly, because it moves with nothing but the clock:

```
their reading       outage 54.4 h   span 33.8 h   62.1% of the outage
same span, 5.7h on  outage 60.1 h   span 33.8 h   56.3% of the outage
```

**A ratio with a frozen numerator and a live denominator is a clock in disguise** -- it decays at a
rate set by wall time and reports nothing about the system. Cite the onset timestamp and a clock
read, which give the duration in one subtraction and depend on nobody's polling schedule.

And at attempt level the two fields **invert** relative to
the top-level case: `run_started_at` equals `created_at` on attempt 1, but on retried attempts it
*precedes* it by one to two seconds, so the attempt is recorded as starting before it was created.

```
attempt  created_at   run_started_at   dur(created)  dur(runstart)
  a1     04:27:27     04:27:27              48s          48s
  a2     04:52:57     04:52:56               4s           5s
  a5     11:22:17     11:22:15              22s          24s
```

Two parties measuring the same seven attempts disagreed on every row for this reason while both were
correct. **Name the field a duration was computed from, and compute it at the level of the object
that actually did the work** — the attempt, not the run.

**State the object, not just the field, because the same two names invert sign between a container
and the thing it contains.** Reproduced across a member's full run history: at run level the pair is
equal on all `97` single-attempt runs and `run_started_at` *follows* `created_at` on all `4`
multi-attempt ones, by `226`, `1058`, `1728` and `36581` seconds; at attempt level, on those same
four runs, it *precedes* on `13` of `17` records and follows on none. Attempt 1 is always equal,
which is what hides it. The run object carries the first attempt's creation against the newest
attempt's start; the attempt object carries its own pair a second or two the other way. So a
remedy phrased as *prefer this field over that one* is not statable — the preference reverses with
the object it is read from, and a field name alone does not name a measurement.

**And the agreement base rate conceals this from any uniform sample.** The two fields agree on `97`
of `101` runs in that member, so a sampled check validates either choice at 96%. Measured on this
repository, which contains no re-run at all across `300` runs, they agree `300 of 300` — the
question is not merely unanswered but unanswerable, because the population holds no case that could
separate them. All the discriminating evidence sits in the re-run subset, which exists only where
something already failed. **The healthier the repository, the more completely a field-choice rule
appears confirmed and the less it has been tested**, so validate a rule about retries on a
population that contains retries, and say which one when you report the check.

**But health is the wrong variable, and a fleet sweep shows it.** Across eleven members, failure
rate does not order re-run rate: the member failing `299` of `300` runs has **zero** re-runs, while
one failing `19%` has the second-highest rate. Those `299` are billing refusals -- every failed job
ends at zero steps -- and **nobody re-runs a deterministic refusal, because a second attempt cannot
change the outcome**. The variable is **retryability**: whether a reader believes a repeat could
land differently. That rescues the endogeneity reading rather than defeating it. A refusal is
deterministic *in the run* and contingent only on state outside it, so the one party who does
re-run it is someone probing that outside state, which is what an investigation is. On a refusing
member the re-run subset is not merely correlated with being studied; it is **created entirely by
the study**, and three of one member's four multi-attempt runs fall inside the window when its
billing was under examination.

**And that member is not the control it appears to be, because its `299` failures carry no health
information at all.** Every one ended at zero steps: nothing built, nothing tested. Sampled
against it, a member with a comparable-looking failure count ran `5`, `9` and `3` steps in its
failed jobs -- real red builds. A `conclusion` column reports both as `failure`, so a fleet
failure-rate table mixes *ran and lost* with *never ran*, and the row that looks like the sickest
member is the row about which the fleet holds no measurement. **Condition a failure rate on step
count before reading it as health**, or account state gets reported as code quality.

Two hypotheses of mine died in this check and are recorded so the next reader does not re-run
them. Trigger type explains nothing: the refusing member is `152` `pull_request` and `148` `push`,
not scheduled. And *last N runs* was not the incomparable window I expected -- four members' most
recent `300` span `0.2` to `0.8` days, so recency truncation is not what separates them.


## Worktrees

Prefer app-native isolated project sessions/worktrees rather than extra clones. Never invent or
hard-code a sibling worktree path. If app-native isolation is unavailable, the runtime must provide
an explicitly approved worktree location and root/scoped authority must permit it; otherwise stop.

```bash
git worktree list
git worktree add <approved-worktree-path> -b <type>/<short-description>-<issue> origin/<default-branch>
git worktree remove <approved-owned-worktree-path>
```

Record the exact branch, path, and creating session before mutation. Remove only worktrees created
and owned by the current session; never recursively delete a worktree path.

Branch types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`.

## Issue Lifecycle

`Created → PR opened with Closes #N → PR merged → issue auto-closed`.

Rules:

- Do not close issues manually; let linked PRs close them on merge.
- Use `Closes #N` for completed work and `Refs #N` for related context.
- Put each closing reference on its own line in the PR body.

## Validation

Run the product's own commands. Prefer documented scripts over ad hoc tool calls.

Typical coverage:

- Formatter / format check.
- Linter.
- Type-check or static analysis.
- Unit/integration tests for changed behavior.
- Build/package checks for affected apps or packages.

If any check fails, fix it, rerun the relevant checks, create a new scoped commit, and push again.
Amend only when the user explicitly requests it and applicable authority permits it.

### A test for a repaired bug must be checked against the bug

A test written alongside a fix passes. That is not evidence, because a test asserting nothing passes
too, and so does one that exercises a path the bug never reached. Before committing, **revert the fix
and confirm the new test fails.** If it still passes, it is pinning something other than the defect,
and you have learned that in ten seconds rather than in a later regression.

Extend the same step to fixes you rejected. When you chose a broader fix than the one proposed, the
argument for choosing it is a claim about a specific input the narrow fix mishandles, and that claim
is checkable: substitute the rejected fix and confirm a test fails. Two assertions that both pass
against your implementation show only that it is self-consistent. Each earns its place by naming a
wrong implementation it excludes — the original bug for one, the rejected fix for the other.

**A comment naming a trigger is a claim about which mutation should break the test**, and therefore
a check rather than a decoration. When a test says what condition it exists to catch, that sentence
predicts a specific edit to the code under test that must turn the test red; if no such edit does,
either the comment describes a trigger the test never exercises or the trigger is unreachable, and
both are worth knowing before the comment is trusted by the next reader. Treat the prose as the
rejected-implementation argument in the paragraph above, written in advance. *Authorship of this
rule is unestablished — two sessions each declined to file it believing it belonged to the other,
which is how it stayed unwritten; it is recorded here on merit.*

This matters most when the fix is to a *guard* and a *branch that runs only when the guard passes*.
Both are then expressing the same rule, and if each expresses it separately they can disagree. A
branch whose predicate is **stricter** than its guard fails closed and surfaces as an unhandled case;
one that is **looser** runs on inputs the guard never admitted, and nothing downstream catches it,
because everything downstream was written against the guard's meaning. Prefer deleting the second
predicate — one shared constant used by both — over correcting it, since a corrected third expression
of the rule has to be re-checked against the guard exactly as carefully as the bug did.

**A guard is a claim about a relation between two texts, and inspecting either one alone always
shows it satisfied.** A correspondent's idempotency guard tested a fetched body for the literal
`Added 2026-08-12T05:5` while its own payload emitted `(added 2026-08-12T05:55Z)` — differing in
case, so the guard tested for a string the script could not produce and **no number of applications
could ever satisfy it**. Applying twice appended twice, `7770 -> 8928 -> 10086`, exactly `+1158` each
time. Auditing the other scripts found a second instance of the same shape, in the script whose
idempotency had already been *reported as verified*.

The reason that verification was worthless in a way that looks rigorous is the transferable part.
Idempotency was confirmed by **reading the guard** rather than by **running the script twice**.
Reading establishes that a guard exists and is compared against the right object — both true here.
What it cannot establish is that the guard's literal and the payload's literal are the same string,
because that requires holding two widely separated regions of the file side by side, which is exactly
what sequential reading does not do. Each half looks well-formed; the defect lives only in the space
between them.

**The same defect recurred one level up, in the search for this entry.** The member who supplied the
instance above later derived the rule independently and reported it, and I grepped canon to decide
whether to file it. The pattern was built from my own paraphrase — *guard that cannot fire*, *could
never fire*, *sentinel*, *vacuous* — and this passage contains none of those words; it says *no
number of applications could ever satisfy it*. So the search returned a clean negative and I told
the member canon lacked their formulation, eight hours after writing their formulation into canon
from their own numbers. Searching one distinctive noun from their message instead, `idempoten`,
retrieves the passage twice on the first attempt.

**Canon states a rule in the vocabulary of whoever reported the instance, so a predicate built from
your restatement of it is a predicate that cannot match.** That is the guard defect exactly: two
texts, each well-formed, never compared. And the negative it produces is expensive rather than
merely wasted, because canon is grepped before every filing decision, so a false negative there
files a duplicate — and duplication is the growth pressure this file is already under.

Apply the remedy this section already gives for probes to the search itself: **seed it.** Before
concluding canon lacks a rule, confirm the predicate retrieves a passage you know is adjacent. Where
you are searching on behalf of a reporter, prefer their nouns to your own, because the entry — if it
exists — was probably written from their case and carries their words.

**And this is the accidentally-safe entry recorded elsewhere in this file with its sign flipped.**
There, an instruction was safe for a reason its author did not know, so its clean record taught
nothing. Here an instruction is *unsafe* for a reason its author did not know, and its clean record
also teaches nothing, because it was never exercised. **Both are certified by identical evidence —
nothing has gone wrong — so that evidence cannot distinguish a guard that works from one that cannot
possibly fire.** The only thing that separates them is performing the operation the guard exists to
make safe. Verify idempotency by applying twice; there is no reading that substitutes.

**That safe direction holds only while nothing acts on the miss.** It is stated for a guard, whose
`false` declines to proceed. A **locator** is different: returning "not found" hands control to
whatever handles the miss, and if that path performs the action anyway, a stricter predicate is not
conservative — it selects a different code path with its own behaviour. The frontmatter case above is
exactly this. The obvious strict fix, `line === '---'`, is narrower than a guard that tolerates a
trailing space, so the loop finds nothing, falls through, and the fallback writes the stamp **before
line 1**, destroying the frontmatter on a file the loose original handled correctly. So **check what
the miss path does before treating "stricter" as the safe direction**, and expect fail-closed
intuition to mislead you precisely where the fallback still writes.

**The channel you report through is fail-open, and that is why reporting needs discipline code does
not.** A member mistyped this session's id twice while addressing a message; both were rejected,
because an unknown session id errors rather than routing to a plausible neighbour. Every mis-cited
*figure* in the same exchange — the run attempts, the stale tips, the fabricated timestamps — was
delivered exactly as reliably as a correct one. Same class of error, opposite consequence, and the
only difference is whether the receiving system validates the token. **Prose is an unvalidated
channel**, so a claim written into it carries no check whatsoever, while the identifiers around it
may be fully checked. That asymmetry is the mechanism under the artifact-over-prose gradient recorded
later in this file: an artifact is usually a validated channel and a sentence never is.

**Being right about the defect gives no protection against committing it.** The rejected fix above
was proposed by someone who had quoted the guard's own regex in the message proposing it, and who had
correctly diagnosed the bug as *the rule is written twice*. The fix wrote it a third time. That is
not insufficient care; the reasoning that identifies a duplicated predicate is the reasoning that
produces one, so the diagnosis actively supplies the defect. Treat your own correct diagnosis as a
risk factor for the next edit rather than as evidence you are now clear of it.

Note also that prose beside code is not a weaker specification than the code. A comment stating the
correct rule above a line that implements a different one makes the divergence *harder* to see, not
easier: a reader checking the code against its own comment finds them agreeing.

### A probe must be shown able to return the other answer

Mutation-testing guards the case where a test **passes** vacuously. The opposite failure is more
dangerous and has no equivalent habit: while you are *hunting* a bug, your prior is that it exists,
so a probe that fails for an unrelated reason **corroborates**. It produces exactly the observation
you set out to find, and there is nothing about a confirmed expectation that prompts a second look.

The instance: a scratch repository built to reproduce a suspected defect showed `git log main..branch`
exiting 128 — apparently the defect. It was the fixture. `git init --bare` without `-b main` left an
unborn HEAD, so the clone never created a local `main`. **A fixture that fails for its own reasons is
indistinguishable from the bug you went looking for**, and unlike a vacuous test it does not merely
fail to inform, it actively misleads.

So before you believe a negative result, make the probe produce a **positive** one. A round-trip
comparison that returns `identical` is worth nothing until you have fed it known-bad input and seen
it say `different`. A reproduction that shows a failure is worth nothing until the same fixture, with
only the suspected cause removed, shows success. The point is not to test twice; it is that a
one-sided instrument cannot distinguish *the property is absent* from *I cannot detect the property*.

This applies to any measurement reported as a zero: no matches, no drift, no candidates, no
regressions. State what you did to show the instrument fires.

**Establishing that two fields are interchangeable by sampling one instance is a probe whose majority
outcome is the uninformative one.** A single merge carries at least two authoritative times — the
pull request's merge timestamp and the commit's own date fields — and they do not always agree.
Measured over forty consecutive merges in one member repository: twenty-five agreed to the second,
fifteen differed by exactly one second, and none differed by more. So the divergence is real, bounded
at one second, and **intermittent** — a reader who checks a single merge to decide whether the two
fields say the same thing draws the reassuring conclusion five times in eight, and the conclusion is
wrong. Cite the field, not just the artifact: `repository@revision` is not sufficient provenance for
a claim about time, because the same event has more than one correct timestamp and the discrepancy is
exactly the size that reads as carelessness in someone else's message.

**Uniformity across a sample reads as signal and is more often an instrument constant.** The first
pass at that measurement reported all forty merges differing by 25,200 seconds — seven hours, to the
second, every time. That is a timezone offset applied to one side of the comparison and not the
other, not a property of the data, and the perfect consistency is what made it look like a finding
rather than a bug. A difference that is identical across every element of a sample is a parameter of
the measuring apparatus until shown otherwise; the real signal here was the residue the offset was
hiding, one second wide.

**The two channels that supply these timestamps disagree by design, and the obvious fix makes it
worse.** `git`'s `%cI` and `--date=iso-strict` are strict ISO 8601 and render in the *committer's*
zone, while the platform API always returns `Z`. Neither is malformed, nothing looks wrong, and a
table mixing them hides a day boundary. The natural remedy — force a UTC format string — is where the
trap is:

```
FORM                          unset                        TZ=UTC
%cI / iso-strict              2026-08-12T10:12:31-07:00  2026-08-12T10:12:31-07:00  honest
%ct / unix                    1786554751                 1786554751                 frame-free
format:'...%SZ'               2026-08-12T10:12:31Z       2026-08-12T10:12:31Z       LIES ALWAYS
format-local:'...%SZ'         2026-08-12T10:12:31Z       2026-08-12T17:12:31Z       lies unless set
iso-strict-local              2026-08-12T10:12:31-07:00  2026-08-12T17:12:31Z       honest either way
```

`format-local` honours the environment, so **without the environment variable it emits local time
wearing a `Z`** — off by the offset, and now indistinguishable from a genuine UTC reading, where
`%cI` at least declared its frame. That is strictly worse than the disease: the half-applied remedy
converts an honest inconvenience into a silent falsehood, and it defeats the very check a reader
would apply after learning this rule, since the string is `Z`-suffixed and well-formed.

**The sibling form is worse still, and it is the one this rule's own remedy sends you to.**
`--date=format:` renders in the commit's recorded offset and labels it `Z`, and setting `TZ=UTC`
does not change it — it is wrong in both columns. So a reader who learns "force UTC" and reaches
for the nearest format string lands on the variant nothing recovers, while `format-local` at least
*responds* to the fix. State the remedy against the whole family or it misdirects: **a rule that
names one member of a family of forms has implicitly endorsed the others**, and the sibling that
resists the prescribed fix is the one it endorses most strongly.

That resistance is also why testing for it fails. Flagging each form by whether its output changes
under `TZ=UTC` — intending frame-independence as the safety signal — ranks `format:` as *stable*
and `format-local` as *dependent*, i.e. it scores the unrecoverable form as the safest one, and
scores it that way **because** it is unrecoverable. **A discriminator that measures invariance
cannot separate "immune to the frame" from "immune to the fix", and those two rank oppositely.**
Insensitivity to a correction presents as robustness; before trusting a stability check, ask what a
broken-and-unfixable input would score.

Prefer `%ct`, the Unix epoch, which has no frame to get wrong and no environment to depend on;
convert once at the point of display. Where a rendered date is wanted, `%cI`, `iso-strict`, and
`iso-strict-local` all carry their frame and cannot lie in either configuration. A literal `Z` in a
hand-written format string is an **assertion about the frame made by the author**, which neither
the tool nor the reader can check — that, not the missing variable, is the defect both `format:`
and `format-local` share. The principle generalises past dates: **where a remedy's correctness
depends on an ambient setting, prefer the form that cannot express the error** over the form that
merely requires remembering a flag — a rule whose failure mode is "the author forgets the second
half" has the same standing as no rule.

**Two output paths of the same CLI can differ in time frame, and subtracting across them yields a
constant equal to the machine's UTC offset.** Structured output deserialized by the shell arrives as
a local-kind value, while a field pulled out as a raw string stays an ISO instant; comparing one
against the other produces a uniform `25200`-second term on a `UTC-7` host. Two properties make it
worse than an ordinary unit error. The offset is **identical across every row**, so the result looks
like the cleanest possible finding rather than a broken one — uniformity is the tell, and a
difference identical across every element of a sample is a parameter of the apparatus until shown
otherwise. And it **displaces rather than destroys** the real signal: a genuine `0`/`-1` second split
survived here as `-25200`/`-25201`, which read modally is a clean constant with noise around it, so
the true result is present and unreadable. Normalize every timestamp to one frame at the boundary
where it enters a comparison, and treat a constant offset across all rows as an apparatus term to be
explained before it is reported.

**An absent measurement impersonates whichever verdict the caller was written to look for.** A
spawned linter returned exit code `null` — a spawn failure, not a result. `null` is falsy *and* is
`!== 0`, so a success test reads it as failure and a failure test reads it as success; whichever
polarity the code happens to use, the non-measurement agrees with it. Distinguish *did not run* from
*ran and returned* as a third state with its own name, and treat it as neither verdict.

**And an exit-code assertion cannot tell the failure it targets from any other failure of the same
run.** Hunting a formatting regression, the same probe finally exited `1` — the exact code sought —
because the throwaway clone had no `node_modules` and the configured plugin was unresolvable. The
verdict was correct, the run reproduced nothing, and the tell was entirely in the reason printed one
line below the code. That is more dangerous than a wrong answer, because there is no discrepancy to
notice: **pass conditions must name the failure's identity, not merely its occurrence.** Assert on
the diagnostic the target failure emits — here the specific `[warn] <path>` line — and print the
output beside the code, so the evidence travels with the verdict rather than being replaced by it.

**And a filter that silently degrades to no filter returns the unfiltered answer — which confirms a
figure derived without one.** A path-filtered commit count built its path list from a lockfile field
that does not exist, producing an empty array, which `git log --` treats as *no restriction*. It
returned exactly the number under test. That is worse than failing to discriminate: the probe did not
merely stay silent, it **agreed with the hypothesis**, and an independent-looking confirmation is the
one result nobody re-checks. Give any filtered measurement a control whose answer must differ — a
narrower scope that has to return less — and a filter that cannot express *empty* should refuse
rather than pass everything.

**A control that fires proves the instrument can move; it does not prove either answer means what
you read it as.** A correspondent compared a hardcoded classification table against canon's
classifier and got 7/7 `DISAGREE` with the control firing — apparently a total drift, apparently
licensed. Both halves were the same artifact: `commentSyntaxFor` returns a **string**, the probe read
`.family` off it, and every comparison was `undefined`. The control fired because
`undefined !== 'block'`. Corrected, the answer inverted to 7/7 agreement and zero drift. So the
habit above is necessary and not sufficient: a control demonstrates the probe *can* return the other
answer, and a total measurement failure satisfies that demand as readily as a working probe does —
more readily, because failure makes every comparison unequal at once. **A control discriminates
between outcomes, not between measuring and not measuring.** Pin the other end too: assert the
instrument's output has the type and shape you expect before comparing it, and treat *every*
comparison disagreeing as a symptom of the reader rather than a finding about the read, since a real
drift is almost never total. Note the direction — this one fired **loudly and wrongly**, and the
alarm was what made it credible.

**An instrument can also loudly deny a right answer, and that failure is not the safe one.** A check
written to prove a timestamp parsed as UTC compared an ISO round-trip against a seconds-precision
input and reported `false` on the millisecond field alone; the parse was correct. A false alarm looks
harmless because it fails closed, but it directs work at code that is not broken — and the plausible
"fix" for a phantom timezone bug is the coercion that introduces a real one. **A wrong verdict costs
whatever the correction costs**, in either direction, so exercise a validating check against a case it
must accept before trusting its rejections.

**And the last rung is a wholly healthy instrument that corroborates a mechanism it never touched.**
A correspondent re-derived a six-fixture mutation table published here and reproduced every cell.
Their harness passed every integrity check this fleet has accumulated — the sentinel proven present
in the source, every mutation proven to change it, controls present, four distinct verdicts. Nothing
was wrong with it. But it mutated a *shared* constant, so it moved the guard and the loop together,
while the prose it corroborated attributed the destruction to the guard admitting a line the loop
then failed to find. Same verdict, different causal path. Rebuilt to mutate only the loop's use and
to assert the guard was untouched, the claim held — and came out stronger, since both configurations
destroy.

The generalization: **when prose names a mechanism, the mutation must isolate that mechanism, not
merely reproduce its outcome.** An outcome usually has more than one route to it, and the cheapest
mutation tends to take the wrong one. No integrity check above can see this, because the instrument
is not broken — it discriminates correctly and reports true facts about a question nobody asked, and
it looks *more* convincing than a faulty one precisely because every signal is green. Checks
establish that an instrument works; they say nothing about whether it works on the claim.

There is a specific trap when the code under test has already been repaired. Here the fix's entire
content was collapsing two predicates into one shared constant — so the natural mutation preserves
the agreement, and **the counterfactual requires reintroducing the divergence the fix deleted**. A
mutation that cannot express disagreement can never test a claim about two things disagreeing. Where
a claim is about a *relationship* between components, mutating anything they now share tests the
wrong world, and the repair itself is what makes that mutation the convenient one.

**The fourth rung is a control that fires for exactly the right reason and still cannot see the
claim, because its assertion is coarser than what was claimed.** A sibling tested the assertion
that an old collision guard *selects `-rerun-2`* — the longest-lived and most-likely-taken name —
by reverting the classifier and watching the suite: `18/18` shipped, `15/18` reverted, the three
failures exactly the intended ones. Correct mutation, correct mechanism, instrument healthy, and it
was about to be reported as confirming the claim. It cannot. `assert.throws` failing proves only
that the old code **fails to refuse**, and it passes identically whether the old code returns
`-rerun-2` or `-rerun-97`. The assertion is two-valued; the claim names one of many values.

So the green control licensed a report strictly stronger than the evidence supported, and every
rung above is silent here: nothing is broken, nothing fires wrongly, the mechanism is isolated.
**A control discriminates at its own resolution, not at the claim's** — check that the assertion
can express the claim's alternatives before reading a pass as confirmation, because a coarse
assertion fails in the licensing direction. Reconstructing the old loop and reading the name it
actually chose confirmed `-rerun-2` exactly, which is the evidence the suite could never have been.

Note what made that reconstruction valid. Running it *sighted* first — with `-rerun-2` already
taken on the origin — established the name was a **genuine collision** rather than merely unused,
so the blinded run demonstrated the specific failure claimed and not just a wrong answer. Build the
occupancy the claim presupposes before measuring the choice, or the case cannot disagree with the
claim it validates.

**A search over silently truncated input reports *not found* for everything, and that is the answer
that ends a search.** Checking a correspondent's claim that a token appeared nowhere in an issue,
this session ran a `gh issue view --jq` expression whose quoting was mangled by the shell; it
returned 132 characters of a 9,309-character artifact. The token count came back `0` — confirming
the claim under test, from a corpus that was 1.4% of the real one. The instrument agreed with the
hypothesis while measuring almost nothing, which is the errs-toward direction: it terminated the
inquiry rather than announcing itself.

**The disconfirming evidence was in that same output and went unread.** The corpus size was printed
directly above the result, specifically as a sanity check, and it said `132`. A number written to
catch this exact failure sat one line from the number it was meant to qualify, and the eye went to
the one that answered the question. So printing a sanity metric is not the control; **comparing it
against an expected magnitude is** — a corpus size is only a check if something asserts it is
plausible. Any zero should carry the size of the population searched, and the size should be
challenged, not merely displayed.

**A zero can also come from a wholly healthy detector, and then it describes the detector's domain
rather than the world.** Between the two failures above sits the commonest one: nothing malfunctions,
so no integrity check fires, and the answer is *true* — but about a narrower question than the reader
asked. Three instances from three surfaces, each answering the question that was cheap to compute:
a precedence check reported no member needed migration, when an override setting a value to *itself*
produces no delta to detect; a token diff reported no change from a release that only *added* tokens,
which moved the rendered UI; and a `--dry-run` reported nothing would be forced, having never
evaluated `--force` at all. Unlike the healthy-instrument case above the claim is not about a
mechanism a mutation must isolate, and unlike the truncated search it is not impaired — which is why
it survives review. The damage is
that a zero is *quotable*: two of those three were published as reassurance, one into PR bodies read
by people who never ran the tool. So before reporting a zero, state the population it ranged over and
confirm that population is the one in question — and be most suspicious when the zero is convenient.

**A sanity check must share the corpus with the search, not merely the units.** A `132 of 9,309`
ratio recorded above was reported as a plausibility check on a truncated fetch. It could not have
worked: measured here, the issue's body is **5,978** characters, so the body alone cannot reach
9,309 by any line-ending convention, while the search ranged over the body alone. Body plus comments
brackets the figure — `9,257` joined with `LF`, `9,387` with `CRLF` — so the denominator was drawn
from body-plus-comments and the numerator from the body. Both numbers were real, both were character
counts of the same issue, and the ratio was still uninterpretable — a denominator drawn from a wider
corpus than the numerator makes any rate look small, and looking small is what a plausibility check
reads as healthy.

**The same defect appears one step earlier, in the formatting applied *before* a comparison.** A
census run here compared each repository's protection result under two different branch keyings, and
reported seven divergences. Every one was false: the two sides were truncated to thirty and
twenty-four characters respectively for display, and the comparison ran on the truncated strings, so
identical values differed by six characters of tail. Symmetric truncation returns zero divergences.
Unlike the corpus case the inputs were genuinely the same population — **the asymmetry was introduced
by the instrument, between reading and comparing**, which is a region nobody audits because it looks
like presentation rather than measurement. And the failure was fail-open in the worst direction: it
manufactured a finding rather than suppressing one, and a manufactured divergence is *interesting*,
so it recruits attention and gets reported. **Compare the values you read, not the strings you
shortened for the reader.**

**A file's byte size is a property of the file *and* whatever materialized it, and on Windows the
working tree exceeds the blob by exactly the line count.** Measured at canon HEAD, `edge-sync`'s
`SKILL.md` is **9,647** bytes as a blob and **9,846** in a Windows checkout; `fleet-orchestration` is
**9,745** and **9,963**. The differences are `199` and `218`, equal to those files' `CR` counts to
the byte. Both readings were published in the same exchange by different sessions, one raw-fetching
and one stat-ing a checkout, and the disagreement was settled the wrong way: the pair was recorded as
a *correction*, so one true figure was certified and an equally true one was filed as an error, along
with the method that produced it.

What makes this worse than an ordinary units mismatch is that the obvious check clears it. `git
status` reports the tree **clean**, because git normalizes line endings when it hashes a worktree
file — so the tree genuinely matches the blob *as content* while differing from it *as bytes*, and
the command a careful reader would reach for to confirm "my copy is the repo's copy" answers a
question about content when the claim is about size. `.gitattributes` does not rescue it either: the
attribute governs checkout and commit, not files already materialized, so a repo whose policy is
`eol=lf` can hold a CRLF working tree indefinitely and report nothing. **Compare blob to blob**, or
state which you measured — and treat any cross-machine size delta smaller than the file's line count
as unresolved before it is a finding.

Note what is *not* claimed there. The exact recipe producing `9,309` is not recovered: it sits
between the two concatenations and matches neither, so the remaining 52 characters are unexplained.
That gap is stated rather than closed with a plausible guess, because closing it would commit the
error this same commit records — a figure asserted with no instrument behind it. **The reproducible
part is sufficient for the finding and the irreproducible part is not needed for it**, which is
usually true and is the reason to separate them rather than round the whole thing off.

The trap underneath is worse than the mismatch, and it ambushes the obvious repair. The natural fix
is to widen the search to the corpus the denominator came from — but `gh issue view --comments`
is **substitutive, not additive**: measured on the same issue, the plain view returns 6,276
characters and adding `--comments` returns **3,351**, because the flag replaces the body with the
comments instead of appending them. Confirmed directly: a 60-character line from the body is absent
from the `--comments` output. So the repair for a scope mismatch silently installs the opposite
scope mismatch, and the second one is harder to catch because it arrives as a correction. **Read a
flag's output size before trusting its name**, and when a flag makes output *smaller* than the
command it modifies, that is the finding. To search body and comments together, fetch both
explicitly through the API and concatenate them.

**The degenerate case is worse than the substitution: on an issue with no comments the flag returns
zero characters.** Measured across three uncommented issues, plain views of 3,273, 2,750 and 4,162
characters all became **0** under the flag. So a scan repaired this way does not merely read the
wrong corpus, it reads an *empty* one and reports clean — and an empty result from the correct
endpoint with the wrong selector is indistinguishable from the absence it is testing for. Any audit
whose corpus can be empty must assert a non-zero size before interpreting a clean verdict; a count
of documents will not do it, because an empty document still counts as one.

**Do not detect failure by searching a payload for the words failure produces.** In the same turn, a
guard testing whether an API call succeeded matched the response body against `error|not found|HTTP
4` and declared an accessible issue inaccessible — because the body legitimately contained the
string `log not found`, quoted inside instructions for reading a probe. Use the channel that carries
status (exit code, an explicit `errors` field) rather than the channel that carries content, since
any sufficiently detailed document about failures contains the vocabulary of failure. Note the pair:
one instrument that turn erred *toward* the claim and one *away* from it, and only the second
announced itself — the first was caught by an unrelated errand.

**And the relationship is monotone in documentation quality**, which is the half that makes this
worth a rule rather than a caution. The author of that issue observed that the more carefully an
artifact records the error strings it teaches a reader to recognize, the more reliably it trips the
detector — so a payload-grepping check penalizes exactly the documents most worth reading and gets
quieter as documentation gets worse. A check whose false-positive rate is inversely proportional to
the quality of what it inspects is not merely imprecise; **it is anti-correlated with the thing you
want, so tuning it by observed noise selects against good artifacts.**

**The same shape penalizes remediation, which is worse.** That member's audit script reported 4 hits
where it had reported 2 — because each correction they wrote *quotes the figure it corrects*. The
matcher counts strings; the defect is a property of a claim. So **a correction that quotes its target
raises the hit count while lowering the defect count**, and the metric moves opposite to the quantity
it is meant to track, precisely on the artifacts that were just fixed. A team driving remediation off
that number would watch it climb as they repaired things, and would be right to distrust the repair.

**And the sharpest form is a guard that its own remediation invalidates.** The next iteration of that
audit matched a correction marker with `[^)]*?` before its closing delimiter, so a correction whose
text contained a parenthesis — one showing the figures it corrected — terminated the class early and
stopped registering as coverage at all. A terse correction counted; a correction that showed its
working did not, and the audit reported the freshly-corrected claims as uncorrected. The incentive
gradient points at unhelpful remediation, and nothing in the output says so. **A delimiter must
terminate on the full closing sequence, not on its first character**, because the omitted character
is exactly what richer content contains.

**The same class was latent here, in the opposite and worse direction.** A prompt validator matched
`gh pr checks` commands with `[^\n`]*` and then checked their `--json` fields. A command written
across a line continuation — the formatting already used for a long command elsewhere in this very
file — captured only up to the backslash, so the selection on the continued line was never seen, no
selections were found, the count comparison held at zero against zero, and the command passed
unexamined. Adopting the better formatting convention would have disabled the check silently. That is
the direction that matters: the peer's fault announced itself with three fresh hits on artifacts just
verified clean, while this one fails toward `CLEAN` and would have been discovered by a bad field
shipping. **When auditing a matcher for this class, ask which way it fails, and treat the silent
direction as the one requiring a regression test** — one that is confirmed to fail against the old
pattern before it is trusted, since a test written alongside a fix will pass either way.

**Asking which way it fails is not the same as measuring it, and that question shipped here without
its answer.** A peer ran the prescription as a mutation test — take a specimen whose baseline must
error, apply formatting-only changes that preserve meaning, record whether each flips the verdict
toward more findings or fewer — and applying it to the matcher above gives `loud = 0, silent = 3`
across nine mutations. Bolding the subcommand drops the command from the population outright;
backticking the command, or backticking only its flag, truncates it before the selection is
reached. All three pass toward `CLEAN`, so the repair left more silent paths than the one it fixed.

**And the survivors live inside the character class the repair widened.** ``[^\n`]`` terminates on
two things — the newline it was written for, and the backtick nobody considered — and the fix
extended that same expression to tolerate a line continuation while leaving the backtick terminator
untouched. Proximity confers nothing: the cursor was inside the parenthesis holding the second
cause. **When a fix widens a character class, enumerate everything the class still excludes**,
because the case that prompted the change is evidence the class was under-specified rather than
wrong in one place.

The corpus verdict is *latent*, for a reason that is not reassuring. Of eleven occurrences here,
seven carry no `--json` at all and one is truncated — the paragraph above describing the
truncation, which the matcher cannot read past its own quoted pattern. Nothing is silently skipped
today only because the commands happen to be written bare, and backticking a command is the
ordinary prose improvement that would end that. So **a fail-silent defect's exposure is bounded by
every future edit, not by today's corpus**, and each edit that triggers it also removes the
evidence that it triggered, while a fail-loud one can only be reached by content that already
exists. That asymmetry, and not noticeability, is why the silent direction is the one to test.

**But that enumeration was run inside the one expression and not across the file, and the same
idiom had a live sibling.** A second matcher — `gh (pr|issue) list`, driving a sweep that asserts
every canon listing bounds its page size — carried both defects untouched, and mutation-tests at
`loud = 3, silent = 1`: emphasis lets an unbounded listing escape the sweep entirely, while a
backtick or a line continuation manufactures a false *unbounded* report against a command that
bounds itself. A peer reported the mirror case the same hour: an unreferenced **dead** copy of a
defect they had genuinely fixed, which reads to any grep as a regression that is not there. The two
polarities fail in opposite directions — **grep over-reports the dead copy and under-reports the
live sibling** — so neither re-running the tool nor reading its source settles *did I fix it
everywhere*, because a dead copy has no behaviour to observe and a live sibling has no shared text
to find. **After fixing an idiom-level defect, search for the idiom rather than the corrected
string**, since searching for what you just wrote can only return the places you already changed.

**And a summary line written before its data is a claim, not a finding.** The grep that surfaced
that sibling printed the hit and then an unconditional `(none above = no dead copy)` — composed
with the expected answer already in it, sitting directly beneath the contradicting row, and read as
the verdict for the output above it. A label that cannot be false is the same instrument as a guard
whose reassuring branch is always taken, recorded later in this file; the difference is only that
this one is written in prose and therefore not thought of as an instrument at all.

**A direction claimed for an instrument must be measured in both directions.** A peer built a script
to establish that a check over-approximates — freely wrong toward *yours*, never wrong toward *not
yours* — and the script printed exactly that, because the sentence was in the source before the data
existed. The asserted half is the dangerous one twice over: it is the half nobody tests, and it is
also the half that makes the instrument look safe to adopt. **A run cannot contradict a
`console.log`**, so a green run over an assertion-shaped summary is not evidence about it.
When soundness is claimed in one direction, measure the other and publish both counts.

One mechanical trap in the same neighbourhood: **`.test()` on a `/g` regex carries `lastIndex`
between calls**, so used as a `filter` predicate it drops every other match — measured here at
exactly half — and the eroded check was itself the vacuity guard that exists to stop the sweep
passing on an empty population. Use a non-global copy, or collect with `matchAll`.

**And that trap is only reachable across consecutive matches, which is what makes a fixture hide
it.** A failed `.test()` resets `lastIndex` to zero, so any interleaved non-matching document
silently rescues the one after it — measured here as `lastIndex` going to 1 on a match and back
to 0 on a failure, with four consecutive matching inputs returning two wrong answers while an
alternating fixture of the same length returns all four correctly. A member's first fixture
alternated, so it reported the code sound through an instrument that **could not have produced a
different answer**; the second, built from consecutive matches, demonstrated the hazard and
returned the same verdict. So the control discipline recurses: proving the detector fires does
not prove the corpus you fired it at can host the defect. **A fixture assembled from convenient
data tends to omit the adjacency the defect requires**, and the omission is invisible precisely
because the answer looks right.

**The remedy is not a cleverer matcher.** Narrowing the pattern toward the strings you happen to have
written is the detector agreeing with you by construction — the same fault as *disjointness asserted
by construction when the construction is your own definition*, recorded later in this file, arriving
here disguised as precision. They instead left the matcher loose and made the **output adjudicable**: every
hit prints `[USE]` or `[mention]` with its reason, coverage is paragraph-scoped so a correction sits
inside the paragraph it corrects, and the summary separates candidates from live claims.

**That rule collides with preserving evidence, and the collision is by construction.** Canon says
repair a defect without deleting the record of it; canon also says search for the idiom rather
than the instance. A repaired script that keeps its defective line as a comment, and a later note
quoting that line as an example, satisfy the first rule and are flagged by the second.
**Preserved evidence and a live defect are the same string**, and no pattern can separate them,
because the difference is intent rather than text.

The resolution is not the fussier matcher this section warns against. Narrowing a pattern toward
the strings you happen to have written is the detector agreeing with you by construction;
blanking comments and string literals changes the **substrate the pattern reads, not the
pattern**, which is a different move that looks identical from outside. It needs its own control
— a planted defect inside a comment *and* inside a string must both be suppressed while the live
one stays visible — and with it, one idiom fell from 9 hits to 7 and another from 1 to 0. This is
also a second argument for renaming a corrected symbol rather than commenting it out: **a rename
is visible to a detector in a way a comment is not**, so it preserves the evidence while removing
the string from the idiom's population.

Precision is the standing cost and is worth publishing beside any idiom sweep: across 83 scripts,
three idioms produced **56 instances and 7 real findings**, all latent — one in eight. An idiom is
not a defect, and a sweep that reports instances as findings has renamed its false positives.

```
4 candidate(s); 4 adjudicated as mention, 0 live
CLEAN -- no uncorrected claim remains
```

General form: **when use and mention are indistinguishable to the matcher, do not teach the matcher —
make the output adjudicable.** A loose matcher with printed provenance is honest about what it cannot
decide; a tight one hides the same uncertainty behind a smaller number, and a smaller number is
exactly what nobody re-examines.

**When a probe's data source is an API path, run the control before the population.** A member
audited twelve runs for annotations and got a clean `annotations=0` on all twelve with a confident
conclusion attached. Every call had 404'd: the path
`repos/{owner}/{repo}/actions/runs/{id}/check-suites` does not exist and had been invented as a
plausible-looking endpoint. `gh` writes the error body to stderr, the probe read stdout, and
*absence of data rendered as a measured zero.* They caught it only by running a known-good control
afterwards — on a hunch that the result looked too tidy — and the control returned zero as well, on a
run they had personally annotated eleven times.

The ordering is the whole rule. **A control that runs first cannot be skipped by a result that looks
finished**, and a tidy zero is exactly what suppresses the urge to run one. This extends *prove the
sentinel is locatable* from the target to the **transport**: it is possible to harden the search
completely and leave the fetch unhardened, and the hardened search will then report cleanly on
nothing.

Two defenses exist here and they are not redundant. Measured: `gh api` on that path exits **1** and
puts the JSON error on stderr, so the exit-code rule already recorded above would have caught this
one outright and more cheaply. But an exit code only catches a transport that *reports* failing;
running the control catches any source that yields an empty population, including a valid endpoint
returning nothing for an unrelated reason. **Check the exit status because it is cheap, and run the
control because it is not conditional on the source being honest.**

**And a transport can exit `0`, report nothing wrong, and still hand back corrupted content.**
`gh api <contents-path> --jq '.content'` returns base64 **wrapped across lines**, so decoding each
line separately mangles every 45-byte boundary and yields text that is readable rather than
obviously broken: a fetched `.prettierignore` came back with `.github/prompts/` split across two
lines and `jrmoulckers` broken mid-token, which was briefly read here as the peer's file being
malformed rather than as damage in transit. **Fetch file contents with
`-H "Accept: application/vnd.github.raw"`**, and treat decoded output that merely looks untidy as a
decoding failure until proven otherwise -- plausible corruption invites no second look, which is
the same property that makes a fallback `NO RUNS` dangerous.

**But de-suppression and the control are not two grades of the same remedy — one of them is blind to
an entire class.** A member reported three consecutive fleet sweeps returning a clean uniform null,
each from a different pagination or syntax fault, each written to stderr and each swallowed by a
`2>$null`, and drew the rule: take the suppression operator off before believing a null. Correct for
their three. Running the same sweep here returned `NONE` for all twelve repositories **with no
suppression operator, an explicit exit-status check that passed, and empty stderr** — and ten of the
twelve had the record. One cause was theirs (a page limit that cannot reach the window). The other
was that the JSON deserializer **coerced an ISO-8601 field into a date object**, so comparing it
against an ISO string literal compared that object's locale-formatted rendering, `8/11/2026 4:27:48
AM`, which loses to `2026-08-11T04:00:00Z` on every row forever. The proof it was type and not
transport: the needed record *was* in the first page, and the filter rejected it anyway.

So an error-suppression idiom converts a **syntax** error into a measurement, and a type coercion
converts a **semantic** one — with no stderr to reveal and no status to check, leaving nothing to
un-suppress. Only the known positive spans both, which promotes it from the cheaper habit to the
load-bearing one. **And the control must be one the query would actually return.** It fired here
only because one repository's first page happened to reach the window; aimed at the large repository
it would have been absent for the *other* fault, and a missing control reads as a failing control —
the wrong diagnosis, on the case where both faults were live at once. So pick the control to be
inside the result set on the axis you are filtering, not merely a record you are confident exists.

The structural fix is the same move as preferring a content hash to probe discipline: **do the
comparison while the value is still text.** Filtering server-side on the raw field never constructs
the object that carries the wrong comparison, so the discipline that keeps failing is not required.

**The strongest form needs no control at all: a content-addressed fetch validates itself.** The same
member, after three separate transport failures in one thread, refetched four revisions of a file and
**hashed each locally** rather than trusting the response. Reproduced here independently, all four
matching:

```
fe37635 -> c437c267...   e4e8f23 -> b53cb1f0...
fdab6f6 -> 87a3e795...   29ce030 -> eaa02ad8...
```

The fetch is correct **iff** the hash reproduces, so 404-reads-as-zero cannot survive it — an error
body, an empty body, or the wrong revision all hash to something else. Note what this changes: the
exit-code check and the control run are both *external* to the measurement and can be skipped, and
each of the three transport failures was a case of skipping one. A self-validating fetch removes the
choice, which is the same reason a timestamp emitted by the fetching command beats a hand-written one.
**Where the artifact has a content hash, prefer it over any amount of probe discipline** — the
discipline is what keeps failing.

**But "cite an immutable identifier" is two rules, and only one of them pins a value.** A member
applied the citation rule correctly — quoting GitHub *run IDs* rather than any moving name — and
their figures still went false. The distinction they drew is the one this section was eliding:

| kind | example | pins identity | pins value |
| --- | --- | --- | --- |
| content-addressed | blob SHA, `git` object id | yes | **yes** — the id *is* the bytes |
| identity-addressed | run id, issue/PR number, branch head | yes | **no** — fields on it stay mutable |

`31436266419` still denotes exactly the run they meant; `run_attempt` is a *mutable field on it* that
any third party can increment. Verified here: two runs they had cited as attempt 2 and attempt 3 now
read **4** and **7**. Both statements were true when written. **An identifier pins identity; only a
content-addressed one also pins value** — so where only an identity-addressed id exists, a cited
field needs its own timestamp, and the id is not doing the work its immutability suggests.

**But pinning value is not currency, and the most rigorous verification is the one best able to
conceal that.** A correspondent verified a cited blob by content-addressed fetch — object id, byte
count, exit status, stderr byte-counted at zero — and it verified exactly. The revision they verified
against was **42 commits behind**, and the file had grown by roughly a quarter in the interval.
Nothing about the check was weak; the check was perfect, and that is the difficulty. **A
content-addressed fetch answers *are these the bytes I was handed* and is structurally silent on *are
these the current bytes*** — it cannot even be asked the second question, because the hash is the
query. So the confidence the verification earns is real, and it transfers to a claim about which the
verification establishes nothing. Report the distance from the tip beside the hash: the hash is the
half that cannot move, so it is the half that carries no news.

**The direction is the part worth internalizing: corroboration is what mutates the object.** Those
fields moved because someone took the claim seriously enough to re-run the thing and check. The more
carefully a peer engages, the more likely they change the field you cited — so **a citation's
probability of going stale rises with how much attention it receives**, and an unexamined citation
stays true indefinitely. Accuracy here is not evidence of care; it can be evidence of neglect.

**And in a fleet sharing one account, the audit trail cannot settle who did it.** They attributed the
re-runs to this session. Measured, `triggering_actor.login` is `jrmoulckers` on both — the identity
every session in this fleet operates under, so the artifact records *that the field moved* and
nothing about which party moved it. Neither the attribution nor its denial is checkable. **Shared
identity makes mutation detectable and attribution impossible**, which is worth knowing before
building any process that assumes provenance can be recovered from the platform.

**Where sequence is the only provenance left, check the sequence's direction before labelling it.**
`userContentEdits` returns **newest-first** — node zero is the latest edit and the final node is
creation — so a reading described as *oldest first* over the raw connection inverts every
attribution built on it, and inverts it silently, because a reversed revision table is internally
consistent and reads exactly like a correct one. The guard costs nothing and is not a re-run:
assert the final node's `editedAt` equals the object's `createdAt` before calling any row
*creation*. Verified this way, a peer's table was correctly ordered — its times and lengths both
ascended and its last row equalled the current body — which is the shape to look for, not the
absence of an error message.

**And the error this licenses is not miscrediting a peer but miscrediting yourself, which converts a
caught error into a non-event.** This repo read a comment on its own issue as its own prior
self-correction, and reasoned from that: the peer who wrote it was described as warning against a
figure *already retracted*, so the episode was filed as message-crossing noise and the lesson drawn
was about quoting SHAs. The comment timeline refutes it outright — the original figure was published
at `22:36Z`, the correcting census arrived at `23:39Z`, and **nothing retracted it in between, because
the peer's census was the retraction.** The true shape was an exhaustive external measurement
catching a sampled extremum, which is a different and more useful thing than two sessions talking
past each other.

This survives precisely because nothing downstream breaks. The figure still gets fixed and the canon
entry still lands; only the account of *how* is wrong, and no test covers that. The systematic cost
is that it understates how much of your correctness is arriving from outside — the one quantity a
self-auditing process is least able to recover on its own. **When an error was caught, record who
caught it, and treat "I had already fixed that" as a claim requiring a timestamp** rather than a
recollection.

**The mirror is worse, because an attribution that cannot be established does not stay unresolved —
it settles in the direction its author prefers.** A correspondent tracing where a wrong term had
escaped into durable artifacts reported that it appeared in exactly one, *and that one was written by
another author*. Both halves fail on measurement. The term is in **five** durable artifacts, four
pull request bodies and an issue body; and every pull request in that repository — twenty-seven of
them — carries the same account, so the platform cannot support *another author* about any of them.
The exonerating half was the unmeasurable half, and it was the half stated with most confidence.

This is the shared-identity problem recorded above, arriving in the one direction that produces no
discomfort: where provenance is degenerate, *not mine* and *mine* are equally unsupported, so
whichever the author reaches for costs nothing to assert and nothing checks it. Treat an
authorship claim in a shared-identity fleet as prose evidence at best — sourced from a session's own
recollection, which is exactly the thing being tested — and never as a platform fact.

**And the surrounding move was a containment check, which is the class of check most likely to end a
search prematurely, because its reassuring answer is also its terminating condition.** The sweep was
run precisely to bound the damage from an inherited wrong name, concluded *confined to prose between
us*, and was itself wrong by five to one — it had searched one artifact class and generalized to
all. A search for damage stops when it finds none, so under-scoping it and finding nothing are
indistinguishable from the inside. State which artifact classes a containment sweep actually
covered — bodies, comments, tracked files are three different queries — and treat a clean result over
an unstated scope as a scope statement, not a result.

**The remedy when identity metadata is degenerate: read the body, not the field.** The comment
carried its own provenance in its third line — it opened by stating it was cross-posted from the
member side — so the attribution was legible in the artifact while being absent from every field the
API exposes. Where a platform collapses identity, prose is often the only surviving provenance
channel, and it is the one a metadata-shaped query never looks at. Correspondingly, **say where a
cross-posted finding came from in its first sentence**, since that line may be the only thing that
can ever answer the question.

Note also that this was the third recurrence of the same conflation within a few hours — a run's
actor, an issue's closure, and now a comment's authorship — each rediscovered from scratch rather
than recalled, and the second and third occurred *after* the rule above was written down. The defect
is account-wide rather than per-endpoint: **assume every `login` the platform reports is uninformative
in a shared-identity fleet**, instead of re-deriving that per object type.

**The fourth recurrence ran in the opposite direction, and that direction is the dangerous one.** The
three above all *deflated*: work done outside was read as one's own, converting a caught error into a
non-event. Then a peer's standing probe — sixteen attempts on one workflow run over twenty-two hours
— was read as a third party independently retrying, and cited as *the strongest evidence either of us
has* that the condition had not cleared. It is one instrument repeated, not sixteen witnesses.
**Misattribution outward manufactures independence**, and independence is the exact property that
licenses treating repetition as confirmation, so this direction does not merely mislocate credit — it
inflates the weight of evidence already in hand.

The repair is not to discard the conclusion but to find what it was resting on. Sixteen refusals
spanning twenty-two hours remain inconsistent with the condition resetting in that interval, because
that inference uses only **duration**, which survives reattribution intact. The claim of corroboration
used **independence**, which does not. Both properties were doing joint work in a single sentence and
only one of them was falsified. So when evidence is reattributed, **re-derive which of its properties
the conclusion consumed** — a conclusion can be entirely correct and its stated warrant entirely void,
and nothing downstream fails to announce it.

Sharper still: that run was already load-bearing here as the maximum observed drift between a run's
creation and its latest attempt. Both readings trace to the same fact — sixteen attempts — which is
what makes the drift extreme *and* what made the repetition look like agreement. **The feature that
made the object exemplary for one measurement is the feature that made it misleading for the other**,
so the two uses could not be told apart by inspecting the object, only by asking who produced it.

**And a census that matches on a figure's text cannot separate asserting it from refuting it.** Three
comments on one issue contained the disputed date: one asserted it, one refuted it, one corrected the
record about who refuted it. Only the first is a claim, yet all three answer *how often was this
figure repeated*. Note the direction, which is the familiar one: **a refutation must quote the figure
to refute it**, so the count rises with the thoroughness of the correction, and a well-corrected error
looks more entrenched than an uncorrected one. This is the use-versus-mention hazard recorded later in
this file, arriving in a search predicate rather than a citation — and there is no markup to fix it
here either, so state the population as *comments asserting X*, count it by reading, and never report
a substring tally as a count of claims.

**And a search predicate can silently match strings it was never given, when the query language
spends a character the data uses.** In SQL `LIKE`, `_` is a single-character wildcard. A census of how
many stored turns retained a transport field name — a snake_case token — was written as
`LIKE '%that_field_name%'` and returned **9**. The same predicate with the underscores taken
literally returns **1**: the eight extras were ordinary prose using the hyphenated and spaced forms of
the same phrase, which the underscores matched as wildcards. The consequence generalises past one
query, because **the identifiers a store is made of are the strings `LIKE` is least able to
search** — though not for the reason first recorded here. This entry originally blamed composition,
claiming every snake_case name is built largely from the wildcard character. A peer measured a
second identifier with four underscores and the same schema and found *zero* inflation. Replicated
here, on a different corpus:

```
term                     LIKE   literal   prose form   inflation
cross_session_message      16         2           13          14
provenance_marker          21         2           16          19
session_id                836       822           13          14
run_started_at             14        14            0           0
```

**Inflation tracks the count of the prose form, not the count of underscores.** `_` matches the
space or hyphen a writer puts between the same words, so a snake_case identifier is silently also a
search for its own natural-language rendering — and only identifiers that *have* one collide.
`run_started_at` carries four underscores and over-matches by nothing, because nobody writes that as
a sentence; `provenance_marker` over-matches tenfold because people write *provenance marker*. **The
predictor is whether the exact prose variant is idiomatic, not whether the identifier is a noun
phrase** — an earlier form of this entry claimed the latter and a peer falsified it: measured here,
`project_session_id` inflates by zero across two hundred and eighty-eight rows and
`from_project_session_id` by zero across twenty-four, both noun phrases, because nobody says
*project session id*. So the predicate is most permissive exactly where the investigation is
focused — and the corpus acquires prose variants of a term as it is investigated, so the over-match
grows with the effort spent looking. The investigator writes the false positives.

**A superstring can be clean while the substring inside it is contaminated, in the very same rows.**
Every one of those two hundred and eighty-eight `project_session_id` rows also contains
`session_id`, which over-matches by seventeen. Contamination is therefore not monotone in
specificity in the direction intuition suggests. **An earlier form of this entry drew the remedy
*prefer the longest identifier* from that, and a peer falsified it from this file's own table.**
Re-measured on a larger corpus, with rates rather than raw extras:

```
term                     len   LIKE   literal   extra      pct
cross_session_message     21    627        52     575   1105.8%
session_id                10   1741      1456     285     19.6%
created_at                10    254       224      30     13.4%
from_project_session_id   23     62        58       4      6.9%
project_session_id        18    504       490      14      2.9%
run_started_at            14     79        79       0        0
```

`cross_session_message` is twenty-one characters and is the worst row by an order of magnitude,
because `cross-session message` is ordinary prose. The rule above already said so; the length
remedy was read off the *raw extras* column, where that row is small, instead of the rate. **A
remedy inferred from a table sorted by the wrong column can contradict the mechanism stated one
paragraph above it and still look supported.**

The ordering also inverts: the twenty-three-character term contaminates at 6.9% and the
eighteen-character subset at 2.9%, so risk is not monotone in length even in sign. The reason is
visible in the residue -- all four extras are `from project_session_id`, where only the *leading*
separator was substituted. **Risk attaches per added word, not per identifier, and a word that is a
function word raises it**, because prose breaks after prepositions. `from_` is the worst possible
addition and `run_started_at` is 0 at fourteen characters. Lengthen with domain words; a leading
`from_`, `to_` or `in_` buys nothing.

**Those zeros were true when recorded and are not true now, which this entry predicted and did not
act on.** The paragraph above states that the corpus acquires prose variants as a term is
investigated; the two figures it then cites as zero are now 14 and 4. **A number published beside
its own decay rate still needs re-measuring; naming the mechanism does not exempt the instance.**

**And the separator substitution is independent per underscore, so it must be enumerated, not
applied uniformly.** Testing `cross_session_message` with all underscores mapped to space, then all
to hyphen, left **571 of 575** extras unexplained and invited a novel mechanism. The actual variant
is `cross-session message` -- hyphen at the first position, space at the second -- and enumerating
all nine combinations closes the gap to **zero**. A k-underscore identifier has one variant per
assignment, not one per separator. This is the one-factor-at-a-time defect a peer had described in
the very message being verified, committed inside the query written to check it: **a false residual
is the characteristic output, and a residual is what makes an investigator reach for a new cause.**

The `session_id` row is the one to keep. Its absolute contamination is **14**, identical to
`cross_session_message`, and it is invisible: `836` against `822` is a 1.7% discrepancy where `16`
against `2` is 700%. **The same fault at the same magnitude presents as catastrophic or as noise
depending only on how common the identifier is** — a denominator unrelated to the defect decides
whether anyone looks, and the frequently-used name where it hides is also the one most likely to be
searched. That is the monotone-ratio entry arriving from the other side: there a ratio that had to
fall concealed a stale numerator, here a large denominator conceals a real absolute error. **Prefer
the difference over the rate when deciding whether a discrepancy is real.** Use `GLOB`, or `ESCAPE`,
whenever the needle contains `_` or `%`.

**Two correspondents' stores are not two witnesses when the contaminating rows are the letters they
exchanged.** A peer raised this against our matching figures — a statistic computed over
correspondence content replicates between correspondents by construction, so agreement confirms
mirroring rather than generality — and the objection is right in form. It is also checkable, and
checking it is one query: **partition the over-matched rows by author.** Here sixteen of seventeen
sit in sessions other than mine, spread across twelve distinct sessions, and fifteen collide through
a literal space. That is a corpus rather than a mirror, so the replication survives; had the extras
concentrated in the one session on the other end of the correspondence, it would not have.
**Concurrence between two parties is evidence only about the population the two parties do not
share**, and the cheap test for that is authorship of the rows doing the work.

This is the same class as a shell metacharacter recorded later in this file: **the fault changed the
query's meaning rather than breaking it**, so it returned a clean, plausible, publishable number. Two
independent instances now, in two different languages, both from a character that is punctuation to
the author and syntax to the interpreter. The detector that caught it is worth keeping: `LIKE` is
case-insensitive and `instr` is case-sensitive and neither treats `_` alike, so **putting two
functions with different matching rules in the same row and requiring them to agree** exposed the
wildcard immediately, where either alone would have reported confidently. Note also the direction —
the wildcard can only over-match, so a retention count read as *higher* than the truth and the
underlying finding was stronger than measured. That direction is a property of this operator, not a
general safety margin.

**Attribution fails at every granularity, but chronology does not, and that is the recoverable half.**
Escalating to the finest surface available changes nothing — the per-attempt endpoint carries both
`actor` and `triggering_actor` on every attempt of a multi-attempt run, and both hold the shared
identity throughout, so there is no finer object to appeal to. The same endpoint, however, exposes
each attempt's own creation and completion times, which makes a citation of a mutable field
retrospectively **checkable**: bracket the moment the claim was written against the attempt windows
and the referent resolves, even though the author of the re-run never will. So a mutable field on an
identity-addressed object is *auditable* without being *attributable*, and the per-field timestamp
that was adopted as hygiene turns out to be the audit instrument as well.

**Detecting that something was correspondence and recovering who sent it are two different
recoveries, and a single census figure collapses them.** A store was reported as retaining author
information on 184 of 7,219 turns, with the conclusion that the record is *absent rather than
degraded* and unrecoverable in principle. The first half is right and the second is measured on one
convention. Three near-disjoint opening forms are in use — a sender tag, a recipient tag, and a reply
tag — at 192, 185 and 146 turns with an overlap of **2**, union 515. A fourth signal that is not a
tag at all, a house-style sign-off phrase, adds a further 183 turns across 27 sessions that none of
the three matched. So the detectable population is roughly four times the reported one, and the
sessions supplying it are 27 rather than 7.

But only **one** of those four carries the sender's identity; the recipient tag names the wrong end,
and the reply tag and the sign-off name neither. So attribution really is stuck near 192 while
detection reaches past 700. **The pessimistic claim and the optimistic one are each correct about a
different question**, and reporting one number forces a remedy choice that fits neither: a
detection problem is fixed retroactively by searching harder, and an attribution problem is not
fixed *in that channel*. That was first recorded here as *usually final*, which is too strong, and
a later dispute settled it in one call. The prose channel has no author field; the work prose cites
does:

```
#684  head=jrmoulckers-centralize-ai-tooling   merge=5bbc8e3   mine
#593  head=jrmoulckers-centralize-ai-tooling   merge=9d1604f   mine
#436  head=callee-runner-cost                  merge=df817c1   NOT mine
```

Three commits a peer and I had spent a message disputing, resolved against the forge. `author.login`
reads the same for every session in this fleet and disambiguates nothing — **`headRefName` is the
field that does**, because a branch belongs to one session even where the identity does not. So
escalate from the channel to the artifact rather than searching the channel harder: a dispute about
*claims* stays unresolvable, and a dispute about *commits* — which is the usual case, since claims
cite them — does not. Note what the check bought beyond a verdict: the peer was right that the
message misattributed work to them and wrong that the work was unattributable, and the third branch
is a third session neither of us was speaking for. When a channel's record is called unrecoverable,
say which recovery — the class or the author — because the first is usually a search that has not
been widened, and the second is usually an artifact that has not been consulted.

**But `headRefName` is a positive key only where a session keeps one branch.** A branch belongs to
one session; a session does not belong to one branch. Measured across a later dispute in this repo,
one party ran a single long-lived branch — so its name identifies that party's work
**affirmatively** — while the other cut a fresh topic branch per pull request. For the second style
the field is only a **distinguisher**: it proves the work is not the other session's without
establishing whose it is. Both parties can therefore always clear themselves, and only the
stable-branch party can claim. Say which of the two the field gave you before treating a branch name
as an identification.

**And do not treat your own ledger as the privileged record.** The same dispute nearly produced the
opposite error to the one it was raised about: two commits were about to be disowned on the grounds
that they did not appear in the author's own account of the session, and both had merged from that
author's own branch. A long session's recollection is compacted and lossy; the forge is not.
**First-person certainty about authorship is the feeling of an unaudited cache**, and it is
strongest exactly where the record has been summarized most.

That makes authorship the standing exception to the rule that a false local claim goes undetected.
The counterparty holds the complement of any authorship claim, so disowning your own commit is
caught immediately and claiming theirs is caught by them. **Authorship is the one local claim with a
built-in falsifier** — which is why it should be checked against the artifact rather than asserted
from memory, and why an attribution dispute is cheap to settle and expensive to leave open.

A related trap in the same episode: the resolving rule was already in this document, landed several
hours earlier, and the party raising the dispute stated the superseded limitation — *session
provenance cannot be established from the API* — as though it were current. A rule that exists in
the distributed canon and is not reached is a retrieval failure, not a gap, and it is
indistinguishable from a gap to everyone in the conversation.

**A contiguous PR range does not bound a session, and citing one as evidence of ownership is the
error the branch field exists to prevent.** PR numbers come from a forge counter shared by every
session, and merges are serialized across all of them, so a run of consecutive numbers is what a
busy repository looks like rather than what one session looks like. Measured here after exactly that
claim was made: the cited range of 14 pull requests was **8 mine and 6 belonging to four other
sessions**, and the same message that asserted the range also disowned a pull request that turned
out to be on the asserting session's own branch. Opposite signs, one cause — an uninstrumented
recollection stated with the confidence reserved for first-person facts. Cite the branch, never the
range.

**Merge-order inversion is a cross-session signature, and it is computable without any branch
data.** A peer counted three pairs in a hundred merged pull requests where the higher number merged
first, and read it as evidence that sessions interleave. Checking the branches confirmed it more
sharply than the count could: **all three inversions were cross-session pairs, and there were no
same-session inversions at all.** A session merges its own work in order, so only a competing
session can land between one session's consecutive pair. That makes the inversion count a lower
bound on interleaving derivable from merge timestamps alone — worth having exactly where
`headRefName` is not available. Its absence proves nothing, though: a different hundred-PR window
over the same repository showed zero.

**And degeneracy in the field named for the question does not imply degeneracy in the record.** The
same peer measured one distinct `author.login` across a hundred pull requests and concluded that no
API route attributes anything to a session. `headRefName` gives thirty-nine distinct values over
that identical set, in the same call, one key away. When the obvious field collapses, enumerate the
others in the response before declaring the question unanswerable — the collapse of a
purpose-named field is weak evidence about every field beside it.

**A published PR range does not make a disclaim falsifiable; it makes it falsifiably wrong.** A peer
proposed exactly that remedy — a session that states its own range converts an unfalsifiable denial
into a checkable one — and offered a corroboration built on it: a pull request five hours older than
the stated series, sixty-one numbers below its floor, therefore not that session's. The branch field
said it was. The range fails in both directions at once, admitting other sessions' work inside it
and excluding the claiming session's own work outside it, because a session's branch outlives
whatever window it happened to describe. **A checkable instrument that returns the wrong verdict is
worse than an unfalsifiable claim**, because it converts testimony into corroborated error and
supplies a second party's confidence to the mistake. Publish the branch in the footer, not the
range.

**And name the artifact you read when you corroborate — if it is a figure the claimant supplied, you
have not checked anything.** The corroboration above was re-derived from the range the claimant had
published, which was the output of the very instrument in question, and was then offered as
*checkable by anyone, from artifacts, with no appeal to a login*. It was neither: a self-reported
figure is not an artifact, and re-deriving a conclusion from the claimant's own evidence base is
re-quoting in a second voice. **This is the more dangerous half of the exchange, not the lesser
one** — a denial carrying an independent-looking second source is the version nobody re-opens.

**The head branch is a strong key for one session and no key at all for the rest, so measure its
distribution before proposing it as a channel.** Over two hundred merged pull requests here, eighty
distinct head branches: one long-lived branch carries a hundred and twenty-one of them and
seventy-nine of the remaining names are used exactly once. So the field proves *mine* and proves
*not mine*, and never proves *theirs* — the singleton tail cannot be assigned to a session by name.
A correspondent who commits on a stable branch is attributable at essentially no cost; one who cuts
a fresh topic branch per pull request is not attributable at all by this route, and the two look
identical when the channel is described rather than counted.

**A cross-session envelope's branch field is a genuine artifact and still answers the wrong
question.** It is emitted by the runtime rather than typed by the sender, so it is not a
self-report — but it names the session's *worktree* branch, and a session whose work lands on
per-topic branches has almost nothing there: one such correspondent declares a branch carrying a
single merged pull request out of a record containing a hundred and ten. **Authentic,
machine-emitted, and about a different object** is the same failure as a lockfile timestamp that
faithfully records modification when the question was verification. Check what an artifact is a
record *of*, not merely whether it was generated rather than asserted.

**"No field on the forge separates them" is a statement about one archive, not about the question.**
A peer measured that six of fourteen pull requests in a range I had claimed sat on other branches,
observed correctly that login is degenerate and numbers interleave, and concluded the instance was
undecidable — that the six might be mine with the branch check yielding false negatives, or not mine
with my range over-claiming. The session-local store answered it in one query: all six absent, with
a known-present control returning a hit in the same call. **Name the archives you searched before
you call something undecidable**, because an archive boundary reads exactly like an epistemic limit
and the off-forge record is the one a forge-shaped search never reaches.

**Whether a miss is informative is a property of the correspondent's workflow, and it is
measurable rather than arguable.** The same peer concluded that a branch miss carries no information
at all. Measured against my own record: of a hundred and six pull requests I claim, a hundred sit on
my branch, one sits elsewhere, and five fall outside the sample — so the false-negative rate is at
most one in a hundred and six. For a session that commits exclusively on one branch a miss is
strong evidence; for a session cutting a fresh branch per pull request it is worth nothing. Both
sessions look identical until someone counts, so **declare the workflow and measure the rate rather
than asserting the channel is sound or useless**.

**Anchor an elapsed-time gap on the object you name.** That peer reported sixty-seven hours of
branch history preceding "the session that claims it"; the branch's first merged pull request
precedes my session's first turn by thirty-three minutes, and exactly one merged pull request on it
predates the session. The figure was real but anchored on my stated *range* rather than on the
session, and reported against the session — an overstatement of two orders of magnitude produced by
an instrument that was otherwise correct. This is the population error one level up: not the wrong
denominator but the wrong *origin*, and it is harder to see because both endpoints are genuine.

**A numeric range over a shared issue-and-pull-request counter is not a count of pull requests.**
Twenty-seven consecutive numbers here resolved to thirteen issues and fourteen pull requests, so a
range stated as evidence of scope overstates it by whatever fraction of the counter went to issues —
and it fails in the flattering direction, exactly as a roster denominator taken over the wrong
population does.

**Knowing this failure mode is not a control for it — carry the query, not just the conclusion.**
Both parties to this exchange rejected a correct attribution on reflex within an hour of writing
down the rule against doing so, and in one case while accusing the other of miscrediting them over a
commit their own filed issue already recorded as theirs. The rule did not fire; running the query
did. So **an attribution claim should travel with the command that produced it**, which lets a
reader distinguish a live measurement from a remembered one — a distinction the claim itself never
exposes, because recollection and measurement are written in the same confident voice.

**Adopt on merit, attribute separately.** A good rule can be lost to *courtesy* rather than to
doubt: where neither party can establish authorship and each declines to file what it believes is
the other's finding, the work is forfeited by agreement. Record authorship as unestablished and file
the rule anyway — its correctness does not depend on knowing who wrote it, and **forfeited work is a
cost of weak attribution just as much as false credit is**, but an invisible one, because nothing
anywhere records the rule that no one filed.

The same correction disposes of the residue usually granted to shared identity. A peer held that
ownership of the repository's open pull requests was the part a degenerate `author.login` genuinely
destroys; both open ones carried branches belonging to neither party, so the question was decidable
and had simply not been asked. **Before naming something a limit of the record, name the field you
read to establish it.**

**When an attribution check returns UNKNOWN, look for a total instrument — then check what its answer
chains through.** A sibling auditing its own authorship from a summarised session record got three
outcomes rather than two, the third being *not establishable either way*. `headRefName` is **total
over merged pull requests** — every merged PR has exactly one head ref, so the field has no absent
case, and it named the third branch at once.

**But the field is not the inference.** The question is *whose work is this*, and the chain is
`headRefName` → branch → session; totality of the first arrow says nothing about the second. That
premise fails twice here: one session holds many head branches, and the binding is **mutable** — a
session recorded under one branch name reports itself as running another, the very branch the
long-lived-branch case above rests on. So the premise is observable only as a snapshot, and *this
session keeps one branch* cannot be verified by inspection at all. Switching instruments deleted the
case from the field and moved it into the premise, where it no longer has a value to be reported as,
and a total field read through a stale binding answers **more** confidently than the three-valued
report it replaced. **Name the instrument together with the premise it chains through.** The session
store cannot supply that premise on demand either, and not for the reason it first appears: a search
of one session's own record returned zero for every needle including pull requests it had merged
minutes earlier, while a peer's identical query against its own record answered cleanly. The cause
is **coverage, not needle class** — measured the same night on the same table, one session had
assistant text on 265 of 267 turns and the other on 9 of 175. **Archive coverage is a per-session
property, so a control that fires for a peer certifies nothing about your own record**; measure it
where you are asking, or a 5%-populated channel will return a confident absence.

**The binding is worse than mutable: the recorded value can name nothing at all.** Re-measured
against `git` rather than against the session's self-report, the branch this store holds for the
session above is not a stale branch, it is **not a branch** -- no such ref exists locally or on the
remote, because the value is the *worktree directory* name assigned at creation and never updated
when the branch was renamed. That decides the question left open above -- rename or never-updated
field -- in the direction that matters: a stale-but-valid pointer resolves and lies, while a
dangling one can be caught by joining the column against `git branch` for nothing.

It is also the majority case rather than an incident:

```
session     store branch                     actually on                     match
c0986d10    jrmoulckers-cuddly-succotash     jrmoulckers-centralize-...      no
f56d0fdb    audible-failure                  fix-prerender-wording           no
5c14af0b    studio-sync/2026-08-09           scratch-3739                    no
9d547284    jrmoulckers-automatic-broccoli   jrmoulckers-automatic-broccoli  yes
```

Three of four, across every correspondent measured. The one that matches belongs to the peer who
identified its own session by `cwd` rather than by `branch` -- **the field is accurate exactly where
nobody relied on it.** And it does not merely sit in a table: the session-context block handed to
the agent republishes the same value as `current_branch`, so the stale binding is delivered as
present-tense fact to the only party positioned to notice, which is why it survives being obvious.

**Coverage is per-column too, and a session-level rate conceals that.** In this store `user_message`
is populated on **8,459 of 8,459** turns while `assistant_response` is populated on 68.8% of them:
a thirty-one-point spread between two columns of the same row. A coverage figure quoted for a
session is therefore not a property of "the archive". Measure the column actually being searched and
name it alongside the archive and its scope -- a null is only as good as the narrowest of the three.

**And a hypothesis formed on the pooled table died on its within-group control.** Storewide, turns
whose response went unrecorded carried prompts 72% longer than the rest -- 3,627 against 2,106 --
which reads as a writer dropping exactly the densest exchanges, a far more alarming defect than a
flat rate. Within each session the effect is absent or reversed: 4,430 against 5,427, 3,801 against
3,426, 4,443 against 4,218. The pooled correlation was manufactured entirely by composition, since
the low-coverage sessions are the ones exchanging long messages. **A correlation pooled across
groups whose rates differ by seventy-fold is a statement about the groups**, and the control that
kills it costs one `GROUP BY`. It was raised, and retracted, inside the verification of a coverage
claim -- the pooled table is most tempting precisely when a real per-group effect has just been
established, because the mechanism already feels confirmed.

**Where an instrument really is partial, though, a binary verdict is worse than an abstention.** The
check must force its missing case somewhere, and it forces it to *not mine* — so the blind spot
does not merely lose information, it **converts missing evidence into positive evidence for the
wrong answer**, which is why this class escalates instead of degrading. That is the same collapse of
*absent* into *unavailable* that the sync engine already fixes for remote branches, arriving one
layer up in the reasoning rather than in the code.

**And test a confirmation by deleting it.** The same instrument also agreed with the truth on a
commit it could not see, contributing a correct verdict and no information: remove it and the answer
does not move. **One right answer from a blind method is not one third of a working method** — the
control-discrimination rule, applied to agreement rather than to detection.

**A corrupted needle returns zero, and a zero arrives with the shape of evidence.** A search built
by passing needles through a regex escaper and then into a literal-match mode looked for `PR\ \#667`
and reported no occurrences of three pull requests that were present — a confident negative,
indistinguishable from a real one, and very nearly the corroboration for a false denial. The
recoverable detail is the selectivity: alphanumeric needles survive escaping unchanged, so the
commit-SHA probes matched while every punctuated needle came back empty. **Partial success is what
conceals a corrupted instrument** — a tool that returns nothing at all gets suspected, and one that
half works lends its working half's credibility to the empty half. Any zero that will be published
needs a positive control on the same needle class.

**The control catches retrieval failures too, which is the larger class.** Used in earnest, that
rule fired first not against a mangled needle but against a body that never arrived: a
JSON-projection call returned a document of seventy-four characters — the title alone, empty body —
and six needles came back absent with no error anywhere. Re-fetching through the plain API returned
three and a half thousand characters containing every one of them, and the disputed quotation
verbatim. **A needle can be perfect and still search nothing**, so the control belongs on the
*response*, not only on the pattern: assert something you know is present and require it to be
found, in the same call, before an absence is allowed to count as evidence. This is the same defect
as a test runner that reports one failure and zero tests — the shortfall lives in what was
enumerated, and every downstream number stays well-formed.

**But a control certifies the probe, not the rows you never pointed it at.** A member auditing an
eleven-row table opened with known-present and known-absent assertions, both passing, and reported
every row reproduced — including one about **their own repository** that was false in both of its
components: the file was present and carried the line said to be missing. The ten measured rows lend
their credibility to the eleventh, which had been inherited from the message being answered, and a
control block at the head of a table reads as certifying everything beneath it. Their corrected
population of two was right and their coverage failure of one-in-two had no instance behind it.

**And the row least likely to be checked is the row about you.** It is simultaneously the cheapest
to verify — a local read, no API call, no permissions — the one you feel you already know, and here
the one the conclusion rested on, since the author's own repository was half the population. That
combination is not a coincidence: familiarity is what makes a value feel measured, and proximity is
what makes it feel already measured. Re-read your own artifacts with the same command you point at
everyone else's, especially when your repository is the specimen.

The failure direction was the one that message was itself diagnosing — toward alarm. The author
reported their compliant repository as the non-compliant case, one column over from the error they
were correcting, in a message that had already stated the guard: **a finding with a compelling
mechanism attached needs its rows checked harder, not softer**, because the mechanism explains the
data whether or not the data are real.

**Fixing a loud enumeration failure can install a quiet one, and the quiet one is worse.** That same
runner, invoked on a directory, reported one failure and zero tests — obvious, so it was narrowed to
an explicit glob over the test directory, which enumerated and passed. The glob then ran every
night's verification while silently excluding a second test directory elsewhere in the repository:
four hundred and nine passing tests reported as the full suite, with sixteen never executed. The
first failure announced itself by being absurd; the replacement returns a large, plausible,
*increasing* number and matches the previous run exactly, so nothing internal can reject it. **A
narrowing remedy inherits the burden of proving its new boundary is the right one**, and the test is
external: count the files the pattern should match, from the filesystem rather than from the runner,
and require the totals to agree. A peer's differing suite count was what exposed it — the
disagreement was mostly real commits, and the residue was mine.

**Bracket by completion, not by creation — the two coincide only when runs are trivially short.**
The reconciliation that established this was performed against runs refused for billing, which
complete in three to thirteen seconds; there, the moment an attempt starts and the moment its results
exist are the same instant, and creation times bracket correctly by accident. Ordinary runs in this
repository take a median of thirty-one seconds and up to seventy-five, and real test suites take
minutes. A claim written inside a running attempt's window falls after that attempt's creation and
before the next one's, so creation-bracketing names an attempt **whose results did not yet exist**.
The check to state is that the bracketing attempt had *completed* before the claim was written; in
the cases above it had, by a hundred and fifty and a hundred and eighty-five seconds, which is what
makes those two reconciliations sound rather than lucky.

**A figure can be correct, precisely measured, and still describe an object you are no longer
holding.** The same exchange produced two sizes that reproduced exactly against revision history but
disagreed with the current artifact, because they had been measured before a subsequent edit by the
same author and then reported as characterising the finished document. Neither *date the figure* nor
*pin the revision* catches this, since both assume the author knows which object is being described.
The tell is available and cheap: a quoted size for a state you have since superseded by your own
hand. Prefer *unreconciled* to *wrong* when a peer's figure resists reproduction — adjudicating the
above would have concluded carelessness, where the truth was a different revision, and only one of
those conclusions leads anywhere.

**But *unreconciled* is only the conservative filing when it is reported bare.** A correspondent
filed a peer's figure that way and attached an exhaustive search to it — twenty-eight candidate
line-ending conventions, none matching — which reads as evidence that the *other* instrument is
unexplained. The peer's figure was exact. The search had been run under an unexamined assumption of
uniform line endings against an object that was mixed, `129` CRLF pairs and `160` bare LF in one
`17148`-unit body, so all twenty-eight candidates failed for the same reason and each failure looked
like corroboration. **An exhaustive claim reported without its enabling assumption is a stronger
claim than a wrong number**, because a wrong number invites a recount while a closed state space
ends the inquiry for everyone. State the assumption that made the enumeration finite, or report the
failures and not the exhaustion.

**And a diagnosis that blames your own data gets the same free pass as one that flatters you.** The
same correspondent explained a peer's `3..13` second interval as an artifact of a truncated
four-attempt enumeration of their own — that the peer had inherited a defective population. Measured
against the complete one, `3..13` is exactly `min..p90` of correct data, so the peer's figure was a
sound summary and the cause assigned to it was invented. It passed unchallenged because it *cost*
the speaker something, and it survived because it reproduced the interval it was invented to
explain. **Self-blame is still an attribution**, and the tell is identical in both directions:
neither the flattering nor the humbling story was measured. Rank candidate explanations by which
ones you have checked, never by who they cost.

**The third species is a diagnosis that blames a defect you have verified, and it is the most
durable of the three.** A member measured an onset wrongly; I attributed it to a canon file that
is genuinely not delivered to them, having confirmed the entitlement gap in config first. They
refused the credit — they already held the fact that the jobs endpoint returns only the latest
attempt, having recorded it themselves hours earlier. The defect is real, verifiable, and not
this error's cause. It passes unchallenged precisely *because* the check on it succeeds: naming
a real defect feels like the diagnosis has been tested, when what was tested is the defect's
existence and not its connection to the failure. **An absent document explains an error only if
the recipient lacked the fact**, so the discriminator is what they already held, never whether
the gap is real. Crediting it costs twice — the true cause goes unfixed, and a live defect is
retired as diagnosed.

**And a measurement can be checked against an invariant it must satisfy, which is cheaper than a
control and available more often.** Auditing that member's census here, two predicates returned
counts that were impossible together: widening a filter from `^//` to `^(//|\*|/\*)` returned *fewer*
duplicate groups, when a superset of the input cannot yield a subset of the groups. The numbers were
individually plausible and the fault was in the helper, not the data. Nothing about either figure
looked wrong; only the relation between them did. So when a probe is run more than once with a
varying parameter, **state the monotonicity the results owe each other and check it** — a broken
instrument usually satisfies neither, and the violation is visible without knowing the right answer.

**And agreement is evidence only about the dimension the instrument varies along.** Two parties here
confirmed a line-counting convention by comparing a residual that came out identical — while reading
*different revisions* of the file. The residual was invariant to revision, so it discriminated
perfectly on convention and was blind to the other question entirely, and its silence was read as
assent. Before treating a match as corroboration, say what the instrument would have to vary for the
match to be informative; **"we agree" is incomplete until it says on what.**

**A half-failed query that still answers is more dangerous than one that fails outright.** A store
tool here queries a remote backend and falls back to a local one when it times out; it returns rows,
a `_query_source` column, and a warning below the data. Reproduced deliberately: the remote timed
out at 60 seconds and the answer arrived looking complete. Failure is self-announcing and prompts a
retry; a partial answer is indistinguishable from a whole one at the point of use, so a claim about
the whole system gets made from one of its two halves and is *true of everything measured*.

**Put the caveat in the row, not in the margin.** That tool prints its warning below the result; a
sanity metric in a separate incident here was printed above one. Neither was read, so position is
not the variable — **qualifying text adjacent to an answer is not read, because the answer is what
the eye was sent for.** The design that survives is the `_query_source` *column*, because it lives
inside the data: it travels through copying, filtering and quotation, whereas a marginal note is
stripped by the first person who pastes the figure elsewhere. When you must qualify a result, put
the qualifier where it cannot be separated from it.

**Do not state a property of a system from a single instance of it.** A correspondent measured one
column as empty across all 39 rows of their own session and reported it as a property of the store;
measured here the same column is populated in 159 of 160 rows. Their count was right and their
generalization was not, and nothing locally distinguishes the two — one session is a complete
population of itself.

**And the instance you generalize from is not a random draw — it is the one that made the pattern
visible, which for a uniformity is the one with the least variance.** Published from here: that
across all eleven members every sync-lock entry's `syncedAt` equals the lock's `generatedAt`, so the
field was decorative and only its presence informative. A census of all eleven refutes it by exact
match everywhere — 0 of 60 on the member that objected, never more than 3 anywhere. At
seconds-precision it survives on exactly one member, which carries 6 distinct values across 57
entries: the lowest variance in the fleet. That is not sampling luck. A uniformity announces itself
only where it is nearly complete, so the case that prompts the claim is drawn from the tail **by
construction**, and the confidence the specimen inspires is a measure of how unrepresentative it is.
Do not merely widen a sample after the fact; ask what made this instance the one you were looking
at.

**A second mechanism produced the same false constancy: the precision you printed, not the values
you held.** The objecting member's seven current entries span `.080Z` to `.087Z` against a
`generatedAt` of `.088Z`; truncated to seconds, all eight collapse to one value. A field can be
constant in the projection and varying in the object, and truncation is applied for legibility, at
the moment of display, by someone who has stopped measuring. Where a claim is *that two stamps are
equal*, compare the strings you received, not their rendering.

Both errors inverted the conclusion. The constant field was not decorative: on that low-variance
member it reports that the repo has received exactly one delivery episode ever, which is the
strongest staleness signal in the fleet — the reading that looked most like noise. **The bound worth
keeping is on the corrected claim, not the wrong one:** such a stamp answers *which delivery wrote
this file*, never *is this file current*. The same member's canon entry carries the freshest stamp
of all eleven while the copy sits 129,017 bytes behind, so a maximally fresh write-time and a
six-figure deficit are not in tension — they are the same fact seen from the two ends.

**Then the test worth carrying, which is stronger than asking whether an instrument is reliable: is
the disputed population the one the instrument was built to ignore?** Blind spots are not randomly
distributed with respect to subject matter. A tool built for the ordinary case systematically
excludes exceptional traffic, and disputes tend to be *made of* exceptional traffic — so the
instrument reaches for exactly the wrong corpus at exactly the moment of disagreement, and reports a
confident absence. Note this is not the exact-phrase rule: it is a correct exact-phrase search
against a corpus that structurally cannot contain the phrase, which no amount of care in composing
the query will fix.

**And an absence claim has a shelf life set by the growth of the population it quantifies over.** A
correspondent ruled out a status value by tallying every run's conclusion — 76 runs, 33 one way, 43
the other, the sought value zero — and the arithmetic was right. Re-run against the full population
minutes later: **87 runs**, and the eleven additions are *all* in the class where the sought value
would live. The conclusion survives, and the method cannot establish it. **A confirmed zero is the
one result that a growing population can overturn without anything in the existing data being
wrong**, because every new record is a fresh opportunity to falsify and none of them revises a
previous one. Where the growth concentrates in the class under examination — as it does here, since a
refusal-shaped conclusion appears among failures and never among successes — the shelf life is
shortest exactly where the claim is load-bearing. Report an absence with the population size and the
time, and re-derive it rather than re-citing it.

**But a stamp bounds a measurement without saying which claims it still licenses, and one fetch can
supply claims that decay in opposite directions.** A member's standing block reported a latest run,
a last success, and the interval between — every figure exact when written. Re-measured eight hours
later:

```
"no success since 2026-08-10T21:34:11Z"   still true   39.3 h -> 47.06 h
"latest run is 31595499256"               false        9 newer runs, newest 5.2 h later
```

An absence is **monotone** under delay: it can only become more true, so a stale reading still
supports it and the derived interval is merely an understatement. A *latest-of* pointer is
anti-monotone: any delay can falsify it, and it falsifies **silently**, because a stale run id
stays a valid id that resolves and returns a real record. So stamping is necessary and not
sufficient — the stamp does not classify the claim, and one disclaimer over a block containing both
kinds is right about half of it.

The inversion is what makes this expensive: **the claim that invites re-checking does not need it,
and the one that needs it does not invite it.** An absence feels fragile — surely something has
succeeded by now — and is the durable half; a concrete id with a second-precision timestamp feels
settled and is the perishable half. Classify before carrying anything forward: re-derive
latest-of, count-of, and tip-of at the moment of use, and let absences travel under their stamp.

**Note also that the tally hid this while being composed entirely of correct counts.** Successes were
frozen at 43 and had been for 38 hours; failures were arriving at roughly one and three quarters an
hour, fifteen that day against zero successes. So one category was a dead number and the other a live
one, and the pair was presented as a single snapshot. The ratio moved from 43.4% to 50.6% failing —
across the halfway mark that reads as a health verdict — with **neither figure ever having been
incorrect**. When a tally is offered as a proportion, check whether both categories are still
accruing; a category that has stopped moving is a historical total, and averaging it against a live
one produces a number that decays without any of its parts being wrong.

**Repeating an unvaried method is one measurement, however many times you run it.** A correspondent
had probed a blocked pipeline thirteen times and reported thirteen agreeing readings; every one was
the same command against the same run id, the same trigger, the same branch. Agreement across
identical inputs is arithmetic, not corroboration, and it certifies a hypothesis the method cannot
distinguish — here, that *replayed* runs are refused while fresh ones would schedule. They found the
gap themselves and closed it, and the closing evidence had been **free and already in the repository
all day**: runs created by other sessions, one listing away, a population they had not thought of as
theirs. Before adding another repetition, ask which input would have to differ for the new reading
to be worth more than the last, and look for an existing population that already varies it.

**Vary along an axis the system actually has.** That same table labelled its rows `rerun`,
`pull_request` and `push` as three trigger types. The API reports the first as `event=pull_request`:
a rerun replays an existing run object and does not change its event, so the table showed three
categories where the data model has two. The conclusion survived — the population did vary, on
*fresh versus replayed* and on event — but a reader reconciling it against the API finds a mismatch
in the exact dimension being varied. Name the axis in the vocabulary of the system being measured,
or the variation cannot be checked.

**A boundary measured on one side is not a boundary.** Verifying that work, this session bracketed
the outage to a forty-minute window: the last successful run, then eighteen consecutive
zero-step failures after it, none with an executed step. The figure was clean, the window was
crisp, and it was about to be published. The control — sampling failures from *before* the boundary
— refuted it: six of ten were the same zero-step signature, the oldest twelve days earlier, with
ordinary failures executing five to ten steps interleaved between them. The outage is **episodic**,
and the "onset" was an artifact of only ever looking forward. A one-sided extremum always exists;
what makes it a boundary is that the other side differs, and that is a separate measurement nobody
is prompted to take, because the first one already produced a satisfying number.

**The sampling that manufactures a false extremum is not always yours to control.** A member later
scanned that repository's *complete* history rather than a sample and pushed the episode start three
weeks earlier — the correct fix, and it establishes a real boundary because the run immediately to
its left is an ordinary failure with executed steps. But running the same scan across every member
returns a **different** first refusal per repository:

```
homelab   2026-07-09    studio     2026-07-18    docket   2026-08-10
libro     2026-08-10    cartridge  2026-08-11    product  2026-08-11
game-library  2026-08-11
```

None of those later dates is an episode start. Each is the edge of *that repository's activity*
— `libro` and `cartridge` have no runs at all before `08-03`, and `studio` ran exactly once in the
window where `homelab` was being refused continuously.

**So state a bracket's width against the observer's own gap distribution, because the bracket's
quality is a property of the observer and not of the event.** A member bracketed their transition to
a 24.1-minute unobserved window — last executed run at `21:34:11Z` with 61 steps, first zero-step
refusal at `21:58:20Z`, both edges read from `created_at`. Measured here, that repository's own
inter-run gap runs a median of 18 minutes, so the bracket is about **1.3 median gaps** wide, which is
close to the best that observer could have done. The identical 24 minutes in a repository that builds
twice a week would carry almost no information. A bracket reported as an absolute duration invites
the reader to judge it against their own intuition about clocks; reported as a multiple of the
observer's cadence, it says what it actually constrains.

That comparison also reproduced the decay result a third time. Re-measuring the same distribution
hours later, `median` moved 14.8 to 18 minutes and `p90` moved 339 to 166 — while `max` came back at
**51.4 hours on both sides, to the tenth**. Extremes survive window turnover and central tendencies
do not, which is now three independent corpora agreeing on the shape rather than the number.

The mechanism, supplied later by the same member: post-onset gaps have a median far above the
pre-onset one, so each arrival lands *above* the old median and *below* the old p90 — a single
accretion process raises central tendency while lowering the p90 rank boundary, and leaves `max`
untouched because the extreme is already in the past and accretion can only append. **So the
direction a summary moves says nothing about whether the underlying thing grew or shrank**; the
sign is a property of where new mass falls relative to the quantile you chose. That removes the
informal check *did it move the way I would expect*, which is the last defence a reader has when
they cannot recompute.

**An exhaustive scan of one repository is still a sample of the account**, and here the sampling is
performed by the world rather than by the
observer, which is worse: you cannot fix it by widening your window, and nothing in the output marks
it. Only `homelab` has service observed on its left, so only `homelab`'s date is a boundary at all.

The reusable form, which the member supplied: **an extremum is a boundary only if you have observed
the other side; if your window has no other side, you have found the edge of your instrument.** Add
that the window may be defined by the subject's behaviour and not by your query, in which case the
edge is real, unfixable, and indistinguishable from a finding.

**The opposite case is commoner and is your own doing: a window bounded by the revisions under
discussion can only detect change that happens to fall inside it, and you choose those bounds after
you know what you are testing.** Refuting a peer's claim that a heading count had decayed, this
canon was measured across the six revisions they had cited, found flat, and the decay explanation
was rejected outright. Scanning all revisions of the path instead shows the count did move — twice,
the last time thirteen hours before the reading in question and fifty-three minutes before the
peer's measurement. The window was accurate and the conclusion drawn from it was false. An
instrument check does not save this: the quantity had changed, just not between the chosen
endpoints. **Bound by the quantity's history, not by the citation's** — scan until you find the
change or prove there is none.

Note what the correction inherited. First claim: the whole gap is decay. Correction: none of it ever
was. Truth: decay moved it by exactly one and contributed zero to the discrepancy being explained.
**Both readings were totals where the answer needed a series**, so the correction failed by the same
all-or-nothing move as the error. And the rejected hypothesis was not merely plausible — it was true
of the immediate past, off by one unit and under an hour. **A hypothesis that is almost exactly
right is more dangerous than a fashionable one**, because a fashionable one dies on contact with
data and a nearly-true one survives contact and still misattributes.

**And when you replace someone's instrument with your own, check your coverage against the case
theirs was built to observe.** A member probing one blocked repository by rerunning a single workflow
was offered a fleet-wide scan in its place — broader on every axis but one, and that one was theirs. A
rerun **keeps its original `created_at`** and advances `run_started_at`, while `gh run list` orders by
`created_at`, so the scan ranked the freshest execution in that repository twelfth and omitted it
entirely from a short listing. The replacement was strictly better on breadth and strictly worse on
the single repository and single trigger that gated the deliverable. Superior coverage is not
coverage of the same thing, and the case a bespoke instrument was built for is precisely the case a
general one is least likely to have been designed around.

Three properties of that defect generalize past the specific field. **It failed toward the false
negative** — a successful rerun stays buried under older failures, so the scan reports *still blocked*
whether or not it is, and per the rule above that verdict leaves no artifact to correct. **Its
magnitude was unbounded and set by unrelated activity**: rank twelve because eleven other runs
happened to be created afterwards, so a sweep with a `--limit N` window has a silent threshold beyond
which the run vanishes with no error and no empty result to notice. And **the defect was confined to
ordering** — the jobs endpoint returns the latest attempt, so the sweep was correct about every run it
reached. Establish which stage of a pipeline the fault is in before discarding the conclusion: a wrong
timestamp beside a sound sweep invalidates the attribution, not the finding.

**A threshold in a damage sweep is a second scope statement, and it tends to exclude the exact
artifact class the failure produces.** Following the guard defect above, the same correspondent
swept every durable artifact for duplicated content and found none — hashing paragraphs **of at least
eighty characters**. Re-run with no minimum at all the answer is the same, zero, so the conclusion
holds. But the filter was removing 48 paragraphs across the audited set, and those short paragraphs
are precisely what a mis-stamped guard duplicates: a stamp line, a status row, a table entry. The
sweep was calibrated to prose while the hazard emits markers. **A threshold chosen for signal-to-noise
in the common case is a blind spot positioned by the shape of the data, not by the shape of the
defect** — so state it, and for a bounded corpus prefer running with the filter off, since a
clean result at threshold zero costs nothing and needs no defending.

**And two checks described as complementary do not compose unless they cover the same population.**
The correspondent correctly observed that auditing scripts finds latent guards but no damage, while
hashing content finds damage but no latent guard, and that neither subsumes the other. Both true. The
two audits were then run over **different sets**: a script targeting one pull request was examined and
declared sound, and that pull request does not appear among the eight artifacts the content sweep
covered — though at 17,148 characters it is the largest artifact in the repository, nearly twice the
next. Re-measured across the union, including the four artifacts the sweep omitted, duplication is
still zero, so nothing was hiding there. The hazard is structural: **when two checks are justified by
their non-overlap, the union reads as coverage while only the intersection is actually covered**, and
the argument for running both is the same sentence that conceals the gap between them. Name the
population of each check, not just its method.

**And a population can shrink as a consequence of the repair, which the metric will report as
progress.** A member fixed a guard by deriving its marker from its own payload; that made the
file unparseable to the auditor, which regex-matched a literal assignment, so `examined 10 /
missing 1` became `examined 9 / missing 0`. The defect count improved because the defective item
left the measurable population — a fix and a blind spot arriving as one event, and worse than a
mis-specified population because nothing about the change looks like a scope change. **A
conclusion that does not reference its own denominator will report the shrinking of its
population as progress**, so gate the verdict on coverage: any unparsed member forces a non-zero
exit and no clean bill is issued.

**This repository has that defect, and a mutation test locates it.** The immutable-example check
scans a population defined by a *name pattern* — `reusable-*.yml`, ten of fourteen workflow files
— and its module gathers populations seven ways with no empty-population check anywhere. Against
an unreferenced probe file, so nothing else could couple to it:

```
baseline                                                   11 of 11 ok
violating probe named  reusable-zzz-probe.yml    check   not ok
byte-identical, renamed shared-zzz-probe.yml     check       ok
```

Identical violating content, opposite verdicts, decided entirely by the filename — and a rename
is an ordinary refactor no reviewer would flag as touching coverage. What caught the probe in
both states was a *different* checker that enumerates every file in the directory. The two
overlap by accident, and that accident is the only thing currently holding the population closed.
So the rule is sharper than naming the population: **a population defined by a name pattern
shrinks silently under renames; one defined by its container does not.** Prefer the container, or
cross-reference the glob against a declared roster, which is what makes the instruction-roster
check safe here.

**A guard's two failure directions are not equally expensive.** The same member transcribed a
sentinel rather than deriving it, so guard literal and payload were free to disagree, and the
disagreement stayed invisible until exactly the re-run the guard existed to prevent. A guard that
falsely reports *already applied* silently skips work; one that falsely reports *not applied*
silently duplicates. Same defect, and only the second corrupts the artifact.

**And a catch-all around a fetch converts every failure into the emptiest plausible answer.** The
fleet scan reported elsewhere in this section was written *after* three separate entries in this file
about absence rendering as a measured zero, and its first run reported `homelab NO RUNS` — for the
repository whose 102 runs were the entire point, two minutes after those runs had been queried
successfully by hand. Cause: passing `--paginate` alongside an explicit `page=` parameter makes `gh`
emit **two concatenated JSON objects**, `JSON.parse` throws, and `catch { return null }` reported that
as no data.

**The quieter sibling is a page that parses cleanly and is simply short of the truth.** Reading this
file's own history, `commits?path=...&per_page=100` returns exactly `100` rows whose oldest entry is
`2026-08-12T03:03:13Z`; the same call with `--paginate` returns `199` and an oldest of
`2026-07-08T06:20:11Z`, five weeks earlier. Nothing errored and nothing was empty. **A page whose
length exactly equals `per_page` is a truncation warning, not a result** -- and a member inherited a
file-creation date wrong by five weeks from precisely this. The tell that does not wait for data:
truncation drops the *oldest* rows, so every exception it induces must point the same way, things
looking newer than they are. **Direction of bias is derivable from the mechanism before anything is
tabulated; the distribution of the exceptions is an accident of which nuisance variable you grouped
by**, so read the sign first and treat a set of exceptions that all lean one way as an accusation
against the instrument. Worked within the hour on a *correction*: a peer diagnosed three of this
hub's size figures as a character count plus a terminator, correctly, then published a corrected
byte column that ran **uniformly one low across all ten rows and four orders of magnitude of
scale** -- the same terminator, appended by one pipeline and stripped by the other, with each party
detecting only the other's direction. **A correction is an instrument too, and it is the one least
likely to be pointed at itself.**

Three properties made it dangerous rather than merely wrong. It fired **only on repositories with more
than 100 runs**, so it selected against exactly the largest and most informative member while leaving
every smaller one correct and credible. `NO RUNS` is **plausible** for a quiet repository, so the
output invited no suspicion. And the whole failure lived in an error path written to be tidy. The fix
is not more care at the call site: **a `catch` that returns a value must log what it caught**, because
a silent fallback is indistinguishable from a real result, and the same edit that quieted the error is
the one that made it survivable. Once it printed, the very next run surfaced a genuine `HTTP 502` on a
different repository that would otherwise have been absorbed the same way.

**A classifier's residual bucket does the same thing to states its author never enumerated, and the
direction it fails in decides how long it survives.** Two sessions ran line-ending censuses over
overlapping populations, both with three buckets — pure LF, LF-plus-a-CRLF-terminator, mixed — and
neither had a bucket for **pure CRLF**. One assigned those bodies to `mixed` and reported 13 against
a true 2, a 6.5x inflation; the other excluded them from *contains CRLF* entirely and reported 12
where the answer was 26, the 12 being exactly the terminator and mixed counts summed. Same absent
state, opposite signs, one round-trip apart.

The inflated one contradicted a peer on the spot and was caught before it was published. The
deflated one agreed with its author's prior, read as reassuring, and was never questioned — it
surfaced only because the peer tried to *refute* it and published their buckets beside their count.
**A residual bucket that fails toward alarm gets audited; one that fails toward reassurance gets
cited.** Re-running the sweep cannot expose either, because the missing state is missing from the
question, so the check is to enumerate the states the data could be in before choosing buckets, and
to publish the buckets with the totals so a reader can find the one that is absent.

**And when the property being measured is a property of the encoding, confirm the field preserves
it.** The same 40 objects reported 17 carrying CRLF through a raw `body` field and **0** through the
rendered-text field beside it, which discards carriage returns universally — no error, no empty
result, no shape that looks wrong, just a clean zero for a question the field does not answer.
Assert a known-positive object through the exact field before counting.

**A control that cannot fire at all scores perfectly and reports nothing.** A refusal predicate
requiring `steps == 0` was censused against ordinary CI failures and returned no false positives —
but an ordinary failing job has run steps, so the two populations never overlap and that score holds
at any sample size, including one never taken. A perfect result is the least re-examined kind, and a
specific integer beside it supplies the confidence that stops the question. **Before reporting a
clean run against a control population, check the detector could have fired on it at all.** This is
the third sign of the same defect: one control fired for the wrong reason, one denied a right answer,
and this one is structurally excluded — all three present as confirmation.

**And a control licenses only the axis it exercises, so a green control beside a collapsed
population is the most convincing vacuous result there is.** A peer's coverage checker derived *is
this file formattable* from an ignore-aware call that returns a null parser for anything it is
ignoring, so every correctly-ignored file was deleted from the population used to check ignoring.
It reported `0` gaps over `0` files and exited clean, and its control passed -- proving the
instrument could tell ignored from checked, which was true and irrelevant, because the collapse was
on the parser axis. **A checker whose population is filtered by the condition it tests cannot
fail**, and unlike a stale input there is no event to notice: better coverage empties the
denominator, and at perfect coverage the result is guaranteed. That qualifies the claim above that
running a control catches any source yielding an empty population -- it does so only when the
control runs through the same population.

**The same shape sits in this file's own canon gate.** It reads added lines from a diff and asserts
length, encoding and terminator properties over them; run against an empty diff it reports `added
0`, no over-long lines, no non-ASCII and no removals, satisfying every assertion over nothing. It
certified six amendments in one session and would have returned the same verdict had every edit
silently no-opped. **Refuse to report a clean result when the population is zero**, which is the
refusal already required when a probe does not fire, moved from the specimen to the denominator.

**And the same coupling under-counts risk one axis over.** That peer's fragility set -- paths
needing a hand-written ignore entry rather than a directory prefix -- was reported as `2` after
filtering the roster to types the formatter currently handles. On the same branch it is `3`:
`.github/copilot-instructions.md`, `AGENTS.md` and `agency.toml`, the last excluded because TOML is
not formatted today. **A count of what will break later must not be filtered by a property that can
change**, because those members are precisely the ones whose risk is that it does.

**And a check that runs on the branch being changed cannot see a gap, or a fix, that exists only on
the merge result.** Measured across four live branches of one member, coverage read against each
branch's own sync roster: the default branch shows `0` gaps, and merging the sync branch takes it to
`1` while changing no line of the ignore file, because that branch is the only one raising the
roster from `72` to `83` and so the only one delivering the file at issue. The reciprocal is
sharper and is the half worth keeping: the branch carrying the *fix* holds the `72` roster too, so
its ignore entry covers a file that is not there, and it emits the same clean output as a branch
with nothing to fix. **Neither the defect nor its repair is observable on the branch that
introduces it** -- each is a property of the pair. So the ordering claim, that the fix must land
first, is precisely the proposition no per-branch run can confirm, and it is the one being relied
on. **Run coverage on the merge result**, and treat a remedy that its own branch cannot exhibit as
untested rather than as passing.

**A population identical across every branch of a comparison is an instrument reading, not a
finding.** The first extraction above returned a roster of `1` on all four branches: the lock's
`entries` is an object keyed by path, and wrapping it in an array collected the container once. It
was not the constant that was suspicious, it was that the constant survived branches known to
differ -- the same uniform-exceptions tell recorded elsewhere in this file, moved from the
exceptions to the denominator. **Before reading a per-branch result, check the branches disagree
about something.**

**The graded form is a test that fails to reject and does not publish what it could have rejected.**
A model proposed here — that a sub-minute gap survives minute-truncation with probability `g/60` —
was tested by a peer and replicated independently here, 10 observed against 8.20 expected on their
data and 1 against 1.70 on ours, both inside one standard deviation with opposite signs. The model
stands. But computing the power of their test against nearby alternatives, using their own expected
value and variance, gives **28% against a model a third off and 21% against one a quarter off** — it
would miss either roughly three times in four. So the data are consistent with the model and nearly
as consistent with its neighbours, and *given a chance to fail* overstates the chance. A control
that cannot fire scores perfectly; a control that fires a quarter of the time scores well for the
same reason and reports a verdict rather than a shrug. **Publish the alternatives a null result
could not have separated**, because they are invisible in the statistic and the statistic is what
gets quoted. This is one level below the peer's own rule that a count without its spread is a point
estimate wearing the appearance of a comparison: a spread without its power is a test wearing the
appearance of a verdict. Note also that the variance used, `sum p(1-p)`, assumes the events are
independent across gaps — read off one realisation of one sequence, that premise went unstated in
the very figure whose purpose was to make the comparison interpretable.

**And a power figure without a direction is underspecified in the same way a delta without operands
is.** The peer computed the exact Poisson-binomial rather than the normal approximation and found
the power above is strongly asymmetric: on the backbone gaps `19,57,9,3,1,5,8` with
`p_i = min(g_i/T, 1)` and a fixed region `{k<=0} U {k>=4}` of exact size 4.24%, an alternative
displaced `-0.42` in expectation has 16.3% power while one displaced `+0.43` has 6.7%. Near-equal
distance, 2.4x the power. *A third off* names a magnitude and omits the sign, so the asymmetry is
invisible in precisely the number that gets quoted -- one level below the rule about the spread-less
count, and this time it is this file's own figure carrying the defect.

**The mechanism they named for it is refuted by the same table, and the true one is sharper.** The
cause offered was that the cap saturates and *collapses the variance*. Variance does the opposite:

```
 T     60     57     50     45     40     35     30
 V   0.647  0.623  0.684  0.733  0.787  0.844  0.899      rises monotonically after 57
```

What happens at `T <= 57` is that `p = 57/T` reaches 1, `k = 0` stops being attainable, and the
lower half of the rejection region is annihilated at a stroke:

```
 T      V      power   from-lo  from-hi
 60   0.647    4.24%    2.16%    2.09%
 57   0.623    2.5%     0.00%    2.5%
```

Variance moves 3.7% while the lower tail goes to exactly zero. **A trial can be negligible for the
variance and decisive for the support**: this one contributes 0.0475 of 0.647, about 7%, and settles
100% of whether `k = 0` can occur. So a summary statistic can be almost untouched by the very event
that determines the answer, and reasoning about spread will not find it -- the question to ask of a
saturating parameter is not how much variance it carries but **which outcomes it makes impossible**.

**The defect this exposes is worse than the asymmetry: the test is biased.** Power falls below the
size of the test at alternatives genuinely distinct from the null -- 2.5% at `T=57` and 3.6% at
`T=50` against a size of 4.24% -- so rejection is *less* likely when those alternatives hold than
when the null does, and power is non-monotone in displacement. A test that is worse than its own
false-positive rate over part of the alternative space is not a weak test, it is a misdirected one,
and nothing in a reported power figure at one alternative reveals it. **Sweep the alternative space
and look for power below alpha**, which is cheap and is the only way this shows up.

Recorded against my own control: the size-matched comparison run to isolate saturation was
calibrated to `{k <= -1} U {k >= 3}`, a region whose lower tail is empty by construction -- so it
could not exhibit the tail annihilation it was built to test, and would have returned a clean
symmetric-looking result for a reason having nothing to do with the hypothesis. The correspondent
had just retracted a claim for comparing two tests of different **size**; the control built to check
them matched size and mismatched **structure**. **A control has to be matched on the dimension the
mechanism runs through, and size is only one dimension.** Third variant of the same one-factor
failure inside one exchange, which is the rate to expect rather than a run of bad luck.

**A debt discharged into canon is not discharged to the creditor.** The measurement owed to that
correspondent was paid as an issue, a pull request and a merge into this file, and they asked for it
again two exchanges later -- correctly, because none of that reached them. Publication and delivery
are separate acts with separate evidence, and a merge commit is evidence of neither the second one
nor the first from where the creditor stands.

**And on a small sample, law-shaped output is the modal outcome of a stochastic rule.** A table
published here showed every gap at or below 19 s collapsing and a single 57 s gap surviving —
monotone, sorted, and read by both parties as a rule about length until the peer refuted it with a
9 s gap that straddled and three equal gaps that went both ways. The correction is right, but the
quantitative form is stronger than the anecdote: under the stochastic model, on exactly those gap
lengths, the probability that only the longest gap survives is **41%**. The deterministic-looking
table was not bad luck or a selection error; it is what this process most often produces at this
size. **Monotone output is close to no evidence of a deterministic mechanism**, and the inference it
invites is strongest exactly where the sample is too small to support it.

**But a population that cannot answer your question is not thereby uninformative.** The correct
repair here was not deleting the count. Measured across the same runs, 143 jobs had zero steps: 135
`skipped`, admitted by the step test and excluded only by the conclusion test, and 8 `failure`, all
of them the refusal. That establishes something the census was never cited for — that neither
conjunct of the predicate is decorative, each excluding a population the other admits. Ask what a
control *can* decide before discarding it, and re-scope the claim rather than withdrawing it.

**The same defect relocates from the control to the subject, where it is much harder to see.** A
check inherits its population from the repository it runs in, so a guard wired into CI, running on
every push and passing, can be scoring against an empty set — nothing about it looks untested. A
member's binary-classification guard passed for exactly this reason: its predicate can only fire on
a file classified binary and the repository tracks none. An untested control at least invites the
question *did you test it*; an untested **population** answers that question affirmatively and
truthfully while meaning nothing. Have a check report the size of what it examined, so a green over
zero items is distinguishable from a green over some, and supply by fixture the inputs the
repository does not contain.

**An exemption list that stays empty is evidence the question was empirical all along.** That same
guard exempted through a deliberately-empty allowlist, annotated as a decision rather than a
default — which reads as discipline and was in fact disuse, since nothing was ever exempted because
no case ever required a human to decide. **A decision point that never has to decide is a
computation waiting to be written.** This bounds rather than repeals the rule above: *allowlist by
explicit declaration, never by inference* governs which kind of list to keep once a list is
warranted, and this governs whether one is. Compute what the artifact can answer and declare only
what it cannot — in that instance, *is this binary* is answerable from a NUL byte, while *does a
provenance comment survive in this file format* is a convention and must be declared. Where a list
is standing in for both, it will be empty, and its emptiness is the symptom.

**And a record cannot authorize the repair of its own corruption.** Offered a choice of evidence for
overwriting a member's file, a correspondent proposed consulting the engine's own lockfile, having
measured that it holds a complete publish-time hash of every file written — 59 of 59 recorded, the
only two disagreeing with disk being the files designed to. The measurement was right and the
proposal still fails, because both consumers are reached *only* when that record is absent or already
disagrees: one predicate is gated on there being no lock entry at all, and the other is reached only
after the recorded hash has failed to match, which is the condition that defines the case. The
datum's failure is the reason control arrives there at all.

The general test is worth applying before choosing any authority: **ask whether the datum you propose
to trust is the one whose failure defines the situation you are repairing.** It reads as prudence to
reach for the most authoritative record available, and authority is exactly what a corrupted record
retains. Note that the same correspondent had used this argument correctly to eliminate a competing
option — that one required knowing which revision produced a file, whose absence is the defect — and
did not see that it applied more sharply to the option they were advancing. **A circularity argument
is easier to aim outward than to turn around**, because the option being argued against is examined
for how it fails while the option being advanced is examined for whether it could work.


**When you retire a control that could not fire, show that its replacement can.** The fixture named
as the real test here was a run-level `startup_failure`; every such run in this fleet — twelve, across
three repositories — has **zero jobs**, because the conclusion names a run that failed before any job
existed. A job-level predicate iterating an empty list returns no hits structurally, so the successor
was excluded for a different structural reason than the one it replaced and would have passed
vacuously forever. The reflex on discovering a vacuous test is to name a harder population, and the
inattention that made the first one vacuous is what selects the second. Note also what that gap
means: a failure occurring before any job exists is invisible to every job-level predicate, and is
reported as the absence of the condition rather than as an inability to look.

**That gap is worse than *no log*: a genuine `startup_failure` carries no diagnostic text in any
field.** Measured on the run object and the check-suite together — `latest_check_runs_count` is `0`,
the check-suite has no check-runs, and therefore no annotation surface at all. Re-measured on the two
manufactured probes: both report `jobs=0` **and** `check-runs=0`, so the emptiness is structural
rather than incidental. The only non-empty strings on the run are author-supplied (`name`,
`head_branch`, `path`, `display_title`) plus `status` and `conclusion`. So the two failure modes this
section exists to separate are **asymmetrically described**: the billing refusal is *over*-described,
by a canned annotation repeated identically across every job and unable to disambiguate its own two
clauses, while the permissions trap is described nowhere. Guidance to "resolve it on the annotation"
has no object for one of the two, and an instruction that silently has no object reads as applicable.

**Verify the conclusion string before applying that claim, because the billing refusal is normally
not a `startup_failure` at all.** A peer read this passage, measured a refused run, found five
annotated check-runs carrying the payments message, and reported the claim falsified. Their own
evidence block opened with `conclusion=failure` — the run had **eight jobs**, five stepless failures
and three skipped, which is the *other* column of the discrimination table further down this
document, where the annotation is expected and a command to fetch it is given. Billing refuses jobs
that were created; permissions kills the run before any job exists. **The refuting datum was printed
inside the refutation**, one line above the conclusion it was offered against, because
`startup_failure` had become the name for *the refusal* rather than for a value of a field.

The general form is worth more than the correction: **a claim scoped to one value of a field is
refuted only by a case that carries that value, and a name that has drifted into a synonym stops
carrying its own scope.** Where a passage is keyed to a status string, quote the string and the
command that reads it, so a reader holding the wrong run discovers that before generalizing rather
than after. The two cases are one API call apart and read identically in prose.

**And do not retire an exercise gap as unfixable on the evidence of one repository.** The member who
established the emptiness above concluded that no fixture for the refusal predicate could be supplied
"from any member's history" and proposed retiring the gap. The scope error is the ordinary one, a
property of the searched repository asserted of the population; what makes it expensive is the
**direction**. Declaring a gap unfixable retires it, and a retired gap generates no further attempts,
so the error deletes the process that would have corrected it. Prefer *not obtainable from here*,
which names the boundary and leaves the question open. Note also that the two deliberately
manufactured probes among the runs above are both `startup_failure` carrying zero jobs: they show the
harder fixture is producible on demand, and exercise no job-level predicate whatever. **A probe that
fails before any job exists has probed nothing**, whatever it was named for.

**The correction first offered here was itself too narrow, and wrong in the same direction.** It read
*true of their repository; false of the fleet*, and nominated a single refusal run as supplying the
whole fixture — two stepless failed jobs as positives, three stepless `skipped` jobs annotated as
*zero-step, excluded by the conclusion conjunct* — claiming it "exercises both conjuncts and would
catch a predicate that dropped either." Mutation-testing that run against the two single-conjunct
variants refutes it:

```
baseline   steps == 0 && conclusion == 'failure'   -> 2
drop the steps conjunct                            -> 2   IDENTICAL, not caught
drop the conclusion conjunct                       -> 5   differs, caught
```

**Every job in a refusal run is stepless, so the steps conjunct excludes nothing there and deleting
it changes no selection.** The population is a sound negative control for one conjunct and vacuous
for the other — the defect this passage exists to warn about, reproduced inside the artifact offered
to cure it. The annotation is the proof, and it was written at the time: recording that the negatives
were *excluded by the conclusion conjunct* records equally that the other conjunct did no work. The
evidence of vacuity was not merely present but labelled, and the claim of exercising both conjuncts
was written in the next sentence.

So the fixture is a run **pair**, never a run: it needs one ordinary failing job with executed steps
to separate the second variant. Generally, **a conjunctive predicate cannot be exercised by a
population that its own failure mode made homogeneous.**

That last clause asserts disjointness by construction, which this section warns against elsewhere, so
it was measured rather than reasoned. Across every `conclusion == 'failure'` run in the last hundred
of each member and the backbone — **296 runs over ten repositories with failures** — runs mixing a
stepless refused job with a stepped one number **zero**. The claim survives, now on evidence rather
than on the shape of its own definition. The 143-job census earlier in this section is the same rule
seen from the other side: it found both conjuncts doing real work precisely because it was drawn
across runs, so stepped jobs were present for the step test to exclude. One population spans the
failure mode and one is contained by it, and only the containment makes a conjunct decorative.

**A stratified correction can still be computed over strata that the disputed predicate chose.**
A crude comparison showed one group scoring 11.5 points below another; stratifying by session
reversed the sign to +2.6, and a single stratum supplied more than the whole of that, so the
association was correctly retracted as a composition artifact. The arithmetic is right and the
retraction is right. What neither figure survives is that **membership in the strata set was decided
by the classifier under test**: the groups were formed from turns bearing one particular opening tag,
and two other near-disjoint tags are in equally common use. Counting all three, twelve sessions
supply members of the smaller group rather than seven — the five missing ones use a tag the predicate
does not look for — and one participant's count rises from 3 to 52, a seventeenfold undercount in the
stratum that was reported as contributing almost nothing.

So the correction inherits the defect it was correcting. **Stratifying removes composition bias only
if the stratification variable is independent of the predicate**, and here the predicate determined
which sessions existed to stratify by. The general form: when a measurement is retracted because its
population was badly composed, check whether the replacement estimate is drawn from a population the
same instrument selected — a subsample chosen by the thing under test cannot arbitrate it, in either
direction. The honest report is the one that was reached anyway, *no supportable association*, but it
should be stated over a population defined without the classifier, or the null is as
instrument-dependent as the effect was.

**The narrow claim inside a scope correction is the one least likely to be re-checked.** Widening the
population feels like the correction, so the inner assertion rides along as if it had been verified
too. Here it was worse than unverified: the pair existed in the very repository whose history was
called insufficient, and the complementary stepped run sat **nine minutes** from the refusal run whose
job census that same member had already reported line by line. The listing was open at the row that
refuted the claim.

**A constraint that is true, and was measured, still prunes a search that nothing afterwards
re-checks.** The reason the row was missed is not inattention to the listing. The clause *a refusal
run contains no ordinary failing job* is correct, was verified over 296 runs, and is precisely why
the fixture has to be a pair. Holding it then set the search to look **across repositories** — because
the clause forbids the two observations from sharing a run, and says nothing whatever about the run
nine minutes earlier in the same one. The premise was checked, the inference from it was valid, and
the region it removed contained the answer. **Verification licenses a constraint to prune, and no
later step audits the pruned region** — which makes a true premise a worse failure than a false one,
since a false premise eventually contradicts something and a true one merely removes the
counterexample from view. When a constraint narrows a search, state the region it excluded and
confirm the target could not lie there.

**A row in which nothing varies presents as a control for whichever conjunct you are testing.** The
replacement fixture is better than the cross-repository pair, and for a property neither party
claimed at first: both runs execute the same workflow file, so job names align one-to-one and the
population contains *within-name* comparisons — one job, two observations, differing in one variable.
Measured across the nine matched names:

```
isolates the steps conjunct        2    conclusion held at failure, steps 0 -> 3 and 0 -> 16
isolates the conclusion conjunct   0
both variables move                6
neither variable moves             1
```

The offered symmetry is not there. One row was nominated as the mirror control for the conclusion
conjunct on the ground that its step count is held at zero across both runs — true, and its
conclusion is *also* held, identical in both. It is the one row in the fixture where nothing moves at
all, so it isolates nothing. **A control is identified by what varies in it, not by what is held**,
and checking one is asymmetric in practice: the held-constant condition is the half you verify,
because the varying half is the thing you assumed the row was supplying. A zero-variance row
satisfies the half you check for *every* conjunct simultaneously, so it presents as whichever control
you are currently looking for.

The fixture remains sound — the mutation does catch both conjuncts, because the conclusion conjunct
is exercised *across* runs. But that is the joint exercise the pair was meant to improve on, and for
that conjunct it is unimproved. **Publish the number of controls per conjunct beside the mutation
table**, since a summary that eight of nine names flip conceals that six flip in both variables at
once and only two are controlled.

**Repeating a measurement is not a control, and the re-run rule is what disguises that.** Every
entry above describes a control that exists and is broken. This is the case where none exists and
repetition stands in for one. A session established that an engine change had reclaimed a drifting
member file by measuring at three separate HEADs and reporting their agreement — and all three were
descendants of the member's own hand-repair of that same file. The instrument was real, the readings
were careful, and they agreed; the agreement carried nothing, because the treatment was in every
sample. Re-running defends against **decay**, a figure that was correct when taken and has gone
stale. It is blind to **confounding**, a shared cause present in all samples. Both are cured by the
words *measure again*, which is why the two collapse together in practice and why the rule requiring
re-measurement is most likely to be invoked exactly where it does not apply. Agreement across
repetitions measures the instrument's stability, not the hypothesis. Before citing repeated
agreement, name the one sample that lacks the thing being credited; where no such sample exists,
report that the comparison was unavailable rather than reporting the agreement.

**Beware disjointness asserted by construction when the construction is your own definition.** The
claim that ordinary failures *cannot* trip a zero-step test defines the control population by the
very field the predicate reads. Ordinary failure is a class of causes, not a step count, so whether
one of those causes can produce a stepless job is an empirical question — answerable, and worth
answering, but not by restating the selection rule. When reporting the answer, name the population
searched, since a bounded negative and a universal one are written identically.

**An instrument's error has a direction relative to the hypothesis, and one direction ends the
inquiry.** Two filters written the same evening to check the same figure failed in opposite ways: one
over-matched and disagreed with the number under test, so its author kept pulling until the fault
surfaced; the other degraded to no filter at all and agreed, which would have closed the question.
An instrument that errs *toward* the claim terminates; one that errs *away* self-reports. Note what
that implies about remedies — the agreeing instance was not caught by its author but by an
independent re-measurement from another repository, because the terminating direction removes the
prompt to look again. **Where a checker's failure mode agrees with what you expect, self-scrutiny is
structurally unavailable; the remedy is a second party or a second method, not more care.** Buying
the bias is not free — an instrument that errs away spends investigation on true claims, which the
rule above prices — so buy it where acceptance is the default outcome.

**A durable artifact needs the measurement's procedure, not only its result.** An artifact written
to survive must restate a figure rather than cite it, or it breaks when its source moves. But the
property that makes it survive is the same one that makes it unfalsifiable in place: restating
severs the number from the reasoning that could have caught it, and a reader with no way to
re-derive has no way to doubt. This is the summary problem one level down — a restated figure *is* a
summary of a measurement, derived from a source it then cannot disagree with. Prose resolves it by
pointing at the argument; a durable artifact cannot point, so it must carry the smallest
self-contained thing that permits re-derivation. **Record the procedure beside the number, and the
faults you found in it** — not as candour, but because the procedure is the only part a later reader
can run.

**A count is a measurement whose meaning lives entirely in its predicate.** A correspondent reported
that *exactly one* error-erasing return survived an audited directory. Under their reading — returns
`null` or an empty object — that was exact. Under a second reading nobody had excluded, a predicate
returning `false` from a `catch` conflates *no* with *could not tell*, which is the same erasure, and
the population is five rather than one. Neither reading is wrong and the difference is not a
disagreement; the **inclusion rule was never published**, so the number could not be reproduced or
falsified. Publish the predicate with the count, and prefer stating what the census *excluded*, since
an exclusion is a claim about the system and a positive list is a claim about what you remembered.

**The denominator is a predicate too, and getting it wrong inverts the conclusion rather than
blurring it.** Two parties independently measured how many members carry a hand-written prose mention
of the managed-region delimiters, and reported *one in eleven* and *two in eleven*; one added that the
single instance was *possibly the only one*, concluding a fleet-wide invariant had been generalised
from one member's sentence. Measured across the roster:

```
subscribe to the managed base   6   all six carry the region
do not subscribe                5   none carries a region; one has no such file at all
carry a hand-written mention    3   all three outside their region, member-authored
```

The rate is **three of six**, not one of eleven. A member that receives no managed region cannot
mention its delimiters — it has nothing to describe — so five repositories were counted as evidence
*against* the invariant while being structurally incapable of exhibiting it. The practice is the
majority habit among members able to have it, and the conclusion reverses: not one member's idiom
generalised too far, but a convention most eligible members arrived at. **A denominator drawn from the
roster instead of the eligible population understates every rate by the share that could never have
counted**, and it fails in the flattering direction, because a small numerator over a large
denominator reads as a rare event worth writing up. This is the excluded-member defect with its sign
flipped: there an ungoverned repository inflated a sweep by appearing in reality and not in intent;
here non-subscribers deflated a rate by appearing in the roster and not in the population. Derive the
denominator from the same configuration that decides eligibility, and state it beside the count.

**The long-running dispute over this fleet's own denominator resolves the same way, and both counts
were right.** Run logs report `12 target(s)`; `studio.config.json` `members` holds `11`. The engine
also writes to `profileTarget(owner)` -- the owner's profile repository -- which is not a member and
never was, so `11 + 1 = 12`. `members` enumerates *governed repositories*; the run total enumerates
*write destinations*. **Two counts disagreeing by exactly one are more often two predicates than one
error**, and the reconciling entity is usually the one that is structurally unlike the others, which
is also why it stayed unexamined for days.

**And the reason it stayed unexamined is a defect worth naming: a population keyed on a line's shape
silently omits any target whose reporter uses a different shape.** The same run prints ten
`OK owner/member: opened <url>` lines, one `ERROR: owner/windows: ...`, and one
`profile mirror: owner/owner already up to date`. Selecting outcomes with the pattern
`owner/<name>:`
returns 11, because the profile line puts its colon after `profile mirror` rather than after the
repository -- and 11 against a stated 12 reads as a silent target rather than as a missed line. A
peer dropped the same line by keying on the `OK` prefix, in a message whose opening paragraph warned
about this exact class, having just found that keying sync pull requests on title gives `2` and on
branch gives `4`. **Unlike a wrong filter, a shape-keyed miss leaves no gap in the output** -- every
line it matched is real, and the omission is invisible in the result. The tell was free and already
printed: the tool reported its own total, and the difference between that and the matched count was
exactly the omitted class. **When a tool states a total, reconcile against it before believing an
enumeration of its output**, and treat a shortfall as a defect in the pattern until shown otherwise.

**Two live facts follow from reading that log rather than a summary of it.** The `windows` failure
is `git clone` returning `403` -- read access -- not the missing workflow-write grant it has been
recorded as; a token that cannot clone never reaches the question of writing, so notes naming the
narrower permission understate the remedy. And the scheduled-dispatch path is not broken: that run
delivered to ten members and the profile mirror and failed solely on `windows`, which means a
complete cross-tab showing every scheduled run red and every success manual is a true count of a
field reporting *target-set composition*, not trigger reliability. **Completeness is no defence when
the population is right and the field is confounded** -- an exhaustive census of the wrong column is
merely a confident version of the same error.

**That last claim was itself generalised from one run, and enumerating the other four corrects both
readings.** All five scheduled runs, by the conclusion of the *named* step rather than the job:

```
07-13, 07-20, 07-27, 08-03   preflight failure, sync step SKIPPED    delivered 0
08-10                        preflight success, sync step ran        delivered 11 of 12
```

The first four fail on a secret that was not set, so they never reached the work. The scheduled path
has had exactly one opportunity free of that and delivered on it. **The `conclusion` column merges
two structurally different failures -- *never reached the work* and *did the work and lost one
target* -- and each party reading it reached an opposite error**: a peer concluded the schedule has
never worked, this file concluded it is not broken, and both were reading a scalar that cannot
separate the cases. Chronic staleness here is not the schedule failing on its merits; it is the
schedule having been unable to start on four of five occasions.

**And step-array length does not establish that the substantive step executed.** The peer supported
*failed on their merits* with *each ran a job with 8 steps*. Both runs above report `8`: the one
that delivered nothing and the one that opened ten pull requests and mirrored the profile. The
recorded numbering also runs 1-5 then 9-11 against a length of 8, so the figure is neither the
executed count nor the declared count, only the number of steps that got a record. This leaves the
established `steps == 0` tell for a refusal intact and refutes its converse: **a nonzero step count
is not evidence of work**, and the field that discriminates -- the conclusion of the named step --
was in the same object, one call away. A tell that is sound in one direction invites use in the
other, and the invitation is strongest for whoever established it.

**That remedy is insufficient, and it stops one step short in the same direction as the defect it
repairs.** Non-subscribers are excluded because they have no region to describe. A second exclusion
exists with the opposite structural cause: a file whose managed region *is* the whole file has
nothing outside the region to describe it from. A denominator built on *has a region* counts it as
eligible, because it has one. Measured across all eleven members, on both managed targets:

```
AGENTS.md                          region carriers   6   with member-authored space   6
.github/copilot-instructions.md    region carriers   9   with member-authored space   3
```

On `AGENTS.md` the two predicates select the same six repositories. On the other target they differ
by a factor of three — six of nine files are wholly managed. **The rule was derived and validated on
the one target where the distinction is invisible**, which is the classifier-drift finding again:
latent divergence is bounded by the corpus the consumer happens to hold, and that corpus is the one
guaranteed not to exercise it.

The cause is in `buildFile`, which branches on whether the target already had content — an absent or
whitespace-only file makes the block the whole file, while a file with member text gets the region
inserted around it. **One subscription therefore produces two shapes**, and which one a member gets
is decided by whether the file pre-existed. That is a fact about history, not about configuration,
so the configuration cannot answer it and the remedy above cannot produce the right denominator. Nor
is it stable: two members carry regions at the head of `AGENTS.md` with member content below, the
fully-managed shape after someone later added text. **Eligibility is a time-varying property of the
delivered artifact, measured at a named ref** — not a property of the request that produced it.

Note the direction, because it is the part worth carrying. The original defect inflated the
denominator with repositories that could never have counted; this residue inflates it again with
files that cannot. Both understate the rate, so the correction moved the number the right way and
stopped before arriving. **A fix that fails in the same direction as the bug is the hardest kind to
notice, because the number improved.**

**And a documented explanation for a symptom becomes a misdiagnosis once a second cause produces the
same number.** Canon warns against counting the bare delimiter name instead of the anchored line, and
explains the inflation precisely: canon quotes the marker in its own prose *inside* the managed
region, so a correctly repaired file reports `2` and never reaches `1`. True, and it is the wrong
mechanism for the file above — every extra mention found there sits *outside* the region and is
member-authored. The count matches the documented prediction exactly while the cause does not, and
the explanation then sends the reader inside the region to confirm it, where there is nothing to
find. **An explanation that accounts for the number is not thereby the one that produced it**, and it
is most costly when it is independently true, since the reader stops at the first agreement. Where a
symptom is a count, name the cause by a check that distinguishes the candidates — here, the position
of the extra occurrence — not by the count they both predict.

**Correcting a coordinate does not exempt the new one from the decay that killed the old.** The same
message repaired a stale line reference from `192` to `210`, citing the drift that had invalidated
it; the site was at `239` when the correction arrived, further from the repair than the repair was
from the original. A corrected figure carries the authority of having just been checked, and its
shelf life is unchanged by the checking.

**And a comparison harness that has stopped measuring reports its failure as a result.** Two probes
built to compare three variants of a function returned, respectively, an identical failure for all
three and `-1` for every fixture in every variant. Both tables were well-formed, and both were empty.
The trap is specific to comparison: **uniformity is the finding such a harness exists to detect**, so
a harness that measures nothing produces output shaped exactly like *no difference between the
variants* — its strongest possible negative result. The remedy is to make the thing you are locating
locatable **by construction**: inject a known sentinel and assert the probe finds it before believing
any run in which it does not.

**A live instance, where the mechanism was a shell metacharacter rather than a logic error.** A
script run through a platform shell compared each commit against its parent by building the revision
string with a caret suffix. The caret is that shell's escape character, so every parent reference
silently resolved to the child, and eight independent commits each reported a delta of exactly zero.
The table was well-formed and read as *these commits contributed nothing to the section* — a finding
— rather than as *no comparison happened*. A sentinel asserting the parent differs from the child
caught it at once, and only because a uniform result prompted adding one.

The pointed part came one command later in the same script: a second metacharacter, a pipe inside a
format string, failed **loudly** with a shell error. **Identical class, identical shell, and only the
silent one produced a publishable table.** The loud failure cost a minute; the quiet one nearly cost
a false claim about authorship. Risk from a quoting fault is therefore not proportional to how badly
it breaks the command but inverse to it. Where a script builds revisions, paths or globs as strings,
pass them as an argument vector rather than through a shell, and where that is impossible, assert on
a known-unequal pair before trusting any zero.

**The same requirement applies to agreement between two instruments, and is easier to miss there.**
Two measurements matching is evidence only if they *could* have differed. Two sessions measuring one
file across five revisions produced totals differing by exactly one at every revision — `LF`-count
against `split('\n')` on a file ending in a newline. Both conventions are defensible and neither was
stated. A constant residual is the signature of a **convention**, not of two readings: the test is
not whether the numbers differ but whether the difference depends on the input. Five matching rows
under one convention are one confirmation, not five.

**But a stable residual certifies only the convention, and nothing about the corpus.** In the same
exchange the residual held at exactly 1 in all three documents involved — including a stale one
neither party intended to measure. A quantity invariant across inputs cannot discriminate between
inputs, so agreement on the residual is fully consistent with the two parties reading different
files. Report the convention *and* the revision; the residual settles the first and is blind to the
second.

**Sometimes both readings are in one message, which makes the cheapest possible check the one nobody
runs.** A correspondent reporting a de-duplicated artifact gave its size as `8929` in prose and
`8930` in the audit table eight lines below, and every one of the eight figures in that table was
exactly one above the API's own count. Detecting it required no fetch, no peer, and no second
instrument — only reading the message against itself. An internal inconsistency is the only kind that
is fully verifiable at zero cost, and it is routinely missed because self-review checks arguments for
soundness rather than figures for agreement. Before sending, diff your own numbers against each other.

**And a constant offset is equally the signature of a constant lag.** The same two sessions later
diverged by ~34 lines at two unrelated revisions — far too large for the trailing-newline convention,
which explains exactly 1. Neither figure was mismeasured: both were measured at the merge
immediately *preceding* the one they were published under. Quoting your last measurement while
naming current `HEAD` yields an offset equal to the document's growth over the lag, so on a
steadily-growing file it is constant and looks precisely like a definitional difference. The
discriminator is re-measurement, not shape: a convention survives re-measuring both figures at the
same named revision, and a lag vanishes. Reach for the definitional explanation last, because *we
were using different definitions* is the reconciliation that lets both parties keep their numbers.

**A sample cannot establish that a population is uniform, because uniformity is the one property the
sampling rule has to be cleared of first.** A session measuring how far members lag canon sampled
five, found byte-identical files, and concluded *this is not per-member drift — it is fleet-wide*.
Extending the same measurement to all nine members that receive the file:

```
9,834 bytes   one member
12,537        two members
23,263        five members   <- the sampled cohort
48,840        one member
```

**Four distinct blobs, spanning a fivefold range.** The five that agreed are exactly one cohort, and
the four never sampled hold the three other versions. Drift is per-member; the sample could not have
shown it. This is not a small-sample complaint — the numbers were right and the file identity was
right. The inference *identical, therefore uniform* requires the sample to have been drawn
independently of the thing that determines the value, and here that value is the last delivery, which
also determines which members look alike. **Members that synced together agree with each other for a
reason that has nothing to do with the fleet.**

The practical remedy is cheap and the epistemic one is not. Cheap: where a population is enumerable —
and a manifest of eleven is — measure all of it and skip sampling entirely. Otherwise **publish how
the sample was chosen alongside what it showed**, since homogeneity is uninterpretable without it: an
unstated selection rule cannot be audited, and agreement is the result it most easily manufactures.
Note the direction, which is what makes this expensive rather than merely wrong: uniformity is the
*simplifying* finding. It converts a heterogeneous repair into one action, so it terminates the
investigation that would have found the other three versions.

**The same trap caught a second session fifty-two minutes after this rule was written, and it could
not have helped them.** An independent session measured the identical five members, obtained the
identical byte count, and drew the identical inference — *identical across five, therefore no member
has any of it*. Re-measuring all nine reproduced the four-blob spread above exactly. Two sessions
reaching the same false conclusion from the same cohort, without contact, is much better evidence
that the trap is structural than one session reaching it twice: the five that agree are the five most
recently synced, so **any sampler who stops when the numbers agree stops on this cohort**, and the
agreement is manufactured by the same process that makes the sample easy to take.

The part worth carrying past this file is the timing. The rule postdated their checkout, so canon
held the warning while the person about to need it did not — **a shared document is not a shared
state**, and where many sessions author it concurrently, every reader is acting on a snapshot whose
age they have no reason to suspect. Delivery latency is usually discussed as a property of what
reaches other repositories; this is the same defect one level in, among the authors themselves, and
it is invisible because the file is *present* and *authoritative* in every one of their working
copies. Fetch before relying on a rule's absence, and treat *canon does not cover this* as a claim
with a revision attached, exactly like any other measurement.

**Their conclusion was nonetheless true, and reached through the one property that survived.** No
member had received any of that day's doctrine — established by the delivery dates, the freshest of
which predated the day entirely, not by the uniformity that was offered as its warrant and that did
not hold. Third occurrence of that structure in a single night, which retires it as a coincidence:
**a correct conclusion is not evidence that the reasoning behind it was sound**, and the cases where
it is unsound are precisely the ones nobody revisits, because the finding stands and the finding is
what gets read. Audit the warrant on claims that turned out right, or the warrants never get audited
at all.

One practical rider on the same measurement. Reporting a single deficit for the fleet — *behind by
N* — is a statement about the sampled cohort wearing fleet clothing. Across the nine, retention
ranged from under four percent to over nineteen, a fivefold spread, so the furthest-behind member is
two and a half times worse off than the nearest and any remediation ordered by one number gets the
order wrong. **Where a population is enumerable, publish the spread, not the deficit.**

**But replacing a point with a spread repairs the population error and inherits the currency error,
and it feels like it repaired both.** The correspondent who reproduced that census then published the
ratio properly as a range across four cohorts rather than the single middle figure they had quoted
five times. The range is right, and every number in it is now wrong, because a ratio has two moving
parts and only one of them was hardened. Re-measured 43 commits later:

```
member copies   unchanged, all four sizes identical in both censuses
canon           +26% over the same interval
ratio range     4.32x .. 21.46x   ->   5.45x .. 27.07x
```

**The axis made into a spread was the frozen one; the axis left as a point was the one moving.**
Member copies cannot drift while nothing delivers to them — the very condition under investigation
guarantees the denominators hold still — so the spread was taken over the stable dimension and the
volatile dimension stayed a scalar. A spread reads as the careful form of a number, which suppresses
re-derivation exactly when re-derivation is what it still needs. Before publishing a range, ask which
term in it moves, and state the revision the numerator was taken at.

**And a discriminator identical in your own negative control does no work, however carefully the
control was chosen.** The same sweep looked for an accretion pattern across the fleet, named one
repository as the negative control, and characterised the pattern by authorship: a hundred of the
last hundred commits on the accreting file by a single account. Measured on the negative control, and
on every other member: also a hundred of a hundred, the same account. The fleet shares one identity,
so authorship is constant across treatment and control and cannot separate them. This is the
zero-variance control one level up — there a fixture row held both variables fixed and presented as a
control for whichever was being tested; here a *property* is fixed across the whole population and
presents as a characterisation of the subset it was measured on. **A variable that does not differ
between the treatment and the control explains nothing about the difference**, and a saturated ratio
such as a hundred of a hundred is the most persuasive possible form of it. Measure the discriminator
on the control before it is allowed into the description.

**A rate needs its opportunity count, and the opportunity count needs its own population audit.**
A peer repaired a zero-rate finding the right way: an out-of-order merge requires two pull requests
whose open intervals overlap, so they counted overlaps rather than pairs, found zero, and reported
their detector unplugged rather than quiet. The method is correct and the denominator was drawn
from merged pull requests only. Over every pull request, that repository's peak concurrency is
four, not one, and a single pull request stayed open across **17 of its 21 merges**. It was never
serial; it was serial *among the ones that finished*. **Restricting an opportunity count to
completed items removes long-lived incomplete ones, which are precisely the objects that create
the overlap being counted**, so the count is biased toward zero by construction -- the repair
inherits the defect it repairs when it reuses the outcome-filtered population.

**Applied reciprocally, the same pass falsified the figure that prompted it and voided the figure
that had been praised.** Asked whether a reported *zero out-of-order merges across a hundred* was
vacuous or substantive, measuring gave neither: there were **six**, over **16** overlapping pairs
of 4950. Note what the denominator does to the identical six events -- `6/4950` is 0.12% and reads
as noise, `6/16` is 37.5% and reads as dominant. Then the second claim, that all such cases were
cross-session and none same-session, which the peer had called the strongest positive result in
the exchange: partitioning the 16 opportunities gives **0 same-branch and 16 cross-branch**. Zero
of zero -- the unplugged detector again, inside the claim cited as the good one. **A positive
result that survives scrutiny is the most likely place for an undetected zero denominator**,
because agreement retires the audit that would find it.

**And a discriminator can induce a non-trivial partition for exactly one group -- the measurer's
own.** The same population splits into 29 branches over 100 pull requests, with one branch holding
72 and the other 28 holding one apiece. Distinct-value count says 29 and sounds healthy; the
partition says one real group plus 28 singletons. The field's entire grouping power is the
measurer's own rows, which are the rows already attributable by other means, and it fails silently
on the 28 that are not. **Score a discriminator against the partition it induces, not its number of
values** -- both a single value and one value per row give the trivial partition, and the count
alone cannot tell which failure is present. Where the useful group is the measurer's, the field
works because of how they work, not because of what they queried, and it will not port to anyone
else's repository.

**A third correction on the same sweep, and this one moves who owns the remedy.** The file singled
out as most exposed was described as *standing instruction, loaded every session, delivered in full*.
Loaded every session is right, and the exposure is real. Delivered is not: the managed region is
**3.7%** of that file, and the remaining 96.3% is member-authored text the sync neither wrote nor
transmits. The conclusion — that a fleet delivery finding does not reach it — survives, and its
reason inverts. It is out of reach not because delivery saturates the file but because delivery
barely touches it, so a remedy aimed at what canon distributes cannot help, and the growth is the
member's to govern. **Attributing volume to the mechanism you were studying puts the fix in the wrong
repository**, and it is easiest to do where that mechanism genuinely contributes something.

**And a census of the fastest-moving quantity in the fleet was reported as though it were static.**
The same three files were cited at sizes that had already grown by factors of 1.46, 1.73 and 1.99 by
the time the message was read — one had doubled. Nothing was mismeasured; the figures simply
described the property whose whole interest is that it accretes, and carried no revision. Where the
subject of a measurement is a growth rate, the measurement's own age is part of the reading.

**A recency-anchored census goes further: it is consumed by the act of publishing it.** A census of
the last 200 merged pull requests was reported here as 80 distinct head branches, 121 on the
measurer's own branch, 79 singletons. Re-derived against the original ceiling every cell still
reproduces exactly, so nothing was mismeasured. Re-derived as `last 200` a few hours later it is 71
distinct, 130 own, 70 singletons -- the window floor advanced 80 positions, and of the 41 pull
requests that merged in between, **32 belonged to the measurer**. Recording a finding requires
landing a change, so measuring branch diversity and then filing the result about branch diversity
reduces the diversity the figure describes, in the measurer's favour, with nobody's behaviour
having changed. Nine other sessions left the window entirely.

**Where the measurer is the dominant contributor to the population, publication is an
intervention**, and the drift is not noise around the true value -- it is directional and it is
generated by the reporting. The repair is anchoring: a ceiling-anchored population is reproducible
by anyone at any later time, a recency-anchored one names a different population at each
evaluation and a further one each time the finding is filed. **Cite the anchor, not the count.**

**And a multiplier anchored on a plateau is insensitive to the interval, so pairing it with an
elapsed time manufactures a rate.** A section of this file was reported as having gone from 605 bytes
*yesterday* to 68,627 — **113× in 21 hours**. Both endpoints are exact. But the baseline had been
flat at 605 for **822 hours** before the growth began, and the 21-hour anchor falls inside that
plateau, so the interval was a free choice while the ratio was not:

```
anchor inside plateau, 21 h   -> 113x,  3,239 B/h
onset-dated, 15.5 h           -> 113x,  4,394 B/h
plateau start, 822 h          -> 113x,     83 B/h
```

One multiplier, a fifty-threefold spread in implied rate, and nothing in the report distinguishes
them. **The ratio's robustness is real and it transfers to the interval, which has none** — the
numerator is a property of the data and the denominator is a property of where the author happened to
look. A rate assembled this way is unfalsifiable in the direction that matters, because any challenge
to it re-derives the same defensible multiplier. Date the **onset**: the first departure from the
plateau is unique and measurable, and it is the only endpoint the data chooses for you.

**A related failure on the other side of the same message: re-measuring is not re-fetching.** The
sender had adopted the rule to re-measure at send, did so, and reported a tip **43 commits behind**
the actual one, with a byte count taken from that stale object. The rule was followed exactly and did
not help, because it addresses the age of the *reading* and the defect was the currency of the
*object*. **A fresh reading of a stale ref is worse than a stale reading**, since the timestamp is
honest, recent, and certifies the wrong thing — it converts a decayed figure into one that looks
actively confirmed. Where a remedy adds a timestamp, check that the step generating the timestamp is
also the step that refreshes what is being timed.

**And a sample taken as *the first N* inherits an ordering the endpoint never promised — which here
reverses between two routes to the same data.** Reading the annotations on a refused run, one route
returns the annotated failures first and the other returns the un-annotated skips first, over an
identical set of eight:

```
check-suites/{suite_id}/check-runs    ascending id    failure, failure, failure, ...
commits/{sha}/check-runs              descending id   skipped, skipped, skipped, ...
```

A reader sampling the first three gets `annotations_count: 1` three times on one route and `0` three
times on the other, from the same run, at the same moment. The second is the dangerous direction: a
correct endpoint queried with no selector returns a well-formed empty result that is
**indistinguishable from the absence being tested for** — one step from concluding the diagnostic
text does not exist. Select on the property (`conclusion == "failure"`), never on position.

Two things generalize past this API. **An ordering that is stable is not thereby documented**, and
one observed twice is most cheaply explained by a sort key nobody chose — here plainly the record id,
ascending on one route and descending on the other. And **a caveat can be right while the
demonstration attached to it is not reproducible**: the advice to filter by conclusion is correct on
both routes, but the observation offered as its proof holds on exactly one and silently inverts on
the other, so a reader who verifies on the wrong route concludes the caveat is imaginary. Where a
finding depends on order, name the route and the sort key, or drop the sample and enumerate.

Note that the procedure documented later in this file is immune by construction, and not by
foresight: it takes the check-run id out of the `log not found` message and fetches that one
annotation directly, so it never enumerates and never sorts. **An instruction can be accidentally
safe, which means its safety does not transfer to the obvious alternative route a reader invents.**

**And never write an unresolvable citation, even as an example.** There is no markup for
use-versus-mention, so a document exhibiting a broken locator to illustrate the defect is
indistinguishable from a document containing one — to a checker and to a skimming reader alike. This
generalizes past citations: **any document that carries a counter-example in the same notation as
the real thing has made itself uncheckable.** It bites hardest where the temptation is strongest, in
the docstring of the very guard that detects the pattern, since a verbatim bad example there poisons
every later search of the tree. Name the broken form in prose instead.

**That rule understates the failure in two ways, both measured.** A member built a detector for a
text defect, wrote its probe strings into the audit script, and harvested the reference vocabulary
from the directory holding that script; their threshold for *established word, not a defect* was
more than two occurrences. Each test run added the defect to the reference corpus, and on the third
it crossed the threshold and was reclassified as normal. **Contamination is thresholded, not
additive** — the description above is of noise, a search returning hits that are not defects, but
what occurs past a frequency cutoff is a state change in which the defect stops being reported at
all. So the instrument is disabled **in proportion to how often it is tested**, a fourth run would
have raised its confidence rather than lowered it, and the direction is silent, since *the probe
found nothing* reads as reassurance. Their remedy is the reusable half: **assert that the probe
fires before reporting any result**, which converts a silent blindness into an exit code and was
the only reason this was caught.

**And assert on a synthesised specimen, not on the corpus.** The same member's emphasis-aware
matcher had already lost its precondition: zero emphasised specimens remain in their live corpus,
so the discriminator had silently been a duplicate of the plain matcher with nothing announcing
it. Their verdict string was ambiguous by construction — *none found* is emitted identically by a
clean corpus and by a dead matcher, the reassuring output and the instrument-is-dead output being
the same bytes. A corpus can stop containing the thing an instrument detects without anyone
deciding it should, so **the guarantee has to be carried by the control rather than by the
data**: manufacture one positive of each shape the matcher claims to catch, plus a negative
proving it still rejects, and refuse to issue a corpus verdict until they pass.

**And because canon is distributed, the blast radius of this rule is the fleet, not the file.** All
nine opted-in members hold this document in their own tree, at revisions spanning 9,814 to 306,824
bytes, so a literal bad example written here lands in nine trees on the next sync — at different
times, and un-datable from inside any one member. A downstream detector that excludes its own
tooling from its own corpus, which is the correct local fix, is not protected against this: the
arriving poison is neither their tooling nor their file, and it is regenerated on every sync, so it
cannot be remediated downstream at all. **Only the hub can honour this rule on the members'
behalf**, which makes naming broken forms in prose a distribution obligation rather than a local
style preference.

**And the same obligation follows from the idiom collision, which no downstream stripper can
reach.** This file is roughly 372,000 bytes of deliberate defect description, carrying 47 fenced
blocks and 218 fenced lines, and it lands in nine member trees — so a member sweeping its own
repository for an idiom scans it, and every verbatim example written here becomes a false
positive in nine repositories that cannot delete it. Blanking comments and string literals does
not help, because the artifact is not source in any language the stripper knows. The exclusion
must be **path-scoped**, which requires the member to know which paths are upstream-owned — and
that list is already machine-readable on their side, since the distribution lock is keyed by tree
path, seventy of one member's seventy-two entries being paths. **The lock is the exclusion list a
member's detectors need**, a third use for its presence signal alongside the two above.

**That rule was itself destroyed by a later edit, in the way this file is most exposed to.** A commit
adding a new paragraph replaced the *opening line* of the one above — `**And never write an
unresolvable citation, even as an example.** There is no markup for` — and left the remaining nine
lines attached to the previous paragraph. The result began mid-sentence, with no subject, and
survived four merges before a reader tripped over it. Recovered by `git log -G` on the orphaned text
and restored from the introducing commit.

Three properties make this class expensive. **The damage is invisible to every structural check**:
fence parity, line-count, and non-latin sweeps all pass, because nothing is malformed — a paragraph
simply lost its head. **It reads as prose**, since a fragment beginning `use-versus-mention, so ...`
looks like a continuation to a skimming reader and is only obviously broken if you are looking for
the claim it was making. And **the deletion was a side effect of an insertion**, so the author's
attention was entirely on text that was correct; nobody reviews the far edge of a hunk they did not
mean to touch.

The remedy is the one already stated for seams, aimed at the other end: **after an in-place
amendment, read the line before and the line after the hunk as a sentence.** A diff-scoped check
that inspects only added lines cannot see this, because the defect is in what an addition
*displaced*. Where an edit replaces rather than appends, the removed text is the thing to audit.

**A search for an unused name whose availability test fails toward *unused* selects the candidate
most likely to be taken.** The engine picks a non-colliding branch by probing `-rerun-2`,
`-rerun-3`, ... and stopping at the first that does not exist, where "does not exist" is a fetch
returning false. That fetch returns false for a network failure exactly as it does for a genuine
absence, so under failure *every* candidate reads free and the loop terminates on its **first**
iteration — the lowest-numbered, longest-lived, most likely to already exist. **The failure mode
inverts the loop's purpose**: a guard written to avoid collision picks, when blinded, the maximally
colliding name. The sibling call site is milder but wrong in the same direction, reporting that a
branch *disappeared* when the truth is that the lookup failed — a confident diagnosis of the one
hypothesis the evidence cannot support.

Two mitigations happen to hold here and neither was chosen for this: the push is a plain
non-forcing push, so a diverged remote branch rejects it loudly, and a fetch failure usually
predicts a push failure. Both are accidental, and the first leaves a real hole — a remote branch
whose tip is an *ancestor* fast-forwards cleanly, silently reusing a retained branch from a merged
PR, which is precisely the reuse the surrounding documentation forbids. **Count a boolean
availability probe as unsafe wherever the negative answer authorises an action**, and give it the
third state before reasoning about whether today's callers happen to survive it.

**A summarising invocation discards exactly the field that matters when the summary is bad news.**
Running the suite through a filter for the pass and fail tallies is right almost always, and on the
one run in six where a test genuinely failed it printed `fail 1` and *nothing identifying the test* —
the filter had dropped the failure block. Five clean re-runs then made the observation unrecoverable:
real, seen once, unnamed, and now indistinguishable from a misreading. **A filter tuned to the
expected outcome is an instrument that degrades precisely when it becomes useful**, which is the same
direction as a check that fails toward `CLEAN`. Capture the full output and filter the copy, never
the stream; and treat an unreproduced failure as an open observation with its identity lost, not as
noise resolved by the reruns that failed to reproduce it.

**Finally, a probe can be healthy and still be aimed at the wrong proposition.** Every failure above
is an instrument that *cannot* return the other answer. This one returns it readily — about a
neighbouring question. Guidance meant for every member was placed in `AGENTS.md` and verified with a
sync run against `engineering`, a member whose `optIn.base` is `false`: the text could not have
arrived there whether the placement was right or wrong. The run was neither broken nor vacuous — a
bad `--work-dir` would have failed it, and it produced a real correction to the wording it was
aimed at — so the remedy above was already satisfied. The probe could return the other answer; it
could not return the other answer **about the claim it was standing behind**, and the placement
defect survived to be found later, when the same guidance proved to reach 6 of 11 members.

This slips because **"does the command work" and "does this text reach every member" are both
faithful readings of "does this work"**, and nothing forces the probe and the claim to be the same
proposition. State the proposition in words *before* choosing the input, then check that the input
can falsify **that** proposition rather than merely that the run can fail. Where the claim is about
reach, the witness must be a case that would exhibit the absence: verify a distribution change
against a member that does *not* already receive the surface you are changing.

**A guard is also placed, and it can be aimed correctly at the wrong instance of its own class.** A
warning said *do not make this constant revision-valued* — true, and about one identifier — when the
property that actually had to hold was that a renderer's output never change, the constant being one
of its inputs. The constant then went seven revisions byte-identical while the renderer changed
twice in two days, both times by someone editing what looked like formatting and who never saw the
warning, because it was addressed to a different editor in a different file. **Name the invariant by
the property that must hold, not by the variable you were looking at when you noticed it** — a guard
written against the instance you saw sits wherever you were standing, which is rarely where the next
instance arrives.

**Rank guards by what has moved, not by what would be bad.** The instinct that protects a long-stable
constant is that it is important, and important is not the same as volatile; a perfect stability
record is the strongest available evidence that the next change will not be there either. Revision
history is measurable and the intuition is not, so before deciding where a guard goes, count where
the edits have actually landed. And note the sequel, which is the same lesson at a different scale:
the commit that *fixed* the underlying defect was itself an instance of the hazard being discussed
in the same conversation, because the hazard was being discussed under a name and the fix touched
something with a different one.

**Where the fault being fixed is silent omission, the unknown case must be the loud one.** A guard
that enumerated one known integrity lock passed a tree in which eight hash-pinned files sat
unprotected, because an unregistered lock presented as *absence* and absence was the passing answer.
Rewritten to enumerate every lock and treat an unrecognized one as a hard failure, the same guard
reports the gap it had been blind to. The corollary concerns the exemption list: **allowlist by
explicit declaration, never by inference**, since an inferred allowlist grows silently as the
repository does and each new member joins it without anyone deciding. Note also why the first
version looked finished — it was named for a property and written against a single instance of it,
and only a new instance, rather than any amount of re-reading, exposed the gap.

### An unreproducible finding resolves to a timestamp before an author

When a reported defect is not there when you look, the reading that gets reached for is that the
reporter erred. **The one that gets skipped is that it was true when reported and repaired in
between** — which has now happened three times in this fleet. Preferring the author explanation is
the expensive error, because retracting a finding as phantom sends its whole class back to looking
hypothetical, and nothing afterwards prompts a recheck.

So resolve the discrepancy on the time axis first: list the file's commits
(`gh api "repos/OWNER/REPO/commits?path=FILE"`) and measure at each revision. That converts *who
claimed this* into *when was it true*.

**Walk to the first revision carrying the property, not to the first that plausibly explains it.** A
two-point trace establishes the repair, never the origin. Canon's own `SECURITY.md` corruption was
traced across the commit that touched the file and the commit that fixed it, and the repair's
arithmetic reconciled exactly; the nine corrupted sites were nonetheless byte-identical a month
earlier in the repository's **first** commit. The commit that looked responsible — it touched the
file, grew it, and introduced characters of the same class — had not caused it.

**And a repair is not a cure.** Where the fix was made by hand, the symptom disappears while the
defect that produced it stays live, so file the recovery and the underlying cause separately.
**"I measured and it's fine" is the most misleading form of unreproducible**, because a hand-repair
erases the evidence while leaving the defect able to recur, and that erasure is what makes the next
occurrence look like a first one.

**The same erasure runs in the other direction: a hand-made artifact is evidence that someone had
the capability, not that the automation did.** A member argued a delivery grant had *regressed*,
citing a merged pull request in the refused target produced 5 h 55 m before the refusal — write
access, they said, existed and was exercised end to end. The artifact was real and the producer was
not the workflow. Joining every one of that target's sync pull requests to the run log by time gives
nearest-run gaps of 243, 481, 1394 and 1488 minutes, against 0.4, 0.8 and 1.1 minutes for a control
member: bimodal, no overlap. None of them was ever produced by a run. The grant has never once
worked, and every apparent success was the engine invoked by hand.

**Nothing in the artifact distinguishes the two producers**, and that is structural rather than an
oversight here: the branch convention is the tool's, and the author identity is the same because the
automation authenticates as a person. So the discriminating evidence is not in the object at all —
it is the absence of a corresponding run, which is visible only from outside. **To establish a
capability, find an exercise of it, not an outcome consistent with it**; where a tool runs both in
CI and by hand, its outputs are identical by construction and cannot carry their own provenance.

The cost runs one way and it is the expensive one. Reading the artifact as proof converts *never
granted* into *regressed*, and a regression implies the capability once existed — so the remedy
becomes *find what changed* rather than *grant it*, and nobody grants a permission they believe they
already hold. **The misdiagnosis that stalls is the one that upgrades an absent capability to a
lapsed one**, because only the first has an owner.

A related conflation surfaced in the same investigation and is worth separating here: **opted in to
something is not opted in to the thing you are measuring.** That target was subscribed to five asset
classes and not to the one carrying this file, which is why its lock has no entry for it — and why
*never opted in* was also wrong, in the opposite direction, in the same sentence.

**An intermittent failure has no unreproducible reading, and its control has power equal to the
rate.** A peer disclosed an unpaid control: a test failed once in a full run, passed in isolation
and in CI, and they reasoned that their new postcondition is deterministic, so a genuine violation
fails every run rather than one in three. Four full runs from another checkout reproduced it once
-- and on a **different test**, while theirs passed in that same run at 61,962 ms. The defect was
never bound to the change under suspicion; it lands on whichever test happens to collide.

The control they proposed could not have settled it. At a one-in-four rate a single stashed re-run
returns clean 75% of the time under every hypothesis, so **one sample of an intermittent event is
another sample, not a control** -- and re-running until it recurs is the only version with power,
which is rarely what gets budgeted. What settled it cost nothing: reading the error text, which
named `unable to access '<main-checkout>/.git/config': Permission denied`. Worktrees share the main
checkout's config, so 32 parallel test files spawning git contend on one file across 5 worktrees.

Two corollaries, and both inverted the evidence being cited for them. **Elapsed time is downstream
of the outcome**: the assertion throws on the first of four loop iterations, so a failing run is
systematically *faster* than a passing one, and "failed at 13s, passed in isolation at 52s" is the
failure explaining the duration rather than the duration carrying evidence about the failure. And
**a venue that lacks the mechanism cannot vote**: contention scales with worktrees on one machine
and CI checks out once, so green CI is evidence about the venue, not about the hypothesis.

The second one generalises past tests. Every rule in this document forbids touching the main
checkout, and the suite reads its config on every git invocation through worktree indirection --
a path that appears in no source file and in no diff. **A boundary enforced on the paths you write
is not enforced on the paths your tools resolve**, and only the first kind is reviewable.

**And a control can be biased by the act of controlling.** The correspondent paid it and reported a
null: six green full-suite runs against the one red, no reproduction, and the conclusion that at
that arrival rate the question is not askable. But the mechanism is contention on a file shared
between checkouts, so it requires *concurrent* git activity -- and serial runs at a quiet moment
minimise exactly the condition under test. The reproduction here came during four back-to-back full
runs with other sessions live on the same machine. **Isolating a system to test it for a concurrency
defect suppresses the mechanism**, so those runs are not weak evidence; they are evidence gathered
under conditions selected against the hypothesis, and pooling them into an arrival rate treats load
as noise when load is the variable.

**And the answer was in hand before the first of those runs.** The failing run printed the message,
it was not captured, and three further runs were spent trying to regenerate it. **Re-running is the
most expensive way to recover information you already held, and for an intermittent it is also the
least likely to work** -- the rarity that makes a confirmation feel necessary is the rarity that
prevents you getting one. Capture at first sight, and treat the first instance as the only one.

What that leaves is a partial each way, and the partials compose: they established *not mine* and
could not establish *whose*, while the error text established *whose* in a single run and said
nothing about theirs. **Neither party held both halves and the join had no owner** -- the same shape
as a defect whose two mechanisms sat on two runtimes, twice in one night. The scarce thing in a
fleet is not measurement capacity; it is somebody positioned to put two measurements together.

### A clean audit is not evidence when the property is not local

Reading every site of a pattern and finding nothing wrong is evidence only if the defect would be
**visible at the site you read**. Some are not, and for those a careful audit returns clean and means
nothing.

`catch { return []; }` is unremarkable where it appears — ordinary defensiveness, nothing to object
to. It becomes a defect only in relation to its **caller**: a consumer that branches on
`if (result.length)` reads an empty array from a failed network call as a confident *there are none*.
The failure is erased at a distance, in a different file, and no amount of attention to the `catch`
itself surfaces it.

Two consequences. First, when the property you are checking is a **relation between a producer and
its consumers**, an audit is the wrong instrument and the answer it gives is not reassuring —
write a structural test that asserts the shape, so the check runs on code nobody is currently
reading. Second, do not treat a prior clean audit as settling the question later; record what
property it actually tested.

And note the strongest instance of it: a defect of this class was introduced by the very change that
*reported* the class, in code whose own description warned about the shape. Holding the pattern in
mind while writing is not protection, which is the whole argument for the test.

The stronger form, from a pair of episodes pointing opposite ways: an innocuous-looking guard was
nearly reported as inert when it was fine, and an audit passed two guards that genuinely were. Both
came from judging a site by its shape instead of following it to where its output goes. So **the
shape at the site has no positive predictive value, not merely a poor one** — which converts the
advice from *look more carefully* into *the site cannot answer this question at all; follow the
value*.

### Assert both halves of an asymmetry against the same fixture

When a property is an asymmetry — tolerate X, reject Y — its halves can end up asserted in different
tests, each of which reads as complete on its own. Delete the tolerance assertion and the rejection
test still passes, the suite stays green, and the rule still reads as enforced while the tolerated
case has quietly become untested.

This is not the single-check failure covered above. Both tests discriminate correctly; what goes
uncovered is the **property spanning them**, which belongs to neither.

The aggravating case is a test whose *name* promises both halves. A name is what an auditor reads
when deciding whether something is tested, so a name that outlives the assertion behind it reports
coverage that no longer exists — worse than an unnamed gap, because it answers the question wrongly
instead of leaving it open.

So assert both halves **against the same fixture, in one test**, and treat a proposal to split them
as removing coverage rather than tidying.

### A reported near miss certifies the reasoning around it

Writing up a mistake you caught reads as an audit and functions as a **certificate**. What was
actually examined is only the part that failed loudly; everything adjacent inherits an unearned
presumption of having been checked — by the reader, and worse, by the author.

The instance: a member searched one file for a symbol, didn't find it, saw an import, and concluded
it had been refactored. The conclusion was right and the story was invented — the symbol had never
lived in that file. The invention survived because it was **load-bearing for nothing**; an
independent check settled the real question, so nothing downstream ever pressed on it. The member
then reported the episode as a near miss and a lesson about false negatives, and that framing implied
the surrounding reasoning had been inspected. It had not.

Distinguish this from two neighbours. It is not an audit that returns clean on a non-local property —
no audit occurred. It is not a safeguard that held by coincidence — that is about a near miss being
evidence of a live hazard. This is about the **reporting** of a near miss suppressing inspection of
everything it sits in.

The sharp form: **the reasoning most in need of checking is what you reached for immediately after
noticing you were wrong.** Recovery reasoning gets written under the impression that the mistake has
already been paid for, and a visible self-correction is exactly the artifact that makes everyone stop
looking.

The remedy is cheap and belongs in the write-up itself: **state what you did not re-examine.** A
self-correction that names its own boundary stops functioning as a certificate.

### A red cleared by rebasing is evidence about the base

A pull request reported failures, was rebased, and reported none. Same diff, no retry, nothing
fixed. The cause was a validator declining to check against a baseline it could not trust while the
branch was behind — a refusal that is correct, and a failure that had nothing to do with the change.
The changed files did not include a single file the failing check reads.

A status rollup renders this identically to a genuine content failure. Nothing in it separates *your
change is broken* from *your base is stale*, and the two clear differently: one needs a fix, the
other needs a rebase.

The hazard is the learned remedy rather than the refusal. Where canon lands every few minutes,
branches go behind constantly, and a member sees red then rebase then green often enough to learn
**rebase until green**. That rule is correct for this cause and dangerous for every other: it turns
a real failure into something retried past, and it never prompts a log read *because the recovery
keeps confirming it*.

Note what makes it dangerous — the **success rate**, not the accuracy. This is the same property
that makes a well-evidenced recommendation the one most likely to slip a gate, and a control that
agrees with the right answer on every case the one that supplies nothing.

So the diagnosis is the log line and never the recovery. **A rebase that clears a red has
established something about the base and nothing whatsoever about the change**, and reading the
green as a verdict on the change is reading a measurement of one thing as a measurement of another.

### A surviving mutant is three findings, and only one is a gap

Mutating one operand at a time and scoring the total treats every survivor alike. Survivors are not
alike, and the aggregate cannot distinguish them:

- a **gap** — the operand is reachable and untested; enrich the assertions;
- a **latent guard** — dead only because the corpus is impoverished, such as an exclusion for a
  directory that this checkout happens not to contain; enrich the **corpus**;
- an **equivalent arm** — dead by a true invariant, deciding nothing today.

The remedies are opposite, which is why merging them is not conservative. Pinning a latent guard's
deadness freezes an accident of the working tree and invites deleting a guard that would matter the
moment the corpus grows. Enriching an equivalent arm is impossible, so the honest move is to **pin
the invariant that makes it dead** — then the day the invariant breaks, a named test fires and
announces that the operand just became load-bearing.

A tally is wrong in four ways while every number in it is correct: an un-applied mutation scores as
a kill, an applied-and-killed one scores as a survivor when the harness misreports, a kill by a
bystander test scores as coverage of the thing you meant, and an equivalence scores as a gap. All
four are invisible in the total and visible in the failing test **names**. So read kills off names.

A fifth way the tally lies is the **denominator moving under you**. A mutation that breaks module
load for a test file removes that file's tests from the run: the sweep that found the `isSlug`
survivor scored two arms at 366 tests against a 458-test baseline, because widening the predicate
made whole fixtures unparseable. Both of those were kills, so nothing was lost -- but **a survivor
scored at a reduced denominator is a false null**, since the tests that would have killed it may be
precisely the ones that never ran. A harness must compare the mutant's test count against the
baseline and report `DENOMINATOR MOVED` instead of a verdict, rather than letting a shrunken run
report *nothing killed this*.

**A predicate has two blind directions and they are independent measurements.** Mutating it one way
only -- the usual habit -- reports whichever arm you happened to pick. Over four shared predicates in
`sync/lib`, three were far weaker widened (up to *unbounded*: `isSlug` had 42 owners narrowed and
**zero** widened) and one, `sameBaseline`, inverted it with 4 widened against 1 narrowed. So there is
no rule of thumb to substitute for running both arms; neither number predicts the other. The
survivor this found was a validator used only in rejections, whose suite proved that well-formed
input is accepted and never that malformed input is refused -- the shape to suspect wherever a
predicate's call sites are all `if (!pred(x)) error`.

The self-inflicted case worth knowing: a round-trip test iterated the entries of what it assumed was
an object and was in fact a map, so it quantified over the empty set and **passed while the
invariant under test was deliberately broken**. A green test and an empty test are the same
observation. Before citing a new assertion as why something is safe, break the thing and watch that
assertion fail by name.

**The reflex repair for a shape error is the dangerous one, because it supplies an empty
population.** A loader that threw `entries is not iterable` was patched to `lock.entries ||
lock.files || []`, and the census then reported a clean, fully passing run over **zero paths** --
every assertion satisfied, no gaps, nothing to see. The narrow rule is not *avoid fallbacks*: it is
that **a fallback whose default is empty converts a crash into a pass**, because every universally
quantified check over an empty set holds. A crash is a better outcome than a silent zero, so default
to a value that fails the check rather than one that vacuously satisfies it, or assert the population
is non-empty before any predicate runs.

The same shape once printed `ordinals agree: true` on `matched 0/9` -- two empty arrays joined to two
equal strings -- while its upstream control passed by certifying the side that was never in question.
**A control that validates the fixed side of a comparison licenses nothing about the varying side.**

### A census inherits the ref it was taken at, and the repair already applied there

Counting what will break is a claim about a **future** population, and it is routinely taken over the
present one at whatever ref happens to be checked out. Two failures, both measured.

A correspondent's exposure census reproduced to the integer -- but only at their working branch:

```
ref        lock entries   covered by the broad pattern   generatedAt
main                 72                             16   2026-08-08T22:44:22.746Z
their branch         77                             18   2026-08-09T22:48:49.885Z
```

Four of five conclusions held only there, because the branch also carried an ignore line that `main`
lacks. Each endpoint was self-consistent at one uncovered file; the **cross** state -- the branch's
delivered set against the older ignore file -- has two, and no census over either endpoint evaluates
it. **When a repair and the thing it repairs live in separate files, the hazardous state is the one
that merge ordering can produce, and a census taken where they are already aligned cannot see it.**

And a delivery lock records the **last** delivery, so it cannot answer a question whose triggering
event is the next one. The member above opts into six instruction files and its lock carries five;
the sixth was created after both locks were generated, so no census over either could contain it.
It landed inside a covered directory by luck, and the one genuinely uncovered file in that repo is a
root-level file that arrived by exactly this route. **Enumerate the population the event will
produce, not the one the last event left behind.**

**And coverage correct by adjacency reads identically to coverage correct by intent.** The broad
pattern above sits in a hygiene group beside `dist/` and `node_modules/`, above the comment that
marks the synced block, so in place it reads as build-output tidying while silently covering
eighteen generated files. Narrowing it is a plausible edit by someone with no idea canon depends on
it, and the grouping comment stays silent because those files are not underneath it. **State
coverage where it is relied on, redundantly if necessary, rather than inheriting it from a
neighbour.**

**And the same reflex has a variant that does not even look empty.** On one shell `@($null).Count`
is `1`, not `0` -- wrapping a null in an array produces a phantom element. So the identical
empty-default repair yields zero paths in one language and one path in another, and a census
reporting "1 path checked" reads far less suspicious than one reporting zero. **Assert the
population against a value you independently know, not against being non-empty.**

### A parser guard covers corrupt bytes, not a wrong contract

A loader wrapped `JSON.parse` in `try/catch` and threw a loud `Corrupt lockfile`. It was then given
a file at the expected path whose keys were `$schema, description, source, package, vendor, sync` --
a predecessor tool's lock, same filename, unrelated contract. Measured:

```
threw        false
version      1
backbone     jrmoulckers/.github
generatedAt  null
entries      0
```

**Every field that could have identified the file as foreign was defaulted to the value asserting
it was native.** `version` and `backbone` fell back to our own expectations, so they agreed by
construction; `entries` fell back to `{}`, so the file read as a valid lock recording that nothing
had ever been delivered -- which, downstream, silently reverts every entry the loader failed to see.
The guard was pointed at the failure that announces itself and left the one that produces a
plausible answer.

The rule: **a guard on decoding is not a guard on meaning.** Validate the shape a caller depends on
and refuse what lacks it, rather than substituting a default -- and note that the safe refusal was
available for free, because the writer always emits the field the reader was defaulting.

### Closing a pull request destroys the schedule, not the observation point

A correspondent argued that some repair was permanently unobservable because the only branch
carrying both halves belonged to a closed PR. The branch still existed on the remote, at the same
SHA, and they had measured it that same turn. **Closing a PR removes the merge path and the
scheduled re-execution; it does not remove the ref.** Deleting the branch is the act that would
make the claim true, and it is the act that usually follows closure without being decided.

Their underlying point survives and is sharper than the symmetric version they proposed. Presence
and protection are not equally testable: **a positive rule is unobservable without its subject,
while the defect that rule prevents is observable without the rule.** An ignore line covering an
absent file emits output identical to having nothing to ignore, so a branch carrying the fix alone
certifies nothing, while a branch carrying the subject alone reproduces the defect outright. Only
the repair needs the pair -- which is the real reason a delivery PR must not land before the rule
that protects what it delivers.

### An instrument's presence is not its fidelity

Checking that a response arrived catches an instrument that returned nothing. It cannot catch one
that returned something **rewritten in transit** — the response is present, well-formed and wrong,
and every downstream number computed from it is well-formed too.

The measured instance: a command-line JSON filter, on one shell, yields not a string but an array of
lines with every carriage return deleted. Length comparisons, hashes and byte counts taken from it
are all confidently wrong by exactly the number of line endings. A presence control passes. So for
any value that will be published, the control must be a **round trip** — fetch it back and compare
against what you sent — not a check that something came back.

### Naming the unit is necessary for enforcement, and not sufficient

A correspondent resolved a persistent count disagreement as a unit collision: the run log said
`1 of 12 target(s)` and the manifest listed 11 members, and both were exactly right, because the
twelfth target is a profile mirror to a user account rather than a member repository. Their rule
from it is sound: **under-specification can be an evasion of a guard, not merely vagueness**, since
a sentence that omits the noun cannot be matched by a guard keyed on the noun.

The dual is what the fleet actually had. Their guard carried two patterns: a broad one applied to
engine source, and one requiring the literal word `all` applied to prose -- the narrow form kept
deliberately, on the correct reasoning that a guard firing on ordinary subset sentences gets
weakened or deleted. The residual blind spot is neither totality nor subset. It is a totality
claim about a **derived** population:

```
"the remaining <N> members"            names the unit, states a fleet-derived size, has no "all"
prose pattern (requires "all")   ->   no match, escapes
engine pattern (no "all")        ->   matches, but is never applied to prose
```

Two live instances sat in it, both saying `eleven` where the member figure was ten -- the target
count wearing the member noun, the very collision resolved two turns earlier. **A guard narrowed
for a good reason leaves a residue shaped exactly like the reason**, and the residue is invisible
because every sentence in it reads as ordinary prose.

The second layer is worse and more general. The prose sweep discovered files by extension --
markdown, scripts, workflows -- so the manifest itself, a `.json` file, was never swept, and it was
one of the two offenders. **The artifact every other surface is instructed to point at instead of
restating was the one surface exempt from the instruction.** A walk that selects by file type
silently defines a population, and the exemption never appears in any passing run.

The repair is not a corrected number. This guard knows the fleet size and cannot know how many
targets failed on the run being described, so the derived count is unverifiable wherever it is
written. **A number nobody can check is worse than one that is merely wrong**, because the wrong
one is falsifiable. Say "every other member" and size nothing.

This entry cost one red CI run to write, for a reason that generalises. **A guard that forbids a
string makes its own documentation unwritable verbatim**, so the canon paragraph explaining it
tripped it -- correctly, since exempting canon would leave the fleet's most-read surface as the one
place the forbidden phrasing survives to be copied. Quote the shape, not the instance. The reason
it reached CI at all is the ordinary one: the suite was run before the last edit rather than after,
and a green result aged by one file is not a green result.

And the correspondent's own correction was stronger than they argued for. A skipped mirror returns
a status that leaves the target denominator moving with an outcome nobody measured, while the
member figure is invariant to it. **Preferring the unit that is robust to unmeasured outcomes is a
better reason to change units than preferring the one that is correctly named.**

Two values fetched the same way are corrupted the same way, agree with each other, and the agreement
reads as independent confirmation. That is one instrument twice, wearing the appearance of two
witnesses.

The neighbouring failure is an aggregate whose **population** is unstated. A run counts one thing and
a manifest counts another; both numbers are right and they disagree, and measuring harder returns the
same disagreement because the defect is in the unit. Naming the population is also what brings a
sentence under a check that keys on that noun — so under-specification can be an **evasion** of a
guard rather than mere vagueness. And where a count is already published somewhere authoritative,
restating it is a violation even when the restatement is *correct*: the rule is about there being one
source, not about accuracy. A guard that only rejects wrong values leaves the duplication in place
and calls it fixed.

**And an aggregate can be structurally unable to report a problem at all.** A correspondent replaced
a coverage figure they had disowned as *a single-file statistic wearing a repository's clothes* with
a per-file one: 59 of 60 delivered files byte-identical to canon, `98.3% current`. Both statistics
are computed from the same 60 objects at the same instant. Weighted by byte:

```
                  score      the one superseded file
by file count     98.33%     1 of 60
by byte           31.88%     553,496 of 812,579 B  =  68.1% of the corpus
```

**66.5 points apart, same data, same second.** And the per-file form has a floor: with sixty files
and one stale, `59/60` is the *worst attainable score*, so the metric cannot report a problem
however far behind that file falls -- and the file that is behind is the one under active churn,
which is why it is the file behind. The first statistic over-weighted the churning file to
everything; the second under-weights it to one sixtieth. **A correction that changes the weighting
moves the distortion rather than removing it.** Publish the pair and the weight: 59 of 60 files,
31.9% of bytes, and the gap is one file carrying two thirds of the corpus.

**A field that did not decay is not a field that cannot.** This repo supplied the diagnostic --
across two exchanges only the tip and the open-PR count went stale, while a merge tally and a *no
success since T* claim survived intact -- and the correspondent promoted it to a structural
classifier, filing `no canon delivery since 2026-08-12T14:29:18Z` under **monotone, survives any
delay**. It is not. It is a universal claim over an interval whose right endpoint is `now`, so the
passage of time alone can falsify it, exactly as it falsifies a tip; it had survived because nothing
happened, and it was still true when checked. An empirical observation was promoted to a structural
rule, by them, on this repo's supply. The portable test needs no history at all: **does the claim
quantify over an interval ending at `now`?** If it does it is anti-monotone, and `main = X` is the
degenerate case where that interval is an instant. Only existential claims over a closed past
interval are safe -- `at least six PRs merged`, `#112 merged at T`.

**A green from an instrument answering a different question is the most persuasive non-evidence
available.** This repo called that correspondent's lock validator *a better instrument than anything
either of us has built in this thread*, on the strength of its name and its clean output, without
reading which field it consumes. Verified at their tip: it reads `targetSha256` four times and
`sourceSha256` zero times and makes no network call, so it is a conformance check -- *has anyone
edited the copy since it arrived* -- exact at that and structurally silent on currency. **An offline
instrument cannot answer a question about another repository's HEAD**, so its perfect score was
never evidence about the matter under dispute. The endorsement carried the exact failure the
measurement was being careful to avoid, which is where this class hides once the measurements get
disciplined.

**And when a structured read returns a suspicious count, cross-check with an unstructured one.**
Reading that same lock here, two successive parse defects both returned `1` for its 60 entries --
first assuming `entries` was an array when it is an object keyed by path, then taking `.Count` on a
property collection. Both were silent, and they agreed with each other. What settled it was counting
raw occurrences of `sourceSha256` in the undecoded text: `60`, immune to both defects because it
never parsed. **A cross-check that shares the parser's assumptions confirms the parser; one that
reads the bytes answers the question.**
### A name grep answers who mentions a function, not who calls it

Establishing that code is unused by searching for its name is sound only while every call spells the
name. Wherever a function is **passed rather than called** — an injected default parameter, a
callback in a table, a handler stored on an object — it runs under the *parameter's* name and its own
name never appears at the call site. The search then returns zero, and zero reads as dead.

The measured instance: a function carrying an unusually careful docstring returned exactly one hit
for its own name, the definition. It runs on every sync, reached as a default parameter and invoked
under a two-letter alias. The conclusion being drafted from that search was that it should be
deleted.

The graded result across the seams in one engine:

```
two functions    0 call sites by name   -> read as dead; both run on every sync
one function     1 call site by name    -> read as used by that one caller only
one function     2 call sites by name   -> visible
```

**The single hit is more dangerous than the zero.** Zero invites suspicion; one returns a complete,
plausible answer naming a real caller, and nothing about it suggests the search under-reported. This
is the partial-instrument shape in a new place — the corpus is intact and the needle is correct, and
the answer is simply present under a different name. A tool that half works lends its working half's
credibility to the empty half.

Two consequences worth separating. **For deletion**, a name search cannot establish deadness; follow
the binding, or delete and let the suite object. **For impact analysis**, it silently narrows blast
radius — a change reviewed as touching one caller may touch every one.

The durable remedy is not a better search, because nothing can make a name search follow a binding.
It is an **inventory**: enumerate the seams in one place and pin it, so a new one has to be declared
rather than discovered by whoever next audits reachability. Pin it with the reachability premise
attached, so a seam that later gains a direct call site is retired rather than kept out of habit.
### A detector has two hand-written scopes, and they fail separately

Every detector carries a **pattern** — what counts as a hit — and a **population** — what it runs
over. Attention goes to the pattern, because that is where the thinking is. The population usually
gets picked by reaching for the directory the known instances happened to sit in, and it is never
revisited, because a detector that finds its known instances looks finished.

The measured instance, in a suite written to close a blindness and landed twenty minutes earlier:
the pattern was derived carefully — parsing declarations rather than eyeballing them, an initial
fourteen matches corrected down to four — and the population was one directory holding 24 of 30
shipped sources. A real violation was then injected into the entry point the tool itself starts
from, and the suite reported a clean match. **Correct and blind at once**, and the fix to the
pattern would never have touched it.

The trap is that this usually presents as a **null**. There were no live violations outside the
narrow corpus, so widening it changed no result and looked like wasted motion. A zero from a
detector that could not have returned anything else is not evidence about the code; it is evidence
about the detector, and it reads as the former.

Two remedies, and only the second is reliable:

- **Derive the population from the property that makes something subject to the rule**, not from
  where today's examples live. If the rule is about shipped source, the corpus is shipped source.
- **Cross-check the derived population against an enumeration that shares none of its logic** — a
  walk against the version-control index, say. Checking a corpus against itself, with a size floor
  or a subset assertion, passes under exactly the narrowing that matters, because a smaller corpus
  is still internally consistent. A premise that the corpus is non-empty does not catch a corpus
  reduced to one file.

Then construct the narrowed state and confirm it fails, rather than asserting the corpus is wide.

### A mutation sweep cannot see a defect whose failure mode is a schedule

Mutation testing varies a decision and asks whether anything notices. It is silent, by
construction, about defects that are not decisions. A check-then-use race is the clearest case:
both orderings are the same source, there is nothing to flip, and every mutant runs on a quiescent
tree where the race never fires.

So a sweep can be genuinely exhaustive — every mutant dead, each by a distinct failing test name —
and have said nothing whatsoever about a whole class of defect sitting in the code it just scored.
The table is true. Its silence is not coverage.

The instance that makes this concrete: a peer landed a fix for a detector's blind scope, with seven
mutants dead and no survivors, and the change introduced two high-severity file-system-race alerts
that a static analyser found and the sweep structurally could not. **The tool caught it; the method
could not have.**

The general form is the one to carry: **ask what your instrument cannot express, not only what it
reports.** An all-green control table invites the question *of what decisions?* — and a method that
only varies decisions will answer every question as though it were one.
### Exhaustiveness over the whole claim, not reachability, is what keeps a document true

It is tempting to sort documentation by whether anything reads it, and to treat the read surfaces
as safe. That ordering is wrong. A help text printed by the front door, executed by a test, and
seen by users every day rots just as quietly as a comment nobody opens — provided the test is
exhaustive over only *part* of what the text asserts.

The measured instance: one `--help` output carried two enumerations. The flag list was pinned in
both directions, per flag, against the parser, by a test that *executed* the CLI rather than
importing a constant — and whose own comment argued that a guard must discriminate at the
resolution of the claim. The paragraph immediately below the flags, introduced by `Env:` — a label
that asserts completeness — named **one of the three** variables the engine actually consults.
Nothing read that paragraph at all. Same file, same string literal, same author, one clause
rigorous and the next unguarded.

So the question to ask of any guarded document is not *is this surface reached?* but **which
clauses of it are under the guard, and which merely sit next to one?** A neighbouring rigorous
check is the strongest available disguise for an unchecked claim, because the diligence is visible
and its scope is not.

Two consequences worth keeping:

- **A completeness label is a testable assertion.** `Env:`, `Validators:`, `Contents`, "the
  following" — each promises a closed set, and each can be compared against a derived one.
- **Both directions need a positive control, and the reverse direction needs it more.** A healthy
  tree usually contains no advertised-but-nonexistent item, so the reverse half has nothing keeping
  it honest and can be weakened to a no-op without any test changing colour. Construct the
  violating state rather than waiting for one.

### A mutation must be shown to reach the surface under test, not merely to change the file

The known rule is that a mutation harness must confirm the mutation applied, because an anchor that
fails to match reports as a survivor and a survivor reads as coverage. That rule is not strong
enough. **A file can change and the surface under test can be untouched.**

The instance, found by disagreeing with a harness rather than by reading it: a mutant meant to
corrupt a printed help string was applied with a first-occurrence string replacement, and the
anchor appeared **twice** — once in the header comment and once in the printed literal. The edit
landed in the comment. The file changed, the character count moved, the harness printed
`applied: TRUE`, the printed output was byte-identical, the test passed, and the mutant was
recorded as a survivor. Run by hand with an all-occurrence replacement, the same mutant dies
immediately.

The failure has the shape that makes it expensive: it reports **in the verdict column**, and a
false survivor does not merely fail to inform — it actively recruits work to fix a gap that does
not exist, and casts doubt on a guard that is functioning.

So the precondition is: **capture the surface, mutate, capture again, and require the surface to
have moved before the run counts as a result.** For a printed one that means executing the command
and comparing its output. Anything short of that scores a mutation whose effect never left the file
it was written into.

There is a second-order lesson in which duplicate swallowed the edit. It was the transcribed
header comment — the very surface whose independent decay motivated the guard in that file in the
first place. **A duplicated claim does not only rot; it absorbs the probes aimed at the original.**
**And a kill can be scored by a bystander.** Beside the un-applied mutation recorded as a survivor
above, a peer measured a third form: two mutations that were applied, genuinely failed the suite,
and still certified nothing. Both died to a test counting managed marker pairs, because they
happened to shift its offsets -- not to the preservation invariant they were written to probe. The
one mutation that left offsets intact, stripping trailing whitespace, survived. That reads on the
tally as `3 of 4 killed`, over an invariant with one live hole and two false floors.

So a mutation tally has three distinct ways to be wrong while every individual number in it is
correct: un-applied scored as a kill, applied-and-killed scored as a survivor, and
applied-and-killed-by-a-bystander scored as coverage. **All three are invisible in the count and
all three are legible in the failing test names**, so read the names and never the score. The
operative check is that the mutation died *to the assertion under test*, which means naming that
assertion before the run rather than accepting whichever one happens to turn red.

### An exemption is trusted more than the check it narrows

A check invites scrutiny because it makes a claim. An exemption carved out of that check invites
none, because narrowing reads as precision — the author evidently thought about the population and
found a case the rule should not reach. Nobody re-derives the exemption's population afterwards, so
an exemption scoped wider than its own justification is the quietest way to disable a rule while
leaving every appearance of enforcing it. The failure has a signature worth recognising: a
prohibition that reports zero, where the zero is manufactured by the exemption rather than by the
tree being clean.

The mechanism is that **a justification and its predicate are separate artifacts, and only one of
them executes.** A docstring may justify an exemption by ownership while the predicate keys on
presence, and presence is satisfied by exactly the population the rule exists to catch. Both
sentences can be written in the same hour by the same author and never be compared, because nothing
compares them. When you write an exemption, derive its population from the property named in the
justification and assert that population in a test; when you read one, do not accept the docstring
as evidence of what the code does.

The sharpest instance is an exemption that ships in the same change as the widening it cancels. The
two halves net to no observable difference, the suite stays green, and the commit reads as a fix.

### A cross-check between two enumerations cannot falsify a predicate they share

Deriving a corpus from the property that makes a file subject to a rule, and then cross-checking
that derivation against an independent enumeration such as `git ls-files`, is the correct remedy for
a hand-written corpus. It is not a remedy for a hand-written *predicate*. Once both enumerations
call the same `isEngineSource`, narrowing that predicate shrinks both sides identically and they go
on agreeing — the cross-check passes on a corpus reduced to nothing in particular.

The two claims are separable and want separate controls: the cross-check pins *how the files were
found*, and a named positive control naming a specific known member pins *what counts as a member*.
Assert that a particular entry point is in the corpus, by name, so that narrowing the predicate
fails a test that says which file went missing. A tally cannot do this; only a name can.

### A benchmark run second measures the cache, not the change

An optimization is justified by a number, and the number is usually obtained by running the old
path and the new one in the same process, in that order. Everything the old path warmed — a git
object cache, a filesystem cache, a JIT's inline caches — is still warm when the new path runs, and
the difference includes all of it. The measurement does not distinguish "this work is unnecessary"
from "this work has already been done".

The correction is cheap: run each candidate cold, in its own process, and run the pair in **both
orders**. If the ordering changes the verdict, the verdict was about the cache. A saving that
survives both orders is real, and it is routinely a fraction of the one the naive comparison
reports — thirty percent where the in-process figure claimed a factor of twenty-five.

This matters beyond the number, because the size of the claimed saving is what licenses the
complexity spent to obtain it. A shortcut that appears to remove nearly all of a cost will be
allowed subtle logic, and a shortcut worth a tenth of that will not. An inflated benchmark
therefore buys a design decision as well as a wrong figure, and the design outlives the correction.
When the measurement is redone honestly, re-ask the design question rather than only editing the
comment.

### A floor written after the break certifies the break

A coverage floor — `found.length >= N`, `map.size >= N` — is chosen by running the code and picking
a number a little under what it printed. If the code was already wrong when the number was chosen,
the floor is now pinned to the broken output and will report healthy forever. It cannot do anything
else: it was derived from the very value it is supposed to falsify.

This is the same defect as a test that re-implements production, arriving through arithmetic instead
of through code. Both take their expectation from the thing under test. A floor is worth keeping as
a coarse backstop against a walk collapsing to nothing, but it must be treated as evidence about
*nothing in particular*, and the real coverage claim has to name specific members of the population.
When a whole class disappears — every file of one kind, every document under one root — a total is
the one instrument guaranteed not to notice, because a class going missing looks exactly like a
class that was never there.

### Calling a validator is not evidence that anything calls it

A test that invokes a validator directly measures its logic and nothing else. Whether production
reaches that validator is a separate property, carried by a call site the test never executes, and
a call site is one line that costs nothing to delete. So a validator can be defined, exported,
thoroughly unit-tested and completely unreached, and every one of its tests still passes.

The failure is quiet in the direction that matters: an unreached validator reports no errors, which
is indistinguishable from a codebase that satisfies it. Coverage tools do not help, because the
validator's own lines are covered — by the tests.

Mutate the **call site**, not only the callee. If deleting the dispatch line leaves the suite green,
the check is decorative. The repair is a probe that constructs a violating state and drives it
through the production entry point, so the assertion depends on the wiring rather than assuming it.
The same applies to a validator that stays wired but stops returning findings: wiring intact,
behaviour gone, and only an end-to-end probe can tell the two apart.

### A list of things to check is the thing it checks

Once a suite pins each item in a population, the list of items becomes a second population, kept by
hand, in the same repository, updated by the same edit that forgets to update the first. A guard
built this way inherits the defect it was built to catch, one level up, and it inherits it silently:
the missing row does not fail, it simply is not examined.

Derive the population from its producer — the dispatch's own source, a directory walk, a manifest —
so that adding a member without a corresponding check fails. When the derived and transcribed sets
must coexist, make each report against **its own denominator**: a small uncovered count read against
an inflated population is reassuring and wrong.

### A mutation that leaves the original as a prefix is not a mutation

Corrupting an anchor by appending to it is the reflex, and it does not work against unanchored
substring tests: `foo` still matches `fooZZ`. The edit lands on disk, the file genuinely changed,
and the predicate sees exactly what it saw before. The mutant then reports as a survivor, which
reads as a gap in the guard rather than as a broken probe — an accusation against working code.

Put the marker in the middle of the anchor, and assert the mutation reached the predicate rather
than only that the file changed. The stronger habit is to require a mutant to fail *for the reason
claimed*: read the named failing test, not the count.

### Put the floor on the population that decides, not the population that is walked

A guard that walks a corpus and evaluates a subset of it has two numbers, and only the second is
the instrument. Floor the first and the guard can narrow to nothing while every check stays green:
the walk still finds every document, every fixture still passes, every mutant still dies, and the
rule fires on zero blocks.

The subset is usually chosen by something nobody decided — an authoring convention, a naming
habit, a formatting style. Ours was backticks: the fleet-enumeration rule matched member names only
when they were quoted, so 145 documents and 5,232 blocks came down to six blocks deciding every
verdict, and two tables that named the whole fleet in plain text were invisible to the guard
written to catch exactly them.

Two consequences. **A detector and its legitimizers must share one convention** — widening the
offence rule while its exemption still required backticks turned both complete tables into false
offenders, so a one-sided widening is worse than none. And **prefer removing the convention to
flooring the population it selects**: a floor on a convention-dependent population still fails the
day the convention drifts, which is a report about formatting rather than about the claim.

Pin the floor to named members of the population rather than to its current size. A count read off
today's output ratifies today's output; a named document is checkable by opening it. Note the
asymmetry that leaves: deleting a name weakens the floor silently, and nothing catches it, so the
list is only as good as the reason each entry was added.

### A rule checked only against a clean corpus is not checked

Reimplementing a rule in a test and running it over the real repository asserts that the repository
complies. It does not assert that the validator would object if the repository stopped complying —
those are different claims, and only the first was ever being made. The tell is that the production
validator can be deleted outright with the suite green.

Distinguish that from a validator that is genuinely unwired: a deletion mutant produces the same
green either way, so it cannot tell "never called" from "called with nothing to find". Both need the
same fix and they are not the same defect, so name the one you measured. Constructing a violation is
what separates them, because only a corrupted fixture can be caught.

When the fixture is a corrupted copy of the repository, check which frame catches it. Our loader
runs the integrity validators itself, so every first-draft fixture threw the message the test was
waiting for — from the loader, before the entry point under test ran at all. The assertion passed
and proved nothing. Build the input the entry point needs without the validation that duplicates it.

## Calling reusable workflows







Studio product repos call the backbone's reusable workflows at a reviewed immutable commit SHA:
`uses: jrmoulckers/.github/.github/workflows/reusable-*.yml@<reviewed-commit-sha>`. The reference
must be a full 40-character SHA; branches and tags are rejected. Never resolve a mutable reference
during a run.

**Configuring Dependabot for those pins is necessary and, on its own, was not sufficient — and its
insufficiency is silent.** The `github-actions` updater resolves a SHA pin by looking for a newer
**release or tag** in the source repository, and `jrmoulckers/.github` published neither until
[ADR-0014](https://github.com/jrmoulckers/.github/blob/main/docs/architecture/0014-reusable-workflow-release-tags.md).
A member with a correct `github-actions` entry covering `/` therefore got update PRs for
`actions/checkout` and `actions/setup-node` and **none** for its backbone refs: no PR, no warning, no
error. `cartridge` measured exactly that — 8 PRs, 0 of them for its seven reusable-workflow pins
([dependabot-core#15577](https://github.com/dependabot/dependabot-core/issues/15577)).

So **a quiet updater is not evidence of a current pin.** The two states are byte-identical from the
member's side, which is why four members drifted onto four different SHAs without anyone noticing.
Until the backbone publishes a tag your updater can see, check pins directly rather than inferring
from silence:

```sh
gh api repos/jrmoulckers/.github/tags --jq length   # 0 means no ref you pin will ever be proposed
git -C <backbone> rev-list --count <your-pin>..main # how far behind your pin actually is
```

**A stale pin can delete a check rather than merely delay an improvement**, so this is a correctness
matter and not a currency one. `reusable-caller-permissions` checks out its lint script *at the
pinned revision*; at one older pin a scan that read zero workflow files reported zero findings, which
is byte-identical to a clean pass. The pin made a broken lint green.

Once tags exist, pin the SHA a tag resolves to and carry the version as the trailing comment, so a
reader can tell what the 40 characters mean and an updater has something to rewrite:

```yaml
uses: jrmoulckers/.github/.github/workflows/reusable-ci-lint.yml@<reviewed-commit-sha> # v1.0.0
```

Pin the SHA, never the tag: the tag is a resolution target for the updater, and a member's `uses:`
must stay immutable. Review the exact upstream diff and release notes before merging the bump.

### Keep required checks terminal

**First establish that the repository has required checks at all — most of this fleet does not.**
Measured across the fleet, the protection endpoint returns three different answers, and the two that
mean *nothing is enforced* are not the same finding:

```sh
gh api "repos/OWNER/REPO/branches/$(gh api repos/OWNER/REPO --jq .default_branch)/protection"
# 200 -> protected; read .required_status_checks.contexts
# 404 "Branch not protected"            -> protectable, nobody has configured it (a choice)
# 404 "Branch not found"                -> you asked about a branch that does not exist
# 403 "Upgrade to GitHub Pro ..."       -> not protectable on this plan (not a choice)
```

**`404` is two states, and the status code does not separate them — only the message body does.**
Querying a branch name the repository does not have returns `404 "Branch not found"`, which a census
bucketing on the code alone files as *protectable, unconfigured*. The backbone demonstrates it on
itself: `.github` is the one repository here that enforces anything, and asking it about `master`
returns `404`. **So a census keyed on a literal branch name reports the most-protected member as
unprotected.** Key on each repository's own `default_branch`, which costs one field and removes the
dependency, and branch on the body rather than the code.

**Measured, that hazard does not currently bite — and the reason is the finding.** Twelve of the
thirteen repositories default to `main`; the only exception is `homelab` at `master`, and it is
masked because the plan `403` is evaluated *before* branch existence, so all three of `master`,
`main` and a bogus name return the same refusal. Keying on the literal and keying on `default_branch`
therefore agree on all thirteen today. **The bucket is right by a property of the fleet rather than
by construction**, and the single member positioned to expose it is hidden behind the very refusal
everyone is waiting to clear — so the method would begin failing at the moment the account is fixed.

At the time of writing only the backbone returned 200. A public member returned **404** and two
private members returned **403** — so the discriminator is *not* visibility, which is the tempting
generalization and a wrong one: public-and-unprotected is a real state. Distinguishing 403 from 404
matters because the remedies are unrelated. 404 is fixed by configuring the branch; 403 is fixed
only by changing plan or visibility, and until then no amount of workflow correctness makes a check
enforceable.

**That paragraph was written from a three-repo sample and is superseded by a census of all eleven
members.** Its claim that only the backbone returned 200 is now false, and the shape of the fleet is
not what a sample of three suggested:

| protection endpoint | count | members |
| --- | --- | --- |
| `200` enforced | 1 | `finance` |
| `404` protectable, unconfigured | 4 | `jrm-recipes`, `score-king`, `engineering`, `studio` |
| `403` not protectable on this plan | 6 | `libro`, `cartridge`, `docket`, `product`, `homelab`, `windows` |

The backbone is a twelfth repository at `200`. So **one member in eleven enforces anything**, and for
six of them the enforcement state cannot be read at all from this account — which is the next rule.

**Re-measured `2026-08-12` keyed on each repository's own `default_branch` — scope stated, since the
paragraph above counts the backbone separately and this one does not: thirteen repositories, being
eleven members, the backbone, and one recorded exclusion.** `200` × 2 (`.github`, `finance`), `404`
× 4 (`studio`, `score-king`, `jrm-recipes`, `engineering`), `403` × 7 (`homelab`, `libro`,
`cartridge`, `docket`, `product`, `game-library`, `windows`). So *one member in eleven* enforces
anything — still `finance` alone, the other `200` being the backbone — and `game-library` is the
addition, landing in the bucket that cannot be read. Only one `404` body occurs naturally anywhere
in the fleet — `Branch not
protected` — which is exactly why the second body is dangerous: it is never seen until the query is
wrong, so no census will ever have exercised the branch that distinguishes it.

**The `403` bucket and the Actions-refusal bucket are the same repositories, for unrelated reasons.**
Re-measured across the roster: every private member returns the plan `403` and no public member does,
and every failed job in those same private members has **zero steps** — the spending-limit signature —
while the one public member failing that day failed with a job that has steps, an ordinary red build.
Two gates, two unrelated remedies (change plan or visibility; raise the spending limit), one
population, because both key on `private`.

**Co-extensive causes cannot be told apart by a census, only by the surface each produces.** Nothing
in a list of affected repositories distinguishes them, so anyone who learns the population without the
mechanism will merge them, and the merged claim then survives every check that ranges over membership.
This is not hypothetical: a precise `plan-blocked` count of mine came back from a peer as a claim
about the Actions spending limit, and no repository list could have contradicted it. Report the
surface beside the count, because the count is the part that is identical under both explanations —
and expect the fleet to look half-fixed when one gate clears, since the same repositories keep
failing under a different signature.

**Key the sweep on step count, not on `conclusion`.** A refusal and a genuine test failure are both
`failure`; only the absence of steps separates them, so a bucket built on the conclusion field files
real red builds as billing casualties and reports a blocker wider than the one that exists.

**A sweep's population is not the manifest's, and stating the scope is not the same as getting it
right.** The paragraph above originally read *twelve members plus the backbone*, having silently
promoted `game-library` to membership because it appeared in an org-wide protection sweep.
`game-library` is the entry in the top-level `excluded` array — deliberately ungoverned, with a
recorded reason — so the thirteen repositories are eleven members, the backbone, and one exclusion.
The error survived a scope note explicitly written to prevent it, because the note fixed the
*boundary* (does this count the backbone?) and not the *roster*. Take the member list from
`studio.config.json`, never from whatever the sweep happened to return, and remember that an
excluded repository is the one population member designed to appear in org queries and in no
manifest.

**A refusal is not a reading.** A `403` says the API declined to answer; it says nothing about how
the branch is configured. A member reported one as *this repository has no protection*, reached the
right conclusion, and reached it from a fact not in evidence — an instrument that distinguishes only
`200` from *not `200`* collapses *configured as nothing* and *I may not tell you* into one bucket,
and the second is not a finding about the repository at all. The general form: **an availability
refusal converted into a factual claim is unfalsifiable by the instrument that produced it**, since
the same refusal is returned whatever the underlying state. Say *undetermined on this plan* and
carry it as undetermined. Three answers require three branches; anything that tests truthiness has
already lost one.

**And the same collapse occurs at the language level, where a bare `catch` is the truthiness test.**
A peer repaired five test helpers that read `spawnSync(...).status` and discarded `.error`, so a
process that never started was reported as one that exited wrongly. They then grepped shipped code
for `spawnSync`, found a single hit that turned out to be a regex *matching the string*, corrected
themselves, and concluded shipped code held no instance. Both steps were right and the conclusion
was still wrong, because the search was for the function rather than for the failure mode. Shipped
code here uses `execFileSync`, which throws instead of returning `status: null` — safe by default,
and reinstated as unsafe by one bare catch:

```js
    return { baseCommit, manifest: JSON.parse(text) };
  } catch {
    return { baseCommit };            // git failed | manifest absent | manifest corrupt
  }
```

Three conditions, one value. **The same function settles that the cause was meant to survive**: its
other catch binds the error and populates an `error` field, and the consumer appends that cause when
present. So the discarding catch is not ignorance of the pattern — the correct form is eight lines
above it, and with `git` removed from `PATH` that path reports `trustworthy base manifest
unavailable (cannot resolve baseline revisions: spawnSync git ENOENT)`. Measuring that is what
corrected this entry: the first draft said the slot could never be populated, which was false and
would have been persuasive.

Stated without inflation, as the peer stated theirs: there is no false pass today, because the
baseline is not the bootstrap commit and the neighbouring branch raises an error either way, merely
a causeless one. But that adjacent branch treats the same collapsed state as valid bootstrap
validation, so the defect sits one constant away from converting a crash into a pass. **Grep for the
shape of the loss — a discarded binding, an ignored second return, a bare catch — rather than for
the name of the call you last saw it under.**

**A reply inherits its frame of reference from the message it answers, not from the sender's current
state.** A member's coverage was published here as `10.5%`, computed on a revision this repo had
itself refuted twice earlier the same day — once at `18:0xZ` and again at `19:38Z`. The denominator
in that same message was re-derived to the minute. The numerator was not, because it was not a value
being carried forward from memory: it arrived in the inbound message and was answered rather than
recalled. Re-measurement discipline fires on what you remember and is silent on what you inherit, so
**answering an old message is a distinct staleness generator** and a well-hidden one, since nothing
in the reply feels like recollection. Re-measure the operands you inherit, not only the ones you
carry.

**And that failure survives operand-level verification, which is why re-measuring harder misses
it.** A product published here -- 25 revisions times a 4,111-char mean delta, 102,775 against a
measured 101,114, agreeing to 1.6% -- was offered as licensing the model. The correspondent replied
that both operands were badly wrong with near-reciprocal errors. Measured against the issue's own
revision history, neither reading was right:

```
2026-08-12T21:01:18Z   level  41,119   revisions 25   <- the epoch the level came from
2026-08-13T03:05:38Z   level 101,114   revisions 40   <- the epoch it was compared against
```

**`25` was exactly right for the instant its level came from**, and `40` was exactly right for the
instant of the comparison. The mean delta was right for a third window, drawn from recent and
atypically large appends. Every operand passes its own audit and the product still means nothing,
because the three were bound to different instants and no operand carries the instant it belongs to.
That is worse than a wrong operand: a wrong one fails a check, and an out-of-epoch one passes every
check there is. **Stamp each operand with the instant it was true, and refuse to combine operands
whose instants you cannot state.** Agreement is cheapest exactly when the errors are reciprocal, and
epoch drift makes them reciprocal by construction -- so a tight match is the weakest evidence in the
set, not the strongest.

**A failed control licenses *not this instrument*, not *no instrument*.** The same correspondent
tried to audit a quotation attributed to them, found their record's outbound `assistant_response`
column returned zero rows for a known-published figure, correctly declared the control failed, and
concluded they held nothing that could reach the traffic. It was in the adjacent column: a
cross-session message is durably recorded at the **receiving** end, in a `user_message` field that
is fully populated, and their own inbound rows carried the quoted figure at two datable turns. A
control that fails on the channel you reached for bounds that channel and says nothing about the
corpus. Promoting it to a global negative is the unscoped-zero error again, with a twist -- the
negative was about the auditor's own reach, which reads as humility and is a stronger claim than the
evidence supports.

**And in asynchronous correspondence, an unanswered point is indistinguishable from a crossed one.**
Two messages here were in composition at once: the inbound correction arrived at `07:22:52.836Z` and
the outbound message was sent `12.8 s` later, so a correction and its apparent disregard were simply
in flight together. Only a clock stamping both endpoints orders them. Without one the default
reading is that the correspondent ignored the point, which charges negligence for ordinary
concurrency -- the only inference in this class that damages the correspondence rather than a figure.

**And the unit a coverage ratio is expressed in can measure the age of its own numerator.** The same
ratio computed in lines and in bytes diverges only insofar as the numerator's mean line length
differs from the denominator's, and that difference grows with distance and vanishes at zero:

```
 19 revisions back   89.31% / 88.97%   spread 1.004x
 51 revisions back   72.13% / 70.96%   spread 1.016x
139 revisions back   10.52% /  6.70%   spread 1.570x
```

Monotone in distance. So a wide lines-versus-bytes spread is not an ambiguity in *how much do you
hold* — it is evidence the numerator is stale, in a unit nobody reads as an age. It presents as a
reason to distrust the unit and it is a reason to distrust the operand.

**The middle row above was published as `70.94% / 1.017x`, corrected once to `70.97%`, and is
`70.96%`: `308,014 / 434,037` is `70.96491774`.** The spread is `1.016x` either way, so the error
never propagated and only the cell was ever wrong. **A correction is the least-audited state a
figure can be in** -- it arrives having just been checked, so the property that would prompt a
re-check is the property it advertises. Three values, and the wrong one wore the repair notice.

A correspondent challenged the row and was right
that it was worth challenging, though not for the reason given -- and the disagreement is a cleaner
specimen than the arithmetic. `51 revisions back` is a **relative coordinate**, and it resolves
three ways, each internally exact:

```
referent                                    lines      bytes     spread
canon 434,037 B / 5,744 LF  (as published)  72.13%     70.96%    1.016x
canon at be032cb, 436,951 B / 5,791 LF      71.54%     70.49%    1.015x
literally 51 commits back = 6533fb8         --         99.21%    --
```

The correspondent recomputed at the second referent, obtained different operands, and reported the
result as *the ratio follows from neither its own stated operands nor the corrected ones*. It
follows from its own operands exactly; those operands are printed three lines above the table. **A
failed reproduction of a relatively-keyed figure renders as a charge of arithmetic error**, which is
the most damaging form it could take, because arithmetic is checkable and so the charge feels
settled. The reproducer cannot distinguish *your sum is wrong* from *I resolved your coordinate to a
different object*, and nothing in the label tells them which happened. This is `publish the span,
not the line number` on the revision axis: **a revision offset is an unnamed ref.** Name the object.

**And naming the object fixes attribution, not currency.** The same correspondent returned having
adopted the rule, and it worked: they bound their standing to *at your stated tip*, named the
commit, and every figure they published reproduced to the byte. They also caught a real defect in
mine -- a block whose canon size was fresh at the tip I stated while the deficit and coverage
standing on it were computed one revision behind, 2,203 bytes stale. That charge is correct and
granted. But the referent they named had itself moved 37 revisions by the time they wrote, and the
label held while the number did not:

```
referent                       canon        deficit    coverage
be032cb  (their computation)   436,951 B    129,017     70.49%
1704ca3  (the tip I stated)    439,154 B    131,220     70.14%
e3984de  (the tip at reply)    535,017 B    227,083     57.57%
```

Both published rows reproduce exactly. The staleness they charged me with is 2,203 bytes; the
staleness carried by their own standing is 95,863, in the same message -- **43x larger, and
correctly labelled throughout.** A reader asking *how far behind are you* is answered 70.14% when
the answer is 57.57%, and no sentence in the message is false.

So a named referent is necessary, is not sufficient, and is worse than nothing in one specific way:
**a correctly-labelled stale figure resists audit better than an unlabelled one, because the label
is the artifact that would otherwise have prompted re-derivation.** An unlabelled figure invites
*against what?*; a labelled one answers that question and thereby closes it. So publish the referent
**and the interval since it**, or bind the figure to the tip at send time rather than to the tip
being replied to -- in a correspondence the other party's frame is the one guaranteed to have moved.

**And a freshness claim can be true of the command and false of its value.** A correspondent
published `origin/main = 9a16c4e` under the citation *git rev-parse, this turn*. The command did run
that turn; the ref it reads is a local cache of the last fetch, so the value was 41 commits and 4.87
hours behind, spanning 37 revisions of this file and +96,842 bytes. `git rev-parse origin/main` does
not consult the remote. **A citation that names the act rather than the object certifies a liveness
it never checked**, and it persuades for the same reason a named referent does: it pre-empts the
question that would otherwise have been asked. Fetch immediately before reading a remote ref, and
cite the fetch rather than the parse.

**And a name is only a name relative to a namespace the reader shares.** The rule above says name
the object; the measurement owed against it asked whether a named object stays resolvable as the
citing entry ages. It does not decay, because age was the wrong axis. Every citation in this file
was extracted, deduped to its oldest citing line, and resolved:

```
class       n    resolves here    resolves for a member reading the distributed copy
sha        12    6/12             0  -- separate object database
run        11    Actions API      0  -- no backbone Actions access
issue       7    Issues API       0  -- other repo
path        5    3/5              differs by tree
basename   21    20/21            differs by tree
```

Bucketed by the age of the citing line the resolved rate is `88% / 100% / 60% / 100%` across
`0-12h / 12-24h / 24-48h / 48h+`. **Non-monotone, and the oldest bucket is the best** -- there is no
decay to find. Of the six commit SHAs that fail here, three resolve in exactly one other fleet repo
(two in `studio`, one in `finance`) and **two resolve in none of the twelve**, so they were cited
while reachable only from the citer's own working copy.

The ordering is the finding. **The citation forms that look most verifiable are the least
resolvable, and the informal ones are the most.** A forty-character SHA names an object by its
coordinate in one object database; a bare basename with no path names it by a property every reader
can search for, and it resolves 20 of 21 where the SHA resolves 6 of 12. This file is distributed to
nine members, so a backbone SHA in it is unresolvable for the audience it was written for **from the
moment it is written** -- not eventually, and never having been otherwise. Prefer the citation a
reader can resolve where they stand: a searchable name, a quoted line, a value they can recompute.

**Both defects in the instrument that measured this failed toward the hypothesis.** Eleven-digit run
identifiers are valid hexadecimal, so `[0-9a-f]{7,40}` scored seven of them as commits that do not
exist; and basenames were tested with a root-relative existence predicate, scoring nine files as
missing that are all tracked one directory down. Both inflated *unresolvable*, the rate then looked
like a decay curve, and printing the failure list rather than the rate is what caught it. The tell
was non-monotonicity: **a rate that should be ordered and is not is reporting on its instrument.**

**And the useful width of a filter depends on the sign of the claim it will support.** Testing head
refs against `sync` to find each member's most recent sync pull request matched
`fix/async-query-budget-854`, because `async` contains `sync`. That produced a false latest-sync row
and very nearly a published charge of mispairing that was itself a mispairing. The same over-broad
filter returning **zero** rows for a member is a *stronger* absence than a narrow one would give,
since breadth can only add matches. So breadth is a liability for a positive claim and an asset for
a negative one -- the exact dual of an over-broad premise, which cannot strengthen a conclusion and
only widens the surface on which it can be wrongly rejected. The sign is usually not known until the
result is in, which is after the width was chosen, so validate the filter against a row whose answer
is known **in the direction you intend to argue**.

**An instrument built from a joined pair speaks only where both halves exist.** A correspondent
distinguished automated from hand-carried delivery by the gap between a member's lock `generatedAt`
and its delivering pull request's `created_at` -- a genuine improvement, and the constructive form
of the rule above, since both halves resolve where the reader stands rather than in a run log they
cannot read. It covers seven of eleven members. Four have no sync pull request at all, so the
instrument is silent on them, **including the repo it was built in.** The members most likely to
have been hand-carried are the least likely to have opened the pull request the join requires, so
the uncovered rows are selected for the property under test.

**A path predicate answered by eye tests string similarity; ignore semantics test the hierarchy.**
Asked whether a member's ignore file covered its canon copy, this repo cited the entry
`.github/instructions/` as covering `.github/copilot-instructions.md`. It does not. The directory
entry covers what is *inside* that directory; the disputed file sits beside it, one level up,
matched by no other entry. The two strings share their distinctive token and differ by a hyphenated
qualifier, so *is the instructions path covered?* returns a true answer to a question nobody asked.
Re-asked of an implementation rather than of the strings, with both controls firing:

```
.github/copilot-instructions.md                LINTED
.github/instructions/workflow.instructions.md  IGNORED   must-hit
src/App.svelte                                 LINTED    must-miss
```

**A hyphenated qualifier reads as a level separator and is not one**, which is exactly where a name
reused across levels defeats inspection.

**And a number can be explained correctly by the party who cannot produce it.** A `219 B` figure
published here for that ignore file was disputed against a measured `221`. The correspondent
identified the mechanism precisely -- one em dash, three bytes rendering as one character -- and
**declined to publish it**, on the stated ground that it explains a number without having produced
it. The refusal was right, and it left confirmation to the only party holding the read path: the
file is `221` UTF-8 bytes and `219` UTF-16 units, one `U+2014` costing the difference. Diagnosis and
the means of confirming it sat in different sessions, as with the two-runtime join above, and the
discipline that forbade the assertion is what made the confirmation worth having. The underlying
error is the unit mixing recorded earlier in this section -- committed here, in the session that
recorded it.

**The reader-relative failure has a preferred site, and it is the standing block.** The same
correspondent published `main 6837ba5` under the citation *git rev-parse, this turn*. The command
ran and was right about the local branch:

```
that repo's remote main       095e4ee
6837ba5                       identical to studio-sync/2026-08-09, four days old
main...6837ba5                diverged, ahead 2, behind 9
```

So standing was certified on a stale branch tip, under a name every other reader resolves to a
different object. It is the dual of the cache read above: there the act was live and the object
stale, here the name is correct locally and wrong everywhere else. And `0 unpushed`, reported
truthfully in the same block, is the giveaway -- nothing was unpushed **because** the tip was an
already-published old branch. The metric reported health, and the condition it concealed is the
reason it could.

What makes it worth recording is that the message **stated the governing rule** -- *a verified fix
on an unreachable commit is indistinguishable from no fix*, demonstrated with a four-way ancestry
check -- and applied it to the disputed object while the block certifying its own position sat nine
commits behind. It also opened by conceding a row certified from memory. Three instances of one
class in one message, and the class is: **the rule was applied to the object under dispute and not
to the frame the dispute is conducted from.**

Across correspondents this is where staleness collects. Three peers, three messages, three stale
standing blocks: a referent 37 revisions old, a ref read from a local cache 41 commits behind, and a
branch name resolving to a four-day-old tip. **Not one of them erred inside an argument.** A
standing block is the least-audited claim in a message precisely because it is the only part not
under dispute -- every contested figure attracts a reproduction attempt, while standing is offered
as housekeeping and accepted as housekeeping. So audit standing first, including your own, and
prefer a referent the reader cannot resolve differently: a full SHA over a branch name, and a
remote-verified read over a local one.

The method they used to earn the right to their central reading is worth taking whole. Before
applying an episode-to-delivery mapping to a member whose runs they could not see, they ran it on
their own row, where the answer was already known: four lock episodes, four delivery pull requests,
each episode preceding its merge, leads of 20.1 h, 1.7 h, 10.4 min and 1.8 min. **Calibrate an
instrument on the row where you hold ground truth, then read it on the row where you do not** -- and
where no such row exists, say that the artifact *proposes* the conclusion rather than establishing
it. A single-second cluster in a lock is equally consistent with one delivery and with a later run
that rewrote every entry, so their lock proposed one delivery for that member and the pull request
history proved it. Same split as fingerprints propose and reproduction proves, one artifact over.

Granted in the same exchange and worth carrying: a size published here as `435,277` was **UTF-16
units**; the file is `436,951` UTF-8 bytes, a gap of `1,674`. The coverage ratio built on it put a
UTF-8 numerator over a UTF-16 denominator -- `70.8%`, against `70.49%` computed consistently in
either unit. **The two consistent readings agree to four figures, so the unit was never the
question; only the mixing was.** A denominator whose unit is unstated cannot be checked at all,
which is why the row above is still weaker than it looks even after correction. And note the
direction: a unit error in the denominator moves the staleness spread *down*, reporting a copy as
fresher than it is -- the same direction as a saturated census reporting perfect health. **Both
instruments failed toward *you are fine*, which is the direction that ends the enquiry.**

**But an instrument's sensitivity is a property of the authoring discipline, not only of its own
logic.** That member closed the exchange by pointing this repo's own fence-masked heading census at
their live copy, correctly, and reading the result as currency:

```
canon             434,037 B   5,744 LF   36 headings
member live copy  308,014 B   4,143 LF   36 headings

coverage by heading  100.0%      coverage by line  72.1%      by byte  70.9%
canon revisions of the file since their copy        51
of those, revisions that added a heading             0
```

Zero of fifty-one, because this file is amended **in place at an existing owning heading** rather
than by appending new ones — a rule adopted here for coherence, which silently converted the heading
count into a constant. The member is 126,023 bytes behind and the metric reports perfect health. The
census was validated for *faithfulness at delivery*, a question it still answers well, and was then
pointed at *am I current*, which it cannot answer at all. **A metric can be saturated by a
convention adopted elsewhere for unrelated reasons**, and a saturated metric does not degrade — it
returns the ideal value forever, which is the most reassuring output it has. Before reusing an
instrument on a second question, check that the quantity it counts is still free to vary under the
discipline now in force.

A guard saturates the same way, and the saturation hides one level below its own floor. The
fleet-enumeration sweep in `sync/test/member-count.test.mjs` walks 145 documents against a floor of
40, and that floor exists because a walk that narrows to nothing passes forever. Measured against
the live corpus at `e470426`, the blocks that reach a legitimizer at all number **six**:

| arm | blocks | where |
| --- | --- | --- |
| hedge | 2 | `AGENTS.md`, `README.md` |
| covers the fleet | 3 | ADR 0009, and two blocks in this file |
| bounded by its own count | 1 | ADR 0006 |
| offender | 0 | -- |

Every arm is load-bearing, so the arms that were kept survive the standard that deleted the
historical one. What is unguarded is the six. The detector matches member names **in backticks**, so
the population deciding every verdict is an authoring convention that no test asserts. Let
backticking drift and the document floor still passes at 145, every arm still passes its fixtures,
and the sweep evaluates zero blocks -- the exact failure the floor was built against, surviving one
level below where the floor was placed. **Put the floor on the population that decides, not on the
population that is walked.** A walked corpus and an evaluated corpus are different numbers, and only
the second one is the instrument.

The live corpus already holds the specimen. `docs/sync.md` names all eleven members in a plain
unbackticked table; the guard sees nothing there. It is correct today and it is not protected: when
a twelfth member lands, the two backticked blocks in this file fire and that one stays silent. So
the falsifiability that makes a complete enumeration stronger than a hedge is delivered by the
backticks, not by the completeness. **An unbackticked complete list has a hedge's safety profile
while reading as the strong form** -- the same inversion, in the guise the fix did not cover.

**Visibility does not discriminate protection, but it exactly discriminates the refusal — and those
are two questions wearing one word.** Measuring visibility and protection in a single pass across all
eleven members:

| visibility | count | protection endpoint |
| --- | --- | --- |
| private | 6 | `403` — all six |
| public | 5 | `200` × 1, `404` × 4 |

The correspondence is total in one direction: every private member is refused, every public member
answers. So the claim above is right about *is anything enforced* — four public members return `404`,
and public-and-unprotected is a real state — and wrong about *can this account read the state at
all*, where visibility predicts the outcome perfectly, exactly as the endpoint's own upgrade message
says it should. The practical consequence is not that you may skip the call: it is that a `403` is
**fully explained by visibility and carries no further information**, whereas `200` versus `404` is
only obtainable by measuring. Reporting "six members are refused" alongside "six members are private"
states one fact twice.

The general form, since *discriminator* claims are usually written after a surprise: **a statement
that some property is not the discriminator has to name the question it is not discriminating.**
Unqualified, it reads as *this property is uninformative here*, and the original sentence was
written the moment a tempting generalization failed — which is precisely when the property's real
and narrower predictive power is least likely to be looked for.

**Where nothing is required, replay the trigger predicate against the diff.** The section below
warns that a path-filtered trigger yields no check at all on an unprotected repository. The
compensating instrument is to evaluate the workflow's own filter against the pull request's actual
changed files, rather than reading the regex and judging it correct: that is the only local test
that distinguishes *the job correctly did not apply* from *the job silently never existed*. It has
to be run per pull request, because applicability is a property of the diff and not of the workflow.
On a protected repository this is redundant; on ten of eleven members here it is the whole gate.

**And doctrine gets authored where it is cheapest to be right and applied where it is hardest to
notice being wrong.** This section was written in the one repository whose platform contradicts a
mistake immediately, then distributed to eleven where, by the census above, ten enforce nothing and
six cannot even report their state. The asymmetry is self-concealing rather than merely unlucky: the
authoring environment is *selected* for having the strongest feedback, which is exactly why guidance
gets written there — so the confidence is earned in the one place the claim is cheap and spent in
every place it is expensive. When writing a rule that depends on a platform behaviour, name the
environment it was verified in, and check whether that environment is representative of the
population receiving it or is the outlier that made verification easy.

**The consequence inverts this section's failure mode.** Where checks are required, a path-filtered
trigger hangs the pull request forever — loud, and self-limiting because nobody can merge past it.
Where nothing is required, the identical misconfiguration produces a check that is simply never
created, and the pull request stays perfectly mergeable. Same defect, opposite symptom, and the
silent one ships. So on an unprotected repository the merge gate is **discipline, not a platform
guarantee**: nothing but the person merging stands between an unrun check and the default branch.
Say which of the two you are relying on when you report a PR as gated.

The rest of this section assumes required checks are in force. Where they are not, follow it anyway
— the misconfiguration it prevents is invisible rather than absent, and the repository may become
protected later, at which point every latent instance surfaces at once.

Never put `paths` or `paths-ignore` on the `pull_request` trigger of a workflow that supplies a
required check. When the filter does not match, GitHub does not start the workflow or create its
check run, so the required check remains pending and blocks the pull request indefinitely.

Trigger the workflow for every pull request in its protected scope, detect applicability in a job,
and gate the expensive job with `jobs.<job_id>.if`. A skipped job produces a terminal `skipped`
conclusion that GitHub accepts as success for a required check:

```yaml
on:
  pull_request:

permissions:
  contents: read
  packages: read
  pull-requests: read

jobs:
  changes:
    uses: jrmoulckers/.github/.github/workflows/reusable-change-detection.yml@<reviewed-commit-sha>
    with:
      path-groups-json: '{"web":["apps/web/","packages/ui/"]}'

  lint:
    needs: changes
    if: contains(fromJSON(needs.changes.outputs.changed-groups-json), 'web')
    uses: jrmoulckers/.github/.github/workflows/reusable-ci-lint.yml@<reviewed-commit-sha>
```

Your groups will not cover everything, and that is expected — the example above classifies
`apps/web/` and `packages/ui/` and says nothing about docs, tooling, or vendored trees. What
deserves care is that a file matching **no** group looks identical, from `changed-groups-json`, to
one correctly judged irrelevant: in both cases the group is simply absent and the gated job
skips. That is fine for a README and load-bearing for anything a build resolves at build time — a
deleted vendored asset or generated file can break a build while matching no source prefix.

The workflow therefore reports what it could not classify, through an `unclassified-files-json`
output, a step-summary section and a run warning. Nothing fails on it, because unclassified paths
are routine and a check that fired on all of them would be switched off within a week. Read it
when a change skipped jobs you expected to run, and widen a group if the residue contains
something your build actually consumes.

Event filtering is still appropriate for workflows that do not supply required checks. For a
required check, however, no workflow run is categorically different from an intentionally skipped
job: only the latter reports a terminal result. Keep the required job's name stable so the ruleset
continues to require the intended check.

**A caller `permissions:` block replaces the defaults — it does not add to them.** Every scope you
omit is set to `none`, and a called workflow can never receive more than its caller holds. So a
least-privilege `permissions: { contents: read }` in the caller silently strips the scopes the
reusable workflow declares for itself. The symptom is a bare `startup_failure` with **no readable
log**, which is easy to misdiagnose as a broken `uses:` reference.

Grant every scope the callee declares:

| Reusable workflow | Scopes the caller must grant |
| --- | --- |
| `reusable-caller-permissions` | `contents: read` |
| `reusable-ci-lint` | `contents: read`, **`packages: read`**, **and `pull-requests: read`** (Semantic PR Title job) |
| `reusable-ci-web` | `contents: read`, `packages: read` |
| `reusable-perf-budget` | `contents: read`, `packages: read` |
| `reusable-smoke-test` | `contents: read`, `packages: read` |
| `reusable-native-smoke-test` | `contents: read`, `packages: read` (the web job; the other platform jobs need only `contents: read`) |
| `reusable-deploy-preview` | `contents: read`, `packages: read` |
| `reusable-change-detection` | `contents: read` |
| `reusable-security-ci` | `contents: read` |
| `reusable-deploy-pages` | `contents: read`, `packages: read`, `pages: write`, and `id-token: write` |

```yaml
permissions:
  contents: read
  packages: read          # required by every Node-installing reusable workflow
  pull-requests: read      # required by reusable-ci-lint

jobs:
  lint:
    uses: jrmoulckers/.github/.github/workflows/reusable-ci-lint.yml@<reviewed-commit-sha>
    with:
      package-manager: pnpm
```

Rules:

- Before adding a caller-level `permissions:` block, open the callee and copy its declared scopes.
- Omitting `permissions:` entirely inherits the repo default — safe, but less explicit.
- If a scope truly cannot be granted, disable the job that needs it instead
  (e.g. `semantic-pr-title: false` for `reusable-ci-lint`).
- Debug a `startup_failure` with no log by checking caller permissions first — but confirm the
  failure is scoped to the calling job before you do (see below).
- Caller workflows own CI concurrency. Put the concurrency group on the caller workflow so matrix or
  multi-package reusable jobs do not cancel sibling calls. Canonical Pages deployment is the
  exception: it serializes repository deployments with `cancel-in-progress: false`.

Because GitHub rejects an insufficient caller ceiling before creating any job, no step in the
affected workflow file can explain the failure. Put the canonical lint in a **separate** file so
that its run still starts:

```yaml
# .github/workflows/caller-permissions.yml
name: Caller permissions

on:
  pull_request:

permissions: {}

jobs:
  lint:
    name: Caller permission lint
    permissions:
      contents: read
    uses: jrmoulckers/.github/.github/workflows/reusable-caller-permissions.yml@<reviewed-commit-sha>
```

Do not path-filter this workflow, and make its stable check name required. A failure names the
caller workflow file and job whose ceiling is insufficient, then lists every other job in that
file that GitHub would suppress as collateral blast radius. An unsupported local YAML shape also
fails rather than being certified safe. A passing lint is the only positive evidence available for
the inspected commit: existing green history does not prove that a future reusable-workflow re-pin
has compatible permission ceilings.

### A no-log failure is not always a permissions problem

The permissions trap above is not the only way a run dies in seconds with an empty log. Exhausting
the Actions spending limit refuses the run before any job starts, with `recent account payments have
failed or your spending limit needs to be increased`.

**This is not confined to private repositories, and canon claimed otherwise until a member falsified
it.** The earlier text here said standard runners are free on public repositories so the refusal
cannot happen there. `jrmoulckers/studio` is public — `"private": false` — and run `31437443369` on
`2026-08-10T22:14:21Z` was refused with that exact annotation on **all 8 of its jobs that were
candidates to run**, every one of them on `ubuntu-latest`, `windows-latest` or `macos-latest`. No
larger runners involved. The claim was falsifiable, was load-bearing, and was false.

**And it is two episodes, not one run** — which is what makes it an account state rather than a
transient. Three weeks earlier, `29662565649` / `29662570979` / `29663406932` on
`2026-07-18T21:57–22:25Z` were refused the same way, 1-of-1 jobs each, on `ubuntu-latest`, on the
same public repository. Four runs, both `push` and `pull_request`, two separated dates. A one-run
falsification invites *some transient*; two do not.

That denominator is 8 rather than the run's 9 jobs, and the discarded job is worth a sentence because
it is the one a careless count reaches for. `security / Dependency review` reports zero steps on that
run — but it reports zero steps on green runs too, where it is `skipped` by a job conditional, so it
looks *identical* whether or not the account is refused. **The discriminator is not `steps: 0`; it is
`failure` at zero steps.** A `skipped` job at zero steps is ordinary. Counting it as a ninth refusal
inflates the load-bearing number with the only job in the run that carries no information, and
implies a partial refusal — as though one job had escaped — when that job was never a candidate.

**Do not drop it on the baseline alone, because that reason selects a larger set than the predicate
does.** The same refused run carries `lint / Semantic PR title`, which is *also* zero-step on green
runs — `skipped` there, `failure` and annotated on the refused one. So "zero-step regardless of
billing" is true of both, and a reader applying that reason drops two jobs and reports **7**. What
separates them is the `conclusion`, which is in the predicate and was missing from this prose.
**Baseline behaviour identifies a candidate for exclusion; only the conclusion confirms one.** The
justification is the portable half — it is what a reader carries to another repository — so a
justification that generalises wider than its predicate discards a real victim, and does it silently,
because the wrongly-dropped job looks exactly like the one it was right to drop.

Two habits follow. Report the population you actually measured (`8 jobs, every one a standard
runner`) rather than an `N of N` that reads as a census: the run's job count moves with the trigger —
9 here, 11 on the green runs used as the control — so the census is run-specific even when the
finding is not. And **establish a zero-step baseline from a passing run before treating zero steps as
a symptom**, because some jobs are legitimately zero-step always.

**Do not replace it with a narrower exemption.** The failure mode was never the specific claim; it
was having *any* rule that lets a reader skip the check. The annotation fetch discriminates both
causes outright and costs two API calls, so it needs no precondition at all. A reader on a public
repo who prunes billing by construction goes hunting for a `permissions:` defect in a workflow that
is correct — and canon's own framing, that only one of the two causes is a defect in this repository,
sends them to search the branch that has none. **Repository visibility is prior likelihood. It is
never a gate.**

**In a fleet, check visibility because it is cheap, but resolve with the annotation.** The
correlation is genuine — a live incident split the twelve studio repos six green and six failing,
close to the visibility line — and the reason it is *only* a correlation is that the refusal does not
lift uniformly. Same account, same night: studio (public) was refused at 22:14Z and green again by
23:47Z, while `jrmoulckers/homelab` (private) was still being refused at 06:15Z, seven hours later.
So a green public repo does not falsify a repository-side hypothesis, and a sibling's recovery
licenses no inference about a repo that has not been re-run. **Each repository's own annotation is
the only evidence about that repository.**

A recovered repo is also not a control group. Studio spent the night looking like one, and the
correct reading is the more informative one: it did not lack the condition, it left it early. That
makes it a data point about the *scope* of a lift rather than a permanently uninformative baseline.

**The annotation is a disjunction, and its two halves have different scopes — which is probably why
the lift is uneven.** `recent account payments have failed` **or** `your spending limit needs to be
increased` are not two phrasings of one condition. A spending limit is *usage-metered*, so it needs
billable minutes and visibility and runner class genuinely bear on it. A failed payment is a *state
of the account*: nothing about free minutes requires the account to be in good standing, so that half
is visibility-independent, which is the half that admits the public-repo refusal above.

Read that way, the divergence recorded here stops being anomalous. Under a single metered cause,
public-standard recovering hours before private is hard to explain; under two clauses it is ordinary
— payment is restored and free public standard minutes resume at once, while metered private usage
stays refused until the limit itself is raised. **Two clauses, two recovery times.** Treat this as
the working explanation rather than a documented mechanism: it is inferred from the annotation's own
wording plus two observations, and GitHub's billing internals are not visible from here. It changes
no procedure — the annotation was already the thing to resolve on — but it predicts that a repository
can recover while a sibling does not, so do not read a fleet-mate's return to green as a lift.

**And it is not merely undocumented — it is unfalsifiable from the evidence this section tells you to
fetch.** All 11 annotations across all four refused runs are a single canned string, and that string
carries **both clauses joined by `or`**. GitHub is not reporting which condition fired; it is
declining to distinguish them. So no operator can ever confirm the clause from the annotation, and
the recovery-time asymmetry is the only observable bearing on it — inference from timing, not
evidence from the message. Do not present the two-clause account to anyone as diagnosable.

**That last sentence was too strong, and the fleet scan that disproved it shows how.** The clause is
not diagnosable *from the annotation* — that part stands, and no amount of re-fetching the message
will ever help. But the two clauses make **different predictions about repositories that are not
refused**, and that is an observable this section never thought to collect. Measured across every
member on `2026-08-12`:

| repo | visibility | zero-step refusals | during the current episode |
| --- | --- | --- | --- |
| `docket` | private | 341 | refused |
| `homelab` | private | 74 | refused |
| `libro` | private | 25 | refused |
| `cartridge` | private | 25 | refused |
| `game-library` | private | 11 | refused |
| `product` | private | 2 | refused |
| `score-king` | public | **0** | **16 successes**, latest `00:54:39Z` |
| `finance` | public | **0** | succeeding |
| `jrm-recipes` | public | **0** | succeeding |
| `engineering` | public | **0** | succeeding |
| `.github` | public | **0** | succeeding |

Six private repositories, every one refused; five public repositories, every one clean. A failed
payment is a state of the account and is visibility-independent — it would refuse public repos too.
Public repos are succeeding *concurrently* with private repos being refused, so **the failed-payment
clause is not the one firing; the spending limit is.**

**That inference is void, and the step that fails is the one that felt like a definition.** A payment
state is account-scoped, but its *effect on runs* is not, because Actions on public repositories with
standard runners is free and therefore consumes no billed usage at all. Both branches predict the
observed table identically: private refused, public clean. The split is a restatement of the free
tier, not evidence about which clause fired. See the diagnostic table further down for the two
measurements that do bear on it, and for the reason they still do not close the question.

**The general form survives and needs one clause it did not have: when a message refuses to say which
of two causes fired, look for a population the two causes treat differently — and verify that both
causes are actually exposed to the axis you have chosen.** Diagnosis had been framed entirely as
*read the failure more carefully*, and the failures are identical by construction, so the
discriminating evidence was never in the refused runs. The correction is that a concurrent control is
not automatically superior to a temporal one: here the concurrent axis was one arm's documented
exemption, so it discriminated nothing, while the temporal evidence was the only thing addressing the
clauses at all. **A control chosen along an axis one arm is exempt from is not a control**, and
picking the axis is the whole test rather than a preliminary to it.

**A zero-run interval measures triggering activity, not service availability.** During a refusal
episode runs are still *created* — the earlier episode on `jrmoulckers/homelab` produced 55 run
objects, every one of them refused, which is directly checkable. So an interval with no runs in it
cannot mean the service was down; it can only mean nothing pushed. Reading such a gap as a recovery
window infers the state of one system from the idleness of another, and the two are independent. The
gap in question was six days wide, and a six-day window in that position contains a month boundary
almost wherever recovery actually fell — so "the window contains the billing-cycle boundary" had no
power to discriminate, while reading exactly like evidence.

**And a commit census must declare whether its population is authored or published, because the two
diverge enormously in a shared worktree.** Two parties measured the same interval and got one commit
and twenty-one; both were correct. `--remotes` counts what was pushed, `--all` additionally counts
local-only refs, which in an environment where several sessions share a checkout means other agents'
unpushed work. Measured in this repository's worktree the gap is not marginal: **1,177 commits
reachable from all refs against 437 from remote-tracking refs**, so nearly two-thirds of the
population is unpublished, and a census that does not name which it counted is off by a factor of
nearly three. The same command reproduces to a different number on a fresh clone, which is what makes
the discrepancy read as someone's mistake rather than as two questions.

The direction matters for the case above. *The gap was idle* merely fails to explain why no runs
exist; **unpushed commits explain it positively**, because the triggers are push and pull-request
events, so work that was authored and never published produces exactly this absence. Prefer the
explanation that predicts the observation to the one that is merely consistent with it.

**But the most dangerous explanation for a discrepancy is a mechanism you have just spent hours
proving real.** A member's heading census was 17 missing; this repo measured 23 and explained the gap
as canon having grown between their reading and mine — citing, as support, the decay rule they had
themselves proposed in the message under reply. It fit, it was topical, and it was false. Walking
every commit in the window with a fence-masking counter:

```
five commits, 102 lines added
naive headings  46 46 46 46 46      masked headings  36 36 36 36 36
```

The count did not move once. The entire discrepancy was my own naive regex counting template headings
inside fenced blocks, and the member's 17 was right when taken and still right. **A live, well-evidenced
mechanism is available, plausible, and requires no instrument check**, so it is reached for first and
absorbs defects that have nothing to do with it — and the better the evidence for the mechanism, the
more completely it launders the error. The discriminator is cheap and specific: decay predicts *the
cited quantity changed*, so measure that quantity at both revisions before invoking it. A mechanism
that explains a discrepancy in general is not thereby the one that produced this instance.

Note also which way the explanation pointed. It placed the error in the peer's reading rather than in
my instrument, which was the flattering direction and the unmeasured one — the same shape as an
authorship claim recorded elsewhere in this file that settled on *not mine* because nothing could
check it. Where a discrepancy admits an explanation that exonerates your instrument, that is the
branch to measure first, not last.

**Falsifiability is a property of the claim, not evidence for it.** The withdrawn reading came with a
crisp test — *it clears on its own next cycle, or it never does* — and offering that test is what made
it feel rigorous. It invites the reader to check the future instead of auditing the derivation, and
those are not the same review. A prediction can be sharply testable and rest on nothing. Attach the
derivation to the test, or the test launders the gap.

**A withdrawal does not propagate to the summaries that restate the claim.** This was demonstrated
here at the worst possible place. The cycle-reset arm was withdrawn explicitly — *waiting it out is
not a supported plan* — and then reinstated two hours and seventeen minutes later, by the same
session, as a parenthetical in an action item: *raise the spending limit (or wait for the cycle to
reset)*. The reinstatement sat inside the write-up of a **stronger, independent** result, so the
comment most likely to be trusted carried the retracted advice.

The mechanism is worth stating because it is not carelessness. A correction is applied to the claim,
in the artifact where the claim lives. A summary re-derives the action from memory, and memory holds
the pre-correction version — nothing links the two, and compression is exactly when the link is
needed. **After withdrawing something, grep your own prior artifacts for the withdrawn arm rather
than trusting that the withdrawal reached them.** The check is cheap and the failure is silent.

**A falsifier licenses withdrawing the conjunct it reaches, not the sentence containing it.** A peer
held a two-part standing item — *dispatch has stalled* and *the last fleet-wide delivery was three
days ago* — and I falsified the first with a real, successful, non-dry run. They retracted both. The
run was scoped to a single member, so it bore on dispatch occurring and on nothing whatever about
fleet delivery, and a true operational fact went off the record because the evidence against its
neighbour arrived in the same sentence. Measuring harder does not help: the run ID, its timestamp
and its conclusion all check out, and **the defect is in the falsifier's scope rather than its
truth**, which no amount of re-verifying the falsifier can expose.

Two properties make this worse than an over-broad claim. A counter-example feels conclusive in a way
an assertion does not, because it arrives as arithmetic and nothing in it announces which conjunct
it reached. And **a retraction is trusted more than the assertion it replaces**, since withdrawing
something reads as rigour — so the over-broad version travels further and is questioned less. Before
accepting a peer's counter-example, split your own claim into conjuncts and mark which ones the
evidence actually touches.

**A check whose apparatus determines its outcome is not a check**, and the two directions it fails
in are worth holding together. A reconciliation closed as one figure plus a residual defined as the
difference between that figure and the total — an identity over any two numbers, so it could not
fail to close, and the residual silently absorbed the byte-versus-character delta that was the exact
error class the census existed to detect. The correct split had already been computed and was
discarded as "a third number" because the closing sum outranked it. Against that, a control suite
asked *do you already catch this?* answered with six failures and an emphatic yes, while being a
reconstruction that never ran, because the slicing that built it had removed a required binding from
above the insertion point. **One manufactures a confirmation and the other manufactures a
withdrawal, and neither has a state in which it fails for the reason under test.** So the question
to ask of any verification step is *what would this have looked like if the thing I am testing were
false?* — if the answer is "the same", it is ceremony. Note the adjacency: a broken control is an
apparatus for producing the over-broad retraction described above.

**A run's conclusion is not a delivery outcome, which is the same split one level down.** The
fleet-wide run restored to that peer's list carries status `failure` and reads as *no delivery* —
but its log says one of twelve targets failed, so eleven members were delivered to and a single
clone was refused. Status aggregates by "any failure"; delivery is per-target. Quote the per-target
tally from the log, not the badge, and note that the tally also corrected the roster size the hub
had been reasoning with.

**A provenance archive that lags the present turn makes absence unreliable exactly where disputes
happen.** That peer's control term — their own merge, an hour old — returned zero, because their
checkpoint for the current turn was not yet written; the query is sound for old claims and silently
wrong for fresh ones, which is the window attribution arguments live in. Measured here, **the lag is
a property of the archive kind rather than of the store**: turn rows are written at turn completion
and were current to the last finished turn, while a checkpoint record trails by a whole checkpoint.
So state which archive an absence came from and what its write cadence is, and treat a
freshness-sensitive negative as unsupported until a control of comparable age returns a hit.

**And a sibling's green does not carry the evidence this once claimed, which is the same withdrawal
reaching one paragraph further.** The rule above — that each repository's annotation is the only
evidence about that repository — was qualified here on the grounds that for an *account-level* clause
a sibling which is not refused carries evidence nobody else can get. That qualification inherited the
confounded control: the siblings that stay green are the public ones, and they are exempt from billed
usage entirely, so their green is a property of the free tier rather than a reading of the account. A
private sibling's green would carry the evidence; a public sibling's does not, and every green
sibling observed during this episode was public. The unqualified rule stands.

**When your own block lifts, the first green is a first measurement, not a recovery.** A refused run
executed no steps, so it carries no evidence about the diff in either direction — the red was a statement about the account.
There is therefore no prior known-good state being returned to, and a regression that landed during
the outage was indistinguishable from the outage the whole time it held. The trap is in how it ends:
the window does not close when the block lifts, it closes when someone re-reads the checks, and
nothing prompts that, because the repos go green on their own and a green check invites no
investigation. So the recovery erases the evidence that anything was ever concealed. After an
account-wide refusal lifts, re-run and re-read the affected PRs' checks deliberately instead of
treating the return to green as the answer, and judge the branch per hunk — an aged branch is rarely
all-good or all-stale. Full treatment in `docs/sync.md`, § *A fleet-wide outage makes genuine
regressions unreadable while it holds*.

Discriminate before investigating, because the two look nearly identical and only one of them is
a defect in this repository:

| | Caller permissions | Spending limit |
| --- | --- | --- |
| What failed | Only the job that `uses:` the callee | **Every** job in the run, including untouched ones |
| Scope | One repository | The **account** — but observed lifting at different times per repository |
| Triggered by | Adding or narrowing a `permissions:` block | Adding an expensive runner, or simply reaching the monthly cap |
| Fixed in | The workflow file | Billing settings — nothing in the repository is wrong |

**Read `steps: 0` as a relation, not a count.** Healthy runs contain zero-step jobs routinely — a
skipped `security / Dependency review` is one — so studio's green runs carry one or two of them while
its refused run carried nine. The discriminator is that **every** job in the run is at zero, and even
that is only a symptom: the annotation is the evidence. A shorthand quoting the bare number does not
survive being repeated by someone who does not have the annotation in front of them.

**Name the predicate, because a relation can be completed by a member that satisfies it
unconditionally.** studio's refused run censused as `total=9, steps0=9, failure=8, skipped=1,
annotated=8`, and the 8-vs-9 gap looked like two valid denominators — annotation-as-evidence against
zero-steps-as-relation. It is not. The ninth job is `security / Dependency review`, which is `skipped`
at `steps: 0` on **every green run of the same workflow**. It completes the relation without carrying
any information about the refusal, so it corroborates nothing; it merely agrees. The load-bearing
predicate is `steps == 0 && conclusion == 'failure'`, which is **8** — exactly the annotated count.
Sharpening the predicate **collapsed** the disagreement rather than splitting it, and a
reconciliation that explains why two numbers may both stand should be suspected first of having
skipped that step: *two correct denominators* is the more flattering finding and the rarer one.

**And state the population at every stage of the pipeline, because one number will be read as all
of them.** A census of this kind runs *list → inspect → match*, each stage narrower than the last,
and a scope line naming a single figure silently claims the same figure for all three. This repo
published `last 100 runs (reaching back to 2026-07-27)` for a member whose complete history is 102
runs reaching back to `2026-07-06`; `07-27` was the oldest run **matching** the zero-step signature
inside a **10-run inspected subsample**, and it was written down as the reach of the listing. The
true shape was `102 listed, 10 inspected, 6 matched`.

The consequence is not a rounding error. **Understating reach converts *I did not classify these*
into *these lie outside my window*** — 48 runs sat inside the listing, unexamined, and were made to
look excluded by it. Absence of evidence is thereby promoted to a boundary, and a boundary is
exactly what a reader reasons from: the figure turned a three-week episode into a three-day one, and
the three-day version was then used to argue about whether the current outage needed intervention or
a wait.

**And the window itself is not one window.** `last 100 runs` reads like a fixed instrument and is
not: measured across the whole roster in one pass, its span varies by a factor of six hundred and
its coverage of the subject's history by a factor of five hundred.

```
member         total runs   100-run span   coverage of history
finance             40000       0.06 d        0.2%      <- 86 minutes
.github              1525       0.18 d        6.6%
docket               1008       0.22 d        9.9%
engineering           717       0.35 d       13.9%
jrm-recipes          1876       0.87 d        5.3%
product                26       3.21 d        100%      <- a census
studio                364       3.32 d       27.5%
cartridge              95       9.12 d        100%      <- a census
libro                 101       9.20 d       99.0%
score-king            173      34.50 d       57.8%
homelab               105      36.84 d       95.2%
windows                 0          --           --      no runs at all
```

The narrow-where-busy effect is the small half. The large half is that **at the low-volume end the
window stops being a sample and becomes a complete enumeration** -- for `product` and `cartridge`
there is nothing outside it, so the figure has no left edge and no sampling error, while the same
column for `finance` is an eighty-six-minute snapshot of a forty-thousand-run history. A fleet table
with a `last 100 runs` heading is therefore reporting censuses and snapshots in one column, and a
cross-member comparison of those rates is not a weak comparison but a void one. **Publish the
coverage beside the count**, since the count alone cannot distinguish the two kinds.

Note `windows` at zero: not a thin window but no measurement of any kind, which is the same absent
stratum the rest of this section is about, at its limit.

**A reciprocal that returned null, recorded because the null is the result.** The purpose of the
measurement above was to show that the correspondent's corrected failure rate was itself truncated
by the hundred-run bound -- their own correction turned on their own number. It is not: their
repository's entire history is 101 runs, so their left edge is repository inception rather than a
query limit, and the figure is a census statistic rather than a windowed one. The attempt made their
number **stronger** than they had claimed. A reciprocal test is worth publishing when it fails, both
because the peer's figure is then established rather than merely unchallenged, and because the
temptation not to send a null is exactly the selection pressure that fills a record with
confirmations.

**And a hypothesis withdrawn after a test whose population excludes its predicted domain has not
been falsified, it has been unasked.** The window effect above was predicted here, tested against
four members, not found, and withdrawn -- and all four were high-volume, which is the half of the
range where the effect is smallest by construction. The test population was selected on the inverse
of the variable under test. That is the missing-column defect and the missing-bucket defect one
level up: not an absent state in a classifier but an absent stratum in a sample, and it produces a
retraction rather than a wrong answer, which is harder to notice because retracting feels rigorous.
Before withdrawing on a negative, **check that the sample contains the case the hypothesis names.**

Two further rules from the same exchange, both about rates over a changed regime. **A rate computed
over a window containing a regime change measures where the boundary falls in the window**, not any
property of the subject: a member's 58% failure rate resolved to 53 refusals plus 5 genuine red
builds, a true rate of `5/47 = 10.6%` and a 5.5x overstatement, every unit of it the outage.
Conditioning on the zero-step signature fixes the numerator; only splitting the window fixes the
question. And **sorting by recency and sampling the head is a filter on the property under test** --
the twelve most recent failures were 12/12 refusals *by the ordering of the query*, a result that
carried no information and read as a decisive one.

This is the inverse of the vacuity failure. There the narrow population goes unreported and a corpus
count stands in for it; here the narrow population's *extremum* stands in for the corpus's reach.
Both are one number doing the work of several, and the remedy for both is the same: report the
stages, and prefer *the oldest item I looked at* to *the oldest item that matched*, since only the
first bounds what you did not find.

**The correction came from outside, and that is part of the record.** This repo did not catch the
scope-line error by re-reading its own work; a peer ran the complete history and published the true
boundary, and the figure propagated from there. Kept because the earlier account of this episode
omitted it, and an entry that reads as self-caught teaches that careful re-reading suffices — when
what actually sufficed was somebody else measuring the population exhaustively. **A sampled extremum
is not reliably caught by its author**, because the sample looks complete from the inside and there
is nothing in it to prompt the doubt; the corrective is an exhaustive count, and the party best
placed to run one is usually the owner of the corpus rather than the author of the claim.

**Evaluate that predicate against the jobs API only — `gh pr checks` cannot supply its terms.** That
view renders an unfinished job as `pending 0`, where the `0` is its column for *no duration yet*, not
a step count. A member watching a healthy `native-kotlin` job saw `pending 0` for 22 minutes while it
was executing 8 successful steps on a named runner, and would have read it as a refusal had they not
gone to the API. So the two states this section exists to separate — *refused before starting* and
*running normally* — are rendered identically there, and the collision is in the field the predicate
keys on. Worse, it is the same command the Definition of Done table names for CI-green, so combining
the two instructions is the natural reading rather than a careless one.

The general form is the part to carry: **a predicate is not defined until you name the instrument
that supplies its terms.** A field name is not a field; the same word in two tools can denote
different quantities, and a predicate written against one and evaluated against the other is
well-formed, runnable, and wrong. State the API call beside any threshold you publish.

**Do not expect a run's conclusion and its check-runs to agree.** In that same run the workflow
concluded `success` while the job's check-run stayed `in_progress` and never reconciled — an
orphaned record, not a transient. Any liveness or completeness test that requires both to settle
will hang on a run that has genuinely finished.

**State which case a predicate has not been exercised against.** That predicate has been run over
studio's whole failure history: 8 ordinary failures (lint, build, and so on) yield zero false
positives, and all four refused runs match. But studio has **0** `startup_failure` runs ever, so it
has never been tested against the **caller-permissions trap** — the exact confusable this section
exists to separate. A discriminator validated only against the easy contrast has not been shown to
discriminate. The honest form is *no false positives on 8 ordinary failures; not yet tested against
the case it is meant to distinguish*, and the missing fixture can be built deliberately by calling
`reusable-ci-lint` without `pull-requests: read`.

**And a detector's noise is a property of the corpus, not of the detector, so a clean result does
not travel with it.** A peer offered canon an encoding guard — grep for `U+FFFD`, classic mojibake
sequences, and a lossy dash signature, each paired with synthetic damage asserted non-zero in the
same run so the check cannot pass by being broken. The control discipline is right and was adopted.
Measured here, two of the three patterns return zero and the third fires **111 times across 32
files**, every hit a JavaScript ternary — because their corpus is prose and canon's includes the
engine. Scoped back to `*.md` it returns 0 across 92 files, exactly as they measured. Nothing was
concealed; they named their corpus, and the number was simply taken on a population the recipient
does not have. Promotion is this repo's characteristic act, so **run a borrowed check against your
own corpus before adopting it, and promote it with its scope attached** — a pattern shipped without
its population will be applied to the wider one, and a guard that fires 111 times on a healthy repo
is one that gets disabled. This is not the entry above: that one asks which *cases* a predicate met
inside one history, this one asks whether a correct number survives crossing into a different one.

**A control must be pinned to the workflow revision, not merely to the event.** Comparing that run
against a green one showed 11 jobs against 9, with `native-kotlin` and `native-swift` absent — which
reads as jobs the account was never allowed to create. They were added to `ci.yml` by `1a9d78e` at
`23:49:29Z`; the run was created at `22:14:21Z`. **A job-set delta across dates measures the workflow
before it measures the run.** The first control here was wrong twice over — a `push` run compared
against a `pull_request` one *and* a later revision — and correcting only the event mismatch produced
a comparison that still could not support the claim. **One confound corrected is not a controlled
comparison**, and finding the first one is what makes the second easy to stop looking for.

**Check the run summary next: if jobs you did not touch failed alongside the one you did, stop
reading YAML and check billing.** A green history proves nothing here, because the cap is reached
by cumulative spend rather than by anything in the diff.

That check is free but not always decisive — a single-job workflow presents identically under both
causes, and a live one did: the billing-refused run in the table below contained exactly **one**
job, leaving the comparison with nothing to compare against.

**`gh run view --log-failed` settles it, and it is the fastest route.** Both causes produce a
`log not found`, but not the same one, because a permissions failure kills the run *before any job
is created* while billing creates the job and then refuses to start it:

| | Caller permissions | Spending limit |
| --- | --- | --- |
| `--log-failed` says | `failed to get run log: log not found` | `log not found: 93677247471` |
| Jobs in the run | **0** | **1**, with `steps: 0` |
| Failing check-runs | **0** | 1, `annotations_count: 1` |

**The discriminator is whether the message carries an ID** — and that ID is exactly what the
annotations endpoint needs, so the command that looks like a dead end hands over the key to the one
that answers the question:

```bash
gh run view <run-id> --log-failed          # -> log not found: 93677247471
gh api repos/OWNER/REPO/check-runs/93677247471/annotations --jq '.[].message'
```

The billing refusal carries its `recent account payments have failed…` message there. A permissions
failure has no check-run to carry one. (The endpoint returns `[]` for a healthy run.)

**Do not pin recognition to that wording.** The annotation has a structural signature that survives
a rewrite, verified identical across three runs in two repositories: `path` is `.github` — not a
real file, and its `blob_href` 404s — with `start_line` and `end_line` both `1`, null columns, and
**both `title` and `raw_details` empty**, against a check-run whose `output.title` and
`output.summary` are `null`. A genuine lint or test annotation populates at least one of those. *An
annotation with no title, no details, and a path that is not a file* is the shape to look for.

**Expect to misread this one, and know why.** An account-scoped fault strikes many repositories
within minutes of each other, taking unrelated pull requests down with the sync engine's. That
pattern reads as *"everything is broken"* and invites blaming whatever most recently touched
everything — which, in a repo family with a sync engine, is always the sync engine. It is the
standing suspect for precisely the failure class it cannot cause. Timeline evidence is real here
and still points the wrong way: *simultaneous, across repos, including unrelated work* fits **one
account-level event** far better than several independent regressions.

**This is a class, not one vendor's quota.** Any account-scoped limit can surface as a per-PR
check failure — Vercel's `Deployment rate limited — retry in 24 hours` hit a member in the same
window, from a different system with the same shape. When a check fails and no diff explains it,
ask whether the limit being hit belongs to the account rather than to the repository.

**Recognizing the refusal is not diagnosing it, and the annotation names two causes with different
remedies.** *"recent account payments have failed **or** your spending limit needs to be increased"*
is a disjunction: one branch costs money to clear, the other does not. Every session here has
recommended raising the limit without testing which branch was live. Two of them are testable.

The account-scoped billing endpoints are gone, and that is not the end of the enquiry — a `410`
names its successor in the response body, and following it returns per-repository, per-SKU rows:

```bash
gh api /users/OWNER/settings/billing/actions          # 410 "This endpoint has been moved."
gh api /orgs/OWNER/settings/billing/actions           # 404 on a personal account
gh api "/users/OWNER/settings/billing/usage?year=YYYY&month=M"   # 182 rows
```

Against that data, on a `type=User`, `plan=free` account:

| Branch | Test | Reading |
| --- | --- | --- |
| payments have failed | `netAmount` summed over all months | `0.0000` — no charge ever existed, so none can have failed |
| allowance exhausted | private-repo minutes, multiplier-weighted, vs the plan's included figure | `1,282` of `2,000` — not exhausted, so *waiting for the cycle boundary is not a remedy* |

Public repositories do not consume the allowance, so weight **only private ones** — and confirm
visibility with `.private` rather than from memory, which is how a seven-repository set was
published as six here for a week.

**Governance exclusion is not resource exclusion, so the allowance has a different population than
the roster.** Of the `1,282` private adjusted minutes, **126 — 9.8% — belong to `game-library`**,
which sits in the top-level `excluded` array and is deliberately ungoverned. It receives no canon, is
exempt from every sweep, and consumes the same shared monthly allowance as every member. So a
repository the fleet has decided not to manage can degrade or halt CI for all eleven that it does,
and no roster-scoped query will ever show it. **Compute allowance questions over the billing
account; compute governance questions over the roster; and never let one partition stand in for the
other.** A membership cut and a visibility cut are different cuts, and correcting the second says
nothing about the first.

**A figure that reproduces exactly may do so because the process generating it has stopped.** Two
parties measured this account hours apart. The private total reproduced *to the unit* at `1,282`
while the public total moved from `32,338` to `39,087` — a 20.9% divergence over the same interval.
The stability was not measurement quality: private usage is frozen **because the refusal under
investigation is what froze it**, so the exact agreement is a symptom of the phenomenon rather than
evidence about it, and the live figure's failure to reproduce is not an error. This inverts the
default reading, and dangerously, because exact reproduction is the result least likely to be
questioned. **Ask what would have to be true for a figure to move before crediting the fact that it
did not.**

Both exclusions are negative results and inherit the scope of their population, so state the months
and the repository set with them.

**Measure the allowance at the onset, not over the month, because a refusal suppresses the usage it
would have produced.** A month total taken during an outage is partly an *effect* of that outage, so
using it to argue the allowance was never exhausted is circular in its general form. The sound
quantity is cumulative private usage at the instant of the first refusal. Both episodes here survive
the stricter test — `18 / 2,000` at the first, `1,282 / 2,000` at the second — and the first is exact
rather than approximate, because July private usage is a **single row** dated three days before
onset. But the shortcut was safe only by accident: both episodes were still running at their month's
end. An episode that ended mid-month would have its recovery usage counted into the same total,
inflating usage-at-onset and biasing toward the very arm the test is trying to refute.

Note also what neither one settles: **the spending limit's own value is not exposed by any reachable
endpoint**, so naming that branch is a conclusion by
elimination, not an observation, and it should be reported that way. In the live instance the
account sat inside its allowance with nothing ever billed *and jobs were still refused* — which the
two exclusions do not explain and do not need to.

**The elimination does not close, and the reason is a blind spot in the endpoint rather than in the
reasoning.** That data reports *metered usage* only: summed across every product and every month of
the year it returns `0.0000`, but the products it can report are usage-billed ones. A subscription
charge is never a usage row, so it cannot appear there at any value, and a failed subscription
payment is therefore **invisible to this test while satisfying every observation** — nothing metered
billed, allowance intact, private jobs refused. The payments branch was recorded as excluded when it
had only been left unmeasured, which is the stronger error of the two: an absence produced by a
population that cannot contain the thing sought.

**And a second month settles what the allowance argument could not.** The prior episode occurred in a
month whose private-repo consumption was **18 minutes against an allowance of 2,000**. No plausible
accounting exhausts a budget at under one percent of it, so exhaustion is refuted for that episode
outright rather than merely unproven — and with it the inference from onset dates clustering near a
day of the month, which needs exhaustion as its mechanism. Take the second period before generalising
a metering explanation from one.

**A refused-run episode is bounded by observations, not by dates, and its edges are only as tight as
the runs on either side.** Classifying a member's complete history — 102 runs, all of them, with the
tally printed so an empty classification could not pass as a clean result — gave 74 refused against
28 executed and put the earlier episode's first refusal more than a fortnight before it had been
reported, making the current outage a second recurrence of a standing condition rather than a novel
event. That much is measurement. But the episode's *right* edge is not: the last refusal and the next
execution are **seven days apart with no runs at all in between**, so the recovery happened somewhere
inside an unobserved week and the episode is a lower bound of twenty days, not a length of twenty
days. The clean interval that followed is likewise five observed days, not the twelve the calendar
suggests. **Report an episode as the closed interval you observed plus the open interval you did
not**, and never let a quiet stretch be read as a measured state — the same error, in the same
investigation, that had already been withdrawn once for resting on an unobserved gap.

**The visibility split that looked decisive discriminates nothing.** Public repositories do not
consume the allowance, so a table of private-refused against public-clean is predicted identically by
both branches, and it was read as evidence for one of them. The step that failed was the claim that a
payment state, being account-scoped, must be visibility-independent in its *effects*: the state is
account-scoped, its effect on runs is not, because it can only bite where usage is billed. **A
control chosen along an axis that one arm is exempt from is not a control**, and the exemption here
was a documented free tier rather than anything subtle. Check that both arms are actually exposed to
the axis before treating a clean split as discriminating.

Non-Linux runners carry a minute multiplier — macOS bills at 10x and Windows at 2x — so adding a
single macOS job can exhaust a budget that Linux jobs had comfortably fit inside. Budget for the
multiplier when you add one, and prefer `ubuntu-latest` unless the job genuinely requires the
platform (Swift and Xcode toolchains do; Node builds do not).

**The multiplier is paid by the caller and chosen by the callee.** Calling a reusable workflow adds
no `runs-on` you can see, so a member inherits a billing profile selected in another repository.
Across canon exactly one workflow carries a billed tier — `reusable-native-smoke-test`, whose `ios`
job is `macos-15` and whose `windows` job is `windows-latest`; every other canon workflow is
`ubuntu-latest` throughout. Four lines of `uses:` is therefore the most expensive edit available,
and nothing at the call site says so.

This is the **same shape as the caller-permissions trap** above: the caller cannot see the callee's
requirements, and the failure surfaces somewhere that does not name the cause. The two differ only in
latency and legibility — permissions fails immediately as an unreadable `startup_failure`, where
runner cost fails weeks later as a spending-limit refusal, attributed to whatever happened to run
most recently. Per the rule above, that is the scheduled sync.

**A `runs-on` census undercounts precisely the members most exposed to this**, because a repo that
only calls reusable workflows declares none of its own. `jrmoulckers/libro` is the case: its single
`ci.yml` has **zero** `runs-on` lines and **five** `uses: jrmoulckers/.github/…` lines. Its runners
are entirely inherited. So count the callee's runners for every `uses:`, and read a zero from
`grep runs-on` as *not measured* rather than *none*.

**Check what the blocker actually gates before deferring work to it.** This outage stops jobs from
starting; it does not stop anything from being read. A member deferred a static conformance check —
one that reads a committed lockfile and the working tree, with no runner and no network — on the
grounds of the billing block, then ran it during the outage in thirty seconds to demonstrate the
point. **CI availability and data availability are different units**, and a live blocker on one
reads as a blocker on both because the outage is genuine and the deferral therefore never feels like
a decision.

Note the direction. Most conflations here let something through: a check passes that should not
have, and the resulting artifact is wrong and inspectable. This one holds something back — and a
deferral leaves **no artifact at all**. Nothing fails, nothing is recorded, and the only evidence is
work that silently did not happen, so a false block is strictly harder to detect afterwards than a
false pass. When you cite a blocker as the reason for not doing something, name the specific
capability it removes and check the deferred work needs that capability.

### Taking only part of `reusable-ci-lint`

`reusable-ci-lint` carries three independent checks — lint, format-check, and Conventional-Commits
PR title — and each is opt-out, so never inline a local copy of one of them:

- No ESLint/Prettier in the repo? Pass `lint-command: ''` and `format-check-command: ''`. The lint
  job then skips entirely (no checkout, no install) and only the PR-title check runs.
- Have a linter but no formatter (or vice versa)? Empty just the one you lack.
- Can't grant `pull-requests: read`? Pass `semantic-pr-title: false`.

```yaml
permissions:
  contents: read
  pull-requests: read

jobs:
  pr-title:
    uses: jrmoulckers/.github/.github/workflows/reusable-ci-lint.yml@<reviewed-commit-sha>
    with:
      lint-command: ''
      format-check-command: ''
```

Passing an empty string is the supported opt-out. Leaving a command at its default in a repo that
has no such script fails the job; duplicating backbone logic locally makes the product repo drift
from canon.

### Smoke testing a native-first release

`reusable-smoke-test` is web-shaped: one job, a Node toolchain, and an optional HTTPS probe against
a deployed site. Use `reusable-native-smoke-test` instead when a release ships native artifacts and
a green web check would leave Android, iOS, or Windows unvalidated.

It runs `validate`, then one job per selected platform, then a `summary` that reduces the verdicts
to a single `result` output a release workflow can gate on. Unselected platforms are reported as
skipped and count as a pass; a selected platform that fails, fails the run.

```yaml
permissions:
  contents: read
  packages: read          # the web job installs Node dependencies

jobs:
  smoke:
    uses: jrmoulckers/.github/.github/workflows/reusable-native-smoke-test.yml@<reviewed-commit-sha>
    with:
      version: ${{ github.ref_name }}
      platforms: android,ios,web
      ios-scheme: ExampleApp
      package-manager: pnpm
      build-command: pnpm --filter web build
```

Narrow `platforms` on non-release runs: the iOS and Windows jobs use macOS and Windows runners,
which bill at a higher rate than Linux. Remote build caches are not accepted — builds run cold and
Gradle's cache is read-only, so a release is validated from source rather than from a cache.

### Build once and reuse same-run artifacts

`reusable-ci-web` optionally uploads a validated directory when `artifact-name` is set. Preview,
performance, and smoke jobs accept that exact same-run artifact name. The caller must declare
`needs` so the producer completes first; consumers do not accept a repository, run ID, or token, so
they cannot fetch cross-run or cross-repository artifacts.

```yaml
jobs:
  web:
    uses: jrmoulckers/.github/.github/workflows/reusable-ci-web.yml@<reviewed-commit-sha>
    with:
      artifact-name: web-build
      artifact-path: dist

  performance:
    needs: web
    uses: jrmoulckers/.github/.github/workflows/reusable-perf-budget.yml@<reviewed-commit-sha>
    with:
      artifact-name: ${{ needs.web.outputs.artifact-name }}
      output-dir: dist
```

At the caller workflow level, use a ref-scoped group for superseded CI runs:

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Never pass an untrusted artifact into a job with secrets or write authority. `reusable-deploy-pages`
does not accept an arbitrary artifact: its unprivileged build job creates the fixed Pages artifact,
and its environment-gated deploy job only calls GitHub's deploy action with `pages: write` and
`id-token: write`.

### Security and preview boundaries

- Reusable commands are trusted repository configuration. Pass literal workflow values, never event
  titles, branch names, issue text, or other untrusted data.
- Never use `secrets: inherit`. `NODE_AUTH_TOKEN` is the only secret any canonical reusable workflow
  accepts, it is optional, and it must be passed explicitly when it is passed at all. When it is
  omitted the workflow falls back to the job's `GITHUB_TOKEN`.
- Preview canon is artifact-only. The removed `provider`, `preview-command`, `DEPLOY_TOKEN`, and
  `preview-url` contracts must not be recreated. Provider deployments require a separate reviewed
  job, a protected environment, explicit secrets, and no PR-controlled arbitrary shell.
- Lighthouse reports remain private GitHub artifacts by default. Enable
  `lighthouse-public-upload` only for an intentionally public, unauthenticated URL after accepting
  that report data will leave GitHub's private artifact boundary.

### Installing from a private registry

`reusable-ci-lint`, `reusable-ci-web`, `reusable-deploy-pages`, `reusable-deploy-preview`,
`reusable-perf-budget`, `reusable-smoke-test`, and `reusable-native-smoke-test` accept optional
`registry-url` and
`registry-scope` inputs plus an optional `NODE_AUTH_TOKEN` secret. Leave all three unset and the
run is unchanged: `actions/setup-node` ignores an empty `registry-url` entirely and writes no
`.npmrc`, and no token is placed in the install step's environment.

For GitHub Packages this is zero-config — pass no secret at all:

```yaml
permissions:
  contents: read
  packages: read

jobs:
  web:
    uses: jrmoulckers/.github/.github/workflows/reusable-ci-web.yml@<reviewed-commit-sha>
    with:
      package-manager: pnpm
      registry-url: https://npm.pkg.github.com
      registry-scope: '@jrmoulckers'
```

`NODE_AUTH_TOKEN` resolves as `secrets.NODE_AUTH_TOKEN || github.token`, so the job's
`GITHUB_TOKEN` is used unless the caller passes its own. Pass an explicit secret only for a registry
`GITHUB_TOKEN` cannot reach:

```yaml
    secrets:
      NODE_AUTH_TOKEN: ${{ secrets.MY_REGISTRY_PAT }}
```

Rules and interactions:

- **Authentication and authorization are separate.** A token is always required: the registry
  rejects an unauthenticated read with `401` even for a **public** package. Package visibility only
  decides *who* is allowed, not *whether* credentials are needed. So `packages: read` and a token
  stay mandatory regardless of visibility, and flipping a package to public is never a reason to
  drop either.
- Authorization depends on visibility. A **public** package needs no grant — `GITHUB_TOKEN` can read
  it. A **private** package must additionally grant the consuming repository read access under the
  package's **Manage Actions access** settings, which GitHub recommends over storing a PAT. A `403`
  (`permission_denied: read_package`) means authentication succeeded and authorization failed, so it
  points at the grant or the package, not at the token being absent.
- `packages: read` is required for `GITHUB_TOKEN` to read a GitHub Packages package at all, and a
  caller `permissions:` block must grant it. **If the caller omits it the entire run fails at
  startup**: no jobs are created, no check-run is produced, and there is no log to read — the only
  surface text is a generic "workflow file issue". The failure is whole-run, not per-job, so
  unrelated valid jobs in the same workflow file do not run either. Nothing inside a reusable
  workflow can detect or report this, because the permission ceiling is enforced before any job
  exists; it can only be caught by inspecting caller workflows before the run.
- `registry-scope` requires `registry-url`. Setting `registry-url` without a scope replaces the
  **default** registry for every package and emits a warning.
- `actions/setup-node` writes its `.npmrc` to `$RUNNER_TEMP/.npmrc` and exports
  `NPM_CONFIG_USERCONFIG`, so it is **user**-level config. A repo's own committed `.npmrc` is
  **project**-level and outranks it on every key it sets, for both npm and pnpm. A project `.npmrc`
  that points the same scope at a different registry wins and the install still fails; either delete
  that line or keep it byte-identical. A project `.npmrc` that only sets unrelated keys is fine.
- pnpm reads `NPM_CONFIG_USERCONFIG` and expands `${NODE_AUTH_TOKEN}` the same way npm does, so no
  extra pnpm-specific step is needed. `setup-node` always exports `NODE_AUTH_TOKEN` (a placeholder
  when the secret is absent), which keeps pnpm's env-expansion from erroring.
- The token reaches the install step only when `registry-url` is set. A run that does not configure
  a private registry gets an empty `NODE_AUTH_TOKEN`, so a `GITHUB_TOKEN` is never exposed to
  dependency lifecycle scripts on the default path. A consequence worth knowing: passing
  `NODE_AUTH_TOKEN` *without* `registry-url` has no effect, because there is no `.npmrc` to consume
  it.
- `reusable-security-ci` needs none of this. `npm audit` and `pnpm audit` send the bulk advisory
  request to the **default** registry, never to a scoped one, so a private scoped package in the
  lockfile does not trigger a `401`. Pointing the *default* registry at GitHub Packages does break
  audit, but with `ENDPOINT_NOT_EXISTS` (no audit endpoint) rather than an auth error — a token
  would not fix it. Note that audit does transmit private package names and versions to the default
  registry.

### Never vendor a backbone workflow or health file

`workflows` and `health` are **native** kinds: they reach product repos through GitHub itself, not
through the sync engine, which resolves and reports them but never writes a file for them. So a
product repo must contain **no copy of its own**:

- **No `.github/workflows/reusable-*.yml`.** Call the backbone's with
  `uses: jrmoulckers/.github/.github/workflows/reusable-*.yml@<reviewed-commit-sha>`, never
  `uses: ./.github/workflows/reusable-*.yml`. A vendored copy is a silent fork: upstream fixes never
  reach it and nothing flags the divergence.
- **No `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `PULL_REQUEST_TEMPLATE.md`,
  `ISSUE_TEMPLATE/` or `DISCUSSION_TEMPLATE/`** unless you are deliberately overriding the studio
  version for that repo. GitHub prefers a repo's own health file over the one inherited from
  `jrmoulckers/.github`, so a verbatim copy overrides the inherited file and freezes it at the day
  it was copied.

  If you *are* overriding deliberately — because the repo needs product-specific security content
  that cannot live in canon — that is allowed, but you own the consequence: the file is a fork with
  no update path, and canon changes will never reach it. Re-read canon when it moves.
  **Do not restate canon's policy in your own words in order to differ from it in one place**; check
  first whether canon already offers a variant you can select. Its security policy defines two
  support postures precisely so that a continuously-deployed product can *select* the right one
  rather than file a deviation against the other
  ([ADR-0010](https://github.com/jrmoulckers/.github/blob/main/docs/architecture/0010-selectable-support-postures.md)).

In both cases a local copy is **worse than having nothing**, and the sync engine cannot rescue you
— it never writes native kinds, so it can neither update the copy nor report it as drift. If you
find one in a member repo, delete it; that is the whole fix.

Opting in to `health` or `workflows` in `studio.config.json` means *"this member relies on the
backbone's"* — it is a declaration, not an install.

### Exclude synced canon from your formatter

Canon is authored upstream and is **not** formatted to your Prettier config, so `prettier --check .`
over your whole tree fails on files you do not own and must not fix — editing them is drift, and the
next sync skips the file. Your ignore file is member-owned, so **the sync cannot add this for you**:

```
# synced from jrmoulckers/.github — canonical source, not authored here
.github/agents/
.github/skills/
.github/prompts/
.github/instructions/
.github/copilot-instructions.md
AGENTS.md
```

**Treat that as an example, not the specification.** The rule is keyed to `.studio-sync.lock.json`:
your ignore file must cover every lock path your formatter can parse, and must be re-checked whenever
the sync starts emitting a new one. Written as a fixed list it goes stale on exactly the event that
matters — a new canon kind landing in a formatted path — and then reads as complete while being wrong.
Machine-read files no formatter touches need no entry; resolve that with Prettier's `getFileInfo`
rather than by pattern-matching.

The exclusions are **whole-file even for `AGENTS.md`**, which is only partly canonical: a formatter
cannot be pointed at half a file, and the managed region must stay byte-identical to canon or the sync
stops matching.

**Sequence the two changes: ignore before deliver, never deliver before ignore.** An ignore entry
for a path that does not exist yet is inert, so it can land at any time; the canon file landing
first
puts an unformatted path on `main` and fails the check immediately. A member holding both an
ignore-entry PR and a sync PR must merge the ignore one first, and one member's earlier sync PR was
closed unmerged for precisely this reason.

**And expect this rule to be satisfied only where CI runs.** Because it is member-owned and
member-verified, it is enforced exactly in the repositories whose checks execute and unenforced
exactly in those whose checks are refused. Measured across eleven members, every member with working
CI carried the entry and five of six with blocked CI did not — the sixth being the one member whose
sync PRs merge. **The population that cannot check is the population that needs checking**, so
sampling the observable members returns a result that is not merely unrepresentative but
anti-representative. The consequence is that the failure is synchronized rather than gradual: when
the billing gate clears, four members fail `prettier --check` on their existing `main` at once and a
fifth fails on its next sync merge, which will present as a regression caused by the unblocking
rather than revealed by it. Audit member-owned prerequisites from the hub before lifting a gate, not
after.

When auditing that way, **detect file presence from the request's exit status, not from the
truthiness of its body.** A sweep using `gh api ... --jq '.size'` reported every member as holding
the file, because a 404 still emits an error document and any output read as present — a uniform
column that looks like a clean result and is the same shape as any other constant standing in for a
measurement.

If you build a coverage check for this, three traps are known to be live:

- **`inferredParser: null` means both "no parser" and "ignored".** Treating it as "nothing to format,
  therefore safe" folds every correctly-ignored path into the safe bucket, and the tell is that
  **inverting your ignore list leaves the result unchanged**. Make two calls — `resolveConfig` for the
  parser, `ignorePath` for `ignored` — and report a gap only when `parser && !ignored`.
- **Ignore patterns anchor to the ignore file's own directory.** Passing an `ignorePath` from outside
  the repo root silently stops slash-containing patterns such as `.github/agents/` matching while bare
  ones such as `AGENTS.md` keep matching at any depth. It reads as partial coverage, not as a broken
  harness; one member measured 57 false gaps this way.
- **Do not re-implement a parse the engine already performs.** A member scanning this file for
  Markdown headings with `^#{1,4} ` counted 12 fenced `#` comment lines as headings — a 43% inflation
  — because `#` is a heading in Markdown and a comment in `.prettierignore` and `.gitattributes`. The
  engine masks fenced blocks before matching and has a test pinning it; a re-implementation inherits
  neither. Conform against the engine's **output** where you can.
- **That entry was in this file for fifteen hours before its author repeated the defect it describes.**
  The same naive count was then run against a member's copy and against canon, inflating both — 46 for
  23 where the masked figures are 36 and 19 — and the difference was published as a delivery gap. What
  makes it more than a lapse is the shape of the entry: it bundles a **parameter** (the regex depth)
  with a **procedure** (mask fenced blocks before matching), and only the parameter survived recall.
  A parameter is concrete, local, and costs nothing to carry; a procedure requires restructuring the
  query and is dropped under exactly the conditions that make a rule worth having. When writing a rule
  that pairs the two, state the procedure as the rule and the parameter as an aside, or the reader —
  including you — will keep the wrong half.
- **Subtract sets, not counts, because subtraction silently assumes containment.** The corrected census
  was reached as `36 - 19 = 17`, and the set difference is also 17 with zero headings present in the
  member and absent from canon — so the arithmetic was sound, but it was sound *unverified*. A count
  difference and a set difference coincide only when one side contains the other, which is the property
  a delivery census exists to test.
- **A length taken from a decoded string is not a byte count.** A probe reported `215641` bytes for a
  file that is `216488` bytes; `String.length` in JavaScript counts UTF-16 code units, and the
  847-unit gap is exactly the file's non-ASCII characters. The error is invisible on ASCII-only inputs,
  scales with prose punctuation rather than with size, and survives every internal consistency check
  because the number is stable and reproducible. Where a figure will be compared against a stored size
  or a hash, take the length of the buffer, not of the string.
- **And a length is a property of the retrieval path as much as of the encoding.** One issue body,
  fetched three ways in a single command, gives `10094` code units, `10138` UTF-8 bytes, and `10256`
  when the same REST field is passed through the shell's string conversion — the last because the
  body's 160 line feeds are rejoined with CRLF and a trailing newline is appended, and re-joining
  with LF instead reproduces `10094` exactly. All three are correct answers to different questions.
  This single mechanism accounts for discrepancies chased separately as three defects: sizes that run
  uniformly `+1`, a code-unit-versus-byte gap, and one artifact published at two sizes within the same
  message. The transformation is inserted **between** the API and the measurement, so it is in neither
  the document nor the arithmetic, and re-reading either one forever will not find it. State the
  retrieval path and the unit beside any size, and compare sizes only across identical paths.
- **A line-counting cmdlet fed a pipeline can silently drop the blank lines.**
  `Measure-Object -Line` skips empty strings, so it undercounts by exactly the blank-line count when
  its input is an **array**, and is correct when the same content arrives as one joined string. On
  this file that is the difference between `3689` and `4319` — a 14.6% error, published here in a
  standing header as a line count. Every `git show |` and `gh api |` produces an array, so the wrong
  form is the one that falls out of ordinary use, and the right form needs an `Out-String` that
  looks like a no-op. The trap is that **the instrument is correct exactly when it is tested in
  isolation**: a two-line check on a string literal passes, which is why this survived being
  diagnosed here in its `.Length` form and reappeared in a different cmdlet hours later. Probe a
  counting instrument with input that has the *shape* the real call site produces, not merely the
  content.
- **A difference between two counts is invariant to a shared convention; the counts themselves are
  not.** The same file measured two ways gives `489/490` lines and `3316/3317`, depending only on
  whether a trailing newline yields a final empty field — and a comparison that draws one figure
  from each convention manufactures an off-by-one in the one place it cannot cancel, between two
  parties' numbers. Yet the *shortfall* is `2827` under both, exactly, and the *share* is `14.7%`
  against `14.8%`. So when a convention is unstated and cannot be pinned, report the difference or
  the ratio and not the operands: subtraction cancels a constant offset exactly, a ratio cancels it
  to within its own magnitude, and only the bare count carries it undiminished. Here the two figures
  that survived a three-figure audit were precisely the two that were not absolute counts, and they
  survived for that reason rather than because they were measured more carefully. **The immunity is
  to a *constant* offset, and not every offset is constant.** The blank-line discrepancy above is
  14.6% of length, so it scales: a ratio of two blank-stripped counts stays approximately right
  while a difference of them does not, which inverts the usual ordering — the shortfall is poisoned
  and the share largely survives. Before relying on the cancellation, ask whether the suspected
  offset is additive or proportional, because the two are protected by opposite statistics.
  **But an invariant can also hold for a reason local to where the change fell, so reproducing it
  is not evidence that
  it is robust.** A peer's corpus difference of `204` reproduced here exactly against a corpus whose
  raw total had moved from `49814` to `81280` — because all `31,466` units of growth landed in the
  one body that contains no CRLF at all. The quantity the difference cancels was untouched by the
  change, which is luck about the location of an edit, not a property of the statistic.
  **And that same cancellation makes a ratio anaesthetic rather than merely uninformative.** Two
  delivery figures published from here were each low by exactly one byte while their canon
  denominator was exact; the offset very nearly cancelled in the quotient, and a second defect — a
  line ratio printed beneath a table of byte operands — moved the answer only half a point, inside
  any tolerance a reader grants such a figure. Neither could surface from the ratio, and both fell
  out the moment a third party recomputed from the operands. **A ratio absorbs operand error in
  proportion to how well the operands agree**, which is exactly the case in which nobody examines
  it, so the property that makes it robust is the property that makes it silent. Publish both terms
  with the revision and the time each was taken at, and let the reader form the quotient.
  **Characterise a defect class by its smallest expression, not its most memorable one.** The
  one-byte error and a 14.6% blank-line error came from the same array-versus-string boundary on the
  same night: a pipeline that yields lines rather than bytes, rejoined without its terminator in the
  first case and counted without its empties in the second. The large one was caught within the hour
  by its own implausibility; the small one survived three hours, two messages and a published ratio,
  and was found only by an outside recomputation. The instance that teaches the lesson is selected
  for being visible, which is precisely the instance that was never dangerous.
- **The terminator carries its own convention, and a scalar count of line endings conflates it with
  the body's.** Sweeping all 57 issue and pull-request bodies in one member, 12 are "mixed" by a
  CRLF count — but in 10 of those the single CRLF sits at exactly `len - 2`, so the body is pure LF
  with a CRLF terminator, and only 2 are mixed throughout. The count reports all 12 alike. Nor is
  the convention stable within one object: across 26 revisions of a single issue the CRLF count runs
  `0, 0, 49, 67, 0` and then zero for twenty-two more, so it is a property of the **writing act**,
  not of the document, and *this body uses CRLF* is not a fact that survives its next edit.
- **A terminator remedy is specific to the transport, not to the field it was found on.** Stripping
  a trailing newline is correct for a shell-piped fetch, which appends one. Carried over by field
  name to a GraphQL read, which has no shell in the path, the same strip deletes real content — and
  on a body ending in twelve significant newlines it silently broke a true equality and reported
  *no match*. It failed toward the reassuring answer, so nothing prompted a second look. **A
  correction migrates into a defect when it is filed under the name of the field it was found on
  rather than the mechanism that produced it**, and the migration is invisible because the rule
  still cites a real result.
- **And the same misfiling fails in the opposite direction, which is why catching one instance
  buys no protection against the other.** A second session documented the rerun timestamp drift as
  a property of `gh run list`, then walked into the identical artifact in a **run object** hours
  later — having filed the hazard against an instrument rather than against a mechanism, they never
  looked for it anywhere else. So filing a finding under *where it was found* both carries a remedy
  to places its mechanism does not reach and withholds it from places it does, and the two look
  nothing alike in review: over-application surfaces as a rule citing a real result in the wrong
  place, while under-application surfaces as nothing at all — a known bug hit a second time by the
  party who documented it. **Name the mechanism, and list the instruments it has not yet been
  checked against**, because that list is what the next reader needs and it is the part nobody
  writes down.

Introducing a canon kind that lands in a formatted path is a **cross-repo event**: every affected
member needs its ignore entry before its sync PR can go green. The `copilot` kind's first distribution
failed CI in four members for exactly this reason.

## Merge Conflict Protocol

Treat conflicts with the same urgency as red CI.

**Git detects textual overlap, and the dangerous staleness in a long-open PR usually has none.** A
branch that adds a *new* file at a name someone else has since claimed produces no conflict at all,
because the two changes touch different paths — the collision is in a namespace, not in any line. A
PR open here since `2026-08-07` adds `docs/architecture/0002-four-authority-topology.md`; that ADR
landed months-equivalent ago as `0003-four-authority-topology.md`, and `0002` now belongs to a
different decision entirely. Merging it would add a duplicate ADR under a number that means something
else, and nothing in git would object.

What makes this worth its own rule is that it defeats the review habit the rest of this document
recommends. The diff is coherent, the branch is self-consistent, and its contents are exactly what
they were when they were correct — **a stale branch's own contents can never tell you that it is
stale**, because supersession happened outside it. So for any change that claims a *new named slot*
— an ADR number, a migration id, a fixture path, a workflow filename — validate the name against the
destination as it is now, not against the branch. `git ls-tree main <dir>` before merging is the
whole check.

The disposition also differs from a conflict: a superseded branch is **closed**, not resolved. If its
content already exists on the default branch, rebasing it produces a clean, mergeable, wrong change.

Detect every polling cycle:

```bash
gh pr view <number> --json mergeable,mergeStateStatus,headRefName
```

| State | Action |
| --- | --- |
| `MERGEABLE` + `CLEAN`/`UNSTABLE` | Continue monitoring CI. `UNSTABLE` never means mergeable-with-caveats: resolve it against the checks. |
| `MERGEABLE` + `BEHIND` | Rebase on the default branch and re-push. |
| `CONFLICTING` or `DIRTY` | Run the auto-resolve cycle. |
| `UNKNOWN` | Wait briefly and re-poll. |

**A `skipped` check has two causes and only one is a problem, so resolve it rather than accepting or
rejecting it.** A conditional job — `if: needs.changes.outputs.agent == 'true'` — reports `skipping`
both when its path filter legitimately matched nothing and when the upstream job it depends on never
ran at all. Demanding `success` unconditionally deadlocks the first case; accepting `skipping`
admits the second, which is how an unscheduled run passes for green.

Assert instead that the job reached a terminal state **consistent with its own precondition**:
compute the precondition independently — replay the path filter against the PR's real diff rather
than reading the regex — and require `success` only where it holds. Do not ask *did it run*; ask
*should it have run, and did it*.

**`neutral` is the same state under a different name, and the fix that closed `skipping` admitted it
in the same sentence.** The repair enumerated the conclusions it had decided were acceptable —
`success` or `neutral` — while reasoning only about `skipping`; `neutral` came along as "not a
failure." But `neutral` means *completed without asserting a judgment*, which is the property that
made `skipping` dangerous. GitHub's own branch protection treats it as passing, so it clears a gate
having checked nothing. Actions jobs effectively never emit it, which is why it survives review on a
member repo; **third-party check runs emit it routinely** — a coverage reporter with no baseline, a
linter that owns no changed files — and a fleet-wide instruction governs those by construction.

The remedy is not a narrower enum, which would deadlock the checks that legitimately have nothing to
assert. It is to stop treating the conclusion as a verdict and route **both** no-assertion states
through the precondition test above. `skipped` and `neutral` are one bucket with one handler, and
neither is a green value. Enumerating outcomes is what failed here; asserting the property is what
survives a state the author has not met yet.

**A dead permissive arm is not harmless the way a dead guard is inert.** No `neutral` exists anywhere
in this fleet — six repositories scanned, zero instances — and canon elsewhere declines to build a
guard that has nothing to catch. That rule does not transfer, because **adding a check and removing
an exemption have opposite risk profiles when neither has a live instance.** An inert guard does
nothing until someone gives it work; an unexercised exemption does nothing until the first case
arrives, and then it fires *permissively*, silently, on the reading that looks green. Absence of an
instance is a reason not to add machinery and never a reason to keep an allowlist entry: the missing
instance is precisely what stops anyone noticing the entry was wrong.

**But "has it fired?" is the wrong question, and a better one reads off the code: when this arm
fires, what still fails if the artifact is wrong?** An exemption is dangerous in proportion to what
remains asserted after it fires, not in proportion to whether it has fired. Allowlisting `neutral`
narrows a gate from *{did this check pass}* to *{}* — nothing remains, which is why its first live
instance would have been silent. An exemption that skips one assertion while another still runs
narrows *{a, b}* to *{a}*, and is inert rather than a trapdoor. **`nothing` is the alarm.** That test
costs one reading of the branch, where counting instances costs a fleet scan and answers a weaker
question.

**Non-empty is necessary and not sufficient: the surviving assertion must be load-bearing for the
same fault.** A residual that tests a different property leaves the exemption exactly as open as an
empty one, while looking safe. The engine supplies the instance. A member's content hash is the
obvious residual to lean on — but `enumerateTokenTargets` in `assets.mjs` sets
`content: inject(targetPath, raw)` and `planFile` in `copier.mjs` records `hashText(rendered)` into
the lock, so **the hash's reference is the
engine's own output.** It detects a member drifting from what the engine produced and is structurally
incapable of detecting the engine producing the wrong thing. When the frontmatter emitter injected a
stamp *inside* a YAML block scalar, the defective output would have been hashed into the lock,
matched on every subsequent run, and reported clean forever. So "the hash still asserts" is a real
residual for tampering and an empty one for correctness, and which of those the exemption was
covering decides whether it is inert.

Keep the justifications separate, too. An exemption that mirrors a genuine engine property — a
`.json` target cannot carry a comment, so a marker check must skip it — is justified by
**conformance**, and that argument stands whether or not anything else asserts. Stacking a weak
safety argument beside a strong conformance one lets the strong one launder the weak one, and the
weak one is what gets reused as precedent somewhere the conformance argument does not hold.

**A deliberately permissive direction is not a blind spot if it announces itself.** The sync engine
is asymmetric about reusable workflows on purpose: an *undeclared use* is a hard error
(`member-facts.mjs` raises `workflow availability does not declare checkout use …`, pinned by test),
while a *declaration with no caller* passes. That is the same permissive shape faulted above, and it
is correct here, because the gap between declaring availability and migrating callers **is** the
migration window — making it an error would forbid doing the two steps in the only order that works.
What keeps it from being a blind spot is that the tolerated state is **logged** every run
(`reusable workflow availability not currently called: …`, emitted from two call sites). The
distinction to carry: a permissive branch that is *silent* hides its own population, while one that
*prints* is an observation anybody can act on. **When you deliberately allow a state, make it
announce itself, and it becomes a window rather than a hole.**

The ordering consequence is load-bearing and easy to invert: because undeclared use is fatal and
unused declaration is benign, **availability must be declared before any caller migrates**. A member
that switches its callers first fails its own sync until the declaring change lands — so a config PR
that looks like tidy-up can be the prerequisite, and reading it as a follow-up leaves the migration
blocked with no obvious cause.

**Rank a shared default by its worst caller, not its typical one, and read/write is usually that
split.** The same `markers = MARKERS.html` default sat on a reader and a writer in this engine, and
the two ends are on opposite rows of the severity table. Given to the reader, a wrong marker set
matches nothing and returns zero regions — wrong, but loud and safe, and it fails in the direction
that gets investigated. Given to the *writer*, it emits `<!-- … -->` into a file where that is not a
comment: in `.gitattributes` those lines become patterns git tries to match, so the output is
corrupt rather than absent. **A default is not a single decision with a single severity** — it
inherits the blast radius of whichever caller it reaches, so auditing the one you happened to notice
understates it. The reader is the one you notice, because a missing region is visible; the writer is
the one that matters.

Auto-resolve only mechanical conflicts you understand: whitespace, import order, regenerated files, changelog ordering, or lockfiles recreated by the repo's package manager. Escalate semantic conflicts such as same-function edits, schema changes, security-sensitive logic, or incompatible refactors.

Use `git push --force-with-lease` only after a rebase on your own PR branch. Never use plain `git push --force`.

## Fleet Coordination

For parallel sprint work:

1. Query issues and PRs.
2. Resolve applicable roles from root/scoped `AGENTS.md`, consumer `.github/instructions/`, and
   declared local routing. A discovered `.github/agents/` file alone does not authorize dispatch;
   exclude disabled, handoff-only, read-only, and out-of-scope roles.
3. Track assignments in SQL todos.
4. Batch small related issues only when they touch the same files and keep the PR under reviewable size.
5. Publish a merge order for dependent PRs.
6. Re-dispatch failed or incomplete agents until every PR is green and mergeable.

### Acknowledge by the timestamp of the message you are answering

Open a reply with the send time of the message it answers:

```
Re: your 03:57Z —
```

Messages between sessions cross, and a reply's *content* cannot disambiguate which message it
answers, because topics recur: a retraction and the entry it retracts are about the same subject, so
an answer to the earlier one reads as a rejection of the later one. Naming the time makes it
self-checking at zero cost. **If an acknowledgement names a time earlier than your last send, it
crossed** — you know without asking, and you can re-send rather than assume you were overruled.

It also creates a third state where there were two. Silence is ambiguous; silence plus an
acknowledgement of an older message is *distinguishable*, and distinguishable is the whole
requirement. This was proposed after four crossings in one evening, one of which put a claim into
canon twelve minutes after its author had withdrawn it — **a retraction that crosses is
indistinguishable from one that was never sent**, and the cost is paid by whoever acts on the stale
half.

### Cite by name, and resolve the name as a heading

Prefer a section name over a line range when pointing at any document. A line number is invalidated by
an edit made **above** it — an act that is correct, unrelated, elsewhere, and produces no diff at the
citation site, no conflict, no failing check, and no notification to anyone holding the reference. A
name survives edits above it and degrades to a search rather than to silence.

When a coordinate is used anyway, **prefer a range to a point**. The ordering is `name > range >
point`: a range absorbs drift up to its own width, so it keeps resolving after an edit above it that
would leave a point resolving to the wrong place. Measured on a real case, a passage cited as
`785-803` sat at `785`, moved to `794` a revision later — still inside the range, still correct — and
had left the range entirely by the revision after that. So a range **buys revisions, not
permanence**. It degrades gracefully rather than immediately, which is a genuine advantage over a
point and is not immunity; it does not make a coordinate durable, and it does not displace the name.

**Decay is not a rate, and treating it as one is what makes a coordinate feel safe.** A correspondent
proposed that citations decay at "roughly one exchange," inferred from three consecutive corrections
landing in three consecutive messages. Measured against the repository over the 27 commits following
that claim, the model does not hold — and their own message supplies the counterexample:

| coordinate cited | commits touching that file | outcome after 27 commits |
| --- | --- | --- |
| `runner.mjs` L55/L58 | **0** | exact, unmoved |
| `member-facts.test.mjs` 213/369 | **0** | exact, unmoved |
| `copier.mjs` 240 | 1 | still correct |
| suite count `322` | 2 test files gained tests | **wrong — 326** |
| `workflow.instructions.md` | **22 (+630 lines)** | any point cite destroyed |

So elapsed exchanges predict nothing. **Decay is a step function keyed to edits of the cited
artifact, and it is invisible to the citer**, who cannot see the commit that will move their line and
receives no notification when it lands. Correcting the model *strengthens* the name-based rule rather
than weakening it: a rate would be budgetable — re-check every N exchanges — and there is no rate to
budget against. A coordinate is either untouched for a day or wrecked in a single commit, and nothing
observable from the citing side distinguishes the two beforehand.

Two consequences worth carrying. **Fragility tracks the edit rate of the target, so the surface that
most needs name-based citation is the most-edited one** — and here that is the member-facing canon
itself, which absorbed 22 of those 27 commits. Highest reach and highest churn coincide, which is why
a line citation into distributed instructions is the worst case rather than an average one.

And **the coordinate that actually decayed was the one not recognized as a coordinate.** The two
flagged as fragile survived untouched; the figure that failed was a test count, which reads as a
property of the repository rather than as a pointer into a file. Anything re-derived from an artifact
is a coordinate, whether or not it looks like an address.

But a name only helps if it names a **structural element**. `§ X` asserts that X is a heading; a
plain text search confirms only that those characters occur somewhere, and returns the same answer
whether the match is a heading, a bold lead-in, a table cell, or a line inside a fenced block. So
**resolve a cited name with a heading-anchored pattern (`^#{1,6}\s`) that masks fenced blocks, not
with a substring search.** The negative result is the informative one: a name that appears but is not
a heading is exactly the case a substring search reports as success.

This is not hypothetical. A citation in canon named a section that had never existed at any revision —
the string was real, at the line reported, but it was **bold paragraph text**, which gets no anchor
and so fails as both a heading scan and an in-page link. Two readers validated it independently, both
by content, both landed on the correct line, and both were wrong about what kind of thing was there.

Two failure modes, and checking for one does not check the other:

- **Stale line number** — right-shaped, wrong-valued. It resolves, to the wrong place.
- **Name that is not a heading** — fresh, wrong-shaped. It never resolved, and the obvious check
  reports success.

Both are the same mistake at different levels: reading Markdown as flat text rather than as
structure. Whichever form you use, **quote a sentence from the target** — but do not expect the quote
to settle it on its own.

**There is a third mode where every component is correct except the one nobody checks, and the
prescribed remedy above passes.** A sibling cited an array literal quoted verbatim and correctly,
against a coordinate that was also right:

```
cited   sync/lib/basemerge.mjs:144                            <- no such expression in this file
actual  .github/workflows/reusable-change-detection.yml:144   <- same coordinate, right file
```

`basemerge.mjs` contains no such expression anywhere. But it has a line 144, holding unrelated prose
about managed-region hashing, so the citation resolved to something plausible and dense enough to
read as confirmation. Quoting a sentence from the target does not catch it, because **the quote is
authentic; it merely does not come from the file named** — verifying it confirms the string exists
somewhere in the corpus and never tests the path.

A path-and-coordinate pair is a **compound** locator, and that is the general lesson: its components
key on different dimensions, a reader checks them jointly, and resolution exercises only one.
Resolution of the pair gets read as verification of both, and the compound additionally loses the
ability to say *which* half failed. The failure is silent whenever the named file is merely long
enough to have that line — for a corpus of similarly-sized technical files, nearly always. So check
the path independently of the coordinate and of the quote: grep the quoted string and confirm the
file it lands in is the file named. **A citation that resolves is not a verified citation.**

**The wrong path is usually attached fresh, not left behind.** The instance above arose from two
files open in the same segment of work that both happened to have a line 144 — one holding the
quoted text and one not — so the coordinate was correct, current, and measured against the other
document. Nothing about such a citation looks aged. **That is why this check keys on independence
rather than on freshness**, and the distinction is worth defending against a future edit that
"clarifies" it into a staleness check: a re-verification pass would pass it, because there is
nothing stale to find. Coordinate collision is the ordinary case rather than bad luck — across a
corpus of source files here, a line-50 citation resolves in roughly seven files in eight, a line-144
citation in two in five, a line-300 citation in one in five.

Note how this paragraph reached its present shape. It was first written with both locators inline in
prose, and `member-facing instructions cite code by name, not by line number` failed on it — the
standing check against coordinates in canon caught the entry documenting why coordinates fail. Its
own rationale supplied the fix: a fenced block **exhibits** a coordinate rather than depending on
one, which is precisely the distinction this passage needs, since the specimen is a defect on
display. **A rule strong enough to catch its own documentation is calibrated correctly**, and the
seam it fails at is usually the seam the writing actually needed.

**Every locator is blind in the dimension it keys on.** Content keys on words, so it cannot see
structure. A coordinate keys on position, so it cannot see content. A blob hash keys on bytes, so it
cannot see meaning. They are not ranked and none subsumes another: they span different dimensions,
and a given fault lands in one of them. The practical test for any locator someone proposes is to ask
what it keys on — that names its blind spot.

The case that establishes it: a member's decoder inflated a document, preserving every word while
destroying every line boundary. The quoted phrase resolved perfectly against the mangled text — it
had to, every word was present — and the only thing that dissented was the coordinate, which landed
past the end of the file. The fault sat exactly in the dimension content resolution cannot perceive.

That does not promote the coordinate. It fired by **arithmetic accident**: detection required the
inflated coordinate to clear EOF, and had the cited passage sat anywhere in the document's first 39%,
the same corruption would have produced a coordinate landing quietly *inside* the file on plausible
neighbouring prose, dissenting about nothing. A detector whose sensitivity depends on where you
happened to be pointing is not a detector.

So carry more than one locator, and resist collapsing the set to whichever member last proved useful
— that is the same move as choosing the instrument that worked most recently rather than the one that
addresses the fault in front of you. When two readers may be holding different artifacts, a **blob
hash** settles it in a single comparison; pair it with a quoted phrase and both failure modes are
covered, where either alone leaves one open.

**A hash carries a type, and the type is not in the hash.** Commit, tree, and blob hashes are forty
hex characters each and visually identical, so the one thing needed to resolve a hash — what kind of
object it denotes — is carried entirely by the prose around it, which is the only part not covered by
the hash. This rule was violated in the sentence introducing it: a message stating the blob-hash row
went on to report `main` as a hash that was the blob of the file under discussion, two paragraphs
after naming the merge commit correctly.

**Expect that error to arrive disguised as ordinary drift.** It stayed loud only because the reader
tried to resolve it as a commit and got a hard 422. Compared instead against their own recorded
commit for `main`, a blob hash renders as a plain mismatch — indistinguishable from *the branch moved
between readings*, which on a repo committing daily is the expected and benign reading, and which the
same message had just supplied. So state the object kind or cite in a form that carries it:
`blob <sha>`, `commit <sha>`, or `path@commit`. Resolve with `git cat-file -t` before treating any
hash mismatch as drift.

### Never enumerate from the artifact you are validating

Pin a discovered population before iterating it — an empty loop reports `pass`, not `skipped`, so it
is indistinguishable from a real assertion. But a `count > 0` guard only tests **non-vacuity**, and
there is a worse failure it cannot see: **a population that is non-empty but derived from the thing
under test.**

A checker that reads its list of files to verify out of its own lockfile, manifest, or index can
detect corruption of what that file declares and **never omission from it.** A path present in the
tree but absent from the index is never enumerated, so the check reports green on it forever — and no
count reveals that, because the population is not empty, only incomplete. It answers *is everything
the index declares intact* while appearing to answer *is everything intact*.

**Only an independent enumeration tests completeness.** Build the population from a source that
cannot be edited by whatever you are checking — for synced canon that is the backbone manifest, not
the member's lock. The lock's job is to answer *what did this file look like last time*; using it to
answer *which files exist* silently converts a deletion into a pass, and deletion is the failure an
ordinary mistake produces first, because it needs one line removed rather than a hash forged.

**The lock's committed history answers a longer version of that same question, not a different
one.** It is tempting to reach for it when the tip is the suspect — a recovery path cannot consult
the tip entry to authorize repairing its own corruption, since at the moment recovery runs that
entry is either absent or already known not to match. Git has been recording superseded entries all
along, in the member repo, at no cost. And the entries are genuine: hashing each one's file as it
stood in that same commit matches on 110 of 112 checked across two revisions, so each is the
engine's contemporaneous record of bytes it actually wrote, unre-derived.

What it will not support is the weight usually put on it, because the record is nearly flat — most
paths carry a single rendering, and the paths with an injected managed region carry one that never
matched. Treat lock history as *what did this file look like on the few occasions it changed*, which
is a real widening of "last time" and is not the same as *was this content ever ours*. Two further
costs are easy to omit: it requires reading member git history, which scales with repository age,
and it is **worthless where history was rewritten**. A force-push removes the evidence and leaves
nothing in the file saying so — the same silent-deletion failure as above, one level up.

Note that two partial signals can be complementary here rather than redundant: a marker or stamp is
unreliable per file but can only ever *add* candidates to an enumeration, while an index is reliable
per entry but cannot report what it never recorded. Neither closes the seam; their union does.

### An invariant that spans two repos must be enforced by a throw, not by a comment

If a rule can be broken by a change in one repo and is written down in another, it is not enforced.
Neither CI can see the pair: the repo holding the rule does not know the other one changed, and the
repo making the change cannot read the rule.

The instance: canon classifies every file type it stamps, and its comment said a new extension "must
be classified here." But the enumeration lives in canon while the act that invalidates it — emitting
a new output format — belongs to whichever repo owns a distribution. Correct diagnosis, accurate
severity, and an obligation binding an author no run could check, in the repo that did not change.

**Make the invariant fail closed in the run that can see it.** A `throw` on the unclassified case
fires in canon's own tests, on the first artifact that needs classifying, with neither side having to
remember the other exists. It binds nobody and catches everybody; the comment bound an author and
caught only the people already going to comply.

This applies wherever you document a requirement for someone else's repo — an expected file layout,
a required field, a supported type. Ask which run fails if it is violated. If the answer is "none,"
you have written a preference, and it will be discovered by the outage rather than by the check.

Two corollaries worth applying directly:

**Rank a shared default by its worst caller, not its typical one.** A default over a *closed*
population can be audited by enumerating the population; one over an *open* population cannot,
because the inputs that break it do not exist yet. Being easier to reason about is why the closed
case tends to get fixed first, and is unrelated to which one should have been.

**Repairing one copy of a duplicated rule leaves the pair worse than it found it.** While both copies
are wrong they agree, and a reader comparing them correctly finds no divergence between them. Fixing
one converts a shared error into an inconsistency visible only to someone who diffs two files and
already knows they are meant to match. There is no partially-correct state for a duplicated rule —
delete the copy, do not improve it.

### A revision you assert is a claim, whether or not you fetched it

Canon already tells you to report the revision you read. That instruments a **fetch** — and the more
common way a stale revision enters a conversation has no fetch to instrument.

Both directions of one exchange demonstrated it. A member quoted canon text that had moved underneath
the quote; the quote had not arrived over the wire that message, it came from **earlier context**, so
no fetch discipline could have caught it — `gh api .../contents/<path>` with no `ref` returns
default-branch HEAD and cannot hand back a stale revision. In the same exchange the backbone asserted
that member's HEAD from its own memory of a previous report, and was two commits behind; the member's
reply asserted its own HEAD and was three commits behind by the time it was read.

| How the stale revision entered | What a recorded blob or size catches | What closes it |
| --- | --- | --- |
| stale bytes over the wire | nothing — the bytes are intact | record the SHA you fetched |
| **quoting from your own context** | **nothing — there was no fetch** | re-read before quoting |
| **asserting another repo's state** | **nothing — you never read it** | re-resolve, or attribute and date it |
| **correcting a peer's state on a shared object** | **nothing — your read was current** | state yours; let them resolve theirs |

The second row is the likelier one precisely because it feels redundant: re-reading a file you have
never read is obviously necessary, and re-reading one you read an hour ago is obviously not. Prose
preserves a quotation perfectly while the repository moves out from under it.

So: **before you quote it, re-read it; before you assert someone else's revision, re-resolve it**
(`git ls-remote` is one call). If you are repeating a figure you cannot currently re-derive, attribute
and date it — *"studio reported `6f98f5b` at 08:25Z"* is durable and checkable; *"studio is at
`6f98f5b`"* decays silently, and the reader cannot tell which one you meant.

**The fourth row is the one re-resolution cannot close, and it arrives disguised as diligence.** A
peer corrected a standing block here with *actual `origin/main` = `1dd252e`, you are 41 commits
behind*, citing a fresh act for their own reading — fetch, then rev-parse, this turn. The act was
real, the arithmetic reproduces exactly at their measurement point, and their diagnosis of the
original error was correct. Measured on delivery:

```
git ls-remote origin refs/heads/main           d957fa6  network read, no local ref consulted
git merge-base --is-ancestor 1dd252e d957fa6   exit 0   the "actual" tip is an ANCESTOR
git rev-list --count 1dd252e..d957fa6          18       it is 18 commits BEHIND the corrected one
```

The correction went false **during composition**, minutes before it was read, because the recipient
merged in the gap. Rows 1-3 all describe a party who read too long ago; here the read was current
and the *object* is shared. Re-resolving at send tightens the read-to-send window, and the whole
exposure sits in **compose-to-read**. The recipient of a correction about a shared object is, by
construction, the party most likely to have already moved it — which is why the rule elsewhere in
canon binds hardest here: **volunteer what only you hold, and for anything the other side can fetch,
let them fetch it.** A default-branch tip is one call from anywhere.

**And prefer `git ls-remote origin refs/heads/main` over fetch-then-`rev-parse` for the check.**
It is one call rather than two with a window between them, it consults no local ref, and it is
read-only: measured here, it left both the loose ref and `packed-refs` byte-unchanged. That last
property is not cosmetic in this layout — `refs/remotes` lives in `git-common-dir` with **no
per-worktree copy**, five worktrees share one store, and that same shared directory holds the
`config` whose concurrent reads are the confirmed cause of a suite flake. **A fetch issued merely to
freshen a citation writes state four sibling sessions are reading**, so the reflexive remedy for
staleness feeds the contention defect next door.

**An anti-vacuity floor on a register that is designed to drain pins the register open.** Canon
already says a check over an empty population asserts nothing, and the reflex is a floor —
`assert.ok(register.length > 0, 'this check would be vacuous')`. That reflex inverts on any register
whose *success condition is emptiness*: exemption lists, accepted-failure registers, known-broken
allowlists, migration backlogs. Measured here on `expectedFailures`, which requires every entry to
name the issue whose closure deletes it and held exactly one row:

```
register drained to []       fail=1   "no expectedFailures recorded -- this check would be vacuous"
register key removed         fail=1   same test
baseline                     fail=0
```

So the day the exemption is correctly removed, the suite goes red and blames vacuity. The two
repairs available to whoever is holding the deletion are **restore the exemption** or **delete the
guard**, and the first leaves the fleet worse than before. A guard that fails when the world
improves is not a strict guard, it is a guard pointed at the wrong event: it made *there is nothing
left to assert* — the outcome the register exists to reach — indistinguishable from a regression.

Note the failure is louder than the vacuity it replaced and still worse, because **red is only safe
when the action it provokes is the right one.** The sibling defect drains to a silent green; this
one drains to a confident red demanding the defect be reinstated.

**Put the non-vacuity guarantee on a constructed population and let the live one be empty.** Prove
the property against a fixture register that cannot drain — including a negative case routed through
the *same* path the live data uses, or the injection is decorative — then check the live register
with no floor on its size, as an additional corpus rather than as the guarantee. And when the live
arm then survives deletion, do not conclude it is redundant: pair the mutant with a corrupted corpus
before scoring it. Here the arm survived on clean data and killed on a violating one, which makes it
latent, not dead, and the treatment for a latent guard is to enrich the input, never to pin the
accident that made it quiet.

### A measurement someone reports is a moment, not a standing claim

The rule above governs what *you* assert. Its mirror governs what you receive: when a report from
another repo does not match what you observe, the mismatch does not tell you which of you is wrong.
It has two explanations that look identical — **their instrument is broken**, or **the world moved
after their instrument ran** — and nothing in the result itself distinguishes them.

The instance: a member reported the contents of an engine constant. The backbone looked, found no
such constant, and concluded the member's comparator was silently passing over a missing value. In
fact the comparator raised a fatal error on exactly that case, and the constant had existed when they
measured — their run predated its removal by about ninety-five minutes. **The report was correct when
made and had since been superseded, which is not the same as having been wrong.**

Default to the instrument being broken and you impugn both the tool and the reporter, and you invite
a repair to something that was working. The discriminator costs one lookup: **compare the timestamp
of the measurement against the merge time of the change that would explain the difference.**

```
git log -G'<the thing they named>' --format='%h %ad %s' --date=iso-strict -- <file>
```

**Use `-G`, not `-S`, and the difference is not cosmetic.** `-S` reports only commits where the
*number of occurrences* of the string changed; `-G` reports commits whose diff mentions it at all. A
paragraph rewritten around a term it already contained changes no count, so `-S` skips the rewrite
and returns the older commit that first introduced the term. This was measured here on this file:
`-S` dated a citation to `a06f5bf` at `2026-08-11T10:38Z`, while `git blame` and `-G` both place the
line at `3ef527f`, `2026-08-11T23:07Z` — an error of nearly thirteen hours, in the direction that
matters, since it made a citation look older than the change it failed to reflect.

The failure mode is worse than a miss: `-S` returns a **real, plausible commit that genuinely touched
the term**, so nothing about the output looks wrong. It had been about to license denying a
correspondent's correct report. **When dating a specific line rather than the life of a term, prefer
`git blame -L`**, which answers the question actually being asked; reserve the pickaxe for "when did
this term enter or leave".

A correspondent isolated the same defect without reference to either repository, which is the form
worth keeping: three commits — introduce the term, rewrite the surrounding prose without changing the
count, then change the count. `-S` returns the first and third; `-G` returns all three. Nine lines,
no shared history, and it establishes the behaviour as a property of the flag rather than of the file
that exposed it. A defect demonstrated only on the artifact where it was found leaves open that the
artifact was unusual; the fixture closes that, and it is also the only available instrument when the
condition a check fires on cannot be produced in a repository that is already correct.

If the change lands after their run, the disagreement is fully explained and there is nothing to fix.
So: **date your measurements when you report them**, and read the date before diagnosing someone
else's. An undated measurement invites exactly this error, and a dated one forecloses it.

**The same discipline applies to the exchange itself: quote the revision you are answering.** Two
sessions corresponding about a moving repository will cross messages, and a crossed message arrives
looking exactly like a disagreement about facts — one party cites a SHA the other has already
superseded, and neither can tell from the artifact whether it was superseded or misread, because
nothing in the message records what it was a reply to. Quoting the SHA being answered makes the
crossing visible instead of arriving as an apparent contradiction. It costs one token and it is the
only thing that distinguishes *you are wrong* from *we spoke past each other*.

**And when replies lag, repeated sightings of one datum read as independent confirmation of a
trend.** Dating and SHA-quoting fix the single crossed message; they do not fix what accumulates
across several. Having seen a stale-looking revision in a correspondent's footer three exchanges
running, this repo concluded a habit and said so. The correspondent's footers were in fact dated and
current each time — the mechanism was that replies ran two messages behind, so each of three
observations re-reported *the same original footer* as fresh evidence. Three sightings, one
underlying sample, and a trend asserted from a series of length one.

**And an indicator whose predicted direction is monotone confirms the prediction whether or not it
was re-measured.** A correspondent tracked how much of canon their copy carried and published
`14.5%`, then `13.5%`, reading it as *falling, as expected, without anything happening here*. The
mechanism is right — canon grows, a copy that receives nothing keeps its line count, so the ratio
must decay. But the numerator had been taken eight revisions and some fifteen hours earlier, across
a delivery that had since landed, and the true figure was `93.1%`. **The ratio behaved exactly as
predicted while being wrong by a factor of seven, and it behaved that way because the numerator was
frozen**: a stale numerator falls more reliably than a fresh one, since nothing in it can move
against the trend.

That is why the confirmation carries no information. A prediction of monotone decay is satisfied by
the healthy case and the failure case alike, so agreement with it cannot separate them, and the
failure presents as the hypothesis working. Nor does recomputation help. Each pass yields a
*different* number, so it never trips the tell above of one datum re-observed — the variation is
entirely denominator-side and reads as fresh evidence. Contrast a figure free to move either way,
where a frozen term eventually contradicts something.

This repo has the same exposure and it is worth stating rather than exempting: the corrected figure
reads `93.1%` here where it read `93.9%` hours earlier, for the identical denominator-side reason,
and this repo's numerator is equally frozen — merely still correct, because no further delivery has
occurred. **Nothing in either number says which.** So publish both terms with the revision and time
each was taken at, rather than the ratio: a ratio is one number carrying two measurement dates and
displaying neither. Where an indicator's expected direction is fixed by construction, the freshness
of each term needs a check the indicator cannot supply.

**An exhaustive sweep proves nothing if the axis has the wrong type.** A body length here resisted
reconciliation across 28 candidate values — seven revisions against four encodings — and the sweep's
completeness was what made the negative persuasive on both sides. The object had `CR = 129` against
`LF = 289`: mixed endings, so its length was never a point in a two-level {LF, CRLF} space. The
axis was categorical; the quantity that actually varied was a **count** of how many breaks carried a
carriage return. Widening a search by adding dimensions only helps if the new dimension is the right
*type*, and confidence scales with the size of the space rather than with its relevance. The tell
was visible and misread: the oldest revision had `CR = LF = 42`, fully CRLF, and `CR` then froze at
42 while `LF` grew, so six of seven rows showed a clean constant offset. **A constant difference is
the signature of a convention — and also the residue of a history**, and those look identical.

**And where figures constrain each other, publish enough of them that the check is available.** The
peer who found the above stated the governing property in the same message: a fixed bias cancels in
every difference and survives only in the level, so a quantity used only in differences can carry a
wrong level indefinitely. That message then closed with *#38 at 41,120 chars / 25 revisions*, and
per-append deltas of `+4,270`, `+3,976`, `+4,086` had been published across three earlier messages:

```
25 revisions x mean delta 4,111    102,767    predicted from their own two figures
measured, three retrieval paths    101,114    identical on all three
published level                     41,120    exactly 10.0 revisions
```

The level is wrong by 60,000 and **it is refuted by the other two numbers in its own sentence**.
Delta right, count right, product right, level frozen ten revisions back — and neither correspondent
multiplied, across four messages. That is the operational form of their rule: a bias hides in levels
because levels are usually published alone. A level, a count and an increment together audit
themselves at no cost; a level asserted by itself has nothing to disagree with.

The `+1` they reported in this file's own figures is not patched here, because it did not reproduce.
Its proposed mechanism — a CLI output terminator counted as body — fails a live test: one object
through three retrieval paths returns one number with no off-by-one anywhere. **A mechanism that
does not reproduce on the instrument is not a correction**, however neatly it fits the gap, which is
the standard the reporting peer set in the same message and applied to their own withheld account.

**A reply that crossed a correction is indistinguishable from one that considered and dismissed it.**
A message here was composed at `06:18Z` and acted on at `13:01Z`, during which 63 merges landed in
the sender's repository and a correction of mine went out. Their message answers none of it, for the
ordinary reason that it predates it — but the party best placed to misread that silence is the one
who sent the correction, who has been waiting on exactly that point. The remedy is the same quoted
revision as above, read in the other direction: **before treating an omission as a response, check
whether the message could have contained one.** Compare the revision it answers against when the
correction went out, and if it crossed, re-send rather than infer a position.

This is the vacuous-population defect at the level of correspondence, and it is worse than its
single-message form in one respect: repetition is ordinarily the remedy for a bad measurement, so
the accumulating count feels like the thing that licenses the generalisation. Before characterising
a correspondent's pattern, check that the observations are of **distinct** artifacts rather than one
artifact seen from successive positions in a lagging channel — and prefer the charge that survives a
single instance, since the second and third may carry no information the first did not.

**The convention only pays if the quoted SHA is read as well as written.** In the first exchange
after adopting it, this repo answered a message that had quoted the SHA it replied to, and addressed
it as answering a *later* commit — one created an hour and sixteen minutes after that message was
sent, so it could not have been the referent. The commit times settle it in a single call, which is
the whole point; the failure was reaching for memory of what had been landed recently instead of the
line the correspondent had already supplied. **Before attributing staleness, resolve the SHA the
message names and compare its commit time to the message's own.** A convention that records the
answer to a question nobody looks up is indistinguishable from not having one.

**And that convention binds the SHA you stamp on yourself, not only the ones you cite about
others.** The message that landed the rule above carried a canon line count of `3274` under a
standing SHA of `174a705` — but `3274` is exactly the count at `2e9a5c0`, committed fifteen minutes
earlier, and the file gained 42 lines in between. The figure was measured, then published beneath a
SHA that did not exist when it was taken. This is the same defect as dating a correspondent's
message by a commit created after they sent it, reflected: there the referent was too new for the
claim, here the claim was too old for the referent. **Emit the SHA from the command that performs
the measurement**, so the pairing is produced rather than assembled — the standing line is written
last and reaches for the freshest thing to hand, which is precisely when the two come apart. A rule
that is applied only outward has no instance where it constrains its author, and so is never tested
by the person most able to break it.

**That remedy fixes the pairing and leaves the operand untouched, and the gap is not benign.** A
peer applied the rule exactly as written and the co-emitted number was still wrong — the header
published `3689` where the file had `4319` lines, an artefact of the counting cmdlet described
above. Emitting the SHA from the measuring command guarantees that the number and the revision were
born together; it guarantees nothing about whether the number is right. **And a co-emitted wrong
number is *more* credible than a stale one**, because it now carries a provenance guarantee it
previously lacked, so the fix raises the confidence attached to a value while leaving its accuracy
exactly where it was. That is the general shape worth carrying: a discipline whose failure mode is
invisible to the discipline itself will convert unverified figures into trusted ones at the rate it
is adopted. Pair it with a check on the operand — a second measurement by a different route — or the
provenance is a guarantee about bookkeeping wearing the costume of a guarantee about facts.

**And the stamp must record when the measurement ran, not when the message was written.** The rule
above pairs a number with a revision; the same gap exists in time, and it is wider than it looks. A
pointer published here — *the newest run is `31622680486`* — was measured at `20:37:49Z` and stamped
`20:46:36Z`. Inside those 8 m 47 s the member's CI produced two more runs:

```
31638808623  20:40:19Z   born 2m30s after the measurement
31639329672  20:46:37Z   born 1s after the stamp
```

Both verified against the forge, and both false-making. The pointer was wrong before it was read.
**A timestamp applied at composition certifies when the text was written and says nothing about when
the claim was true.**

The exposure is one-sided by claim direction. For a monotone claim — a streak length, a count of
things that have already happened — the compose gap only understates, and understatement is safe.
For an anti-monotone one — a newest, a maximum, an absence — the gap is precisely the window in
which it dies. Attaching the stamp last, at publication, is the natural motion, so the habit is
wrong for exactly the class of claim that needed it. Emit the clock from the measuring command
alongside the SHA, and where the two must be separated, publish the measurement's time rather than
the message's.

**And shrinking the gap is not the general remedy, because the gap is not wholly yours.** The
sharpest case here is one where the discipline above was applied correctly and the claim still died.
A member closed with `main=<sha> fetched=<T> dirty=0 openPRs=0`, noting *fetched in the same command
that printed it* — no compose gap at all. Their tip had moved 1 h 49 m after that fetch and 4 h 17 m
before the message was read. The pointer was true when written and false when read, and nothing the
sender could do would have changed it: **the interval that falsifies an anti-monotone claim runs to
the moment the reader looks, and only the reader knows when that is.** Composition latency is the
part you can see; transit and read latency are usually larger and invisible from the sending end.

**But invisibility is a property of the substrate, not of the direction.** A correspondent argued
that a slow clock and a slow channel are observationally identical at the receiving end, since the
discriminator -- the sender's clock against an independent source -- exists only at the sender. That
holds when the parties share nothing. Here they shared two clocks, and both read from the far end:

```
their session, last turn   2026-08-13T06:59:03.024Z   machine-wide session store
their own forge write      2026-08-13T07:01:47Z       issue append, dated by GitHub
their published stamp      2026-08-13T02:48Z          the message's own claim
receipt                    2026-08-13T07:14:05.846Z   same store, same clock
```

Both sessions are rows in one machine-wide store written by one OS clock, so a multi-hour offset
between correspondents was never an available hypothesis, and their measurement of that clock
against the forge certifies the other end too. Their turn record shows continuous activity at
`04:12`, `04:27`, `04:47`, `05:00`, `05:04`, `05:38`, `06:19` and `06:59`, and none at `02:48`. So
the message was composed about 4 h 11 m after its own stamp, against a measured transit ceiling of
**15 m 03 s** -- turn start to receipt, so the true figure is smaller.

The gap was composition, in the message arguing that composition was the correspondent's class and
that stamping last could not reach its own. **A shared substrate makes the sender's clock auditable
from the receiving end**, and the discriminator is ordinary: any artifact the sender wrote at their
stamp, dated by a clock neither party owns. If those writes cluster at your receipt rather than at
their stamp, the gap is composition and the remedy is the one they already hold.

The same standing block carried *issue #38, 101,114 chars* while correctly withdrawing its
elapsed-hours and run-count figures as clock-dependent. The forge read **149,896**, `+48.2%`. A
character count is a function of `now` exactly as a run count is: the invariance table had three
rows and the standing block had a fourth decaying quantity that never reached it. **Enumerate the
decaying quantities from the block you are about to publish, not from the list that prompted the
fix.**

So the fix is a change of form, not of speed. Either publish the pointer as an explicit bound — *was
X at T, and anything after T is unknown to me* — or publish the monotone companion instead, a floor
or an onset that later events cannot falsify. Only the second is safe to quote back.

The specimen carries the reason to bother. The commit that member had not yet seen on their own
default branch **added a validator checking their synced files against the lock's hashes** — the
direct answer to the question the correspondence was open on. Their repository had answered it four
hours before their message reported it unanswered. **An anti-monotone pointer decays fastest exactly
where the subject is under active work, which is the only condition under which anyone is asking**,
so its reliability is lowest precisely where it is being relied on.

**But durability is a property of each figure, not of the sentence containing it.** The peer who
found the above closed with a block headed *standing, in the durable form only*, deliberately
withholding a newest-run id, and placed three quantities in it. Measured on arrival:

```
no success since 2026-08-10T21:34:11Z    true, 0 successes in the window
51 subsequent runs                       53
47.2 h elapsed                           53.1 h
```

The qualitative claim held — though it too is anti-monotone, merely slower, since one success ends
it — and both numbers had already moved. The elapsed figure is the sharpest case in this file: it is
a function of *now*, so it decays continuously at one hour per hour, and it was the most perishable
quantity in the message while sitting under the header asserting durability. Choosing a durable
*form* does not make its operands durable; the label was applied to the sentence while every figure
inside it was still read off a clock. **Check each quantity for what it is a function of** — a value
computed from the present moment is perishable no matter how settled the proposition it decorates.
The gap being audited was 8 m 47 s and the auditor's own was 5.9 h.

**And the class of claim that goes unaudited is the one volunteered in support.** Every discipline
in this file is aimed at a claim that contradicts something, because a contradiction is what starts
an inquiry. A figure offered to *strengthen* a peer's result is checked by nobody: agreement
terminates the inquiry as effectively as a perfect score does, and the offering party has no
adversary. The instance is exact. A derivation was volunteered here to corroborate a peer's
byte-level reconstruction — "canon opens with a 3-line frontmatter, the engine emits a 4-line
prefix, so `+1`" — and the engine does neither: the frontmatter is carried through unchanged and one
line is inserted after it. The peer independently held a *different* wrong mechanism, and the two
mechanisms agreed on the integer. **Agreement on an arithmetic is not agreement on a mechanism**;
`4 - 3` and `+1` are the same number for a process that performs neither subtraction nor prefixing,
and the coincidence was then offered as the evidence that the mechanism was right. Two parties, two
wrong accounts, one correct result, and the concurrence itself presented as the check.

The correction is not pedantry, because the wrong mechanism makes wrong predictions. The insertion
point is computed from the closing delimiter, so when canon later absorbed a `description:` line
into its frontmatter the index moved from 3 to 4 and a reconstruction hardcoding 3 failed —
"emits a 4-line prefix" would have predicted the wrong index on the very next delivery. **A right
answer from a wrong mechanism is a prediction that has not yet been asked to move.**

**The half of a message that carries assertions rather than measurements has no instrument, and no
pairing remedy can reach it.** The rule above was derived from a standing figure that reached
*forward* for the freshest SHA to hand. The same paragraph then failed in the opposite direction: a
standing block froze at the era of the message it was answering while the body moved on by eight and
a half hours, publishing that a correspondent held a canon revision they had stopped holding three
hours earlier — and had said so in the message being replied to. The distinguishing property is not
when the two halves are written. It is that a body reports things measured this turn while a
standing block reports things asserted, and *emit the SHA from the command that performs the
measurement* is unreachable for a claim about somebody else's repository, because there is no such
command anywhere in the loop.

**So the claims most likely to be wrong are precisely the ones addressed to the party best able to
check them.** A remote claim is cheap to assert, expensive to verify, and lands in front of the one
reader for whom verifying it is free and who has every reason to. The operational form: **state a
counterparty's state only with the time at which you last measured it, or not at all** — *"as of
your 09:05Z report, you held X"* is true, checkable, and flags its own age, where the bare present
tense is a claim about right now that nothing in the loop ever established.

**But do not read a record of peer-caught errors as a map of where your errors are.** The
correspondent who supplied that rule offered as evidence that every figure published here about this
repository had reproduced exactly, while every remote claim had failed — three for three. The
evidence is false, and the counter-example was theirs: they had themselves caught a line count of
this repo's own canon, measured here, with a command run against a local file, that was wrong by the
blank-line count. The cheapest available check, performed, and still published wrong.

The reason the record looks one-sided is that **a false remote claim is read by the one party who
can falsify it, so its detection probability is near one, while a false local claim is re-derived by
nobody and its detection probability is near zero.** The observed distribution reports where errors
are *visible*, not where they are — the shrinking-population result again, with the uncomfortable
corollary that the party compiling a record of your mistakes is systematically sampling one half of
them. Concluding *my local figures are sound* from *my peers only ever correct my remote ones* reads
a detector's coverage as a measurement of the thing detected.

**The correction to that inference is subject to it too, which is the part I got wrong.** Having
established the asymmetry, I refuted a peer's error-rate claim by producing a local error of my own
and inferring from it a rate for unchecked local claims. Invalid, for the same reason: that error
had been *caught* -- published to the one party re-deriving my figures and corrected within the
hour -- so it is drawn from the visible half, not the unchecked one. A claim nobody verifies
generates no evidence in either direction, so **the unchecked population is unobservable rather
than unknown-but-estimable**, and the detector coverage that voids the original claim voids the
replacement estimate identically. The honest form is to say neither party can speak to it. **A
result about what an instrument cannot see applies to the remedy you build from it**, and the
remedy is where it is least expected, because refuting a claim feels like standing outside it.

It also matters that the two failures have independent mechanisms. **Verification cost** explains a
remote claim asserted with no measuring command; an **instrument defect** explains a local claim
measured with a command that silently returns the wrong number. Cost predicts errors cluster where
checking is expensive, and the local error occurred where checking was cheapest, so a remedy built
only on cost licenses trusting exactly the figures the other mechanism corrupts.

**And a two-party audit converges on the two parties.** The cost rule predicts errors in what each
side says about the *other*, and it under-predicts the worst case: an object neither party owns is
measured by nobody, indefinitely, and produces no correction because there is no counterparty to
bounce off. Two sides audited the endpoints of a distribution pipeline to the byte for a full
session while the nine-member fan-out the pipeline exists for went unmeasured by both — eight of
nine between 28 and 92 hours stale, in four cohorts, four of them holding a revision one party had
personally verified faithful that morning and then never mentioned again. **The measurement that
never happens is the one with no advocate in the room, and its absence is silent because absence
always is.** When two parties agree their own figures are sound, that is the moment to ask which
third thing both are describing and neither is measuring.

**A byte-count minus a character-count does not size the non-ASCII content.** The gap is a
*weighted* sum — a 3-byte BMP character contributes +2 against UTF-16 units, a 2-byte one +1 — so
it bounds the count within a factor of two and determines it only if the composition is already
known. Measured here: a 1,190-byte gap over 599 non-ASCII characters, 591 of them at +2 and 8 at
+1, where reading the gap directly overstates by ~2x and dividing by two understates by 4. Both
errors occurred in one exchange, the second inside a correction of the first, and the correct figure
came from counting the characters rather than from any arithmetic on the gap. **A quantity derived
from two measurements of the same object in different units carries a coefficient, and the
coefficient is a property of the content, not of the encoding pair.**

**And an independent confirmation is worth only what its own reading is worth — agreement is the
condition under which nobody audits the reading.** This repo declined to take a correspondent's
figure and went to the underlying file instead, which is the right instinct, then described that file
as containing no relevant declaration at all. It contained nineteen lines and two active rules, one
of which was written by the member precisely to keep the tree in question deterministic. The
conclusion happened to survive, but by the opposite mechanism to the one asserted: the count was zero
not because nothing was declared but because **everything** was, twice over. Had the local rule said
otherwise, the same method would have produced the same sentence and the same figure, and the figure
would have been false.

The trap is structural rather than careless. A confirmation that *disagrees* gets investigated
immediately; a confirmation that *agrees* terminates the inquiry, so an independent check is audited
in exactly the case where it was least needed and never in the case where it silently failed. When
an independent source agrees, state the mechanism it revealed and not merely the value — if the
mechanism cannot be stated, the source was not read, only consulted.

**Count lines with the tool's own counter, not a text helper that discards empties.** Two revisions
of a prose file measured here came back 397 lines short each, plausibly sized and internally
consistent, because the helper used counts lines *within* each string and an empty string contains
none. Blank lines run about one in six in prose, so the error is large, silent, and proportional to
how well-formatted the document is. It was on the verge of being used to contradict a correspondent
whose figures were exact. Prefer counting the elements the tool returns, or the file's own byte size,
and treat any line count that disagrees with a correspondent's by a suspiciously round fraction as a
question about the apparatus first.

### An issue's state records a button press, not the state of the question

The rule above concerns a measurement that was correct when made and has since been superseded. A
tracker field fails differently: **nobody measured anything at all.** `OPEN` and `CLOSED` are set by
hand, and the hand is not attached to the code, so the field lags repair in one direction and
regression in the other.

Both directions occurred here on a single day. **`OPEN` is not evidence the question is live:** one
issue was repaired in code by two separate commits hours apart while three sessions went on arguing
over which half remained broken. This repo was one of them — reading `state: OPEN` plus the single
comment it had been pointed at, then posting a claim that two comments three hours earlier in the
same thread had already falsified by measurement. **`CLOSED` is not evidence it was repaired:** of
two issues closed the same day, both reading `CLOSED | COMPLETED`, one closed on a commit with zero
added source lines that were not comments, the other on a new predicate and a new suite. The API
does not distinguish documented-shut from repaired-shut.

The pull toward the field is that it costs one call and returns a clean answer to a question it was
never asked, while the answer lives in the expensive read. So **take the thread's most recent
measurement, not the state field** — and when someone asks you to record a finding on an issue,
**check that it is open before writing**, since a closed issue with no comments is not a place a
finding survives.

**And when you amend one, `gh api -f body=@file` will destroy it.** `-f`/`--raw-field` sends its
value as a literal string; only `--input` (a JSON payload) or `-F` reads a file. A patch written as
`-f body=@note.md` replaced a 2739-byte comment with the 13 characters `@note.md`, and reported
success. There is no error, because nothing was malformed — a body was supplied and accepted. For
any write that carries prose, build a JSON payload and use `--input`.

Two habits make that recoverable rather than terminal. **Never put cleanup in the same command as
the verification it depends on:** the `Remove-Item` that deleted the only local copy was written
after the verification output and ran regardless of what the verification said, so the copy was gone
before the failure was read. And know the recovery path — GraphQL `userContentEdits` retains prior
bodies of an edited comment, so an overwritten comment can be restored verbatim.

**That store exists only for documents somebody has already edited, and it materialises
retroactively.** Measured across a member's complete issue census, 11 of 13 have bodies and **zero**
revision nodes; the creation-time node is not written at creation but appears on the first edit,
stamped with the creation timestamp. So the original text of an unedited document has no immutable
record at all, and once one appears it covers a window that had already closed — a citation made
before the first edit was unverifiable when made and is verifiable now, with nothing in the artifact
distinguishing it from a citation made afterwards. **Every other referent tracked here decays;
this one accretes**, and accretion is the more dangerous direction, because decay eventually
announces itself by failing to resolve while accretion silently makes past looseness look rigorous.

Two consequences for using it. The pin is real once it exists — the oldest node on an edited issue
holds the genuine pre-edit body, verified against a live body of a different size — so it is worth
reaching for. And because an edit is what *causes* the record, anyone with write access can
manufacture a pin for a document they did not author, which is the answer to *I can content-address
what I wrote but not what I read*: you can content-address anything you can edit. Submitting an
identical body creates **no** revision; an edit followed by a revert creates **two**, and leaves the
body byte-identical to a node already in the store — measured on an issue where the revert
reproduced a prior revision exactly, six seconds apart. So a pin can be manufactured, but not
covertly: it costs two visible revisions and an `edited` marker. Describe the technique as
**available and self-marking**, which is a better property to rely on than either guess.

**And the probe that established this accreted into the corpus it measured.** Three of that issue's
revisions are instrument rather than content, and the store records them identically; it now holds
twenty-six, with nothing in the history separating a measurement from an edit. So a revision count
is not merely stale on arrival — **it is not purely a property of the document**, and a session that
probes an artifact it also cites should record the probe in the artifact, so a later reader is not
left reconstructing which revisions were the reading.

Note also that edit provenance cannot separate actors under a single identity — every editor login
across this corpus is the same account, so a session cannot exclude its own influence on a
revision-history sample by avoiding its own documents. Timestamps against a known working window are
the only available discriminator, and only the session that owns the window can apply them.

**A second discriminator was proposed to close that gap, and it cannot.** Line-ending composition
fingerprints the *authoring path* rather than the identity, and the two come apart exactly where the
login is degenerate, since one account drives several tools — so it looks like the missing channel.
Measured across a member's complete corpus of 57 bodies, all 57 under one login, it sorts into four
classes and not two: 31 pure LF, 14 pure CRLF, 10 pure LF closed by a lone CRLF terminator, and 2
mixed throughout. The proposal had been read off nine hand-picked objects, which excluded every one
of the fourteen pure-CRLF ones.

**And the mixture records editing, not authorship.** Both mixed bodies were *created* pure CRLF by
that same account and became mixed on a later edit — one going from `75` CRLF and `0` LF to `75` and
`38` thirteen minutes later, the other frozen at `42` CRLF across five successive edits while its LF
count climbed `17, 56, 89, 125, 158`. The creating client's endings survive untouched while the
editor's accrete beside them, so composition measures **how many paths have touched a body**, never
which agent wrote it: sequential provenance, not identity provenance. At creation both mixed objects
were indistinguishable from fourteen others.

The reason it fails is structural rather than a matter of accuracy, and it generalises. **A channel
that only fires when two paths differ cannot support a negative claim.** An unmixed body is the
expected result whenever the writing and editing paths agree, which is 45 of these 57, so absence of
mixing is not evidence of non-interference — it is evidence of nothing. A discriminator is usable
for *exclusion* only if its silent state is rare; where silence is the majority state it can confirm
interference and can never rule it out, and offering it for the second purpose inverts what it
knows.

**That recovery path is a full snapshot, not a patch, and it exists for almost no issues.** The
`diff` field is named misleadingly: measured here, the newest node is byte-identical to the current
body, and the oldest node's `editedAt` equals the issue's `createdAt`, so the original text is
present rather than only the deltas after it. It works on private repositories. The limit is the one
that matters for citation — across a hundred consecutive issues in this repository, **ninety-nine had
no revision history at all**. An issue that has never been edited has an empty edit list, so the
tempting pin of *(issue, revision timestamp)* has no referent for nearly the whole corpus.

**And its availability runs backwards, which no pin should.** An unedited body cannot be pinned at
the moment you cite it, and acquires a citable revision only if someone edits it later — so whether
your citation is anchorable is decided by events after you made it. The pin is also easy to validate
on exactly the wrong sample: the artifacts that carry rich edit histories are the ones the author has
been revising, which is why a mechanism checked against your own working documents will look
universal at a one-in-a-hundred base rate. For an unedited body the current text *is* the original,
so content is recoverable; what is unavailable is any evidence that it is unchanged.

Verify the restoration structurally, not by size. The byte count available for comparison was itself
an artifact of a shell redirect that appends a newline, and character count differed from UTF-8 byte
count by the multi-byte dashes in the prose — two plausible reconciliations that both failed. What
settled it was five remembered landmarks reappearing at their original line numbers. **A length is a
weak identity for text; positions of known content are a strong one.**

### Conform against a population that outlives the implementation

When you check that your copy of a rule still matches canon's, choose what to key the check on. Two
shapes look equivalent and are not:

- keyed to an **internal constant** — asks *do you still spell it this way*. Breaks on any refactor
  that preserves behaviour, and reports a difference that is not a defect.
- keyed to **inputs and answers** — asks *what do you answer for this path*. Survives refactors,
  because it names only what both sides already name.

Prefer the second. Paths, filenames, and public inputs are the durable unit: they are the vocabulary
canon and members share, and they remain meaningful after the implementation behind them is
rewritten. A member that replaced a constant-comparison with *import the engine's real function, feed
it my actual locked paths, diff the answers* found a genuine classification divergence on the first
run — one the constant-comparison could not have detected at all, because the constant it watched had
been deleted by the very change that introduced the divergence.

Note that the durable-population check is also the one that keeps working while the thing it inspects
is being redesigned, which is when you most need it and least expect to have it.

**And when you compare two populations, compare membership, not cardinality.** A reach census across
every opt-in kind reported three partial surfaces at an identical *6 of 11*, which invited treating
"the six" as one portable group and carrying it between kinds. Two of the three sets were in fact
identical and the third was a strict superset — six, six, and **seven** — so the shared count was
false. The cause was in the instrument: the enumerator read every falsy-looking opt-in as opted out,
but the manifest holds two distinct states, an **empty array** (opted in, nothing selected — the
engine builds a real group) and a literal **`false`** (no group at all). Collapsing them did not
merely under-report by one. **It turned seven into six and thereby synthesized an agreement between
populations that were never the same** — and the agreement is what licensed the wrong transfer,
because a count that matches reads as a count that was checked. Before reporting a set size, enumerate
what your predicate does with each value the data actually contains, and prefer to print the members;
a list disagrees with itself visibly, a total never does.

### Reporting a defect in canon from a repo that holds a synced copy

You hold a copy of these instructions at `.github/instructions/`, and it is **generated, not
authored** — it lags canon by design, and during a distribution outage it lags without bound. So
"I checked the instructions and the claim is still there" is a statement about your copy, and
canon may have repaired it several revisions ago. This has already produced repeated round trips
where both parties were reading accurately and disagreeing anyway.

The copy cannot currently tell you which canon it came from: the provenance header names the source
**repository**, and `.studio-sync.lock.json` records the backbone and a `generatedAt` time, but
neither records a canon **revision**. That is an engine gap rather than your mistake. Until it is
closed, do this:

- **Read the canonical file before reporting**, not your synced copy — `gh api
  repos/jrmoulckers/.github/contents/instructions/workflow.instructions.md` with the raw accept
  header, or `gh api .../commits/main` for the revision.
- **Report the revision you read** and the blob hash. If you cannot obtain one, say which artifact
  you read and that it was a distributed copy; that alone routes the reply correctly.
- **Quote and cite `generatedAt` from your lock** when reporting drift you believe is real. A
  timestamp does not identify a revision, but it bounds one, and it makes the lag visible instead of
  invisible.

The corollary for whoever maintains canon: a member reporting a claim that canon already fixed is
**not** making an error, and answering "that is stale, you read an old revision" misplaces the fault
onto the reader for holding the artifact canon published to them. The report is correct about the
artifact in their hands. When distribution is blocked, expect the same correct report repeatedly, and
fix the distribution rather than the reporter.

**And lag is not neutral in content — a stale copy keeps the claims and drops the corrections.** A
correction is always newer than the claim it corrects, so freezing a copy at time T retains every
claim made before T and no correction issued after it. The copy is therefore not a uniformly older
document; it is enriched for uncorrected error, and enriched most in whichever passages attracted
the most correction, because contentious claims are precisely the ones whose revisions sit in the
undelivered tail. Measured on a member holding a copy generated four days earlier:

```
canon         339,688 B   9 occurrences of the term under dispute
member copy     9,833 B   2 occurrences        144 of 151 revisions behind
```

Delivery was faithful — canon carried exactly two at the revision the member holds. But both of
those *prescribe* a diagnostic, and all seven it lacks *scope or correct* that prescription,
including the one stating the failure being diagnosed is normally not that status at all. The single
retained instruction is also the superseded form: canon has since appended *but confirm the failure
is scoped to the calling job before you do*, and the member holds the imperative without its
qualifier. So the copy did not merely fail to help; **it supplied a confident instruction and
withheld the sentence saying when not to apply it.**

The visible cost is a member re-deriving a correction canon already records — that member
investigated, reached the same conclusion the undelivered passage states, and reported it as a new
finding. Treat that as the signature of content-biased lag rather than as duplicated effort, and
read it as evidence about distribution rather than about the member. It also reprices the backlog:
every undelivered revision is disproportionately a correction, so guidance degrades faster than the
undelivered byte count suggests.

**A merged sync PR does not make you current — it makes you current as of the moment it was
generated.** Its files are pinned at its head commit, so every canon change since is still missing
after it lands. libro's blocked `#37` was generated at `04:27:21Z`; the authorship and peer-gate rules
merged at `11:21:19Z`, and its `AGENTS.md` blob contains neither. Merging it would have closed the PR
and left that gap intact.

**But aggregate lag licenses no conclusion about any single passage.** That member later measured a
pending sync as 144 of 152 revisions behind and inferred from the figure alone that the delivery
could not carry a correction issued during the gap. Measuring the delivery itself — the pull request
head, a different object from the branch that was measured:

```
canon @ d311430                423,990 B   183 revisions
member main                      9,834 B   correction ABSENT
member #37 head 1f98946         23,263 B   correction PRESENT   167 of 183 behind
```

The pending copy holds 5.5% of canon and is 167 revisions stale -- figures this file then
misused as a ranking, corrected below -- and it carries the disputed qualifier in full. The
enrichment thesis
below is exactly what makes the inference feel sound: undelivered revisions really are
disproportionately corrections, so a large lag really does raise the odds that any given correction
is missing. Raising the odds is not deciding the case. **A distributional claim about the backlog
cannot settle whether one named passage is in it**, and the error runs both ways — the opposite
inference, that a pending delivery must carry a recent fix, was equally unlicensed and merely
happened to be right. Grep the delivery for the sentence. It costs one request and it is the only
thing that answers.

**And a ratio between a member rendering and canon measures neither lag nor completeness.** That
5.5% was published here as a ranking -- *by any aggregate measure the worst artifact in the
comparison*. Measured across the whole fleet at the same path, by blob id rather than by size:

```
blob      bytes     members
5932d34   23,263    jrm-recipes, score-king, finance, engineering
2cf4679   12,537    cartridge, product
50c3b25    9,834    libro (default branch)
dd37364   48,840    docket
28c236a  308,014    studio (largest member holding)
--            --    homelab, windows -- not retrievable, non-zero exit
```

**Four healthy members hold the pending delivery byte-for-byte.** So 5.5% is the current member
rendering, not a deficit: a rendering is a filtered projection of canon, and a ratio against the
source measures the filter. The figure was not false -- 167 of 183 is true of that member and
equally true of four nobody had called stale -- it was **non-distinguishing**, and it got
attributed to one
member because only one member was measured. The peer made the mirror error in the same exchange,
ranking itself *measurably the furthest behind* from its own single-member reading, so two parties
derived opposite comparative claims from populations of one. **A superlative needs the population it
ranks over, and neither of us had one.**

Two things the cohort view supplies that a pairwise comparison cannot. The peer's *working branch*
at 12,537 B is not a private intermediate state -- it is the live rendering of two other members,
so
one member's stale copy is another's current one and "behind" is meaningless without a named cohort.
And the blob id is the better instrument: equal byte counts across repositories are evidence, equal
blob ids are proof, and both cost the same request. Ranking by cohort also relocates the remedy,
since a wave that stopped is one dispatch for everyone rather than a special request for the member
that happened to be measured.

**And in a double-quoted PowerShell string the backtick is the escape character, so a probe can
delete its own needle.** A peer searching a delivery for a passage containing a code span wrote two
probes -- one bare, one with markdown backticks -- and got `false` from both:

```
"startup_failure` with no log"   ->  startup_failure with no log     27
'startup_failure` with no log'   ->  startup_failure` with no log    28
```

The two independent probes were byte-identical after parsing, so the agreement was one measurement
reported twice. This fails **silently toward the negative**: a deleted delimiter can only prevent a
match, never create one, so the error is invisible in exactly the direction that manufactures a
false absence. And note what broke -- writing the probe a second way *is* the standard defence, and
the shell collapsed both forms before either ran. **A redundancy the transport can silently remove
is not a redundancy.** Single-quote every literal needle, or hand it to a runtime that will not
reparse it; a doubled backtick survives, which is why the failure is intermittent rather than total.

**The same shell corrupts in the other direction too, and the boundary is wider than the report of
it.** A sibling found that `gh api <issue> --jq .body` in PowerShell yields not a string but an
array of lines with every carriage return deleted. It reproduces here exactly, three times:

```
issue   reference len   CR    --jq .body -> elems   rejoined with LF   loss
#770         3373        72            73                 3301          72
#461         3718        66            67                 3652          66
#582         3142        45            46                 3097          45
```

Loss equals the CR count in every case, and every length, hash and byte-equality computed downstream
is wrong by the line count while remaining perfectly well-formed. **But the diagnosis attached to it
-- that a `--jq` scalar is not a string -- is false, and the true boundary is much wider:**

```
cmd /c type <a CRLF file>     Object[]  3 elems   CR kept 0      no gh, no jq
git show HEAD --stat          Object[]  8 elems   CR kept 0      no gh, no jq
gh api ... --jq .title        String    1 elem                   a --jq scalar, uncorrupted
gh api ... | ConvertFrom-Json                     CR kept 72     lossless
```

PowerShell converts **any** native command's stdout into an array of lines and discards the
terminators. The value is a `String` only when the output happens to be one line, so the array-ness
tracks the line count and never the flag. `--json` survives not because it returns a different kind
of value but because JSON escaping puts the whole payload on a single line and smuggles the CR
across as the two-character sequence `\r` -- **the escape is what crosses the boundary, not the
character**, which is why parsing restores it and rejoining never can.

Two consequences the original report did not reach. First, **the trailing terminator is lost even
when there is no CR at all**: the twenty-byte reference above rejoins to sixteen, three CRs and the
final LF, so this is not a CRLF-platform defect and an LF-only corpus is not safe from it. Second,
the scope bound was produced by grepping the workflow directory for `gh ... --jq` and `-q .`, and
that is the wrong predicate -- the right one is *any multi-line native stdout captured into a
variable*, which takes in every `git`, `node` and `pnpm` invocation in the tree. The conclusion
survives, because CI runs bash and bash does not split; but it survives for a reason that was not
given, and **a right conclusion drawn from a wrong predicate is the most durable kind of error,
since a correct answer is what stops anyone looking again.** Check the bound, not just the verdict.

The remedy is a round trip rather than a presence check, and the reason is worth stating: a presence
check passes here and must, because the response *did* arrive, complete and correct in content. What
failed is fidelity, not delivery. **The corpus never arrived and the corpus arrived and was rewritten
in transit both present as well-formed confident numbers**, and only the first is visible to a
control that asks whether anything came back. Verify a published body against its source through a
channel that did not cross the same boundary.

**But a round trip that normalizes before comparing is a presence check wearing a round trip's
clothes.** The remedy above is correct and it is not self-executing: the obvious way to write the
comparison cancels the very corruption this section documents. The verifier run here after every
publish piped `gh ... --jq .body` into `Out-File` — the *same* boundary, not an independent channel
— and then compared `.Replace("\r\n","\n").TrimEnd()` on both sides, which deletes CR loss and
trailing-terminator loss by construction. Measured against the mutations named above:

```
case                                         verdict     raw bytes   canonical   CR sent/got
identical                                    identical   true        true        3/3
CR loss only (the documented defect)         identical   false       true        3/0
trailing terminator lost                     identical   false       false       3/2
CR loss + trailing loss, rejoined with LF    identical   false       false       3/0
real content change                          DIFFERS     false       false       3/3
truncation                                   DIFFERS     false       false       3/1
```

It reports **identical** for all three transport defects, and fires only on content change and
truncation — which is precisely why it looked sound: the one time it ever caught anything it caught
a truncation, and the published claim was upgraded from *matches* to *byte-identical* on that
strength. The figures it printed were not bytes either. A body published this session was reported
`sent=3694 got=3694`; measured through a channel that does not split, the two sides are 3788 and
3789 bytes with 85 CRs each. **`3694` is neither side's length — it is what both sides became after
the instrument normalized them**, a number produced by the tool and reported as a property of the
artifact. The publish was in fact correct, which is the whole trap: right conclusion, wrong
predicate.

So capture outside the boundary rather than trying to repair the string afterwards — Node's
`execFileSync(cmd, args, { maxBuffer })` with **no `encoding`** returns a Buffer and performs no
line splitting; the same body arrives with its 85 carriage returns intact. Then compare raw bytes,
**and report the terminator counts as their own observable**. That last step is not belt-and-braces:
a newline-canonical comparison is blind to CR loss *by design* — the `3/0` row above passes it — so
canonicalizing more carefully cannot recover the signal, and only a separately reported count keeps
the canonical form from quietly absorbing the defect it was adopted to catch.

**And two values fetched the same way are corrupted identically, so they agree, and the agreement
reads as confirmation of both.** That is the doubled-probe failure above with the sign reversed:
there, writing the probe twice was the standard defence and the shell collapsed both forms; here,
reading the value twice is the standard defence and the same transport damages both readings
equally. **A check that appears to have two witnesses may have one instrument twice**, and the way
to tell is not to repeat the reading but to change the boundary it crosses.

**A non-reproduction is not a refutation when the fingerprint matches.** The sibling ran an earlier
class of mine against five issues on their `gh` build, got agreement across three channels on all
five, and still recorded it as a null *about the rate rather than about the defect* -- because the
74 characters I had reported for one body is exactly that issue's title length, confirmed here to
the character. A failed replication that reproduces the signature while missing the symptom is
evidence about frequency, and filing it as a refutation discards a real finding on the strength of a
sample of five.

**And your own writing is the weakest evidence you hold about yourself.** The correct answer to a
question I got wrong six times was sitting in a document I wrote, unqueried, because authorship
feels like having already read it. A record you produced is the one you are least likely to look up,
which is the compacted-session problem applied to documents instead of to memory.

The same measurement exposes a naming collision worth stating separately. *The in-flight copy* named
three objects in one message — the member's default branch at 9,834 B, its local working branch at
12,537 B, and the delivery at 23,263 B — and the argument moved between them unmarked. The rule
further down (**a member's report of its own lag measures its working copy**) covers the first two;
the third is the one that decides remedies, because only the pull request head answers *what would
merging this actually deliver*. Resolve it with `gh pr view <n> --json headRefOid` and read the blob
at that oid, rather than trusting a branch name that looks like the delivery.

Note where that correction was issued. The same message opened by telling me I had measured an
unnamed ref, and then built its central finding on an unnamed ref. **Issuing a rule is not applying
it, and the message issuing it is the least likely place to have it applied**, because stating the
rule discharges the attention that checking would have used. This file already records the
document-scale version — two contradictory paragraphs adjacent for their whole life, unread against
each other because reading is by subject. The message-scale version is faster and harder to see,
since both halves are composed in one sitting by an author who has just demonstrated they hold the
rule.

**And from the hub, a distribution defect and ordinary lag are indistinguishable.** Both present as
the same observation: *the member's copy lacks the correction.* One never heals and needs
intervention; the other resolves itself on the next run. I diagnosed the first when the truth was the
second — a member was missing a rule that had been repaired, and I attributed it to the correction
landing in a surface the member does not receive. Measured afterwards, the entire section postdated
that member's last sync by about ten hours. **They had never held the refuted rule at all.**

**A pointer and its target are distributed under separate opt-ins, so a delegation can reach
strictly more members than the thing it delegates to.** A sibling's correction here was that a rule
had been landed in the instruction file 9 of 11 members opt into, and the natural repair -- move it
to the document that reaches all eleven -- is unavailable. That document opens by naming the base
operating guide as authoritative for the golden rules, the definition of done and the mandatory
human gates, and states in its own text that it never restates them. The base guide is taken by
six. So the only fleet-universal vehicle is contractually barred from carrying the mandatory rules,
their ceiling is six by construction, and no widening of any count guard can raise it. Routing a
*procedure* there is correct and is exactly what the base guide does; the rules cannot follow.

Measured across the fleet, the mandatory human-gate section is present in 6 of 11 members while the
instruction to go read it is present in 10 -- so four are directed to content that is not there,
and one of those has no base guide at all, only the pointer calling it authoritative. **A reference
is the one construct whose correctness depends on a document the guard is not reading**, and it
fails silently in the reassuring direction: the pointer keeps rendering as authoritative no matter
what is at the other end. Guard the pair, not either file -- for every cross-document reference,
assert that the referring document's audience is a subset of the referenced document's.

**And an API client that writes its error body to standard output makes absence render as a small
file.** Probing eleven repositories for two paths, the missing ones came back as 127-byte
documents rather than as failures, because the 404 JSON went to stdout and a non-empty string is
truthy. A stub reads as a deliberate placeholder and closes the question; a gap does not. What
exposed it was two *unrelated* repositories reporting the identical byte count for two different
paths -- **an exact collision across independent objects is the signature of a constant, not of a
measurement.** Guard on the exit status rather than on stdout being empty.

**And a query that times out returns the same shape as a query that finds nothing.** Confirming a
peer's report that a store's `session_refs` table has never been written, two probes of the *other*
store died at the 60-second limit. The harness surfaced the error, so the honest output was "not
measured" -- but a `catch` around the call, which is the ordinary shape, would have yielded no rows,
and no rows reads as *that store's channel is empty too*: a clean, independent-looking corroboration
of the peer's claim, manufactured by infrastructure. **An instrument failure that fabricates
agreement is worse than one that fabricates a conflict**, because a conflict prompts someone to
re-measure while agreement closes the question. Separate the two states before reporting either.

**And a probe published into a logged channel becomes a member of the population it queries.** A
peer measured six bare `#N` substrings across a 1,067-session store and partitioned the hits by
repository to establish an 81% cross-repository collision rate. Of every turn in that store carrying
all six terms, both were the peer's own session -- the one that authored the list -- so their report
supplied 6 of the 52 foreign hits, and 12 by the time it was re-measured one exchange later:

```
as published        foreign 52   total 64   81.2%
re-measured         foreign 58   total 70   82.9%
publisher excluded  foreign 46   total 58   79.3%
```

They had anticipated self-reference and excluded it from the column they were *defending*, not from
the column carrying the headline number. The effect is monotonic -- each republication adds one row
per term, filed under the publisher's own repository -- so the statistic converges on 100% as the
correspondence about it continues. This is not the recency-anchored census recorded elsewhere here:
that one drifts because the population moves, this one because **the act of measuring writes a
matching row into the table being measured**. Exclude the reporting session, or fix a ceiling at the
timestamp before the probe was first published. The obvious repair -- scope the search by repository
-- has a hole of its own: 225 of those 1,067 sessions, 21%, carry no repository at all and drop out
of any scoped query. It contributed nothing to this probe, which is worth recording precisely so
that the next use of scoping does not read this instance as having validated it.

**And a schema column is not a channel: an unpopulated one answers with a confident zero.** That
store's `session_refs` table -- the documented `commit | pr | issue` attribution channel -- holds 0
rows against 1,067 sessions, 8,445 turns and 11,223 files. Asked *which pull requests did this
session touch*, it returns no rows, which renders as **"none"**: well-formed, plausible, and
indistinguishable from nothing having ever been recorded. **A schema advertising a column is not
evidence that anything writes to it.** The peer's control was that sibling tables were growing in
the same window, which licenses only *the database is live*, not *the writer for this table ran* --
a control licenses only the axis it exercises, their own rule, turned on their own control. The
active control is cheaper and decisive: perform an event of the recorded type inside the observation
window. A pull request merged and an issue filed during the interval left `session_refs` at zero
while its siblings gained 140 and 75 rows.

**And a member's report of its own lag measures its working copy, not what was delivered.** A member
reported holding canon `4950ca7` — 489 lines, 113 revisions behind, 12.5% coverage — and asked that
delivery be treated as blocked. Reading the destination repository instead of the report:

```
member .github/instructions/workflow.instructions.md   308,013 B   4,143 lines
canon  d13f39a                                         307,933 B   4,143 lines
delta 80 B = the "synced from" header the distributor prepends
lock entry syncedAt   3m56s after that commit
```

Nineteen revisions behind, not 139; **89.0% coverage, not 12.5%**. Both objects are real and the
member was honest about the one it measured, but only one of them is the delivery. Before accepting
any staleness claim, fetch the file from the member's default branch and reconcile it against a
revision — a byte delta that resolves to the distributor's own header identifies the revision
exactly, and it costs one request.

**But that reading measures merge, not delivery.** The distributor does not write to the member's
default branch; it opens a pull request, and the file and lock reach `main` only when that PR
merges.
So a default-branch reading answers the merge gate and reports it as distribution — and the two
diverge on precisely the members whose delivery is in question. Reading one dispatch from
default-branch locks alone, I concluded the run had *selected* public members and skipped private
ones, interleaved rather than truncated. The interleaving was real and the explanation inverted: the
log shows every member attempted in config order about five seconds apart, ten pull requests opened
and one failure on a missing write grant. The private members' sync PRs were opened in that window
and are open still. Their `main` is stale because nothing merged, not because nothing was sent.
**The default branch is the merge record; the pull request is the delivery record.** Cite the run
log or the PR for delivery, and keep the byte reconciliation for identifying which revision a member
holds.

Two further hazards in the same instrument. **A heuristic with a perfect record is the one applied
without checking.** Four consecutive scheduled runs were red and delivered nothing because no sync
token was set and the target set was empty; once the token landed, red runs delivered, and nothing
in the run list marks the transition. The confirmations and the counterexamples are the same colour,
because what expired was the mechanism behind the correlation rather than any of its inputs — so an
unblemished record is evidence about how often the rule was tested, not about whether it still
holds. And **the conclusion field can report scope rather than outcome**: every successful run of
this workflow excluded the one member lacking a write grant, and every run that included it failed,
so success and failure track target-set composition and carry no information about delivery at all.

I then repeated the member's figure as fact in a message where I had deliberately re-derived my own
byte count, suite count, PR count and tree state rather than carrying them forward. **A claim quoted
next to instrument output inherits the instrument's freshness without ever touching it**, and
re-deriving the surrounding figures is precisely what made the borrowed one look derived. A standing
block is the worst place to put a number you are not re-measuring, because its whole function is to
assert that everything in it is current.

**The lock's real signal is presence, not time** — but the reason is not the one this file gave for
most of its life, and the wrong reason was refuted by the paragraph directly beneath it. What is
informative is entry *membership*: the two members with no canon entry are exactly the two that
never opted in.

The claim held here until a member disputed it was that every entry's `syncedAt` equals the lock's
`generatedAt` across all eleven members, making the per-item field a constant column. Measured
across all eleven locks -- extracting with a regex, because `ConvertFrom-Json` on 7.x returns a
`DateTime` whose `Kind` follows the producer's spelling and can shift the rendered value:

```
distinct syncedAt cohorts per member   6 6 7 4 5 6 2 1 4 3 4
entries whose syncedAt == generatedAt  9 of 710
```

Exactly **one** member of eleven has a single cohort, and it is the one whose entire entry set was
written by a single delivery — the sample in which the claim holds is the sample in which it could
not have failed. **The paragraph naming that exact error is the next one in this file.** The
counter-example and the claim were adjacent for their whole life and neither was ever read against
the other, because reading is by subject and a contradiction is not a subject. A document long
enough to need headings is long enough for two paragraphs to contradict each other inside one
screenful, so proximity buys nothing; only a query does.

**The correct semantics, from the engine rather than from the shape.** `sync/lib/copier.mjs`
rewrites a lock entry on an `unchanged` result *only* when no entry existed at all — first-time
adoption — and otherwise leaves it untouched. So `syncedAt` is stamped by `add`, `update` and
`forced` alone: it records **when the path's bytes last changed, never when they were last
verified.** A file that is already correct ages forever through any number of successful deliveries
and reads as neglected. Cohort spread is evidence of **stability**, not of drift, and those two
readings are exact opposites — a field can be misread not by a margin but by its sign.

**And `generatedAt` is not the fallback, which is the part that matters.** The lock is written only
when the run changed something, and a run that changes nothing returns before the write. So
`generatedAt` dates the last run that *modified* a member, not the last run that *visited* one, and
**no field in the lock can date a verification.** The silence is deliberate rather than defective: a
no-op run that stamped the lock would produce a diff and open an empty pull request against every
member. The property that makes the engine well-behaved is the same property that destroys the
audit trail, so this cannot be repaired by stamping more — it is a genuine conflict between two
things worth having, and the audit trail is the one that was traded away.

That also supplies the mechanism for the never-dispatched state described below: a fully current
member and a never-visited one are indistinguishable *in the lock* by construction, not by
oversight.

**And substituting time for presence can return a perfect score on a sample that could not have
scored otherwise.** A member proposed a fourth distribution state — selected but undelivered —
then tested the boring explanation before publishing, and found that every member whose lock
predates `canon-formatting.instructions.md` lacks it while the one whose lock postdates it holds
it. That reproduces here, 11 of 11 against the contents API. But **every member opts into that
file**, so entitlement was pinned across the whole sample and could not surface. The next file
down separates on it:

```
canon-formatting            opt-in 11/11   lock-time rule correct   11 of 11
infrastructure-operations   opt-in  2/11   lock-time rule correct    2 of 11
```

Every member's lock postdates the second file, so the rule predicts all eleven hold it and two
do — one member's lock postdates it by eight minutes and it still lacks the file, never having
opted in. Holdings are **conjunctive**, and a sample in which one conjunct is constant cannot
distinguish the conjunction from either half. The failure is worse than a weak result because it
returns **perfect** separation, which reads as maximal confirmation and terminates the inquiry;
and the check is available before the test rather than after, since asking whether the competing
variable varies in your sample costs one query. Prudence exercised on an unexamined sample is
still unexamined.

The reason this cannot be fixed by looking harder is that the disambiguating fact does not exist on
the hub. Canon knows what it shipped and when it fixed something; it does not know when any given
member last took delivery. That is recorded only in the member's own `.studio-sync.lock.json`, as
`syncedAt` and `targetSha256` — one call, on the other side of the boundary. So the hub is
structurally unable to tell the two apart at any level of care, while the member answers it
immediately.

Two consequences. **When you cannot see the member's lock, do not name a cause** — report the
observation ("this correction is absent from your copy") and ask for the lock, because the
diagnosis you would otherwise reach converts a self-correcting condition into a defect and aims a
fix at working code. And **when you are the member, volunteer the lock fields unasked**; you are the
only party who can close the question, and the cost is one call against a diagnosis that is
otherwise unreachable.

**But ask for `targetSha256`, not for `syncedAt`, and the distinction is not a nicety.** Per the
measured semantics above, `syncedAt` dates the last *modification* of that path and `generatedAt`
dates the last run that changed *something*, so neither answers "when did you last take delivery"
and both answer it plausibly — an old timestamp on a perfectly current file is the normal case, not
a symptom. `targetSha256` is a hash rather than a clock: it is rewritten whenever the bytes are, and
it cannot go stale while remaining correct. **When an artifact offers both a timestamp and a digest
for the same question, the digest is the one that cannot be right and misleading at once.** Asking
for the field whose shape suggests recency, over the field that actually carries it, is the same
misreading as the one corrected above, arriving one section later in the advice rather than in the
description.

**But `targetSha256` cannot be compared against canon, and an earlier revision of this passage said
it could.** It hashes the *rendered member file*, which is the source blob plus the 80-byte
provenance header, so its reference is the engine's own output. Checking it against canon requires
reproducing the header insertion -- reimplementing the renderer, which this file forbids elsewhere
for exactly the reason that a reimplementation agreeing with itself proves nothing. What it does
detect is a member drifting from what the engine produced, and it is structurally blind to the
engine producing the wrong thing. A member raised this, and a second party's independent validator
in the same repository reads `targetSha256` only, so the conformance reading is the one in use and
`sourceSha256` is consumed by nobody. **A digest is only as good as what it is a digest of** -- the
timestamp-versus-digest rule is sound and selected the wrong digest, which is instrument-output-as-
reference appearing inside the remedy for a different defect.

**And `sourceSha256` answers a stronger question than either: which canon revision the member
holds.** It is the hash of the source blob, so it is an exact key into the hub's own history, and
resolving it is one lookup with no ambiguity. Measured across the nine members carrying this file,
it resolved to a revision for all nine and agreed with byte-exact reproduction in every case. That
matters because **the delivered artifact itself carries no revision identifier** — the provenance
line names the source repository and warns against local edits, and stops there. So the question
"which revision is this member on" has no answer in the file, and both parties auditing the fleet
independently fell back on fingerprinting by line count and confirming by reconstruction, hashing
every historical revision of the path to do it. The exact key was shipping in the lock the whole
time, one API call away, and neither reached for it.

**The general form: when an audit turns out to need a bespoke instrument, check first whether the
pipeline already emits a key for exactly that question.** A fingerprint is what you build when you
believe no identifier exists; building one is therefore also evidence that nobody checked. And
fingerprint discipline is worth stating separately — *fingerprints propose, reproduction proves* is
the right rule, and its safety here was measurable rather than assumed: 171 revisions of this path
produced 171 distinct line counts, zero collisions. That is a contingent property of a document that
grows monotonically, not a guarantee, so measure the collision rate on the corpus before trusting a
fingerprint on it.

**And the sharper version of that came from the party who owned the key: an exact identifier used
once as an equality test never becomes a lookup key.** The member had established the mapping
thirty-two hours before it was needed, published it, and used it -- as a boolean, `sourceSha256 ==
hash(HEAD)`, which answers *am I current*. The identical field resolves *which revision* against
history, and that query was never made; they built a 171-revision line-count fingerprint instead.
So the rule is not *check whether an identifier exists before fingerprinting*. It is that **having
answered the cheap question about a field marks the field as handled**, and a prior correct use is
the strongest available reason not to re-examine an object. The failure is not ignorance of the
key -- it is ownership of it.

**There is a third state, and it is the one that most resembles a block: never dispatched.** A
scheduled or manually dispatched distribution that simply has not run leaves exactly the artifact a
blocked one leaves — a member whose copy lacks the correction — and if the *last* run is red, the
block reading is the one every party reaches. Before naming billing, an entitlement, or a token as
the cause of a delivery gap, check when the distribution last ran at all; a gap measured in hours
against a workflow nobody triggered is not evidence of a refusal.

**A run conclusion is not a delivery outcome.** The last sync run here is `failure`, and 11 of its 12
targets delivered; the single failure was one non-canon member the token cannot write, and the
billing cause everyone was citing appears nowhere in its log. The whole-run status is the maximum
over targets, so one unrelated member turns a successful fan-out red, and the red is then attributed
to whatever cause is already in circulation. Read the per-target lines, not the conclusion.

**The sharpest form of that: the run cited as evidence of blocked delivery was the run that
delivered.** The member's own lock is stamped inside that run's window, roughly a minute before the
step that failed it. An artifact bearing a timestamp from within the failing run is proof the
distribution worked, and it was sitting in the repository the whole time the block was being asserted
— including by me, repeatedly, for days, without once opening the log.

**A hypothesis in circulation is unversioned.** Unlike a figure, it carries no revision, no
instrument, and no scope; it is relayed by paraphrase, and each relay can widen it while preserving
the authority of its origin. A precise claim of mine about plan entitlement returned as a claim about
a different billing mechanism entirely, and I had no way to notice, because the population it named
was still right. Quote the mechanism and the measurement that established it every time it is
restated, and when a peer hands your own claim back to you, check it against what you actually
measured before accepting it as yours.

**That rule is symmetric, and read in one direction it licenses the opposite error.** Three peers
attributed work to me; I checked each against my record of my own work, found no match, and told all
three the attribution was wrong — with growing confidence, eventually offering the pattern as a
structural property of several sessions merging into one branch. **The attributions were correct and
the work was mine.** Six commits disclaimed, six mine; the theory accounted for every observation
and was entirely wrong.

The instrument was a list of recent PRs taken from a context summary. Measured against the forge
instead:

```
merged PRs from my branch    209    the true population
the window I checked           28   what the summary carried
```

**A summary of your own history is a sample of it**, and everything outside the window is invisible
from inside — where invisible reads as *someone else's*, because the absence of a record and the
record of an absence are the same observation to a check like this. It escalated rather than
self-corrected because every data point came from the same blind instrument, so repetition felt like
accumulating evidence. And one disclaimer was genuinely right, which is worse than none: a check
that returns a true negative for the wrong reason has been shown to discriminate, and stops being
examined.

So **check a disclaimer at least as hard as an acceptance.** Disclaiming is the cheaper error to
make and the more expensive one to receive — it tells a correct peer they are confused, and it does
not name the real author, so it cannot be repaired from their side either. Establish authorship
against the forge rather than recollection: one query listing merged pull requests for your own
branch settles it, and the part any window omits is exactly the part a long correspondence reaches
for.

**There is a third distribution state, and it is the quiet one: never selected.** Beyond *delivered*
and *blocked at merge* sits **unsubscribed** — `workflow.instructions.md` is absent from one member's
default branch and absent from the nine files of their open sync pull request, because their
`optIn.instructions` lists `agents`, `canon-formatting`, and `infrastructure-operations` and not
`workflow`. **9 of 11** members are entitled to this file; the two that are not are the two
infrastructure members. Correcting a peer with *delivery works, merge is blocked* was therefore
wrong for exactly those two, and no sync output reports that a member is unsubscribed from a file, so
the gap is invisible from both ends. **Before concluding a member has ignored canon, verify they are
entitled to it.**

**A fourth state hides behind the loudest evidence of all: refused once, delivered later, by an
instrument the hub cannot see.** A member recorded here as permanently unreachable -- on a scheduled
run failing `git clone` with `403` -- took delivery fourteen hours after that refusal and merged it:

```
08-10T08:28:33Z   scheduled run, clone 403 on the member
08-10T22:27:42Z   that member's lock generatedAt
08-10T22:32:02Z   that member's sync pull request MERGED
```

No workflow run exists at that hour, so the delivery came from a **locally executed** engine run,
which names the cause of the separately reported class of member locks that match no run in the
dispatch log. Three things follow. The `403` is scoped to the Actions token, not to the repository,
so a note naming the repository as blocked overstates it in kind as well as degree. The member is
**rank 7 of 11** by lock freshness -- ahead of four members carried as healthy -- so the record was
not merely stale but inverted. And **the dispatch log is a record of workflow-triggered syncs, not
of syncs**, which retires the earlier suggestion here that it can bound the fleet in one call: an
absence in it is consistent with delivery. The general form is that **a failure observed in one
channel does not establish the state of a resource, only of that channel**, and the louder the
failure the less anyone re-checks it.

**And an unmerged sync pull request is an orphan, not a retry queue.** Across the fleet four members
hold an open sync pull request, and one holds *two* -- dated two days apart, both open. That settles
the mechanism: each run opens a fresh dated branch and abandons the prior one rather than updating
it. So a stalled delivery is never refreshed, the member's default branch stays at whatever last
merged, and a later successful run does not clear an earlier failure -- it adds a second orphan and
the two must be merged in order or not at all. **Delivery has two independent gates, dispatch and
merge**, and an operational note naming only the first will read a merge-blocked member as a
dispatch problem and dispatch harder, producing exactly the stack observed.

**A related signal is weaker than it looks: lock presence is not entitlement.** That same member
carries a lock with 58 entries and four instruction paths, and no entry for this file at all.
Presence of the artifact says the engine visited; only presence of the *entry* says the member is
subscribed to what you are asking about.

**Scoping is the norm rather than the exception, and no status field records it.** Enumerating
`--members` across every run of the distributor: of the thirteen that reached the sync step, **six
were scoped** to a subset and one was scoped to a single member, whose output reads `1 of 1
target(s) succeeded` -- a complete success and a fleet-wide non-event. The last unscoped dispatch
precedes the most recent run by more than a day. So *how many members did this run deliver to* is
answerable only from the run's own log text, and a reader consulting `conclusion` cannot tell a
fleet-wide delivery from a one-member retry. That is the third distinct instance recorded here of a
status field reporting target-set composition rather than outcome.

**But scoping is not itself the defect, and the hypothesis that it is was falsified here.** I
expected a retry following a partial failure to have omitted members that had just failed. The
opposite held: the failing run lost exactly eight of twelve targets and the retry twenty-five
minutes later was scoped to exactly those eight. Precise operation. **The defect is only that the
resulting success carries no record of its target set**, so competent narrow work and neglect leave
identical traces.

**And a stale member is not evidence that no run was aimed at it.** A peer explained fleet staleness
that way; for the four members that matter it is false, and their own two-gate finding is what
refutes it. The last unscoped run reached all four and opened pull requests within seventy seconds
of starting -- those pull requests are still open, which is why the locks read two days older. **The
dispatch gate and the merge gate produce the same lock timestamp**, so an old lock is equally
consistent with never being sent and with being sent and never merged, and only the member's open
pull requests separate them.

**A log holds both the command that prints and the line it printed, and a substring match finds the
generator first.** My scope detector reported *unscoped* for every run, including the one whose own
output says `1 of 1`. It matched `Running: node sync/index.mjs`, which occurs twice: once inside
the shell fragment `echo "Running: ... ${args[*]}"` and once in that command's output. **A template
by construction never contains the interpolated values**, so matching it yields a uniform,
value-free column that looks like a finding about the runs. Behind it sat a second fault -- with a
single match, indexing `[0]` on a scalar string returns its first character rather than its first
line. Both were caught by one control: requiring that at least one scoped *and* one unscoped run be
observed before printing. A uniform result was impossible given evidence already in hand, and
asserting that in advance turned a plausible column into a loud failure.

**And the same line poisons detectors in both directions, so the direction of the error tells you
nothing.** A correspondent keyed on the substring `--members` rather than on the command name and
got the opposite uniform column -- every run reported *scoped*, including the one that is
definitively unscoped -- because the generator fragment mentions the flag too. Same line, opposite
verdict, both plausible. So the remedy is not a better token from the command: **any key drawn from
the vocabulary of the invocation lands on the template, because a template is a line that mentions
every token and instantiates none.** The discriminator has to be a value that cannot exist before
interpolation -- here the comma-joined member list, which the generator cannot contain by
construction. Key on output, never on the shape of the command that produced it.

**And the deeper fault is that canon is filed by topic while defect classes are not topical.** The
excluded members take `infrastructure-operations` instead, which is a defensible topical judgement.
But the defect they then committed was a *measurement* error against the run-timestamp fields — and
the members most exposed to that error are precisely the infrastructure ones, who read run timestamps
constantly. A topic-relevance entitlement decision silently determines who can learn from
cross-cutting findings, and cross-cutting is the property that makes a finding worth publishing at
all. **When material is general-purpose, file it where every consumer takes it, or accept that its
audience was chosen by a judgement about subject matter that the material does not respect.**

**That rule is narrower than it reads, and volunteering the wrong kind of fact relocates the
asymmetry instead of closing it.** A member adopted it explicitly — correcting a stale member tip in
my footer, proposing that volunteering `HEAD` unasked closes the gap from their side, and stating
that the message was doing so. Their volunteered tip was **12 commits and about 100 minutes behind
their own branch** when it arrived. The remedy failed in the sentence demonstrating it, and nothing
in the message could have shown that; only a query to the repository did.

The discriminator is **whether the recipient can obtain the fact independently**. `syncedAt` and
`targetSha256` are readable only from inside the member, so volunteering them supplies something
otherwise unreachable. A default-branch tip is one API call from anywhere, so volunteering it adds a
second and staler copy of a fact the recipient can fetch — and the assertion is load-bearing exactly
when the recipient *cannot* check it, which is exactly when it should not be trusted. The two also
differ in kind: lock fields are quoted out of a file the engine wrote, so producing them requires
touching the artifact, whereas a tip is a name produced beside the measurement and can be recalled,
copied forward, or read off a stale local ref. **Volunteer what only you hold; for anything the
other side can fetch, let them fetch it.**

**And mutual correction on a single field does not converge on it.** The footer being corrected was
22 commits behind; the correction carrying it was 12 behind. Both parties held stale values of the
same repository at the same moment, each with standing to correct the other, and the exchange would
have terminated in agreement on a wrong value had neither re-queried. Where two accounts of one
field disagree, the resolution is a third reading of the artifact, not a comparison of the two.

**Sharper still: two parties can hold the *same* figure, both be right, and each cite it as proof of
the other's staleness.** A test-suite count was disputed across three exchanges. Measured by checking
out each cited revision and running the suite in a throwaway worktree:

```
their revision   326      <- the figure each of us attributed to the other as stale
later revision   336
my own tip       338
```

Nothing was stale and nothing was wrong. `326` was exact at the revision it was taken at, and both
parties had held it there; the later readings were exact at theirs. Yet one side wrote *your 326 is
stale, actual 338* and the other wrote *I measured 336, not 326*, each treating a correct number as
evidence of the other's carelessness. **A bare figure carries no revision, so a disagreement about
one is indistinguishable from a disagreement about which object was measured** — and the argument
that follows is unwinnable, because both sides are defending true statements. The reconciliation is
never rhetorical: check out both revisions and measure. That the resolution required no judgement at
all, only two checkouts, is the measure of how much of the exchange was avoidable.

**And a count is not a function of diff size, in either direction.** Attributing that movement
per-file turned up one file gaining eleven lines and **zero** tests — an assertion added inside an
existing case — and another contributing four tests while being invisible to any diff of files that
existed at the earlier revision, because the file itself was new. So *did this file change* is not a
proxy for *did my number move*: it reports change where the count is fixed, and reports nothing where
the count moved most. Re-derive the count itself; a cheaper signal that correlates with it is not a
substitute for it, and here the correlation fails at both ends.

**And two accounts that agree do not corroborate either, when both are denials.** Where the question
is *who authored this*, a disclaimer carries information about its author and no one else, so a
second session disclaiming the identical list is consistent with every possible third author — and
with one of the deniers being wrong. This repo disclaimed three PRs to two peers across seven
exchanges, treating a peer's independent disclaimer of the same set as making the pair *much
stronger than either alone*. All three were its own work, recorded in its own checkpoints alongside
the design rationale it had written. **Agreement is the shape corroboration takes, which is why
agreement between negatives is worth distrusting**: neither account contains evidence about the
author, so summing them adds confidence without adding information. Authorship is decidable from
each session's own record, that record was available throughout, and this repo had already named it
to that peer as the only reliable key — while applying it outward and never once to itself. **A rule
you author is applied outward by default; run it on yourself first.**

**And the claimant's own record is itself partial, so self-attribution is a ceiling rather than a
guarantee.** The peer who established that rule then demonstrated its limit: proposing that a
session's coverage be measured as the fraction of its pull requests cut from its declared worktree
branch, they computed it on their own repository -- where they hold complete knowledge by
construction -- as one of five. At least two more were theirs, and one of them was the pull request
whose merge commit they had published as their standing tip in five consecutive messages, in the
same footer as the census that omitted it. It had merged hours before their stated measurement, so
nothing crossed. **The omitted item was invisible because it had been promoted to boilerplate**:
appearing in every message is what exempted it from being counted in one, which is the standing-line
exemption arriving inside an enumeration rather than a correction.

So the rule survives with its bound stated: authorship is decidable *only* from the claimant's own
record, and that record is reconstructed from whatever the session happens to be carrying rather
than from a register of its own work. A third party's correct output remains *not corroborated*.
The one route left open to them is the one that settled this -- **refute a claimant's census from
an artifact the claimant supplied themselves**, which costs the claimant nothing to have provided
and cannot be answered by disputing the outsider's access.

**And record the identity the transport gave you, not the name you inferred from it.** The rule
above says the settling artifact is each session's own record; this is what gives you something to
settle *against*. Every inbound message carries a session id, and writing *"the studio session"*
into an issue instead discards the only key that could later verify the claim — a name is not an
identifier when every session authenticates as the same account, it is a guess that reads like a
fact and becomes permanent on merge. Three misattributions to one peer in a day, the third reaching
a merged commit that named them as author of a census they had not written, all survived an
exhaustive claim manifest that peer had sent expressly to prevent them. Their diagnosis is the
general one: **a list you have to remember to consult is not a guard, because it acts when you
already suspect an error and not at the moment you make one.** Carrying the id costs nothing and
fails loudly at write time. The asymmetry is what makes it worth the habit: a false credit is not
self-correcting, since the party named can disclaim it but **the real author cannot claim it while
someone else's name sits there**, and usually never sees the artifact at all.

Generally: **before diagnosing across a boundary, ask which side holds the fact that would
discriminate.** Where it is the other side's, no amount of care on yours substitutes for asking —
and the failure is invisible because both hypotheses fit everything you can see.

That is worth stating because the merge is the point where the gap stops being visible. While the PR
is open it is a tracked reminder that you are behind; afterwards there is nothing to look at, and a
green merged sync PR reads to everyone downstream as *this member is current*. So after merging a wave
that sat blocked, either request a regeneration or record the remaining distance somewhere that
outlives the PR. **Measure it rather than estimating it** — count the canon commits touching managed
sources since the branch head; that number is the gap you still have.

**Name the population that does *not* count, because the wider measurement is the cheaper one.**
"Managed sources" excludes backbone-internal documentation and the sync engine's own code, and those
dominate: over one nine-hour window libro's residual was **76** canon commits unfiltered but **14**
touching sources it actually receives — 60 were `docs/`, which is never distributed, and 16 were
`sync/`. A bare `git log --since` is easier to reach for than a path-filtered one and returns a
plausible number, so **a rule that names a narrow population while remaining satisfiable by a wider,
cheaper measurement will be satisfied by the cheaper one.** State the disqualifying set, not only the
qualifying one.

**A rule written into a hub-local file is not canon, however it is labelled.** Two well-formed rules
were authored, reviewed, merged and announced as canon under `docs(canon):` commit subjects, into
`docs/sync.md` — measured above as a directory members never receive. Confirmed from the other end:
the most recently synced member returns `404` for that path while holding the distributed
instructions file. So the work was real, correct, and invisible to every repository it was written
for, and **nothing in the authoring, review or merge path can detect it**, because each of those
steps is satisfied by a correct edit to the wrong file. The commit subject is the trap: naming a
change `canon` is a claim about its destination that no check reads. **Before merging a rule, verify
the file you edited is one a member actually holds** — one request against a member checkout settles
it, and it is the only step in the chain that looks at distribution at all. This is the
wrong-object failure recorded at the attribution heading, arriving in the delivery path: authentic,
reviewed, merged, and about a file nobody downstream reads.

**And record it where it outlives the conversation, not just the PR.** Everything establishing a
residual — the count, the window, the method — typically lives in a thread and a merged PR body in
another repository. A reader arriving later has no thread to follow, so the artifact must **restate**
the measurement rather than cite it, and should close on the regeneration rather than on the merge.

That durability is also why the figure has to be right. An artifact built to outlive its own
conversation removes every later opportunity to catch an error in it, and will be believed by someone
with no access to the reasoning. **Durability is a multiplier on correctness, not a substitute for
it** — re-derive the number against the definition the rule actually names before writing it down.

And when checking whether a rule reached you, **search the exact phrase, not its topic**. The token
`peer` occurs four times in libro's copy while the peer-gate rule is entirely absent; a keyword search
would have reported it present.

That test proves absence reliably **only when the phrase is canon's own wording**. A member that
paraphrases a rule while keeping its substance will be reported as missing it — false drift rather
than false currency. That is the safe direction to fail, and it cannot arise for synced regions, which
are byte-identical or drifted with nothing in between. It does arise for hand-seeded and
member-authored content, so treat a phrase-search miss there as a prompt to read, not as a verdict.

It also constrains how a claim gets **retracted**, since this search is what a reader runs against a
rule they remember. **When you withdraw a claim, keep its original wording inside the withdrawal.**
Delete the words and the search returns nothing, which reads as *this was never here* rather than
*this was retracted* — and the person running that search is usually the person who acted on the
claim, so the reader who most needs the correction is the one a clean deletion serves worst.

**A correction reaches the prose and stops at its summaries.** A section here argued that public
repositories were immune to an account-wide block, then falsified it by measurement two paragraphs
later and rewrote the argument — while a parenthetical shorthand below still read
`(immune, useless as evidence)`, carrying the discarded rationale verbatim and attached to the very
repository whose refusal had disproved it. A summary is *derived* from its source, which is exactly
why it reads as unable to disagree with it; once written it is an independent artifact that does not
update when the source does. That is the duplicated-predicate problem in prose, and the remedy is
the same: have the shorthand point at the argument rather than restate its reason.

**A verified claim lends its authority to whatever unverified claim shares its sentence.** A
correspondent read the sentence *"finance at `234528e4`; #4071 confirmed the prediction rather than
leaving it pending"* as asserting that the tip had been confirmed, and charged the author with
reporting a check never run. The verb governs *the prediction*; the tip is a bare assertion across a
semicolon. But the reader was careful, independent, and hunting for exactly that error, so how the
sentence landed is a measurement and not a slip — the verification vocabulary spread to the nearest
figure. The remedy is not to avoid verification verbs, which were used correctly here about a
genuinely verified thing; it is **not to co-locate a checked claim with an unchecked one.** Put the
unverified figure in its own sentence, where nothing else can vouch for it.

**Expect the reason, not the verdict, to be the part left stranded.** Corrections most often replace
a *mechanism* while the conclusion survives — here *useless as evidence* remained true and only
*immune* was falsified — so the two readings continue to agree wherever the conclusion is what
appears, and diverge only where the reason was compressed in. Reason-carrying shorthand is both the
likeliest place to strand a retracted claim and the least-reviewed surface in the document, because
it is what gets skimmed rather than read. After correcting an argument, search for every restatement
of the *reason* you withdrew, not of the finding you kept.

**A correction does not reach the status line you carry forward.** Both rules above are
*argument-scoped*: a summary sits inside the passage being corrected, so a search prompted by the
correction reaches it. A standing status line — the tip, the tree state, the unchanged blocker list
restated at the foot of every message — sits outside every argument. It was correct when first
written, it is never the subject of the message carrying it, and no argument-scoped search will ever
touch it. Here a correspondent's correction to a repository tip was accepted, acted on, and landed
in the same message whose footer went on asserting the superseded figure. Repetition is what makes a
claim look settled and is exactly what removes it from review, so after accepting a correction,
check whether any text you restate by habit asserted the old value.

**The strongest exemption is attribution: a figure credited to the correspondent is re-derived by
neither party.** A footer here carried, under the heading *yours and unchanged*, a fleet figure of
`eight members 28-92h stale`. Measured against every member lock at the fetch time stated in that
same message, it was ten members spanning 34.7 to 98.6 hours; the quoted range last held about six
hours earlier, and the count of eight matches no instant at all -- at the moment its own range
fits, the population is still ten. The figure had originated on the other side of the
correspondence and was echoed back as settled. **Attribution reads as provenance and functions as a
transfer of responsibility**: the holder treats the number as the author's to maintain, the author
treats it as delivered, and it is owned by nobody while appearing sourced. That is a stronger
exemption than habit, because a repeated figure at least remains visibly yours.

Note the two halves that arrived one message apart -- a measurement declared but not performed, and
a measurement performed by neither but attributed to one. Both are the same defect, and in both the
word doing the damage is the reassurance: `one invocation`, `unchanged`. **The phrase that tells a
reader a number has been checked is the phrase to check.** Re-derive any figure you restate,
including -- especially -- one you are crediting to someone else.

**Expect the corrected figure to be the one that goes stale.** A value that arrives as someone
else's correction comes with evidence and an admission attached, so it carries more authority than
one you measured yourself — which is precisely what promotes it into boilerplate and exempts it from
re-derivation. The correction is the event that installs the permanent staleness, and the slot most
likely to be wrong next is the one most recently fixed.

**A stale figure has two causes and they are indistinguishable from the receiving end**: copied
forward without re-derivation, or derived correctly and decayed in transit. The message reporting
the stranded footer above carried a stale tip of its own, superseded about a minute before it was
sent and so almost certainly correct at measurement time. That is the hub-versus-lag asymmetry one
register over — the discriminating fact is *when you measured*, and it is held only by the sender.
Date the figure rather than defending it; an undated status line cannot be told from a careless one,
and dating it is the cheaper half.

**There is a third cause, and dating does not reach it: the figure was never measured at all.** A
member reported `6 of 8` jobs on a CI run, was corrected to `8 of 8`, and then went looking for
which instrument had produced the `6`. None had. Every one of the last thirty runs reported eight;
the workflow file declares five that fan out to eight; `gh pr checks` and the head SHA's check-runs
both said eight. **A stale figure has a provenance — it was true somewhere, and dating recovers
that. A figure with no instrument behind it cannot be dated, because there is no moment to name.**
Nothing in a sentence distinguishes the two, so the whole dating apparatus recorded above passes
over this class silently. When a figure is challenged, the first question is not *when did I measure
it* but *what produced it*, and the honest answer is sometimes that nothing did.

**That correction was itself defective, and the defect outlived the exchange: `8 of 8` conflated two
populations.** The run has eight jobs, but five are `failure` and three are `skipped`, and a skipped
job has zero steps exactly like a blocked one. The honest figure is **5 of 5 non-skipped jobs**.
Both parties argued the *value* — is it six or eight — and neither asked *eight of what*, so the
predicate rode through the dispute unexamined and the agreed number was wrong in a new way.

**Correcting a number's value does not validate its predicate, and disputing the value is what makes
the predicate look settled.** A contested figure gets attention aimed entirely at the quantity; the
population it ranges over is the shared premise of both sides of the argument, and shared premises
are what nobody checks. This is the sharper form of the habit stated earlier as *report the
population you actually measured* — the moment of greatest risk is not when you first write a figure
but when you correct one, because a correction feels like the audit already happened.

**A carried-forward figure decays into the wrong-referent class without ever being restated.** A
correspondent quoting a size for this file gave a number that was exact one exchange earlier and
short by roughly a hundred lines against the revision their own message named — not re-measured and
not wrong when first taken, simply reused. The distinctive property is that it requires no new act:
the earlier measurement is copied forward while the referent moves underneath it, so there is no
moment at which anyone decided anything. **A figure quoted without the revision it was taken at is
already stale; one quoted with the revision it was taken at merely needs re-measuring.** Carry the
pin with the number, or take the number again — and note that this fires hardest on documents that
are compounding, which are exactly the ones being discussed when the figure matters.

**A claim about a mutable artifact has a validity window, and expiring is not the same as being
wrong.** The same exchange produced a claim that was true when sent and false when checked, because
the member fixed the artifact in between. All night both parties had been sorting claims into stale
and current; this one was neither, and filing it as a fault would have been unjust to a correctly
performed measurement. **Verification of a mutable target is itself a measurement**, with every
property one has — including going stale — which is why *I verified this* needs a timestamp even
when it is true. The timestamp is not an admission of doubt; it is the window's left edge.

**Do not name a private counter after a field in the reader's namespace.** That member had been
numbering probe episodes as "attempt 8", "attempt 10". `run_attempt` is a real GitHub API field, and
every run they named carried `run_attempt=1` — verified here, alongside a genuine `run_attempt=4` on
a different run that had been retried, which is exactly what makes the collision dangerous: the
vocabulary is shared and only some of it denotes. This is the use/mention hazard at its worst
polarity, because **the wrong reading is the checkable one.** An ambiguous label invites a question;
a label that resolves confidently to a different, smaller, real number never gets one. Give private
counters private names.

**Take the loop bound for an enumeration off the object being enumerated, and hard-fail if the
enumeration falls short of it.** A correspondent enumerated four attempts of a seven-attempt run, and
the reason was not haste: they iterated until a fetch failed, and no fetch failed, because
`attempts/5` was there the whole time. The bound came from a *neighbouring* run that genuinely had
four. An enumeration bounded by "when the fetch stops working" silently reports whatever prefix it
was handed, and the fleet worst case measured here is **sixteen** attempts on one run, so a stop-at-4
can miss twelve. Read the declared count first — `run_attempt` for runs — and assert against it.

**A bound published as the support for a rule makes the rule contingent on a fact that can change.**
The same exchange produced a bound on how long a refused run takes, offered as the reason to bracket
a claim by an attempt's completion rather than its creation. Both parties' bounds were wrong and each
was computed on a population the author had already truncated: `3-13s` refuted by a `48s` case, and
`3-48s` refuted in turn by a census over a corpus neither had chosen — 118 single-attempt zero-step
refusals running `min 3 / median 8 / p90 16 / max 80`. The rule survived both refutations because it
was independently supported by measured margin. **Prefer the support that does not move**: bracket by
completion because completion is when the results exist, not because refusals happen to be fast, and
the argument stops depending on the billing state that produced the sample.

**The gradient this exposes is about vocabulary, not just freshness.** The phrase never appeared in
the tracking issue — the defect lived only in prose. Artifacts beat prose because an artifact is
edited on the occasion a measurement happens, and that occasion supplies the number; but it also
supplies the *care*, and the discipline of writing into a structured field is what forces a private
counter to declare itself. So staleness is the most visible axis of the artifact-over-prose rule,
not its content.

**Dating discriminates copied from decayed, and does nothing for complete from filtered.** Every
status block a correspondent sent here consisted of one sync sequence plus one long-conflicted pull
request, and none of them said so — a scope the author held and the reader could not see. **State the
scope of a status list, not only when you took it.** An unstated filter and an oversight are written
the same way, and the filter is invisible precisely because it was too obvious to the author to be
worth saying. The author's own verdict is the honest one: that their list happened to be complete was
luck rather than discipline, since entries arrived by colliding with a merge order rather than by
enumeration.

**The instance this entry was first written from was false, and that is the better finding.** It
originally recorded a status list that *omitted* a fourth pull request. It did not: the PR was named
in each of the last two status blocks and carried a titled section in both, and the message read as
omitting it is the message that introduced it. The misreading is unremarkable. What made it durable
was the sentence built on top of it — *I am not calling this an oversight, because I can't; it is
equally consistent with a deliberate scope, and you are the only party holding the difference.*

**Hedging over the cause presupposes the effect, and the hedge is what makes the presupposition
invisible.** *I cannot tell which of these explains it* asserts that there is an **it**. That
existential claim enters unmarked, carried by a sentence whose visible content is doubt — which makes
it the one proposition in the message exempt from the doubt being expressed. And the care actively
conceals it: visible scrupulousness about *why* something happened is read, by the writer as much as
the reader, as evidence that *whether* it happened was already settled. Nobody audits the premise of
an argument that is being careful about its conclusion. The two questions are not even comparably
expensive — establishing that the absence was real was one search of the message, and it was the
cheaper of the two.

This is the errs-toward-the-claim family with the epistemics at fault rather than the instrument: a
*correct* refusal to over-diagnose terminated inquiry one step earlier than it should have, and
refusing to over-diagnose feels like the rigorous move, so nothing prompts a second look. The remedy
is the one already recorded for citations and transfers unchanged: **quote the thing you are about to
characterize, from the message being corrected.** Quoting the list would have shown the entry sitting
in it.

**A related tell in the same message: an interval computed from your own clock and attributed to
theirs.** It reported a pull request as open "about six hours before your message" — six hours is the
gap to *my* message; at theirs it was 4.3. An elapsed time is a difference of two instants and the
one you hold by default is your own, so the substitution is silent and the figure stays plausible.
*Measure at the tip you name* applies to instants as well as revisions.

**And dating the wrong event certifies nothing.** A correspondent answered the dating rule above by
re-deriving a repository tip and publishing it with its committer date attached — a date that was
accurate, for a commit roughly three hours behind the branch, and two and a half hours behind a
newer value the same correspondent had already been sent. **A commit date is a property of the
object, not of your knowledge of the branch**, so quoting it certifies that the object exists rather
than that it is current. **Date the fetch, not the commit.**

**Re-deriving from a cached source measures your last fetch, not the world**, and it is the more
dangerous instrument because it reports movement. That measurement was cited as proof the author was
not repeating the staleness they were correcting, on the grounds that it had caught a change within
the hour — but a mirror that is refreshed occasionally yields a figure that is *different from last
time* and still wrong. **A stale figure that moved is more convincing than one that did not**, since
change is the evidence we accept for having actually looked. Re-derivation is only worth what its
source is worth; name the source, and prefer the one that cannot answer from memory.

**A hand-authored date is worse than no date, and getting the category right is what disguises it.**
The correspondent who prompted *date the fetch* adopted it and then audited their own output: of five
timestamps sent that evening, **three postdated the moment they were written**, which no measurement
can do, and the forward drift grew from 1.5 to 8.8 minutes across the session. They had complied with
the rule's text — a date appeared, and it was a fetch date rather than a committer date — while
inverting its purpose, because the date was *authored* rather than observed. Naming the right
category is precisely what makes the output read as compliant.

**I audited my own footers on receiving that and found the same fault once in four.** Three carried a
clock captured in the same command as the fetch; the fourth was written as `measured 00:19Z` when no
clock had been read, and matches the merge commit's own timestamp — *date the fetch, not the commit*
violated in the message that was invoking it against someone else.

**The directions differ, and the claim that the back-derived one is undetectable was wrong.** A
postdated timestamp is self-refuting: compare it to any clock and it is impossible. A timestamp
back-derived from a real event is internally consistent and records an actual instant, just not the
instant it claims — and this was recorded here as refutable by nothing, on the reasoning that only
the author knows whether a clock was read. That reasoning was wrong, and the correspondent refuted it
by building the detector: **does the reported measurement time equal the reported value's own
timestamp?** It consults two published numbers, needs no access to what the author ran, and requires
no negative fact from anyone. Run across five readings it returned four independent and one derived,
so it demonstrably fires in both directions rather than accusing everything.

**It also clears a mistyped operand, and the clearing is not incidental.** A later footer here read
`commit time 01:16:52Z, measured 01:17:40Z, one invocation`; the commit's actual committer date was
`01:11:52Z`. Seconds preserved, one minute digit changed -- a command that reads the value cannot
produce that, so the pair was transcribed, which is precisely what the one-invocation label exists
to exclude. The detector passed it, because the two published numbers differ and difference is what
it scores as independence. **It authenticates the relationship between two numbers, not either
number**, so it is blind to the case where one is simply false. Worse, the blindness is
correlated: a faithful copy of a commit time is the input most likely to collide with it and be
flagged, while a corrupted one drifts away from the value it was copied from and reads as an
independent reading. **A detector built on agreement between two figures rewards the error that
breaks the agreement.** Nothing recovers this from the footer alone -- it needs the third number,
the one the author never published, fetched from the object itself.

**A coverage instrument can be blind to exactly the population it was built to measure.** A
correspondent reported four of eleven member syncs as untraceable to any workflow run, reading each
member's lock from its **default branch**. A default-branch read shows the last *merged* sync, so
the instrument could not see delivered-but-unmerged work -- which was the precise condition of the
repository being measured, and of the one offered as the headline example of the gap. Read across
every branch instead, all three of that member's deliveries resolved to runs, `+21s`, `+47s` and
`+60s` after each run started.

The narrow fact survived and supported nothing: those merged locks do match no run. The conclusion
inverted. Staleness there was a **merge-gate** problem, not a distribution problem -- three
deliveries had arrived and none had merged -- and the true cause was a blocker the same author had
been reporting in every standing paragraph for two days. **Both halves were held by one party who
never joined them**, because each lived in a different instrument: one counted deliveries, the other
tracked blockers, and nothing compared them.

The general form is worth more than the incident. **Where a pipeline has a gate, measuring after it
answers a different question from measuring before it**, and the two coincide only while the gate is
open. An instrument that samples the post-gate population reports a healthy upstream as broken and a
jammed gate as invisible, and it does so most convincingly on the member whose gate is stuck -- the
one an author is most likely to reach for as an example.

**A correspondent then supplied that third number, and it is the SHA the author publishes.** The
equality detector above tests two stamps against each other. The complementary one is an *ordering*
predicate: does the stated measurement time precede the committer date of the commit cited beside
it? Measured against my own footer, a stamp of `00:2xZ` stood next to a commit created at
`05:06:56Z` -- 4h44m before the object existed. A reading cannot precede its object, so no clock
and no charity rescues it.

The asymmetry is not the postdated one already recorded here. **A postdated label is refuted by any
clock, so every reader can catch it. A predated label is a real instant, in the past, correctly
formatted, and internally plausible** -- it is refuted only by an object the author chose to
disclose. So detection is a function of the author's own disclosure, and the discipline of citing
resolvable SHAs is what makes one's own stamps checkable. **Falsifiability is self-incriminating by
construction; a vaguer message passes.** That is an argument for publishing the object, not against
it.

**The same exchange caught a cancelling unit error, which is the harder half.** A provenance header
was described here as one line of 79 characters plus its terminator, totalling 80 bytes. The line is
77 characters and 79 *bytes* -- it carries one em-dash, one character wide and three bytes long --
so `79` was a byte count wearing the character noun. The total is right anyway, because a terminator
adds one of each unit and the mislabelled operand and the skipped conversion cancel exactly.

This was already canon at the time, recorded one round earlier as counts stated in one unit and
labelled with another, and it survived the correction that named it. **A cancelling error is
invisible to every check that tests only the total**, which is what makes it outlive its own rule:
nothing downstream disagrees, so no run, no reviewer and no gate has a reason to look at the
operands. Where a derived figure is published, publish the operands in their units, because the
sum is the one place the mistake cannot show.

**And restraint is not the same as measurement.** The correspondent declined to name a cause for
the bad stamp -- "that is a story and I have not measured it" -- while asserting the unmeasured
premise the story rested on, that a particular commit was the newest one in existence at the stated
instant. Three commits had landed in between. **Withholding the narrative while asserting its
premise is the same error wearing restraint**, and it is harder to see than the narrative would
have been, because the visible abstention reads as rigour. It also happened to be charitable in the
wrong direction: the reconstruction it licensed made the fault smaller than measurement does.

**A retraction published at the source does not reach the peer who derived from it.** An offset
figure asserted here was withdrawn two rounds later, in canon and in a reply, on the finding that a
difference between two readings taken at different times is a duration rather than an offset. The
withdrawal landed after the last message to the correspondent who had adopted it, and they carried
the dead figure through three further messages, restating it in each opening. Nothing in the
withdrawal was wrong and nothing reached them. **Every restatement made the figure look better
corroborated**, because a number repeated by two parties reads as agreement rather than as an echo.
So a retraction has an audience beyond the record: push it to known derivers by name, and treat a
peer still quoting a withdrawn figure as evidence the withdrawal was published rather than
delivered.

**And the zone designator is an operand, not decoration.** A stamp arriving as `05:1x` with no zone
matched local wall time to the minute and sat exactly the local offset from UTC, while the same
correspondent's previous stamp carried an explicit `Z` and verified as genuine UTC against a
clock-independent quantity. Both cannot be UTC. Dropped, the designator leaves a number that is
plausible, correctly formatted, and in a different unit -- and the ordering detector above cannot
help, because a stamp in the wrong unit can be perfectly consistent with every object cited beside
it. Only an impossible ordering is detectable; a merely wrong one is not.

That was the third unit collision measured in a single session -- members against targets, bytes
against characters, local against UTC. In each the figure was right and the label was not, and in
each the disagreement was worked as a factual dispute for several rounds before anyone tested the
unit. **When two careful parties keep reproducing each other's methods and still disagree, suspect
the unit before the measurement**, because a genuine factual dispute usually dissolves on the first
shared reproduction and a unit collision survives every one of them.

**A charitable reconstruction needs the same controls as an accusation.** A correspondent withdrew
a correct charge against these timestamps on the theory that they were local time wearing a `Z`,
having swept three candidate offsets and selected the one under which both readings became small
and positive. The offset was fitted to produce the verdict, not measured: this machine reads
`-07:00` at both instants in question, is Pacific by identifier, and agrees with the remote `Date`
header to the second. **A nuisance parameter chosen because it makes the residuals look honest is
an assumption dressed as a finding**, and the frame was not even unobservable -- it is one command
on the author's side, so the correct move was to ask rather than to fit.

That makes two consecutive turns from one correspondent resting on an unverified premise, and both
pointed the same way: toward making this session's fault smaller. **Charity is a directional bias,
so it needs the controls an accusation gets** -- a reconstruction that exonerates should be held to
the standard of one that incriminates, and neither should be published on an operand nobody read.

The obligation runs to the accused too. **Refusing an unearned exoneration is a measurement duty,
not modesty**: accepting it would have retired a real defect on a false premise and left the record
asserting a frame this machine has never been in. The original charge survives its own author's
withdrawal, because a verdict and its diagnosis fail independently -- the correspondent's own line,
turned around, since they had read the right ordering violation off the detector and named the
wrong cause for it twice.

And the true offset makes the finding worse rather than better. Under it one stamp is coherent only
as UTC, at six minutes after its object, while two are coherent only as local. **A mixed frame is
worse than a wrong one**: a constant offset is correctable by a single subtraction, a mixed set is
not recoverable at all, and its existence proves at least one stamp was authored rather than read
whichever frame is assumed.

**And a sweep cannot find a truth outside its candidate set.** The same reconstruction was restated
at three samples, sweeping UTC-4, UTC-5 and UTC-6 and keeping UTC-5 because it left every reading
positive and small. The true offset is UTC-7 and was in none of the three. Extending their own
table to it, every sample sits at +133 to +159 minutes -- **positive on all three**, so the truth
was never eliminated by the data. What eliminated it was the word `small`. Positivity is a hard
constraint, since a reading cannot precede its object; `small` is a behavioural prior about how
soon a person reads a clock. **Two criteria of different kinds were carried under one name**, and
the prior did the work while the constraint took the credit.

The sample count made this worse rather than better. **Every additional observation fits the
surviving candidate equally well, so n raises confidence without raising coverage**, and a sweep
reports the same certainty whether the truth is excluded or merely absent. Three samples felt like
corroboration and were three repetitions of one omission. Where a parameter is directly observable
from the other party, enumerate nothing: ask, or read it from an artifact they publish.

And the residual they flagged as possibly informative is provably not. They noted the deltas rise
monotonically and declined to model it, which was the right restraint aimed at the wrong quantity:
the differences between deltas are invariant under an additive parameter, measuring 13 and 3
minutes at UTC-4, -5, -6 and -7 alike. **The trend carries exactly zero information about the
offset**, and the level -- the only informative quantity in the set -- is the one that was settled
by prior rather than by measurement. When fitting an additive constant, the part of the data that
looks like structure is the part guaranteed not to identify it.

**And where the record is silent, a claim and its refutation are both testimony.** An attribution
was made here about which sibling session authored two commits, and refused. Measured, every
candidate is identical in every field the artifact records -- same author, same committer, same PR
author, one branch-naming convention, one file -- because sessions in a repository commit under one
identity and squash merges rewrite the committer besides. So the claim was not read from the record,
which could not have supplied it, and the correction cannot be checked against the record either.
**An attribution claim about an artifact class that records no author is unfalsifiable in both
directions**, and the honest move is to grant the denial: the author has direct knowledge of their
own work that no observer holds, while the accuser has only inference dressed as observation.

Two asymmetries make this worse than the ordinary unverifiable claim. **A false credit costs the
actual author their work, where a false denial costs only the accused** -- so the crediting
direction, which feels generous, is the more damaging one and attracts the least scrutiny. And a
remedy already in canon, that an attribution travels with the command that produced it, was present
and unreached at the moment it was needed. Attribute by something observable -- a branch, a PR
number, a timestamp band, a subject convention -- or attribute nothing.

**And a measurement of a moving repository is a function of two arguments, only one of which gets
published.** Two sessions reported the same suite as `421/421` and `441/441` and both were exact:
421 declarations at one revision, 441 at another, with eleven commits touching the test tree in
between. Same unit, same method, same repository, different vantage. This is a different species
from the unit collisions above -- there the label was wrong, here both labels are right and
incomplete -- and it resolved in one command **only because the correspondent published the SHA
beside the figure**. A count without a revision is not a measurement of a repository under active
change; it is a measurement of a moment nobody else can return to. Bind the figure to the revision
in the same breath, and treat a bare total from a peer as a reading whose vantage you must ask for.

**And relocating a stranded rule is a rewrite, not a move.** A sibling found four of their own
entries in a hub-local design document that no member repository receives, and declined to ship
them intact: each had a general half and a hub-local half, and moving them whole would have put one
repository's internal census and base-SHA variable into eleven product repos -- trading unreadable
for unreadable-because-irrelevant. **The reason a rule landed in the wrong document is usually that
it was written with its instance fused to it, and that fusion is exactly what disqualifies it at
the destination.** So distil the general half and leave the instance behind; a relocation that
preserves the text has not answered the question that stranded it.

Their guard for it is the shape to copy. The document had never stated that it was undistributed --
the fact needed to prevent the error was absent from the place the error is made -- but adding the
notice alone would only reproduce the failure one layer up, since a rule present and unreached is
indistinguishable from a gap. So it is checked against the manifest in **both** directions: the
notice is required while the directory is undistributed and forbidden the moment it becomes a
distributed kind, with a non-vacuity premise, because an empty source list would satisfy the claim
while reading nothing.

**And a defect you cannot have is not a defect you avoided.** The same correspondent, asked whether
they shared an under-enumeration fault, answered that they did not and then refused the credit:
their harness runs two suites as two commands, so there was never a single total for an omission to
hide inside. That is immunity by circumstance, not by design -- the same structure as a mutant that
dies for a reason unrelated to the assertion under test. **Report the mechanism of an escape, not
just the escape**, because a fault avoided by accident recurs the moment the accident does not
hold, and a clean result claimed as discipline conceals exactly that.

**And a frame error inside arithmetic changes the answer, not the label.** The local-time-wearing-a
`Z` defect above is a reporting fault: a reader is misinformed and the computation is untouched. The
same error inside interval arithmetic is a different animal. A correspondent computed when their
repository first reached four concurrent pull requests, got `2026-08-10T17:07:38Z`, and concluded
the peak preceded an outage boundary by four and a half hours. Measured in true UTC the instant is
`2026-08-11T00:07:38Z` -- **exactly seven hours later, with identical minutes and seconds** -- and
it follows the boundary by two and a half. A before became an after.

Two things make this worth its own entry. The **signature** is free and nobody looks for it: when
two parties' instants differ by a whole number of hours and agree in every sub-hour digit, that is
a frame shift and not a disagreement, so the arithmetic never needs redoing. And the shift was
**one-sided within a single comparison** -- the boundary was in true UTC while the computed instant
was not -- which is the mixed-frame fault one level down from a mixed-frame footer, and strictly
worse, because a comparison between two frames yields a number that is wrong without being
anomalous.

The discriminator for which side moved is worth keeping: had the boundary been the mis-framed
value, the peak would have been reported at its true instant. It was reported seven hours early, so
the fault lay on the computed side. **When two quantities are compared and one is shifted, the
published value of each identifies the culprit** -- but only if both are published, which is why a
conclusion stated with its operands is repairable and one stated as a verdict is not.

**And their reconciliation control passed, as it had to.** They checked that their interval spans
summed correctly, and a uniform frame shift preserves that property exactly: every part moves
together, so the parts still sum to the whole. **A control that verifies internal consistency
cannot detect that the whole sits in the wrong frame**, and its passing is what retires the
suspicion. Reconcile against an external fixed point -- a boundary from another source, a clock
read by a different command -- or the control only proves the error was applied evenly.

**And a duration over intervals that have not ended measures the observer's clock.** The same table
reported forty-five hours at peak concurrency after the boundary, with four pull requests still
open: that figure grows by one hour per elapsed hour and is unbounded, so it describes the age of
the outage rather than the repository's behaviour. This is the **dual of survivor bias** and it
evades the same audit -- survivor bias drops the incomplete cases, right-censoring keeps them and
truncates them at an arbitrary instant, so **nothing is filtered and a population audit keyed on
filters sees nothing wrong**. Where a statistic sums durations, state whether every interval has
closed, and compare closed periods only with closed periods.

**And an opportunity count needs its own population audit, run on the definition rather than on the
surrounding claim.** The correction that produced the above was itself right and is kept: a
merged-only restriction is survivor filtering on a question about concurrency and is *constitutive*
on a question about merge-order inversions, since an inversion requires two merge timestamps and an
unmerged pull request cannot supply one. Forty-five concurrency opportunities and zero inversion
opportunities coexist in one repository without contradiction. **The same predicate is a bias in
one column and a definition in the next, and the predicate alone cannot tell you which** -- so ask
what the event being counted requires, not what the sentence around it asserts.

**And a control against empty-corpus confirmation must not be evaluated inside the empty corpus.**
A correspondent looked for the receipt that would settle who first asserted a figure, found zero
outbound-message rows for their session, and -- having been caught one round earlier by a query
whose corpus did not reach the window it asked about -- ran a control: zero rows for **any** tool
name in that session. They reported the null honestly and declined to treat it as a clearance. The
control was the right instinct at the wrong scope. It establishes that the *partition* is empty,
which cannot distinguish `this table does not record the thing` from `this table does not contain
my session`, and only the first supports the conclusion they drew.

Removing the session filter -- one edit -- returns 4,321 recorded outbound messages across other
sessions, up to 215 in a single one. **The store was never blind; our own rows were simply absent
from it.** This session appears in the local store only, with a modification time eight seconds
after its creation and four days stale, and does not appear in the shared store at all. So the fault
is a coverage gap and not a schema gap, and the difference is the whole practical point: a schema
gap is permanent and a coverage gap resolves, which means outbound authorship is decidable
retrospectively even though it is undecidable live.

The recursion is the entry. **A control built against a known failure mode inherits the scope of
the query it was built to protect**, so it reproduces the failure one level up while displaying the
diligence that was supposed to prevent it -- and a null reported with a control attached is more
persuasive than a bare one, which is exactly what makes an under-scoped control expensive. When a
count comes back zero, vary the filter, not just the metric: the discriminating question is never
`is this population empty` but `is this population empty because of what I am measuring or because
of how I selected it`.

**And a run that delivers to k members imprints a k-wide degenerate band on every age threshold.**
The same correspondent, correcting an over-strong claim that no threshold could yield a particular
count, showed the truth is structural rather than impossible: four members were written inside
thirty-three seconds by one dispatch, so three adjacent counts are reachable only by a threshold
landing in that band -- under a hundredth of a percent of a hundred-hour range. **Which counts a
staleness figure can honestly take is a property of the fleet's delivery topology, not of its
health**, and the unreachable bands sit exactly where a batch succeeded. Corroborated here from an
independent artifact: the same run opened four member pull requests within a thirty-second spread.

Their demonstration of it is the better half, because the instrument failed rather than the
argument. Ages rounded to two decimals -- thirty-six seconds, wider than the band -- produced three
different reachable sets from three instants over an invariant population, one of which contained
the disputed value and would have refuted their correspondent with an artifact of their own
display. **A displayed precision coarser than the structure under test converts a structural fact
into a moving finding**, and every individual row still reads as a clean measurement.

**A bare measurement can identify the revision it was taken at, and that inverts a vantage
collision.** A sibling refused an attribution of the figure `399/399` and of the commit `05068ef`
as two separate false claims. Counting test declarations across every revision touching the suite
resolved both at once: 399 is the count at `05068ef` exactly, and their own published figures --
415, 420, 421, 423 -- are each the count at a real revision. The number and the commit were one
measurement. Because the count takes eighty distinct, strictly increasing values across those
revisions, a bare total localises its own vantage. So the collision recorded earlier in this file
is self-repairing here: **when a quantity is monotone in revision, a figure published without its
SHA can be resolved to its SHA afterwards.** Do not ask a peer who omitted the vantage to
re-measure -- invert the sequence, which also costs them nothing and cannot be refused.

**A negative needs its window stated, because a window is a claim.** A composition stamp was
declared absent from a correspondent's session on the strength of eight listed turns. The eight ran
from 04:12 to 06:59; the instant in question sat 35 seconds inside a turn that opened at 02:47, and
the session held 74 turns. The window opened **85 minutes after the moment it was used to rule
out**, and nothing in the listing said so. An enumeration offered as evidence of absence is only as
good as the bound it silently applied, so publish the bound with the negative or the reader cannot
tell a search from a sample.

**An inbox cannot attribute, because the substrate records a receiver.** A row cited as one peer's
receipt opened with a different peer's header. Of 34 inbound turns in that window, five were
self-labelled from one correspondent, three from another, and **26 carried no sender information at
all** -- the only sender data anywhere being what a sender chose to type into the body. A shared
clock makes timestamps comparable across sessions but **makes the sender auditable only if the
substrate records a sender**, and this one does not. Where several correspondences land in one
inbox, every cross-session interval is at risk of being assigned to the wrong exchange with
flawless arithmetic throughout.

**Before deriving a quantity by subtraction, check whether it is recorded.** Two parties spent
several exchanges computing composition and transit times by differencing a turn timestamp column,
producing figures four orders of magnitude apart, and defending each with careful arithmetic. That
column stores turn *start*, milliseconds from arrival, so it contains no emission events and **no
difference taken from it measures either quantity at any magnitude** -- which is a stronger
disqualification than either party's, since arguing that an interval is too short to be a reply
concedes that some interval would have been admissible. Meanwhile the per-call durations were
stored directly in the same database, summing to 211 to 520 seconds per turn across 14 to 45 calls.
A derived figure invites an argument about method; a recorded one ends it.

**Decay is not the discriminator for a quotable figure; pinning is.** A byte count quoted against a
commit is reproducible forever by anyone who resolves that commit -- the quantity moves and the
citation does not. A figure with no public revision id cannot be pinned at all, and should be
quoted as a delta with a stamp rather than as a citation. This replaces the growth-rate test
recorded above, which wrongly permitted any slow-moving unpinnable number and wrongly forbade
fast-moving pinned ones.

**A unit error preserves order, so no ordering check can detect one.** A peer refuted a
unit-collision hypothesis by showing the sequence was non-monotonic, on the sound ground that a
constant shift preserves order. The rule is correct and its contrapositive is the trap: preserving
order is exactly what a unit error does, so monotonicity is evidence against nothing. Five
consecutive canon sizes were published here as `bytes` while being UTF-16 code-unit counts from a
shell that decodes -- `718603 721479 723515 726466 730227`, each 1,888 below the true
`git cat-file -s` value, monotone throughout with plausible increments and a constant offset, because
the file's non-ASCII line count never moved. The series is the only thing an auditor sees, and the
series is clean. Detecting the class requires re-deriving one value by a second instrument; no amount
of internal consistency in the first will do it.

**A length reported by a tool that decodes is a property of the decoding, not of the artifact.** The
figures above were produced by a raw-file read whose `.Length` counts code units after the bytes have
been interpreted as text. Nothing in the call names an encoding, so nothing in the call announces
that a choice was made; the number is well-formed, stable, reproducible, and about a different object
than its label claims. This is the same shape as a comparison that normalizes both sides before
comparing them -- in both cases the tool silently supplies a transformation and then reports the
transformed quantity as the measurement. For a size, quote the object store: `git cat-file -s
<rev>:<path>` never decodes. Label the figure with the command that produced it, so that a reader
comparing against a peer can see whether the two figures are in the same units at all.

This also bounds the pinning rule recorded above. Quoting a byte count against a commit makes the
*citation* reproducible; it does not make the *unit* recoverable, because the commit fixes the
artifact and not the instrument. A pinned figure in the wrong unit is reproducibly wrong, and its
pinning is what lends it authority.

**A gate correctly scoped to a diff does not license a total in the same block.** The size figures
above sat beside a quality gate that had already been narrowed to `added-lines-only` after an earlier
finding, and the narrowing held: the added lines really were ASCII, so the gate was right. The 1,888
bytes were pre-existing non-ASCII in the file the block reported a total for. A correctly scoped
gate and an incorrectly scoped total coexisted in one block, each true of its own population, and
adjacency did the rest -- a reader takes the verified scope of the strictest claim as covering the
block. Restate the population on every figure, not once per block.

**A control that tests two unknowns with one equation reports the pair, not the parameter.** An
offset was defended by showing that the machine's converted-to-UTC time matched an external
reference to the second. The match is real and it validates the conversion, but the relation under
test is `wall + offset == reference`, and the disputed quantity is one of two free terms on the
left -- so the control returns agreement under every candidate offset, each paired with the wall
clock that satisfies it. The evidence that actually discriminated was a **direct read of the
timezone record**, which does not involve the clock at all. Both were presented, and the blind one
was presented as the clincher; a reader adopting the argument adopts the blind one, because it is the
one framed as decisive. **Before offering a control, name the value it would have returned had the
disputed parameter been different** -- if no such value exists, it is a demonstration, not a control.

**A document can hold a prescription and its own refutation, and the prescription is the one that
gets executed.** This file recommended an external clock reference in its prescriptive opening, and
several hundred kilobytes later recorded the measurement showing that same reference is cached,
non-monotonic across consecutive reads, and dispersed more widely than the quantity it is used to
measure. Both entries were correct, landed deliberately, in the right file. Nothing linked them, and
the recommendation kept issuing instructions the tail of the same document refutes. The mechanism is
the internal form of a rule already recorded here about retractions failing to reach the parties who
derived from them: **prescriptive text is written to be acted on and epistemics text is written to be
read**, so a correction filed as a lesson never reaches the paragraph that gives the order. When a
finding refutes an instrument, repair the passage that prescribes the instrument in the same change,
and if the two cannot be co-located, put the bound at the point of use rather than the reasoning.

**A comparison table is where a redaction gets silently resolved more than once.** A coarsened
timestamp was carried into a two-column table, and each column resolved the span independently -- one
inheriting a figure computed in an earlier round, the other recomputed at the interval's lower
endpoint -- with no cell recording which point it used. Every individual derivation was defensible
and the pair was incoherent, because **each column is a separate act of computation and the label is
re-read for each one**. A span survives the first derivation as a span and is collapsed independently
in the next, so the collapse is invisible in exactly the layout that invites comparison. Resolve a
redaction once, to both endpoints, and carry the interval into every column, or print the resolved
point in the cell.

**A cached reference is not an arbiter, and when sampling one the estimator has a direction.** Two
parties nominated a remote service's response header as a neutral clock, and both reported agreement
with it to the second. The header is served from cache: sampled thirty times at three-second
intervals it produced **nine distinct values over ninety seconds**, each held on a plateau while the
computed difference fell at exactly one second per second of local time -- the signature of a frozen
instant being counted down rather than a clock being compared. The spread across samples was `10.68
s`, which is larger than the quantity either party claimed to have measured, so an agreement reported
as `0 s` is a statement about when the cache last refreshed. Because a cached instant is never later
than the true one, every sample is a **lower** bound, and the tightest estimate is the **maximum**;
advice to take the minimum -- which this record previously gave -- systematically selects the
stalest reading and biases the result in one direction. Sample repeatedly, publish the spread and the
round-trip time, quote the extremum that bounds the truth, and report a bound rather than a value.

**An ordering detector is only as monotonic as its reference.** A useful test had been adopted on
both sides -- nothing a message cites may postdate the message's own stamp -- and it does real work,
killing a proposed unit-collision explanation outright, since a constant shift preserves order and
therefore cannot produce a sequence that decreases. But the reference clock it is computed against
went **backwards by one second between two consecutive reads**, because a cached response can be
served by nodes holding different instants. The detector's resolution floor is that inconsistency, so
findings four orders of magnitude above it survive untouched while a sub-second or one-second
"postdating" result from the same reference is noise wearing the shape of a finding. **State a
detector's noise floor when adopting it**, or its cheapest results will be its least reliable ones.

**A record that captures what you were told and not what you said makes every peer auditable and
yourself unauditable.** Challenged on a sequence of stamps in its own outbound messages, a party
found that its store retained inbound messages and its own visible replies while the outbound message
bodies appeared in no queryable table -- so every peer's published figures could be checked from the
local log and none of its own could. The asymmetry fails in the flattering direction, because the
claims that cannot be retrieved are exactly the ones a party would be held to, and it converts an
audit into a matter of whose transcript is consulted. A concession made without the ability to check
is worth less than one made with it, and **the difference is invisible in the wording**, so it has to
be disclosed explicitly rather than implied by the tone of the agreement.

**A reconstruction confirmed by probes invariant across a variable has tested every variable but that
one.** A party recovered the instrument behind a wrong figure by replaying a bounded query at three
cutoffs and matching all three outputs, then published the reconstruction as having found the fault.
The match was real and the endpoint diagnosis was right. But re-running every probe under the two
candidate populations returned **identical results at all three cutoffs**, so the evidence
discriminated the endpoint and was silent about the population -- and the population is precisely
where the accompanying correction had drifted, restating a count over all commits as though it were a
count over the filtered path. A successful replay licenses the conclusion that the tested variable is
explained, never that it is the only one. **Before offering a reconstruction as a diagnosis, vary
each candidate and keep only the probes whose output moves**; a probe that returns the same answer
under both hypotheses is confirming the part nobody doubted.

**A correction is a new claim and inherits none of the caution of the claim it replaces.** The
original figure had been published deliberately and audited hard; its replacement arrived inside a
paragraph of concession, where both the author's attention and the reader's are on the admission
rather than on the arithmetic. The gradient is structural rather than careless: **a sentence
beginning "actually there are four" is read as a retraction, and retraction is a genre that signals
rigour**, so it is among the least likely sentences in a message to be checked. The same shelter
covers any figure that travels inside an apology, a granted charge, or a self-diagnosis. Hold a
correction to the standard of the claim, not to the standard of the apology, and state the population
and instrument for the replacement as fully as for the original -- most cheaply by re-deriving it
with the query written out, since a correction offered without its query asks to be believed on
posture.

**A citation that avoids a write also avoids acquiring the object.** A remedy was offered for stale
state citations: replace the reflexive fetch with a remote listing, which is one call instead of two,
consults no local ref, and -- measured -- leaves the ref store byte-unchanged. That last property
matters more than it looks, because in a multi-worktree checkout the remote-tracking refs live in the
shared common directory with no per-worktree copy, so a fetch issued *merely to freshen a citation*
writes state every sibling session reads. The remedy is right and its scope is narrower than its
motivation: a remote listing returns a **name**, not an object, and every relational question --
ancestry, distance, content at that tip -- requires the object locally, which is exactly the write
being avoided. The measurement that settled the dispute it was proposed for could not have run on its
own output; it worked because both commits happened to be local already. **Cite a tip with the
read-only call; the moment the claim becomes comparative, the fetch is not reflexive, it is the
measurement.**

**A rule adopted in prose does not reach the boilerplate in the same message.** A party landed a new
rule -- when correcting a peer about a shared object, state your own position and let them resolve
theirs, because the exposure is compose-to-read and no amount of re-resolution touches it -- and
published, in the standing block beneath it, the shared tip the rule is about. It was accurate at
send and forty-six commits stale on arrival. The mechanism is not carelessness: standing blocks are
**copied forward rather than re-derived**, so they are the last place a newly adopted rule arrives
and the first place its subject appears. **The habit a rule targets lives in the template, not in the
argument**, and a rule that is never applied to the template is adopted only where it was already
being followed. When adopting a rule, edit the boilerplate in the same commit as the prose.

**A metric that holds over your diff, printed where pass conditions live, is read as holding over the
artifact.** Both parties had been reporting line-length, encoding, and delimiter counts in the block
that otherwise carries CI results, and neither is checked by CI at all -- the pipeline runs tests and
an aggregate gate and nothing else. Worse than decorative: the figures were computed over **added
lines**, while the file they appear to describe carried hundreds of lines violating them, green the
whole time. A self-imposed style check is worth running; reporting it beside pass conditions
converts a property of your diff into an implied property of the object. **State the scope a
measurement was taken over, especially when the scope is the change rather than the thing changed**
-- otherwise the strongest-sounding line in a report is the one with no enforcement behind it.

**A population derived from a program's text is satisfiable by editing the text.** A guard scraped
the entry point's source for its list of dispatched validators, deliberately, to avoid transcribing
a hand-written list -- and the derivation was sound. What it did not buy was the property the guard
existed for. Mutation showed the scrape holds under a loop refactor and fails loudly, contrary to
its author's own disclosure; but the mutation that succeeded needed **no production edit at all**,
only the deletion of rows from the test's own table, which restored green and dropped the corruption
fixtures behind it from six to four. A derivation from text is only as strong as the edit distance
to changing that text, and test files are the cheapest text in the repository. Derive the population
from the program's **value** -- an exported registry the entry point iterates -- so that shrinking
the asserted set requires deleting a validator from production, where it is a reviewable diff
against the thing that actually runs.

**A guard that fails loudly is not thereby safe; price the cheapest repair of its failure.** Loudness
was treated as the safety property, and it is the wrong one: the question is what the next author
does when the alarm sounds. Here the alarm's cheapest silencer was a test-only deletion that removed
coverage without moving the test count, because the deleted rows were iterated inside a single test
rather than generating one each. **A guard whose loud failure has a cheap silent repair points the
next author at the edit that removes coverage.** Two guards were needed and neither sufficed alone:
one that fails when the asserted set shrinks, and a set of fixtures that call the entry point for
real so a member added to the registry and never iterated is still caught.

**A fixture that strips the environment reports environment faults in the vocabulary of the defect it
tests.** A helper copied the repository while filtering out `.git`, on the reasonable assumption that
it names a directory; in a worktree it names a **file**, so the copy had no git at all and every
git-dependent path threw. Each row asserted through a matcher on the expected corruption message, so
the environment fault surfaced as *"its corruption did not reach the entry point"* -- precisely the
defect the fixtures were built to detect, reported by a fixture that never got far enough to look.
The obvious correction is also wrong in a second way: a copy tool that excludes directories only will
copy the gitlink, and the copy silently re-attaches to the original working tree. Two copy methods,
two different wrong answers, neither an independent repository, and both green-looking. When a
fixture constructs its own environment, assert the environment before asserting the defect.

**Two names for one object are one carrier, not two.** A repair was reported as more robustly
attested because it was reachable through both a branch ref and a pull-request ref; both resolved to
the same commit. **Redundancy in the naming layer is not redundancy in the thing named.** Two refs
at one object survive the deletion of either name and fail together on every fault that touches the
object -- a wrong commit is wrong identically down both paths, and the forge advances the
pull-request ref to track the branch, so a force-push moves both at once. What a second access path
buys is reachability after a deletion, which is worth having and is not evidence. Before counting
agreeing observations, resolve each to the object it observes and count the objects.

**Widening an enumerator finds exactly the class it was widened for.** A census taken over branches
was corrected by hand-writing a refspec for pull-request head refs, doubling the population and
closing the known gap. The corrected census still omitted a third class -- the merge refs that exist
only while a pull request is open, one of which belonged to a pull request the census classified --
because the widened filter was widened for the class already known to be missing. The instrument
that needed no correction was strictly cheaper: the unfiltered listing returns every class and
always did. **Effort spent widening a filter reads as diligence and still returns a filtered
result**, and the corrected population looks complete precisely because the gap someone thought of
is now closed. Prefer the unfiltered instrument to a better filter, and when only a filter is
available, state the classes it admits rather than the count it produced.

**A remedy that is absent locally is indistinguishable from a remedy that does not exist.** A member
reported that a generated lockfile sat inside its lint population, and concluded the only available
fix was an ignore line nobody had written -- true of that tree, and false of the fleet: three
sibling members had each added exactly that line, on three dates, in three separate pull requests,
none promoted upstream. One call per member finds it. This is the companion of *a file that has
never failed a check produces the same evidence as a file exempt from it*, and it fails in the more
expensive direction, because **a missing remedy prompts invention while a missing failure only
prompts silence**. The fleet-level form is worse than the local one: a fix independently discovered
three times downstream and zero times upstream is not three fixes, it is one unfiled defect plus
three members who will each pay again after the next delivery.

**Conformance that rests on a shared default is one observation, not one per member.** Four members
lint a generated file that passes only because a hardcoded `2` in the generator matches the
formatter's default indent; every configured member in the fleet runs that default, and no test on
either side asserts the relationship. Counting the passes as independent evidence inverts the risk.
**Independent coincidences degrade one member at a time, so the first failure arrives as a warning
while the others can still be protected; a single shared default fails every dependent member in the
same release, with no early instance and no staged signal.** Before treating repeated agreement as
robustness, find the one value it traces to -- and if it traces to one, the count of passing members
measures the blast radius, not the confidence.

**A reconciliation that succeeds has not proved it found the only discrepancy.** The entry below was
demonstrated on a pair of `549` against `243`, attributed entirely to population. Measured, the pair
differs on two axes: at a fixed instant the counts are `504` and `243`, and eleven hours later they
are `549` and `281`. Correcting the population alone leaves `281` against `243` -- a residual of
`38` that reads exactly like a peer being short. Correcting the instant alone leaves `261`. Only
both together give exact agreement. The published reconciliation was right because every reading in
it was timestamp-bounded, but **exact agreement after a single correction is evidence that the
corrected axis mattered, not evidence the others were aligned**, and the failure is silent because
agreement is the signal used to stop searching. Enumerate the live axes -- population, instant, ref,
path -- before reconciling on any of them, and when a correction leaves a residual, do not read the
residual as the peer's error until the remaining axes are fixed too.

**A repository that holds the biggest copy is not thereby the origin of the copies.** A table of
member holdings in this file annotated its largest row as the canonical source, and the annotation
was never derived -- it was inferred from rank, and stood for weeks in a document that instructs
against exactly that inference. The canonical path is `jrmoulckers/.github` at `instructions/`; the
member holding that outweighs every other member is still a member. **A size-ordered map cannot
produce the contradiction that would expose a wrong origin, because it never asks where a file came
from.** The instrument that settles it is blob identity, which costs the same request as a size:
equal byte counts across repositories are evidence, equal blob ids are proof. The same substitution
appears one layer up when a figure that agrees with a fresh reading is treated as confirming where
the figure came from -- agreement of two numbers is not provenance of either.

**Before charging a peer's figure as wrong, find the population it would be right for.** A count of
`243` was read against a locally measured `549` and was one step from being published as an error.
Both were exact at the same instant: `549` counted every commit on the branch and `243` counted
commits touching the one file the claim was about. **A figure that is exact over some population is
a labelling question; only a figure exact over none is an error**, and the second is far rarer than
the reflex to charge suggests. The failure mode is worse than a private mistake because a published
charge transfers the burden of proof to the party who was right, and does so with arithmetic
attached. This was committed while auditing a peer for a labelling error, using the wrong
denominator, one screen below an entry recording both defects.

**A remedy adopted to replace an unmeasured value must have its own failure mode measured before it
is trusted.** An external clock reference was adopted by two parties to end a chain of composed
timestamps. Sampled three times with round-trip time printed, it returned offsets of `+22.4 s`,
`+0.6 s` and `+0.8 s` at a constant `0.12 s` round trip -- the outlier is not latency but a cached
response, and the reference publishes `Cache-Control: public, max-age=60`. **The instrument adopted
to cure a stale instant serves stale instants, with a documented budget and an authority the
original defect never had.** The protocol survives with a correction: sample several times, take the
minimum offset, and print the round-trip time beside it so latency and staleness stay separable. A
single reading of any clock is a claim about one packet.

**A rate measured across a burst and projected forward is a claim about the burst.** A corpus growth
figure of `22,186 B/h`, used to argue that a subscription cost is unbounded while an alternative is
bounded, measured `10,435 B/h` over the adjacent and longer window -- a factor of `2.1` with no
change in method. The qualitative conclusion survived and the quantity did not. **Quote a rate with
the window that produced it, and quote a second window before building on it**, because the window
that first exhibits an effect is chosen for exhibiting it.

**A saturated proportion is durable under append and says almost nothing about the rate.** An
artifact whose magnitude varies but whose sign never does was correctly reported as `0 of 21`
positive, on the grounds that a proportion at its boundary cannot be moved by growth and is
refutable by a single counterexample. Both halves are true and neither is evidential strength: zero
events in twenty-one draws is consistent by the rule of three with a true rate near **14%**, and
nineteen of those twenty-one are attempts of a **single run**, so they share a queue, a runner and a
clock and the independent count is far below twenty-one. **Durability and precision are separate
properties, and an invariant stated at a boundary advertises the first while sounding like the
second.** The honest form names the draw: not observed in twenty-one attempts, nineteen of them
non-independent.

**An increment produced at a moment the observer chose still has a magnitude the world set.** A
sample-triggered span was said to have moved because someone typed rather than because time passed.
Measured, the increment was `69,183 s` and the interval between the previous attempt and the probe
was `69,183 s` -- identical to the second. The **event** is the observer's and the **magnitude** is
elapsed wall-clock, so the quantity is neither party's: it records the sampling schedule, and its
value is the observer's own latency in returning. **A quantity that advances only when sampled
measures the interval between samples**, which is why adding a timestamp cannot repair it -- the
timestamp and the increment are the same fact written twice.

**A closed form derived at the smallest case is not a general reduction, and using it to withdraw a
general claim over-refutes.** A ratio of mean to spread was shown to be a relabelled function of a
single parameter, and the demonstration was sound -- at `n = 2`, where the spread of two points is
half their difference and the ratio collapses to `(1 + r) / (r - 1)`. It was then used to discard a
statistic computed at `n = 20` over a three-valued distribution, where no such collapse occurs and
the agreement of the two numbers was coincidence. The correct verdict was that **one side of the
comparison was degenerate and the other was not**, which is a sharper finding than both being
degenerate. **Check the smallest case's algebra against the case actually in hand before retracting
on it**; a retraction that removes a sound result costs the same as a claim that keeps an unsound
one.

**A count derived from a list already asserted element-by-element is entailed, not enforced.** A
guard asserted that each of six named documents is reached by a rule, then asserted that the number
of documents reached is at least six. The second assertion cannot fail unless one of the first six
already has, so it is unreachable as a failure and carries no independent information. The
reasoning that produced it is sound -- a separately-tuned threshold drifts away from the names it
is meant to summarize -- but deriving the threshold from the list traded a weak check for a
redundant one. **Before adding an aggregate over a set whose members are individually asserted,
establish that some state falsifies the aggregate and satisfies every member assertion.** The
useful residue is a claim about the **gap** between what a rule reaches and what it is pinned to,
because that quantity can move while every named assertion still holds.

**An exemption scoped more broadly than its justification acquires members the justification never
covered.** A sweep skipped an entire test directory so that one file's fixtures would not be read
as live claims; the exclusion covered thirty-four modules, and one of the others carried in its
test title exactly the unhedged fleet enumeration the rule exists to catch. **Write an exemption on
the same unit as the reason for it** -- a reason about one file becomes false the moment a second
file joins the directory, and nothing signals the transition.

**A lesson lands on the construct that prompted it and not on its neighbours.** A fix made a walk's
directory exclusions decidable from a constructed root, on the stated grounds that an accident of
the working tree is not an invariant to pin. The file-extension allow-list one line below the same
exclusions still admits one spelling of a two-spelling extension, and is undetectable today only
because no file uses the other spelling -- the identical defect, in the same function, untouched by
the change that named it. **After fixing a defect, re-read every sibling construct in the same
function against the sentence used to describe it.**

**A pin list is unfalsifiable in both directions, and the symmetric case is the one that goes
unstated.** Deleting an entry silently weakens the floor, which was acknowledged. Adding a new
document that the rule ought to reach is equally undetected, because nothing requires the pinned
set to grow with the corpus. Measured here the reached set and the pinned set are **identical**,
which is what conceals both directions at once: with zero gap, neither an omission nor an addition
changes any observable. **A containment check between two sets is informative only while the sets
differ; equal sets make it a tautology.**

**A first-and-only run of a new instrument cannot be distinguished from a clean result.** A detector
ported to a second language reported zero findings where the original reported six documents and
twelve matches. The port was wrong and the tree was fine, and the only thing that established this
was an expectation created before the port ran. **A rewrite of a working instrument must reproduce
the original's output before its disagreements are worth reading**, and a zero from a tool on its
first execution is a claim about the tool.

**A completeness control that compares an enumeration against a reported total passes exactly when
that total is a ceiling.** Enumerating a paginated collection and checking the count against the
API's own `total_count` is a sound control for every collection below the service's limit, and
vacuous at or above it: the listing hard-stops after page 400 and reports the total as exactly
40,000, so the check compares 40,000 against 40,000 and reports a complete census over an unknown
population. The control is silently weakest on the largest collection, which is the one whose
truncation costs most. The discriminator is the **shape** of the number rather than its agreement
with anything -- a round figure repeated identically on every page is a cap, an unrounded one is a
count. **Validate a total against the pattern a real count would have, not only against a second
reading of the same field.**

**Coverage is a scalar computed over the whole population and cannot license a claim made over a
stratum.** A window retaining 100 of 101 records looks 99% complete, but the excluded record is
necessarily the oldest, so a rate conditioned on age loses it from the denominator and moves --
here from 5/47 to 5/48. **The error a window induces is not proportional to the fraction it
excludes; it is determined by where the excluded records fall relative to the subpopulation being
tested.** For any recency-bounded query feeding a time-conditioned rate, the truncation is
perfectly correlated with the conditioning variable, and coverage cannot distinguish a window that
is 99% complete everywhere from one that is 0% complete on the oldest stratum.

**Coverage by count and coverage by time are different measurements and neither bounds the other.**
Measured across eleven repositories enumerated to exhaustion, the two diverge on 8 of 9 measurable
members across a 34.6-point range, and **the sign varies** -- positive where a window spans many
records over little time, negative where the excluded records are clustered in age. A single column
carrying both headings therefore overstates completeness for some members and understates it for
others, which is worse than a naming error because no direction of correction is available. Note
also that coverage bounds the **bias** a window introduces and says nothing about the **precision**
of a rate, so a coverage-only table makes a 26-record census look like its most trustworthy row.

**A limit demonstrated on its weakest instance gets priced as unproven.** The divergence above was
first noticed on the member whose divergence is 1.0 point, the smallest non-zero value in the
fleet, and was offered as true in principle and unproven in practice for exactly that reason. The
same property measured 16.4 points elsewhere. **When a newly noticed effect looks marginal, measure
it where it should be largest before pricing further work on it** -- the instance that revealed an
effect is not evidence about the effect's size.

**A guard belonging to the instrument must never be reported in a column reserved for the data.**
An enumeration loop carrying a thirty-page cap stopped at 3,000 of 40,000 records, and the result
table printed the shortfall as a mismatch attributable to the repository. The cap was disproved in
one call by requesting a later page directly and receiving a full one. **Every limit written into a
measurement script is a finding about the script, and belongs in a separate column from findings
about the subject.**

**Monotone is not the same property as adequate, and a sweep that crosses the reference point
proves the weaker one.** A measure rising steadily across a swept parameter establishes
monotonicity. It does not establish that the measure clears its own baseline, because a sweep
passing through the reference point necessarily has values on both sides of it. Measured on an
exact seven-trial calculation: a one-sided decision region whose power rises strictly from 0.001%
to 53.7% sits **below** its own 0.751% baseline at every point on one side of the reference, and
the same defect is visible in six of the eighteen values of the sweep originally offered as proof
of adequacy. Whether the sub-baseline region is a defect at all depends on where the space of
alternatives ends -- an operand neither party had written down. **A repair justified by a shape is
sound only within a boundary someone has stated.**

**Naming a defect makes the term available, not suspect, and the next use is the likeliest to
repeat it.** A correction that saturation cannot be inferred as the cause of an effect merely
because a discontinuity coincides with it was followed, one paragraph later by the same author, by
a conjecture naming saturation as the causal condition for a related result. Measured refutation:
across 4000 random seven-trial configurations per arm, counting only those admitting a genuine
two-sided region, configurations carrying a near-saturated trial were defective in 86.7% of cases
and configurations carrying **none** were defective in 48.1%. The saturated trial raises the rate
and is neither necessary nor the mechanism. **A condition present in every observed instance of a
defect is a correlate until an instance without it has been sought.**

**A retraction scopes to the conclusion, not to the instrument, so every other reading taken with
the same instrument survives unexamined.** A diagnostic was withdrawn after its sliding window was
found to evict its oldest observations; a second finding computed from that same window was
published in the same message and carried no qualification. Independent measurement put the second
finding at 12.8% where it had been reported near 47%. **When an instrument is retired, re-derive
every figure it produced, not only the one that prompted the retirement.**

**A control arm that returns an empty population refutes nothing and must be reported as refusing.**
An arm constructed to test whether a defect requires some condition returned zero admissible cases,
because the condition's absence also removed the structure being measured. Reporting that arm as
evidence of absence would have been a zero-population claim dressed as a negative result. It was
recorded as a refusal and a second control was built that actually admits cases. **A control is
only a control once it has been shown to contain something.**

**Editing a secret out of an issue body does not remove it, and the audience is everyone with read
access.** Prior revisions of issue and pull-request bodies are retrievable through the API's edit
history by a reader who is **not the author, holds no write access, and has no relationship with the
repository** -- measured directly against a public repository, returning every prior body in full.
The field is named for a diff and returns the **complete body** at each revision, so retrieval is a
direct read rather than a reconstruction. **A credential posted in issue text must be rotated, never
edited out**, and confirming a redaction by re-reading the issue is the degenerate check: the view
used to confirm is the one guaranteed not to show it.

**A filter chosen from the net effect of an operation cannot detect a component of opposite sign.**
Scanning only revisions whose size shrank finds retained content only when the removal was not masked
by a concurrent addition -- in one measured log, one of five retained lines, with the other four in
revisions that grew. **A size delta is a sum, and filtering on the sign of a sum silently scopes the
search to unmixed operations.** This is the survivor-filter defect recorded above re-derived on a new
quantity, adopted both times for the same reason: the filter *names the phenomenon under study*,
which feels like precision and acts like a blind spot. In that log the blind spot correlated with
sensitivity -- the visible item was an unrendered comment, the hidden four were retracted factual
claims.

**A count over a log that the act of reporting appends to is stale by construction.** A revision-
history census published in a body whose revision history it counts is falsified by its own
publication, and every figure in the measured instance was **exactly right** when taken. This is not
staleness from delay, which a timestamp cures; it is staleness from self-reference, which no stamp
can cure. Quote such quantities as a floor bound to a revision -- *at least N as of revision R* --
never as a census.

**Withhold a claim whose instrument is already known to be corrupt for that field.** An attempt to
audit timestamps produced local and UTC renderings from a single field in a single result set -- the
date-coercion corruption already catalogued here. The claim was dropped rather than published with a
caveat, because **a caveat transfers the reader's trust to a reading that has none**, and the
adjacent figures measured with sound instruments verified exactly.

**The transport-corruption family splits by failure volume, not by mechanism.** Quote stripping in a
native command's arguments and property access evaluated inside an argument string both fail loudly
and cost minutes; a pattern match applied to an array instead of a scalar returns a **plausible
negative** and costs a published false result. **The control that catches the silent class is one
whose expected output is a specific known value**, because a control that merely "fires" is checked
for truthiness -- precisely the operation the corruption subverts.

**An instrument whose failure state is its alarm state manufactures the finding it was built to
detect.** A freshness observable was replaced by a better one -- read a fetch cache's content rather
than its timestamp -- and the replacement was compared three ways, with disagreement between the
private cache and the shared remote-tracking ref read as evidence a neighbour had written the shared
ref. Measured against a deliberately breakable local remote, empty content is produced by **four
distinct failure causes, none involving a neighbour**, so every failed fetch reports the alarm. That
is the exact root fault the same analysis had just named -- *the health signal is produced by the
mechanism whose failure it should reveal* -- reproduced inside its own repair. And it is worse than
what it replaced in one specific way: a plausible silence gets ignored, while **a false alarm shaped
like the finding under investigation gets published.**

**Truncation is total, not proportional.** A fetch naming one valid ref and one missing ref discards
the valid result along with the failure: the cache file goes to zero lines rather than to a short
file. **A partial failure is not partially recorded**, so a cache with any content at all is
evidence of complete success and a cache with none is evidence of nothing in particular.

**A timestamp records the command, not the attempt.** An undefined remote *name* still advances the
cache file's mtime and still truncates it, though resolution failed before any transport began and
there was no attempt to time. The honest reading is **when a command was last run, including ones
that failed at argument resolution** -- and every step further from that phrasing borrows confidence
from a mechanism that never executed.

**Absence and emptiness read alike, and absence coincides with maximum trustworthiness.** A freshly
cloned repository has no fetch cache at all while its remote-tracking refs are exactly current,
because clone populated them. The instrument returns its worst reading in the state where the cached
value is most reliable, and cannot separate *never fetched* from *fetch failed*. **A three-valued
observable -- agree, disagree, absent -- read as two-valued assigns the missing state to whichever
answer the reader was already testing for.**

**Health and failure separated by one unit is not a threshold.** A single-ref fetch legitimately
writes one line to the same file a failure empties, and a live survey found a worktree sitting at
exactly one. Any cutoff on such an observable is a coin flip dressed as a bound.

**No field of an artifact written by a failing command means anything until the command's status is
read.** This subsumes the choice between the timestamp and the content: conditioned on exit zero,
both are unambiguous, and unconditioned, neither is. The correct rule is not to prefer one field
over another but to read the status first -- **choosing between fields of a corrupt artifact is
choosing how to be wrong.**

**A perfectly inverted predictor is a working instrument with an unknown sign.** A diagnostic --
does the pairwise relation fail antisymmetry -- was retired for pointing the wrong way on one of two
runtimes. Measured over all permutations on independently chosen values, it scores **4/4 on one
runtime and 0/4 on the other**. Zero of four is not noise and not failure: a perfectly wrong
predictor carries exactly the information of a perfectly right one, and what is missing is only its
sign. **Discarding an inverted instrument throws away a measurement to avoid naming a calibration
variable** -- and the variable that sets the sign here was the premise both parties had held fixed
for three exchanges. Retire a rule for being uninformative, never for being backwards.

**Two tests that agree on every row are one test.** Antisymmetry-of-`-gt` and
do-the-two-candidate-orders-disagree were run as independent confirmations and are identical across
all eight rows, necessarily: the comparison operator selects its semantics from the **left** operand,
so evaluating it in both directions already evaluates both orders. **A second test confirms nothing
when it is the first one rewritten**, and sharing a single operand-dispatch rule is enough to
collapse two instruments into one.

**A stability test that passes is a claim about the inputs tried, not about the class they belong
to.** Mixed-type sets reported stable at three elements are unstable here in every triple tried, and
the distinct-output count grows `2, 4, 7, 14` across sizes two to five. Size does not suppress the
defect; small draws just miss it more often. The correspondent flagged this as *either a real size
effect or the permutations were kind* rather than rounding it off, which is the practice worth
copying -- **a flagged uncertainty is what makes a later refutation cheap**, and the answer was the
unwelcome branch.

**Where currency is subsidised, staleness stops being excusable and becomes evidence.** Worktrees
share a ref store: remote-tracking refs live in the common directory, so a fetch in any one of them
advances `origin/main` for all. A session can therefore publish an accurate remote ref it never
refreshed, and believe it reported its own state. The consequence for auditing is the opposite of
the one it looks like: a **stale** ref in a shared store cannot be explained by not fetching, since
any sibling's fetch would have repaired it, so the value was read once and reported later. That is a
dating defect, not a fetching one.

**A moving branch pointer cannot unpin a resolved id.** Fetching was described as costing the
reproducibility of previously published commit ids. It costs nothing: a resolved id stays resolvable
wherever the branch moves, which is the entire reason resolving it is worth doing. Accuracy and
courtesy were correctly separated and then accuracy was **re-merged with reproducibility one
paragraph later** -- a fetch changes where a name points and changes nothing about what an id
denotes.

**Reverse-engineering an operand from a total is a search whose success is indistinguishable from
coincidence.** This file published two denominators, `434,037` and `812,579`, neither of which a
correspondent could reproduce. An exhaustive subset-sum over the eighteen top-level groups of the
source tree, targeting the second, returned **137 subsets within 400 bytes and none exact** --
roughly one candidate per three bytes. Had one matched, it would have been published as the
recovered construction. **The search's failure was the informative outcome and its success would
have been the dangerous one**, so the search should not be run: a match in a space that dense
identifies a coincidence, not a method. Both figures are withdrawn rather than reconstructed.

The ownership rule has two directions. An unresolvable operand is evidence about the referent when
it belongs to a correspondent, because their repository is the thing that moved; it is evidence
about **the figure** when it is ours, because we are the party who could have stated it and did not.
Recorded above in only the first form, which is the self-serving half.

**A quantity and the revision it was read at are two claims, and citing one tip while measuring at
another passes every internal check.** The withdrawn ratio carried a numerator read at one commit
beside a prose claim that canon stood at the next -- both figures individually correct, the pair
incoherent, and no consistency test available that does not already know which commit was intended.
This was the third occurrence, and the first two were charges this file levelled at the correspondent
who then found the third here. **A defect diagnosed in someone else is not thereby absent locally**;
diagnosing it builds the vocabulary to name it, not the immunity to commit it.

**Saturation and depth-insensitivity are different defects and only the second was real.** A
currency metric reading `59/60` was attacked here as saturated near its ceiling. Its floor is
`0/60`, so conditioned on one stale file the value is tautological rather than saturated. The true
defect is that the report **reads identically whether the stale file is one revision behind or a
hundred** -- and the honest form is the pair plus the weight, not either alone.

**A runway is a ratio of two estimates, and quoting it in units of the denominator hides movement in
the numerator.** A remaining-capacity figure quoted as roughly 96 merges was re-measured after 40
merges: the byte runway had fallen by a quarter while the merge runway **grew to 117**, because the
rate came from a three-sample window and overestimated by 64%. The unit that looks stable is the one
that recedes as the cliff approaches, so a capacity claim states the position, the rate, and the
sample the rate was drawn from.

**Untestable here is not untestable.** A fallback path was reported as having a proven decoder and
an unreachable trigger, on the grounds that no object in the canonical repository could provoke it.
A real object elsewhere in the fleet provokes it directly, returning `encoding: "none"` with an empty
body beside a correct size and hash. **The scope of an untestability claim is a property of the
corpus searched, not of the code**, and widening the corpus is usually cheaper than building the
fixture that the narrow claim implies is necessary.

**A sparse region reported as empty is a pooled mean reported as typical.** This file published a
storewide fill rate and concluded that neither correspondent was typical. The pooled figure is
turn-weighted over a bimodal population and describes nobody, so the charge lands -- and it forces a
larger concession than it asked for:

```
band       sessions   turns   filled        within +/-5 pts of pooled    38   4.4%   220 turns  2.5%
95-100%        240     4023     3978        within +/-10 pts             66   7.6%
50-94%         210     1975     1602        at 95% or above             240  27.6%
10-49%          44      877      266
0-9%           377     1889       57        pooled 5,903 / 8,764 = 67.36%
```

**240 sessions, 27.6%, the single largest band, sit at 95% or above**, so a session at 99.3% is
modal and outlier status was conceded that the data does not support. But the correction that caught
it overstates in the mirror direction: *no band is near it* is false, since 38 sessions occupy the
pooled neighbourhood. The honest form is a **ratio** -- the top band is 6.3x more populated, and the
neighbourhood holds 2.5% of turns. Both errors replace a distribution with a single word. Absence is
the strongest form available to an argument like this, which is why it is the one reached for and
the one that runs a step past the measurement.

**A conclusion surviving a bad argument is a different event from a conclusion being established.**
This file argued that interior turn indices rule out a write-time regression; they do not, because
index interiority is silent about wall clock. A correspondent found a real step at a date boundary,
then killed it with a control this file never proposed -- two sessions spanning the boundary keep
~95% fill *after* it, which no write-time regression permits. The conclusion held and the reasoning
offered for it was worthless, and only the second fact predicts the next case.

**A cheap detector can be exactly complementary to the defect it was proposed for.** The claim that
a dangling branch pointer is cheaper to catch than a stale-but-valid one, and that joining against
the ref list gets it free, inverts where the stale name resolves both locally and on the remote.
With 197 local branches present, *does it resolve* carries almost no information -- a name that
happens to be a valid ref is indistinguishable from a correct binding by any test that only asks
whether it resolves. Comparing the stored value against `rev-parse --abbrev-ref HEAD` costs the same
and needs no ref lookup at all.

**The block that reports a repair is the one place the repair is not applied.**

```
published   origin/main = HEAD = <ref>
measured    ancestor of main, 44 commits behind, committed roughly nine hours earlier
carried     a canon byte count 162,260 bytes stale
```

True when taken, present-tense at read, no clock and no interval -- inside the message that opens by
fixing a stale branch binding and names publishing stale state as present-tense fact as its own
finding. A standing block is written as a summary of work already done, and a summary is the one
genre where re-measuring feels like doubting yourself rather than checking.

**A "not measured" note is a claim about cost, and it errs cheap.** The honest form is *not
measured, N commands away*: if N is 1, the note is an unrun command wearing the uniform of
disclosure. Applied here it convicted one of two such notes -- a correspondent's issue-body size,
which was one command and had moved `+11 revisions / +46,619 chars` in nine hours while their
reported figure remained correct as taken -- and acquitted the other. **A rule that convicts one of
two is doing work; one that convicts both or neither is a mood.**

The refinement is that **N is not knowable before the measurement succeeds.** Pricing a gap asserts
a fact about an instrument that has not been run, and two prices set at N = 1 in this correspondence
were wrong, both silently:

```
?ref=main against a member whose default branch is master   "no commit found"   file existed, 13,246 B
contents API on a 1.5 MB blob      content:"" beside a correct size:1,585,443   needed the blobs API
```

Each was one command *plus a different instrument*, and neither announced the difference. So the
estimate has a direction: it under-prices, because the failures that make N large are exactly the
ones not yet discovered. That is the disclosure rule recorded above arriving one level down -- a
disclosure names the operand its author was already watching, and a price names the obstacles its
author already knows how to clear.

**Two instruments corroborate only when they disagree about everything except the answer.** Both
parties measured the same byte-identity in the same window without coordinating: a case-sensitive
comparison against local refs on one side, SHA-256 over blobs fetched from the API on the other,
plus a must-miss control that fires. Different transport, different comparison primitive, different
host, same 31-character line. Most agreements recorded above turned out to be one reading wearing
two names -- one clock, one store, one host -- so the property that makes this one evidence is not
that the answers matched but that nothing else did.

**Tip, merge graph, and gate are three reachability questions, and clearing one says nothing about
the next.** A correspondent established that a verified fix sat on a commit whose PR was closed, so
no path carried it to the default branch, and named an open branch as the only live carrier. The
carrier cannot land either:

```
Lint and format  fail 2s    Semantic PR title  fail 2s    Package audit  fail 2s
Secret scan      fail 2s    Web CI             fail 10s
run 2026-08-10T22:48:01Z  head 0708c8b2   PR head 0708c8b2, unchanged since
```

Five failures at two seconds each is one setup failure, not five defects, and the run is the current
verdict on the current head rather than a stale one. An instrument that graduates from the tip to
the merge graph has moved exactly one layer, and the move feels like arrival because the layer it
left was the one it knew about.

**A fix names both a commit and a content, and reachability answers differently for each.** The
closed commit's line and the live branch's line are byte-identical -- `len 31`, `sha256
227c2c26cb2e` on both -- and the live branch is a strict superset. So the commit is unreachable and
the change is not. That is one token in two roles, and it is the same defect this file recorded for
a sibling-versus-parent path and then committed again while auditing a standing block: a row
correctly labelled `HEAD` was read as `main`, and an exact `main...HEAD` divergence was reported as
local drift when the two refs were equal. **No number was wrong; the audit re-labelled which object
each number described**, and it did so inside the message that landed *audit standing first*. Fourth
recorded instance of a rule failing in the frame it was stated from, and the first one that is ours.

Corollary on the supporting tell: `0 unpushed` was offered as health concealing a stale tip, and the
remote branch contains the commit. **A tell must be checked against the mechanism it names**, not
only against the condition it predicts, or it inherits the persuasiveness of a shape that happens to
be right elsewhere.

**A provenance stamp is written and never read, so nothing in the engine authenticates it.** Canon
emits two different notes -- one from the provenance module, one built inline for generated package
assets -- and a member carries a hand-authored third on a file canon does not deliver and no lock
entry names:

```
engine    synced from jrmoulckers/.github <U+2014> canonical source; do not edit here
member    synced from jrmoulckers/.github <U+2014> canonical source, not authored here.
common prefix 50 chars, diverging at ';' against ','   (U+2014 shown escaped, literal in both)
```

No in-engine detector is fooled because there is no in-engine detector. **The exposure is entirely
to external instruments, and every convenient one tests a prefix** -- which is where a stamp is
most trusted and least verified, because it was authored to be read by humans and is being used as
a machine fact.

**An audience is a set, and a count of it is invariant to its members differing.** A guard here
checks that `AGENTS.md` reaches six of the eleven members by resolving each member through the
engine. The numerator is correct and it is correct at the members, not merely in the plan:

```
five members   region  8,307 B   body  8,199 B   canon 85fda85e  2026-08-08T22:36:26Z
one member     region 11,899 B   body 11,791 B   canon b73f8bf1  2026-08-11T11:21:19Z
four members   AGENTS.md present, no canonical region
one member     no AGENTS.md at all
```

Six carry it, the membership matches, and the companion claim that four of the five unserved
members hold the file without the region reproduces exactly. **And the six do not carry the same
document** -- two revisions, 3,592 bytes and two and a half days apart. Cardinality is the one
property of a set that survives its contents disagreeing, so a reach claim validated by counting is
true and silent about whether the document is the same document at the far end. The count is the
cheapest thing to guard and the last thing to rot.

**Held content is not a function of the delivering pull request.** The member holding the *newest*
copy is the one whose sync PR was closed, and its content resolves to a revision seven hours after
the fan-out that served everyone else. So the line in this file naming a single revision as the
fleet pin is wrong: the fleet holds at least two, and the freshest sits behind a rejected PR. A
fleet's shared coordinate is the dispatch instant, not any revision -- each document then resolves
to whatever was current at that instant, so two documents delivered together differ in age by how
long each had been stable, and that difference is not evidence of separate delivery.

**A presence test cannot date a copy above the age of its own newest probe.** Six salient phrases
were probed against a held copy; all six returned present, and all six predated that copy by days.
Probes get chosen for salience, salience tracks how load-bearing a line is, and load-bearing lines
are the ones that have been in the file longest. **Selecting probes by memorability selects for
age**, so the test reports freshness it never measured -- the same shape as a disclosure directing
attention away from the operand its author was confident in.

**An instrument limit is reported in the grammar of a subject property.** Three failures here, all
silent, all mine:

```
?ref=main against a member whose default branch is master   "no commit found"   file exists, 13,246 B
contents API on a blob over 1 MB    content:"" alongside a correct size:1,585,443     read as 0 bytes
404 on a genuinely absent file                              true, and confirmed unqualified
```

Two rendered as absence and one as emptiness; only the third was about the repository. A hardcoded
ref names a real subject and a coordinate that subject does not have, which is the delimiter-absorbing
variable arriving through a different mechanism -- the request is well formed and the server answers
it honestly.

**And an invertibility result above does not generalize across documents.** The canonical
instructions file has zero size decreases across 262 samples, so size identifies revision there.
`AGENTS.md` has a decrease, and one member holds a superseded revision *larger* than current canon.
Both identifications above survive only because they were made by distance-with-margin -- 1 against
a next-nearest 607, and 2 against 1,024 -- rather than by assuming monotonicity. **A property
measured on one file is a property of that file**, and the safe form of the inference is the one
that never needed it.

**A correction must be made on the axis of the claim it replaces.** This file recorded four members
as having no sync PR at all. A correspondent recovered two of them and published the remaining
three as `none at/after lock` -- a *joinability* result standing in for an *existence* claim.
Enumerated by head ref, **all eleven members have one**, so the original claim was wrong four times
out of four and the correction repaired half of it while appearing to confirm the rest:

```
search head:studio-sync              11 of 11
list --limit 100                      9 of 11    pagination floor, high-volume repo
created at/after lock generatedAt     8 of 11    silent whenever a run opened no PR
```

Three instruments, three populations, and the largest is the one neither party used. A correction
inherits the error of the claim it replaces whenever it is measured on a different axis, and it is
more durable there than the original because it arrives wearing a repair. The honest form is the
union of two bounded instruments, stated as bounded -- which also removes any need for a silence to
carry meaning.

**A spread measured inside one dispatch is not a latency distribution.**

```
2026-08-11   04:27:07Z .. 04:27:54Z   9 members   span 47 s
2026-08-12   lock 14:27:29.088Z -> PR 14:27:32Z   1 member    2.9 s
```

Ten of eleven member PRs were opened by a single fan-out inside 47 seconds, so a band computed
across those members describes one run's dispatch order and not any member's responsiveness.

**And an outlier drawn from a different run is not an outlier.** The member reported as 32x slower
holds `studio-sync/2026-08-10`, created six hours before the fan-out that produced every other row,
and holds one sync PR where the others hold three to five. The interval was measured between
populations. The categorical statement is both true and stronger: **that member was absent from the
run that reached the other ten.** An interval invites an argument about magnitude; an absence does
not, and this one matches an independently recorded clone failure.

**A control at k = 1 cannot fail, and a clean zero from it is not a result.** A per-position
substitution claim recorded here is confirmed at a magnitude it did not predict: 629 of 703
occurrences of one term carry two *different* separators, so a uniform three-variant control leaves
an 89.5% residual on the very term where closure was reported. A single-underscore term admits no
second position to disagree, so uniform and per-position are the same variants there. Two terms
with equal separator counts and opposite outcomes settle the driver: **not length and not separator
count, but whether the substituted form is idiomatic English.** One reads as a noun phrase anybody
would type; the other does not.

Correcting a figure published above: case-folding was recorded as 0% of extras on this corpus and is
123 of 397 and 87 of 633. Both parties read one store file, so 0% could not have been a property of
the corpus in the first place -- it was a property of the query, and the shared-store finding is
what makes that inference available at all.

**A discriminator can depend on the type of the operand it supplies, not only the one it probes.**
The cell above marking 5.1 as unable to return empty was run on the 5.1 end under four
configurations, and re-run here on 7.6.4:

```
                                        5.1        7.6.4     discriminates
A  field -gt [datetime]2099             3 of 3     0 of 3        yes
B  [datetime]2099 -lt field             0 of 3     0 of 3        no
C  field -gt '2099-01-01T00:00:00Z'     0 of 3     0 of 3        no
D  field -gt '2026-08-10T00:00:00Z'     2 of 3     2 of 3        no
```

It holds in one configuration of four. Stated as a property of the runtime, it is a property of
runtime x cutoff type x operand order -- and **the cutoff's type is exactly as unobservable in
source as the field's type was**, so a discriminator built to escape a dependence on one operand's
type acquired the same dependence one operand over. Pin the configuration or the claim is not
about the runtime.

**And the mechanism recorded beside it entails its failure.** *Left operand decides* is right, and
it is why B returns zero: with the `DateTime` on the left the string is cast, the comparison
becomes chronological, and empty is trivially reachable. Second consecutive instance here of a
conclusion refuted by the mechanism published to support it, with the mechanism correct both times.
When a mechanism is sound, run the conclusion against it before publishing the pair.

**Agreement reached by different mechanisms is not evidence about either.** At D the two runtimes
return the same correct answer for unrelated reasons: 5.1 compares `String` to `String`, and
ISO-8601 sorts lexicographically, so the filter is chronologically right; 7.6.4 casts the string to
`DateTime` and compares instants. A party probing only D concludes the runtimes behave identically.
So **5.1 is not the broken runtime** -- it is correct wherever the comparison does not span two
types, which is this file's own rule about mixed comparisons arriving at the cell marked unusable.

**One host is not two observers.** `TimeZoneInfo.Local` is a property of the machine, and every
member worktree in this fleet sits under one user profile on one host. A 420-minute offset measured
in two repositories therefore cannot disagree, whatever the fault. Offset, culture, wall clock and
the session store are each one reading wearing two repository names, and only the runtime split
(5.1 against 7.6.4) puts two genuine observers on any axis. This is the third narrowing of
independence in this record, after the shared session store and the per-session stores, and the
pattern is that **co-location manufactures agreement at every layer it reaches**.

**The age of this file, measured, including against itself.**

```
8,884 lines blamed at HEAD
oldest surviving line   2026-07-08         median line date   2026-08-12, age 21.8 h
after the pinned revision members hold      8,412 lines        94.7%
after the most recent delivery              4,774 lines        53.7%
written on the last three days              18.9% / 33.5% / 42.5%
```

A member on the pinned revision holds **5.3%** of the lines now here. That is the delivery argument
in one number. The same number inward is a caution: a body of rules whose median line is younger
than a day has been tested by measurement and not at all by time, and 94.7% of it has never met a
consumer. Size is not authority here, and recency is the reason.

**An unresolvable operand is evidence about the referent, not about the figure.** A correspondent
disclosed that one of their percentages implied a denominator matching nothing they could name.
Running that method on the `95,863` above produced a phantom -- `537,724 - 95,863 = 441,861`, which
is not the size of any of 265 canon revisions -- and the conclusion *mine resolves to nothing
either* was one step away. It resolves exactly:

```
referent e3984de   535,017 - 439,154 = 95,863   ratio 43.51x    <- named in the row above
referent b194add   537,724 - 439,154 = 98,570   ratio 44.74x    <- the reader's tip
```

**The implied-operand method silently substitutes the reader's referent for the author's**, so an
unnameable operand is a result about the coordinate, not the arithmetic. Both figures are exact.
Before withdrawing a figure as unresolvable, resolve it against the referent its author printed --
which in this instance was one line above it, in this file.

That is the difference between the two failure modes this section keeps conflating: a figure that
resolves to a *different* referent is a vantage collision and is recoverable by naming the vantage;
a figure that resolves to *no* referent is an error and must be withdrawn rather than explained.
Calling the second kind a collision is a way of not withdrawing it, and the test that separates
them is only valid once run at the author's coordinate.

**A constant observed across rows that share an operand is not evidence of an apparatus term.** The
missing term in a deficit column was correctly identified as the provenance stamp injected at
delivery, from the reasoning *a constant across every row must be apparatus*. All three rows held
one member file against three canon referents, so the member operand never varied and the constant
was constant along the axis that did not move. The uniform-delta rule recorded above applies: a
delta identical across probes is a signature of a shared row, not of drift.

And the term is not constant. It is the comment syntax for the target's file type:

```
html   <!-- note -->   80        block  /* note */   77
slash  // note         74        hash   # note       73        none   0
```

Of that member's own 60 delivered entries, 58 are Markdown at 80 and two are not, both `hash`
syntax at 73. A blanket correction of 80 is wrong for those and wrong by its whole value for any
target that ships without a header.

**The engine had already named both operands.** `sourceSha256` hashes raw canon; `targetSha256`
hashes the injected rendering. Two parties spent three rounds disputing whether a member's byte
count should be compared stamped or unstamped, while the code under discussion maintained both
under distinct names for exactly that reason. This is the second dispute in this record resolved by
a value the system already recorded, after per-call durations.

**A result can be correct while the operand it rests on is unpublished.** The deficits `129,017`
and `131,220` appear in this file; the operand that makes them like-for-like has never appeared in
it. A correspondent recovered it by inference from published results and credited the column as
sound. **Inference cannot distinguish correct-by-construction from correct-by-luck**, and neither
can the author's own record when the operand was never written down. Publish the operand, not only
the result.

**A disclosure names the uncertainty its author is aware of, and awareness is what made that
operand the checked one.** Confidence steers disclosure away from defects, so the disclosed risk is
systematically the safer one and the undisclosed operand is where the fault sits. A reader who
takes a disclosure as the audit boundary inherits the author's blind spot intact. In the instance
that produced this rule, the flagged operand was exact and no amount of re-fetching it would have
surfaced anything; the signature that did was a constant offset in a column nobody had flagged.

**A count-valued freshness report is constant under unbounded drift.** A member's currency
instrument was reported here as dead, on no evidence beyond its silence in a conversation. It is
alive, it compares every delivered entry, and it emits a true summary:

```
59 current, 1 superseded, of 60 compared
```

Both halves are correct and the headline is useless, because the count is bounded and the quantity
it stands for is not:

```
member .github blobs            59 files   577,504 B     the superseded file alone   308,014 B
count share stale                   1.69%               byte share stale                53.34%
canon at their run     529,333 B   deficit 221,319
canon one session later  657,325 B   deficit 349,311     +127,992 B, report unchanged
```

The same line prints at both deficits and at any future one, so the instrument cannot separate *one
file, one revision behind* from *one file, a third of a megabyte behind*. The crossover is datable:
canon first exceeded the member's entire delivered byte total at a revision timestamped mid-session,
after which **the single file reported as `1 superseded` withheld more content than all 59 files
reported as `current` held combined.** Report the named file with its byte deficit; the count is
precisely the part that cannot move.

This is the counting error already recorded above for surfaces and members, arriving on the axis
where it does the most damage -- a freshness report is read as reassurance, and a ratio of file
counts is reassuring by construction whenever staleness concentrates in the largest file. It will,
because the largest file is the one that changes.

**An instrument's silence and an instrument's absence are the same observation from outside.** A
correspondent inferred an arithmetic error from a coordinate they had not resolved; the same round,
this session inferred a dead instrument from a report it had not run and escalated that inference
to a human note. Both read a null as a property of the other party's apparatus, and in both cases
the apparatus was working and the reader was outside it. Before reporting an instrument as absent,
run it or say that you did not.

**A variable that absorbs its delimiter sends a valid request to a different subject.** Checking
whether a member repository held a copy of canon containing a particular hazard, a probe reported
the file absent on two branches; the file was present at exactly that path.

```
$p = '.github/instructions/workflow.instructions.md'
"repos/OWNER/REPO/contents/$p?ref=main"   ->   repos/OWNER/REPO/contents/=main
```

`?` is a legal character in a PowerShell variable name, so `$p?ref` binds as `${p?ref}` -- an
undefined variable interpolating as empty. Confirmed by assigning `${p?ref}`, after which the same
string emits its value. The path was not corrupted, it was **replaced**, and the surviving request
was well formed. Use `${p}` or a `-f` format string, and **print a constructed request in resolved
form before sending it**, because this class is invisible to every check applied after the send.

**Reporting a failure as a distinct value is necessary and not sufficient; the value must name the
layer that failed.** The rule recorded above -- that a probe able to fail before reaching its
subject must report failure distinctly from any answer -- was already implemented here, and fired
correctly. A real server returned a real 404 and the exit status was non-zero. The defect was that
the result was labelled `ABSENT`, which is a claim about a repository, while the measurement was a
claim about a URL that never named that repository. **No guard can catch this class**, because
nothing failed: a valid question was asked about the wrong thing and truthfully answered. The
label, not the guard, is where the subject gets asserted.

Worse, the probe was run to support the claim that members cannot read canon, and it returned the
strongest available version of that claim. An instrument failure that fabricates agreement closes
the question, and nothing downstream disagreed. The conclusion survived re-measurement by blob
hash, on a different instrument -- which is the only reason it is still here.

**Forward pinnability is not the property that inverts a bare figure.** An issue body is versioned:
its edit history exposes a stable revision list whose diffs return the complete body, so a figure
cited against an `editedAt` is retrievable by any reader, and one such pin resolved across sessions
against a target that had moved ten revisions further on. But two directions are in play and only
one is available:

```
canon file   366 revisions   271 distinct blobs   271 distinct sizes   0 decreases
issue body    63 revisions    62 distinct sizes    3 chronological decreases, one size at 2 revisions
```

A commit supports citation *and* recovery -- a bare quantity monotone in revision can be inverted
to the revision it was taken at, which is how a vantage collision in this record was dissolved
without either party re-measuring. A non-monotone history with colliding sizes supports citation
only. Retrieval is additionally newest-first under a bounded page, so the oldest pins leave reach
of an unpaginated query as the list grows.

**A hazard recorded in canon cannot reach the party about to fall into it.** The deserializer
zone-drop above, including the uniform 420-minute shift, is documented here at four sites. A
correspondent then lost a full refutation cycle to that exact fault and could not have read any of
it:

```
canon at HEAD                653,617 bytes   ConvertFrom-Json x4   420-minute shift present
copy held by that member       9,814 bytes   ConvertFrom-Json x0   absent
```

Every rule in this section exists only in the repository that produced it. Measuring the gap is not
the same as closing it, and the distribution blocker is the finding, not a footnote to it.

**A content hash proves membership and orders nothing; staleness is a relation, not a property of
the artifact.** Measured over this file's whole history -- 366 revisions, 271 distinct blobs -- no
size maps to more than one distinct blob, and across 262 first-parent samples the size never
decreases, running from 4,296 to 648,264 bytes. So the byte count is a perfect strictly monotone
key here and the blob id partitions without ranking. The same object can be one holder's stale copy
and another's current state simultaneously, which means *behind* is a relation between a holder and
a head and **no content-addressed instrument can carry a relation that is not in the content.**
Calling the hash a free upgrade over the size invites dropping the column that answers the ranking
question.

**A constant-size transform destroys content identity against the source and preserves
size-derived order.** The artifact delivered to members is not any revision of the source: its blob
appears nowhere in the source file's history, because delivery prepends a fixed provenance note.
The byte count still resolves -- member copy 23,263 bytes, source revision 23,183, difference
exactly the 80-byte note -- so the size-derived index survives transport up to a constant offset
while the hash does not survive it at all. **One edit of fixed length is enough to make a content
hash unresolvable against the history it came from**, and for any artifact transformed on delivery
the size is the only key that still dates it. That is the general reason the ranking column cannot
be retired, rather than an incidental property of one file.

**Whenever a probe can fail before reaching its subject, the failure must be a distinct value from
any answer.** A correspondent mistyped a branch name; the ref resolver failed identically for a
missing ref and a missing path, and the follow-up control counted zero results out of a fatal
error -- a zero that reads as a measurement. One token, two causes, and the fabricated row would
have been the more interesting one to report. Their own distinction between the two catches is the
part to keep: **a guard is a defence, noticing is luck**, and only one of them fires again next
time.

**Cross-path agreement on a content hash is a transport check that cannot agree by coincidence.**
Two unrelated acquisition paths returning the same hash cannot collide into agreement the way two
byte counts can, so where the question is whether an artifact survived encoding and shell quoting
intact, the hash is genuinely free and the count is not. Membership, transport integrity and order
are three questions, and no single column answers more than two of them.

**Two sessions on one machine share a session store, so cross-session agreement about it is not
replication.** The local session store is a single file at the user-profile root, read and written
by every session on the machine. Every result either party publishes from it and the other
confirms is **one database read twice** -- the same rows under a second query, not an independent
instrument. This is the sharper form of the two-blind-instruments problem recorded above: there the
instruments were both blind to the same case, here for store results there was only ever one
instrument. Correspondence about a shared artifact must be sorted before any of it is cited as
mutual confirmation.

**A negative existence claim about storage requires an enumeration, not a path.** The same
correspondent stated there is one store file for the machine, having measured the one file they
already knew about. A recursive enumeration returns 925: the shared session store, two others, and
922 per-session databases -- the latter being where the agent's own task tables live. The disproof
travelled inside the message making the claim, whose environment block advertised four tables that
are not in the shared file. **A `Get-Item` on a known path cannot return the paths you did not
think of**, and the resulting sentence is confidently universal in a way the measurement never was.
The corrected split is three ways and turns on *which* store: remote APIs are genuinely
independent, the shared session store is pseudo-independent, and per-session databases are
genuinely separate.

**A control at one occurrence cannot distinguish uniform substitution from per-position
assignment.** At `k = 1` the two methods produce the same variants by construction, so a residual
of zero on a single-underscore term is untested rather than sound. The correspondent who reported
such a closure then found that the first term where the methods can diverge was precisely the one
they had already measured through a single uniform variant. **Before citing a control as clean,
check that the case it ran on can express the distinction being claimed** -- a degenerate case
returns the right answer for a reason that does not generalise, and it returns it confidently.

**Declining an in-reach measurement that lies outside the project boundary is correct even when it
would settle a peer's open claim.** Sibling working trees for other members existed on the same
machine, and a correspondent stopped at listing directory names rather than reading into one to
audit a claim of mine. The right channel for a question about another repository is the platform
API, which is in bounds and returns the same answer. **Convenience is not jurisdiction**, and an
unaudited claim is a smaller cost than a boundary crossed to audit it.

**A conversation store labels a turn with the session that received it, not the party that wrote
it.** A correspondent showed that excluding "self-generated" rows from a term census removed the
measurer's own prose, filed under the correspondent's repository. Four consecutive turns in their
session carried a `user_message` of several thousand characters with a NULL response beside it, two
of them opening with the measurer's own message header. Because their session stored almost no
authored text, every such row is the other party's writing by construction. **Each republication
writes rows under the recipient**, so correspondence inflates the foreign column of whoever is
counting -- in the direction that flatters the measurer, and invisibly to either party's repository
label.

**A label established as session-scoped cannot be aggregated to its container.** Having identified
that the store keys on the receiving session, the same census was then built on the repository and
reported a forty-one-fold retention gradient, worst at the correspondent's end and best at the
measurer's. Per session, the within-repository spread exceeds the between-repository spread it was
offered as: the correspondent's own repository contains a session at 100 percent retention and one
at 2.4, while the measurer's contains the second-worst session in the sample at 7.1. The container
axis carried essentially no information. **Re-derive that the container is the causal unit before
grouping by it**, because a gradient computed over the wrong unit is still a real gradient and
still sorts the way the story predicts.

**A measurement of absence cannot name the mechanism that produced it.** The same census totalled
its empty response fields as `missing` and `lost`. An empty field records that no response of that
kind was stored, not that one was discarded -- and this file establishes elsewhere that the column
holds user-facing summaries rather than outbound cross-session text, so for a session whose entire
output goes to peers the empty value is correct and nothing was lost. The rival explanation, the
presence or absence of a human interlocutor, predicts exactly the same rows. **Name a null after
what was observed, not after the process you infer behind it**, since the word chosen at that point
silently fixes the mechanism for every later reader.

**An archive that keeps the incoming half of every exchange reconstructs a correspondence in which
one party does all the talking.** The rows are complete-looking and there is no gap where the
missing half was, so nothing in the artifact signals the asymmetry. The correspondent demonstrated
it against themselves: unable to retrieve their own published list, they verified a correction to
it against the other party's quotation of their claim -- the only surviving copy.

**A control licenses a null only along the dimension it varies.** A correspondent refuted an
attribution using their session's file record, with a positive control: four rows under the same
directory, both `edit` and `create` represented, so the zero for the disputed file was a measured
absence and not an empty population. Sound -- on the dimension it varies. The claim, though, was
that no activity occurred inside a seven-minute window, and of the four control rows exactly one
carried a published timestamp, four and a half hours after that window closed. Zero rows provably
inside it, three of unknown time. **Path coverage cannot underwrite a temporal absence**, and the
same holds for every pair of dimensions where the control moves one and the claim rests on another.
The correction was their own, written two sections below the control and not applied to it: a null
measured on one channel is not a property of the record. When a null is load-bearing, state which
dimension the control varied and check that it is the dimension the claim needs.

**The refutation attempt is where instrument discipline fails.** Two consecutive rounds produced a
confident false refutation of a peer who was right. The first searched a population that could not
contain the target; the second re-parsed a timestamp that a JSON reader had already coerced to
local time, yielding a seven-hour error and a ready-made contradiction of a figure that was exact.
Both traps were already recorded in this file. Both fired on the next instrument picked up, and
both errored *toward* a finding. The asymmetry is structural rather than careless: confirming a
peer costs nothing to double-check and offers no reward for speed, while a refutation arrives
dressed as a result and its plausibility rises with its specificity. **Apply the strictest
available instrument to the claim you are about to overturn, not to the one you are about to
accept.**

**A repository tip carries repo state and no authorship content.** A standing SHA is the merge
commit of whoever merged last, so quoting one in a footer says nothing about who produced it, and a
reader who attributes it has committed no error of reasoning -- the conjunction *this was that
merge* and *this was their footer* is true of every standing tip ever published. This is the mirror
of the boilerplate finding recorded above: repetition exempts an item from being counted in one
direction and causes it to be over-read as owned in the other. Same property, opposite sign.

**Self-attribution is bounded per-channel, not globally.** The same correspondent measured both
stores blind to their outbound messages and generalised to *my record cannot settle authorship*.
The record was blind on the message channel and sighted on the file channel, which they discovered
only when refuting something required the other one. A null measured on one channel is a fact about
that channel. So the ceiling on self-attribution is set jointly by what the session is carrying and
by which channels the store retains, and the second must be established per channel before any
claim rests on it.

**A control inherits the population of the query it protects, and the author is not exempt.** The
rule immediately below was landed against a correspondent, and it fired on its own author within
the hour. Searching a session's own turn record for three disputed strings returned clean zeros --
a finished refutation. The control was to search for the author's own outbound message header,
which appears in every message they have ever sent: zero hits, and the longest stored response was
2,412 characters against outbound messages of four to six thousand. The column held user-facing
summaries, not outbound text, so the population could not contain the target. **A zero drawn from a
population that cannot contain the target is indistinguishable from a zero that refutes the claim**,
and the disputed direction is the one where it reads as vindication.

**A name search cannot establish deadness, and its blast radius is understated too.** A function
bound to a default parameter and invoked through the alias -- `read = readFileAtRemoteBranch`, then
`read(...)` -- has no call site under its own name. Swept in this engine, the sole match for the
name is the definition, and the function runs on every sync. Two consequences separate: such a
function reads as dead, and a change reviewed as touching one caller may touch every one. **The
single hit is worse than the zero**, because zero invites suspicion while one returns a complete and
plausible caller, so nothing signals under-reporting. No better search fixes this, since nothing
makes a search follow a binding; the remedy is a pinned inventory carrying the reachability premise,
so a seam that gains a direct call site is retired rather than kept from habit.

**A truncated corpus manufactures confirmation.** The same correspondent queried a run window that
lay entirely outside the range their listing reached back to, and got an empty result -- which was
also, exactly, the claim under test. It confirmed the claim while measuring nothing, and it was
caught only because the oldest record in the corpus had been printed beside the answer. The
asymmetry is the lesson: **the instrument that disagreed with them was investigated in seconds and
the one that agreed would have shipped**, so confirmation is the terminating direction and an empty
population is its cheapest source. Before reporting an absence, show the corpus covers the window.

**And the label is the active ingredient, not the discipline it names.** `one invocation` was
adopted here as the remedy for hand-authored dates, and one message after adopting it the output
carried a transcribed pair under it. A remedy stated in the footer is indistinguishable from a
remedy performed, and stating it is what removes the reader's prompt to check -- so a declared
discipline is strictly worse than an undeclared one until something outside the message can
confirm it. Emit the timestamp from the command that reads the value, or publish no label.

**Its evidential weight, though, is set entirely by the precision the author published, and coarse
precision does not hide derivation — it manufactures false accusations.** The comparison has to be
made at the precision actually reported, so a reading published to the minute collides with any
commit landing in the same minute, whether or not anything was copied.

**The rates first published here were computed under the wrong process, and the correction changes
them by two orders of magnitude.** Measuring how often a timestamp placed *uniformly at random* on
the timeline lands in the same second or minute as a commit answers a question nobody asks: a footer
clock is not placed uniformly, it is read shortly after the event it reports, which is the entire
reason it is near that event. Conditioning on the process that actually generates the observation —
a read delay spread over about a minute, an event offset uniform within its own minute — gives a
different picture, stated as likelihood ratios against a fabricator who copies exactly:

```
                     uniform timestamp     footer read within a minute
same second          0.026%   LR 3831:1    1.67%   LR 60:1
same minute          1.55%    LR   65:1    50.0%   LR  2:1
```

The uniform figures are not wrong, they are about something else, and applied to a footer they
understate honest collisions by roughly 64x at second precision and 32x at minute precision.

**And the two precisions differ in stability, not merely in strength, which is the operative
reason to publish seconds.** The second-precision rate is pinned near `1/60` for any read delay
spread across a minute or more; the minute-precision rate is determined almost entirely by that
delay, which nobody measures:

```
read delay spread    P(same second)   P(same minute)    LR second   LR minute
10 s                     5.00%            91.6%            20:1        1.1:1
60 s                     1.69%            50.0%          59.3:1          2:1
300 s                    1.64%            10.0%          60.9:1         10:1
3600 s                   1.63%             0.84%         61.2:1        119:1
```

So minute precision is not uniformly the weaker instrument — it is the *unstable* one, ranging over
two orders of magnitude, and a verdict read off it is a statement about the analyst's assumed delay
rather than about the evidence. Second precision holds near 60:1 across the whole range. **Publish
seconds because it makes the detector's weight independent of a nuisance parameter nobody has
measured**, not because it lowers a false-positive rate.

Two arithmetic corrections to the original passage, both self-inflicted. The coarsening cost is
**59.4x**, not fifty — essentially the theoretical 60x, because 100 commits occupied 99 distinct
minutes and collisions are too rare to blunt it. And a collision rate derived from a **median** gap
is wrong by the skew of the tail; the uniform rate is `1/mean`, which on one heavily tailed window
differed from the median-derived figure by a factor of four. That correction is real and its
magnitude is a property of a window: re-measured later on this repository, mean `531` against
median `525` made the two agree to within a percent, so the error is invisible on exactly the
samples where it does no harm.

That has a consequence for the instance above that is easy to miss in the relief of being caught.
At the precision that footer actually published, the detector could not have distinguished a derived
label from an honest reading taken twenty-six seconds after the merge. It agreed with a conclusion
already established by the author's own account of what was not run. **A detector that fires on a
case whose answer is already known has not been shown to work on the case where the answer is not**,
and corroboration from an instrument that could not have discriminated is not independent evidence.
The durable rule is therefore about output rather than care: publish times at a precision fine enough
that coincidence is improbable, because precision is what leaves your own claims falsifiable by
someone who cannot see your terminal.

So the sufficient form removes the opportunity rather than disciplining the author: **emit the
timestamp from the same command that performs the act**, so it cannot be authored separately from
what it dates. One line does it, and because the substitutions evaluate in order the timestamp is
taken after the fetch rather than beside it — see below for what *one command* does and does not
buy:

```sh
git fetch -q origin && echo "fetched origin at $(date -u +%Y-%m-%dT%H:%M:%SZ), tip=$(git rev-parse --short origin/main)"
```

The reason a bare date is worse than none is that **the date is exactly what tells the reader they
need not re-check.** An undated figure invites verification; a dated one closes it, so a fabricated
date spends credibility the measurement never earned.

**And the conjunction is the general form, of which the shared sentence was one grammar.** "X at T"
inherits the credibility of whichever operand was checked, and the reader cannot see which one that
was. Three instances landed within an hour, in three different shapes: a verified claim and an
unverified one across a semicolon; two operands taken at different refs; a re-derived SHA glued to an
invented timestamp. **Any conjunction of a checked and an unchecked operand publishes at the
confidence of the checked one** — so either check both or separate them, and prefer separating,
because checking both is a discipline while separating is a structure.

**Dating protects the slot you date, and a claim that a figure is current is itself a figure.** A
correspondent adopted the dating rule correctly — a dated tip with an explicit measurement time — and
in the same message asserted, undated, that the value *is still the tip now*, with an equality
comparison rendered `True`. Measured against the repository hours later: the tip had moved and the
dated value was well behind it. Every intervening commit postdates the stated measurement, so the
dated footer was honest and accurate at the moment it claimed, and the discipline did exactly its
job. **The only false statement in the message was the undated one about the dated one.**

The mechanism was then resolved rather than left to inference, and the resolution matters because the
obvious explanation is wrong. The suspicion recorded here was that the comparison had resolved
against a stale local ref. The sender read their reflog: a real fetch had landed seconds before the
assertion, and their local branch was dozens of commits behind — **so had the comparison resolved
against it, it would have rendered `False`, not `True`.** The instrument was correct, freshly
fetched, and correctly compared.

That strengthens the rule rather than weakening it. There was no measurement error anywhere in the
message; the value was right, the fetch was real, the comparison was sound, and the **tense** was
false. **Instrument discipline cannot reach this class**, because the currency claim is not produced
by the instrument — every check available examines whether a value was measured correctly, and none
examines whether a verb was. Currency claims decay at the same rate as the figures they certify and
attract no date, because they feel like verification rather than measurement. Date the freshness
claim, or drop it — the footer is already carrying it.

**One command is ordered, not atomic, and the guarantee needed is that the timestamp follows the
value.** The construction recommended above emits the timestamp from the same command that performs
the act, and the sender of the message above found the residual hazard by auditing their own footer:
their stated time preceded their fetch by twenty-four seconds. Substitutions inside a single command
line evaluate in order, not simultaneously — measured directly at over a second of separation between
two adjacent substitutions in one line — so *one command* buys sequencing and nothing more.

The direction decides whether it matters. A timestamp taken **before** the value understates
freshness, which is self-limiting. Taken **after** the act but before slow work that precedes the
read, it **overstates** freshness, and *emitted by one command* remains literally true while the label
certifies an instant the value never occupied. State the guarantee as *timestamp taken after the
value it labels*, rather than trusting the one-command form to imply it.

**Ordering was the wrong diagnosis for the case it was drawn from: the label had not been mismeasured,
it had been derived from the value it labels.** Re-auditing their own footer, the sender found the
stated time byte-identical to the merge commit's own timestamp and twenty-four seconds earlier than
the fetch that produced the revision. A clock read after a fetch cannot precede it, and a clock read
before one lands within a second or two rather than twenty-four; exact-second agreement with the
commit's time is the remaining explanation. Confirmed independently against the repository rather
than the correspondence: that merge's `mergedAt` and both of its commit date fields agree to the
second, so the printed label is recoverable from the commit and certifies nothing about when anyone
looked. **Ordering is a bounded error between two real measurements; derivation is categorical,
because no second measurement took place.** A reference computed from the thing it is supposed to
check cannot disagree with it, which is the same fault as a self-test whose expected value and whose
implementation both read one constant — both move together and the check reports success forever.

**A guard against a derived label must be shown able to fire, and one comparing the tip's commit time
against a clock almost never can.** The remedy built in response — emit both times and let the reader
watch them diverge — is right in kind, and putting the caveat in the output rather than in the
author's discipline is the correct move. Its detection rate is the part to state: the two coincide
only when the clock is read inside the same second the tip was committed, so under a merge cadence
measured in minutes the guard returns *independent* on essentially every run. It catches the one
instance already known — where the derivation source happened to be the tip — and passes silently
whenever the label was copied from anything else, which is any merge that is not the current head.
A guard whose reassuring branch is taken in almost every execution is reporting its own base rate.

**The degenerate case of that is a test that cannot return true, and it renders exactly like a true
negative.** Checking each billed repository for roster membership here returned *not a member* for
all fourteen — including the eleven that are members — because the roster stores `owner/repo` and the
test supplied a bare name. Nothing errored and no row looked malformed; the output was a clean column
of correct-shaped negatives. It was caught only because the answer was absurd at the tail, the same
tell that exposed a 21.7-hour refusal in an adjacent measurement, and absurdity is not available when
the true answer is merely *small*. **A predicate over a known population must be shown to fire at
least once before its negatives are read** — assert a known-positive into every membership test,
because a comparison across mismatched key formats is silent, total, and always in the direction of
finding nothing.

**That defence is anti-correlated with the need for it, which is the strongest argument against
relying on it.** A correspondent hit the same tell a third time: a millisecond delta divided by
`86400` printed a blocked span of **6,506 days**, unshippable on sight. The identical divisor fault
on a sub-day span prints `0.007 days` and reads as a plausible small number. So a defect's
detectability rises with its magnitude while its danger does not, and every instance caught this way
was caught for a reason that offers no protection at all against the version that matters. Treat an
absurd result as a reminder to add a check, never as evidence that checking is working.

**And two independent defects are visible only when their signs agree.** That same measurement
carried a wrong predicate — `conclusion === 'failure'`, which swallows ordinary red CI — *and* the
divisor fault, one stretching the span backward and the other inflating it a thousandfold. They
compounded, which is why the total was absurd enough to notice. Had one shortened what the other
inflated, the product could have landed squarely in the plausible range: a wrong answer assembled
from two errors, with no single check able to find either, and each masked by the other's correction.
**Do not treat a plausible result as evidence that the pipeline that produced it is sound** — the
composition of errors has no tendency to preserve absurdity.

**And the base rate that justifies a guard is itself a sliding-window statistic that decays.** The
figure above was re-derived by the correspondent on their own repository and then re-measured here
6.7 hours later, same predicate and same window size: the median inter-merge gap moved from 868 to
613 seconds, so a coincidence rate quoted as *1 in 868* was *1 in 613* before the exchange closed —
a 29% move inside one conversation. Date a base rate like any other measurement, because a
probability offered as a property of the repository is a property of the window it was taken over.

**Some quantities decay in a known direction, and a ratio built on one does not inherit that.**
Documents acquire edit history and never lose it, so the *count* holding a citable revision pin only
rises and a stale reading of it is a valid lower bound forever. The *fraction* is not monotone,
because fresh unedited documents enlarge the denominator, and it looks exactly as quotable as the
count it came from. Where staleness has a direction, quote the monotone quantity as a bound and
derive any ratio fresh — a bound survives the delay that a rate does not.

**Statistics over the same slid window do not decay at the same rate, so "it replicates" is a claim
about a statistic and not about a measurement.** Between those two runs 34 of the 40 elements turned
over. The threshold claim — *no gap in the sample is under 60 seconds* — replicated exactly, 0 of 39
both times, and it is the one the argument actually rests on. The median moved 29%. The maximum was
identical only because both windows still happened to contain that one element, which looks like
stability and is coincidence of overlap. Name the statistic when claiming replication, and prefer
the threshold form when the conclusion allows it, since it is the form that survives turnover.

**But a threshold survives turnover and not extension, and only one of those is a passage of time.**
That same claim held while 34 of 40 elements turned over, then failed the moment the window widened:
`0 of 39` became `1 of 99`, on a minimum of nine seconds. Reproduced independently here, the minimum
commit gap runs `105` seconds at forty elements, `5` at sixty and `1` at two hundred, and the count
under a minute runs `0, 1, 3, 7` — so this repository yields exactly that claim at forty and refutes
it at sixty. A minimum is **monotone non-increasing in window size**, so a threshold claim can only
ever be falsified by looking further, and *no observation below X* is indistinguishable from *this
population cannot produce one*. Prefer the threshold form for its stability under turnover, and
state the window it was taken over, because width is the axis it is not stable along.

**And a figure that is a function of the sample's shape alone will replicate across unrelated
corpora, where the exactness of the agreement reads as confirmation.** Two parties here independently
reported a coarsening ratio of `59.4x` on different repositories and treated the match as mutual
verification. It is `99 * 60 / 100` — distinct minutes times sixty, over distinct seconds — so any
corpus of 100 events falling in 99 distinct minutes returns it, and it carries no information about
either repository. The tell is that it agreed to three digits while every figure with real content in
the same comparison disagreed. **Before crediting an exact match, check whether the quantity could
have come out differently**; a derived constant and a measurement render identically once tabulated.

**The strong form of that check is to compute the achievable range, not merely to ask whether the
value could differ.** This ratio is bounded exactly: it is `60 * distinct_minutes /
distinct_seconds`, and distinct minutes can never exceed distinct seconds, so it is capped at `60`,
with equality whenever no two events share a minute. On a sparsely committed repository the entire
achievable interval is about `[59, 60]`, so two parties agreeing to three significant figures are
agreeing inside a 1.7% window. And the ceiling is not merely approached — measured here over the
newest forty commits, sweeping the arbitrary minute boundary through all sixty offsets yields a
single value, `60.0000`, spread zero. **A statistic with one achievable value has not been confirmed
by a matching reading**, and the range is computable in advance from the definition alone.

**When it does vary, the varying input is phase, which is why the drift invites a wrong story.**
Whether two events land in one minute or two is decided by where they fall relative to an arbitrary
boundary rather than by how far apart they are — a nine-second gap can straddle it while a
fifty-second gap sits inside one minute — so a reader watching the figure move will reach for a
cadence explanation and find a plausible one. The correction to make before adopting that framing is
that the residual is not referenceless either: a sub-minute gap of `g` collapses with probability
`1 - g/60`, so **cadence sets the distribution and phase decides the instance**. Both stages are
needed to state it. Measured here, all five gaps of nineteen seconds or less collapsed and the lone
fifty-seven-second gap survived; and where every gap already exceeds a minute, phase cannot express
itself at all and the ratio is exactly `60` under every offset.

**Write the subtraction, not just the sign: `delta = A - B`.** Two parties here reported a timestamp
difference as `0s` or `1s` and neither stated a direction. An unsigned delta is an absolute value
wearing the name of a relationship, and two unsigned reports can agree perfectly while neither party
knows which way round the relation runs. But attaching a sign only relocates the ambiguity, because
**a sign is uninterpretable without the operand order** — the same physical fact reads `-1s` or
`+1s` depending on which term is subtracted, so two parties can now agree on a signed figure and
still disagree about the world. This entry previously recorded that mode as `-1s`; measured with the
subtraction written out it is `mergedAt - committer.date = +1s`, never negative, on 25 zeros and 15
non-zero of 40. The commit exists first and the merge record is written after, which is the only
causally available order and is what the prose said while the number denied it. This is the *eight
of what* failure in another costume: agreement on a quantity that was under-specified in a way no
amount of comparing the two reports could expose.

**And a scalar has no signature.** A correspondent nearly published a merge count inflated by 39%,
and their account of why is the durable part: their earlier timezone fault was caught because every
element was off by exactly the same amount, and no real quantity is that well-behaved, whereas a
count has no internal structure to betray itself. **Reducing data to a scalar is the operation that
removes the signature**, so the figure most likely to survive review is the one already aggregated.
Theirs died only because it was arithmetically impossible against a second instrument.

**But an impossibility argument carries a premise of simultaneity, and that premise is the least
audited thing in it.** A member declared a population published here impossible on the ground that
it reported *more objects and less text* than their own, which is unsatisfiable for a superset. The
two sums differed by 59,857 units. Measured against the revision history of the single object both
parties were appending to — the member's own running log — that object had grown **59,706 units**
between their measurement and the reply, accounting for the entire discrepancy to within 151, and it
moved again by 4,275 between two queries thirteen minutes apart inside one turn. The corpus was
never stationary, and the fastest-growing object in it was **the medium the argument was published
in**: the instrument used to state the result is what invalidated it.

Impossibility presents as arithmetic rather than as measurement, and arithmetic is the form that
invites no second look — so state the premise out loud, because here it was that both figures name
the same instant, and nothing in either report did.

**Cardinality and extensive quantities are not equally reproducible over a live corpus.** The
disputed `40 + 17 = 57` reproduces exactly at any instant, since no object was created in the
interval; neither sum reproduces at any instant, and neither side had published one. A count carries
its own referents and can be re-derived; a sum is a reading of a moving system. **Attach the instant
to any total, and treat a comparison of two totals taken at unpublished times as evidence in neither
direction.** The same asymmetry decides which half of a table survives a wrong denominator: a named
enumeration does, every ratio beside it does not.

**But cardinality is only safe on a corpus that is not growing, and that condition was doing the
work.** The `40 + 17` above reproduces because no object was created in the interval, not because a
count is durable. Three live counterexamples the same week: a member's run total moved `1232` to
`1374` between a peer's send and this read, the commit count on this file moved `165` to `199`, and
a canon figure of `78,023` seconds moved to `121,811`. What did reproduce, to the second and across
two independent instruments, was the **oldest** commit date on that same file -- because a minimum
over an append-only set cannot move when the appends land at the other end. So the durable property
is **invariance to appends**, not cardinality: an extremum at the frozen end survives, a saturated
proportion (`0 of N`, `N of N`) survives because growth cannot cross a boundary the data never
approaches, and every count and sum between them decays. **When a figure has to stay quotable, pick
the invariant one; when only a count will do, publish its instant.**

**That rule was induced from a sample with liveness pinned, and the sample could not have refuted
it.** All three counterexamples above are live corpora; a static corpus cannot produce a moving
count, so the evidence was selected on the very variable the rule is about. The correct statement is
that durability belongs to the **pair** -- statistic and corpus -- not to the statistic:
**quotability is a property of the subject, read off whether anything is writing to the end you
measured.** A count over a closed set is as quotable as any extremum; an extremum is only safe
because appends land away from it, and a corpus grafted with older history would move the minimum
this file calls invariant.

**But *unwritten* is not *closed*, and the distinction is where the correspondent's own six
counterexamples fail.** Six sibling files here hold counts of `2, 3, 3, 4, 4, 4`, offered as durable:

```
file                              count  first commit          last commit
canon-formatting                      4  2026-08-11T19:51:39Z  2026-08-12T05:31:08Z
tokens / agents / docs / skills / infra  4,4,3,3,2             2026-08-12T05:01:18Z   all five
```

Five of the six were last written by **one** commit, so six agreeing observations are one event seen
six times -- the two-witnesses-one-instrument failure at `n=6`. And `canon-formatting` is `1.4` days
old and went `0` to `4` in `9h39m`, so *stable for weeks* is false of the one file that is young.
Nothing closes any of these sets; they are open and quiet, which is the ambiguous case, not the
durable one. **Sort sets into closed, open-and-quiet, and open-and-written -- a quiet count is
evidence of nothing, because a figure that holds still is exactly the outcome that cannot say which
regime produced it.**

**Two channels are independent only if they are simultaneous.** Counting commits on this file, local
`git rev-list` returned `241` and hub enumeration returned `242`, and the gap was nearly published as
a paging defect in the hub's `Link` header. The extra commit landed **40 seconds into the command
that compared them**. Over a live corpus a cross-channel disagreement measures the elapsed time
between the reads before it measures either instrument, so read both sides inside one fetch or date
each separately -- and treat a difference of one on a fast-moving corpus as a clock reading until
something rules that out.

**A ratio between a frozen holder and a live head measures delay, not divergence.** Nine members
hold this file at six distinct revisions; the spread from the oldest holder to the hub was reported
as `37x` and measured `47x` thirty-five minutes later, because only one end is moving. Such a figure
cannot reproduce and cannot fail to grow, so it carries no information about the members at all.
**The ordinal survives** -- which holder is behind which -- because appends at the head cannot
reorder a frozen tail.

**And the repair for a withdrawn ratio is usually not a better ratio but the intensive quantity it
was standing in for.** Here that quantity exists and is exact: canon's own revision index. Every
delivered copy is a canon revision plus a fixed sync header, so subtracting the header turns a
nearest-match into an identification:

```
202 revisions   drops 0   adjacent ties 0   distinct sizes 202 of 202   -> strictly increasing
held  9834 - 80 = canon  9754 -> revision   7        held  12537 -> revision   8
held 23263 -> revision 16 (four members)             held  48840 -> revision  30
held 308014 -> revision 136                          unique header offset in 0..200: 80
```

So the fleet spans revisions `7` to `136` of `202`, and whoever clears the block inherits copies `66`
to `195` revisions apart. **A revision index does not move when the hub commits**, so it reproduces
at any instant, which is exactly what the `37x`/`47x` ratio lacked.

**Strict increase is what licenses the map, and no-drops alone does not establish it.** A
non-decreasing series can tie, and a tie makes size a set of revisions rather than one; the
correspondent who built this verified no-drops and treated the identification as established. Both
halves were needed, both hold here, and the header offset is independently confirmed by being the
**only** value in `0..200` that lands all five sizes on real revisions -- a control on the offset
itself rather than on a decoy input, which is the stronger form when the parameter is fitted from the
same data it explains.

**And that lag is stratified by ability to merge, not by CI health.** The two orderings agree on
every member but one, and that member decides it: the repository with the worst CI in the fleet,
failing `299` of `300` runs, holds the *second newest* copy, because its failures are refusals that
never block a merge. The three members holding the two oldest copies are the three whose checks
cannot pass at all. So delivery is not a queue draining at a uniform rate -- **the members least
able to receive a correction accumulate the most of them**, and nothing inside a member reports its
own tier. Whoever clears the blockage inherits six starting points rather than one, and a fix
validated against the hub has been validated against none of them.

**And the lag is exactly measurable, because distribution is verbatim.** A member was argued to hold
"a per-member rendering at a fraction of the size"; measured, every one of nine members holds a
**real hub revision plus a constant 80 bytes**, that being the provenance line prepended on
distribution. Nine of nine matched at `-80`, so the size difference is lag and nothing else. All
`202` hub revisions of this file also carry **distinct** byte sizes, which makes `member_size - 80`
a unique fingerprint of the source commit -- a member cannot date its own copy from inside, but the
hub can date every member's copy to the commit and the minute. **The right statistic for lag was
never a ratio against a moving head; it is the source revision date, which is frozen**, and it
confirms the merge-ability ordering directly: the three members whose checks cannot pass hold the
three oldest revisions. Record the fingerprint as a convenience and not a design -- distinctness
across 202 revisions is unenforced luck that decays as revisions accumulate, so stamping the source
revision into the provenance line is the durable form.

The mechanism sits one operand over from where it looks. Reproduced on identical data at one
instant, a `ConvertFrom-Json` pipeline counted 93 where offset-aware parsing and a commit listing
both counted 67. **But the diagnosis that followed — that the field is `Kind=Utc` and correct, and
the cutoff is the faulty operand — holds only on the runtime it was measured on, and this paragraph
did not name one.** A member on PowerShell 5.1 measured the field as a plain `String`; here on
7.6.4 Core it is a `DateTime`. Both reports were published in the general voice, described
incompatible behaviour, and could not be reconciled because the discriminating field was missing
from both. **A behaviour claim about a runtime is uninterpretable without the runtime version**,
for the same reason a delta is uninterpretable without its operands.

**So there is no portable operand order.** The comparison keys on the *left* operand's type, and
the field's type flips with the runtime, so the safe order on one runtime is the broken order on
the other. Measured here on identical data whose correct answer is 1 of 3, `field -gt 'ISO literal'`
returns 1 and `'ISO literal' -lt field` returns 0; on 5.1 the two swap. Advice of the form *put the
field on the left* is runtime-specific and inverts.

**And across the type boundary the relation is not antisymmetric, so it is not an order at all**:
an ISO string and a `[datetime]` can each report strictly greater than the other. Measured on both
runtimes from one machine, so this is a two-runtime result rather than a property of whichever type
the field happens to take -- it is a property of comparing across the boundary at all.

The prediction that accompanied it was retracted too broadly. `Sort-Object` over such a set was
expected to become input-order dependent; on **7.6.4** it does not, and that negative was published
here with no version stamp, eleven lines below the sentence saying a behaviour claim about a runtime
is uninterpretable without one. On **5.1.26100.8875** it *is* order dependent, and not subtly:

```
input order 1 -> first element  2026-08-12T06:18:00Z
input order 2 -> first element  08/12/2026 16:00:00
```

The comparer keys off the first element's type, so the input order selects the semantics for the
whole sort. **A retraction inherits the scope of the measurement that prompted it**, and this one
was issued in the general voice from a single runtime, inside a correction of exactly that error.

**On 7.x the deserialized `Kind` is a function of the producer's spelling, which no reader
controls.** `...:00Z` yields `Kind=Utc`; `...:00+00:00`, the same instant and equally legal, yields
`Kind=Local`, and the two compare unequal by the local offset.

**The claim recorded here that this cannot appear on 5.1 was wrong, and wrong in the worse
direction.** Measured on both runtimes, same inputs, one command:

```
                     5.1.26100.8875         7.6.4 Core
field type           String                 DateTime
Z -eq +00:00         False                  False
Z -gt +00:00         True                   True
mechanism            0x5A > 0x2B, lexical   ticks compared, Kind ignored
error                unbounded              exactly one local offset
```

**Same verdict, different mechanism, both wrong.** So a 5.1 reader running the reproduction gets the
predicted `False`, reports *confirmed*, and has confirmed a different defect. That is worse than the
fleet split predicted here, because a split announces itself and a false confirmation does not.
**A reproduction that checks only the verdict cannot detect that it reproduced a different bug** --
reproduce the mechanism, or at minimum the magnitude, which is where these two visibly diverge.

**And the discriminator proposed to settle it is subject to the same defect.** A member closed this
argument with *the discriminator is one line: `$row.created_at.GetType().FullName`* -- correct, and
it returns `System.String` on their 5.1 and `System.DateTime` on 7.6.4 Core here. Both readings are
right. Each end runs the identical line, gets an incompatible answer, and correctly concludes the
other's account is impossible. **A discriminator whose output is a function of the environment it
runs in relocates a dispute instead of settling it**, and it does so while looking decisive, because
a one-line type probe is the most checkable thing either party has put forward.

The same message contained a portable discriminator, offered only as an objection to a sign. The two
mechanisms differ in **reachability**, not merely in magnitude:

| runtime | field | mechanism | error | can return an empty set? |
| --- | --- | --- | --- | --- |
| 5.1 | `String` | lexicographic, left operand decides | unbounded, saturating | no |
| 7.6.4 | `DateTime` | ticks compared, `Kind` ignored | exactly one local offset | yes |

Under lexicographic comparison a one-sided lower bound admits everything, so it cannot produce
`NONE`. **An observed outcome that one mechanism cannot reach discriminates between them without
running anything on the far runtime**, which is precisely what the type probe cannot do. Prefer a
discriminator built from the symptom you already hold over one that requires the environment in
dispute -- the second is unavailable exactly when the disagreement is real.

**And `Kind` is not rendered, so printing both operands cannot explain their comparison.**
`ConvertFrom-Json` yields `Kind=Utc`; a `[datetime]` cast of the same `Z` literal yields
`Kind=Local`. The two name the identical instant and compare unequal by 420 minutes, because
comparison uses ticks and ignores `Kind`. Printed, they read `04:27:48` and `21:27:48`, with nothing
attached to either accounting for a 7-hour gap between two spellings of one moment.

Two members hit the halves of this in the same hour and neither joined them. One disclosed a
uniform 420-minute error across four rows, from `[datetime]` parsing a `Z` string as local; the
other characterised the `DateTime`-left cell as *shifted by one local offset*. 420 minutes **is**
that offset here.

This was recorded as *the join was unavailable to both, because each holds exactly one runtime*.
**That was false, and it is the most instructive error in this section.** Both runtimes were
installed on the same machine the entire time:

```
pwsh                                             7.6.4  Core
%SystemRoot%\System32\WindowsPowerShell\v1.0\    5.1.26100.8875  Desktop
```

Every disputed cell was then settled in one command against both, and all of the far runtime's
reported results reproduced exactly. **Nobody checked whether the split was real, because the split
was the frame of the argument rather than a claim inside it.** Each party's readings were consistent
with their own runtime, so the two-runtime hypothesis was confirmed by every observation and tested
by none. **A hypothesis that explains every observation is thereby never tested by any of them**,
and it accrues confidence for exactly as long as it goes unchallenged. So before accepting that a
disagreement is irreducible, measure the irreducibility: it is a claim like any other, and it is the
one claim in a dispute that neither party is assigned to check.

This is the standing-block finding one level up. There the least-audited sentence was the one not
under dispute; here it is the assumption the dispute is conducted inside. **Audit the frame, not
only the figures** -- two independent instances of it turned up in one night, in different repos,
by different routes.

**And on a shared ref store, measuring your own standing writes to your neighbours'.** A member
established that `refs/remotes` lives in the common directory rather than per worktree, then watched
`origin/main` move under them without issuing a command: a sibling worktree merged, fetched, and 27
seconds later the shared ref carried the sibling's value into their session. The same holds here --
`git-common-dir` is the main checkout's `.git`, five worktrees share it, and both
`refs/remotes/origin/main` and `packed-refs` live in it. So *measure before you claim* is itself a
mutation of every sibling's reference point.

Their conclusion -- **nothing fixes the writer except not fetching** -- does not survive, because
not fetching is the stale-cache defect recorded earlier in this file, so the two remedies exclude
each other. The sign is wrong too: a fetch only advances a remote-tracking ref toward the true
remote value, so a neighbour's fetch makes your reading **more** accurate and your earlier reading
**less** reproducible. Accuracy and reproducibility are the pair that trade here, not accuracy and
courtesy. The resolution is the one this file already reaches from two other directions: **stop
citing the ref and cite the object.** A resolved SHA is immune to every neighbour; a branch name is
a query whose answer depends on who runs it and when.

**And a remote-tracking ref is a cache that advances only on a local fetch, so a constant reading is
the expected output of both a stable world and a dead cache.** A correspondent chased the shared-ref
finding into their own repository, found six worktrees on one common directory, and then found their
`origin/main` had not moved for three days. Resolved against the remote with `git ls-remote` it was
correct -- and had never once been verified that way in the session. The zero-variance signature
this file already records for a stale delta series, arriving in a standing figure.

**The reason it stayed correct is the outage.** Their `main` had not moved because a billing block
was preventing every merge in the repository. Had CI been healthy the queued pull requests would
have landed, `main` would have advanced, and the cached reading would have gone stale exactly when
it began to matter. Two figures published side by side as independent -- the blocker and the diff --
are causally linked, and the link runs in the direction that **makes the instrument look reliable**.
So: **an outage can suppress the variation that would have exposed a weak instrument, and the
interval when a measurement is least trustworthy is the interval when it looks most stable.**
Reliability observed during a freeze is a property of the freeze.

**But the diagnostic used to find this has the same degeneracy as the symptom.** The evidence
offered was the ref's reflog -- 21 entries, last movement three days back, read as *frozen across my
own fetches, which found nothing to import*. Measured here, a fetch that finds nothing writes no
reflog entry at all:

```
reflog entries for refs/remotes/origin/main, before and after a no-op fetch   476 / 476   delta 0
```

The reflog records **writes, not fetches**, so it cannot distinguish *fetched, nothing new* from
*never fetched* -- which is exactly the ambiguity it was brought in to resolve. **A diagnostic for a
degenerate reading must not itself be degenerate over the same two states**, and reaching for the
history of the object under suspicion is the natural way to fail this.

The observable that does discriminate is `FETCH_HEAD`, and it carries a scope asymmetry worth
knowing:

```
.git/worktrees/<name>/FETCH_HEAD    per-worktree   mtime advances on every fetch, no-ops included
.git/refs/remotes/origin/main       shared         movable by any of the N worktrees
```

**The observable that proves you fetched is private to your worktree; the value it certifies is
shared.** So you can always establish your own freshness and can never establish that no neighbour
moved the ref underneath it -- which is why the remedy stays *cite the resolved object*, and why
`git ls-remote` is the only reading that answers the question without reference to either file.

Recorded against this repo: the first attempt read `FETCH_HEAD` from the **common** directory, where
one exists but belongs to the main checkout and was two days stale. It reported *did not advance*,
which was true of that file, false of the fetch, and one step from being published as a general
negative. Wrong field, wrong ref, wrong path -- **three ways to get an honest answer to a question
you did not ask**, and this was the third, hit within minutes of naming the first two.

**The family has a fourth member, and it is the worst of them: a field whose name denotes something
other than what it holds.** `userContentEdits.nodes[].diff` on the GitHub GraphQL API is not a diff.
Replicated on this repository's issue #326, independently of the correspondent who found it:

```
5 revisions   lengths 3906 / 3907 / 4590 / 4599 / 5978   live body 5978
hunk headers (^@@) present ?                     false on all five
newest node === current body ?                   true
oldest node is a strict PREFIX of its successor ? true
```

It carries the entire body at that revision. This is worse than a sibling path or a rendered
projection because **the field is non-null on every read, which presents as confirmation that it
works** -- when what needed testing was not whether it returns something but what the something is.
A name is a claim by the API author, and it is the one part of a response that no amount of
querying will check. Neither party looked, for the same reason and for two days.

**A control that validates one endpoint cannot exclude the failure it is aimed at.** The control
first offered here was *newest snapshot === current body*, which tests one node of forty-three and
is equally satisfied by *every node is a full body* and by *the newest is a full body and the older
ones are genuine diffs* -- the second being exactly the hypothesis at issue. Testing the oldest node
against its successor validates the far end and closes the gap: a real diff between two revisions
whose lengths differ by one character would be a few bytes, not a 3,906-byte strict prefix. **Put
the second control at the other end of the series, not beside the first.**

**And the retention consequence belongs in the secrets rule.** Content removed from an issue body
stays served. Measured across a correspondent's revision 13 -> 14:

```
lines lost ENTIRELY (occurrence count fell to zero)   1
recovered   <!-- transient probe, removed in the next write -->
absent from the live body and from every later revision; still returned by GraphQL
REST issue object exposes prior revisions ?  false
gh issue view                                shows the live body only
```

The recovered line was an HTML comment, so it was never visible in the rendered issue even while it
was live, and it is not visible now through any tool anyone actually uses. **A secret pasted into an
issue or comment and then edited out has not been withdrawn** -- editing is not redaction, the
standard tooling shows the sanitized version, and the only real remedy is deleting the object and
rotating the credential. Probe-artifact accounting that counts files on disk does not reach this:
an artifact written into a log body is retained permanently by a system nobody thinks of as storage.

**A presence test is degenerate over multiplicity, and this cost a correct reading.** Asking whether
each line still appears returned *0 removed* for all three shrink episodes in that log, including
the one that did remove a line. Counting occurrences separates the mechanisms:

```
rev  6 ->  7   -587 B    de-duplicated 1    lost entirely 0
rev 10 -> 11  -1156 B    de-duplicated 21   lost entirely 0
rev 13 -> 14    -53 B    de-duplicated 1    lost entirely 1
```

Two are pure duplicate collapse -- which positively confirms the double-write those episodes were
offered as evidence of, rather than inferring it from the byte delta -- and the third is a different
mechanism wearing the same sign. All three had been read as one phenomenon because a shrink in an
append-only log admits only one obvious explanation. `Contains` answers *at least once* and never
*how many*, so any test built on it is blind to precisely the duplicate writes an idempotence guard
exists to prevent.

**A guard verified only forward certifies its own tenure.** The idempotence guard in that log had
been evidenced by re-running it and observing `skip: already added`. That establishes it works now
and is silent on the era before it existed -- which is the era that caused it to be written, and
the era whose duplicate writes are still sitting in the artifact the guard protects. **Re-running a
fix proves the fix; only the history proves the scope of what it fixed.**

**`DateTimeOffset` remains the repair, and it is the operand-order-independent one**: cast from
either spelling it recovers identical `UtcTicks`, and it returns the correct count in both operand
orders. Keep the prescription and drop the diagnosis — the durable rule is **never let a comparison
span two types**, because two identically-wrong operands compare right while one right operand
against one wrong one compares wrong, which is why "fix the bad operand" keeps naming a different
operand each time it is asked.

**Consistency and currency are two questions wearing one word, and ancestry answers only the first.**
A local ref left behind by many commits is still an **ancestor** of the remote, so it passes every
check asking *is this consistent?* and fails only checks asking *is this current?* — meaning anything
reasoning from an ancestry test gets a clean result from a ref that is days old. Audited here rather
than assumed: every git comparison in this repository's tooling and workflows resolves the
remote-tracking ref explicitly, the CI checkouts fetch full history so the ref is created fresh at job
start, and a missing ref fails loudly instead of degrading. A null result, recorded because **an audit
that goes unmentioned is indistinguishable from one never run** — which is the same asymmetry as a
control that cannot fire.

**A remote-tracking ref is shared mutable state across sessions, so it can move with no local
command.** A member reported `origin/main` advancing between two adjacent tool calls having run no
fetch, and concluded the environment refreshes refs. The mechanism is narrower and checkable:
`refs/remotes` lives in `git-common-dir` and has **no per-worktree copy**, so in a repository with
several worktrees — five here, one ref store — a fetch by the main checkout or by any sibling
session updates `origin/main` for every one of them. The ref did not refresh itself; a peer moved
it. Every figure published as *measured at `origin/main` X* therefore names shared state, and the
interval between resolving the ref and reporting it is a window another session can write into.
Pin the SHA that was resolved and quote that, rather than the ref name, whenever the reader is
expected to reproduce the measurement.

**A quoted figure and an asserted one render identically, so correspondence is a poisoned source for
harvesting values.** A correction necessarily contains the value being refuted, sitting in the
corrector's message, in the corrector's voice. Here I read a tip out of a message that had quoted it
back **in the sentence declaring it stale**, and counted it against the sender as their own claim.
The sender caught it and named the mechanism better than I had: the population defect one level up —
the value was in their message, but they were not the party claiming it. This has real reach, because
every practice in this section that tallies figures across a conversation will read a refuted value
as freshly attested by whoever refuted it, and the refutation is what put it there. **Attribute a
figure to the message that first asserted it, not to the most recent message containing it**, and
when quoting a value in order to correct it, mark it as quoted — the reader cannot recover your voice
from the string.

**There are at least three roles and they flatten into one column.** The same correspondent, hit by
this a second time in two messages, supplied the taxonomy: a figure appears in a message as
**asserted** (the sender's own claim), as **quoted-as-wrong** (the value being corrected), or as
**cited-as-timeline** (a landmark in a sequence, owned by nobody). All three render identically once
tabulated, and the second and third are the *majority* of figures in any careful message — precision
about the record is what puts them there. The consequence is perverse in the same direction as
before: the more rigorously a correspondent reasons about values, the more values their messages
carry that are not theirs. **Store the role alongside the figure, or ingest only from the sender's
own status footer and never from their body** — the footer is the one place whose role is unambiguous
by position.

And the direction check applies to the *ownership* claim too. Here I reported a tip as one the sender
had been handed and was late in re-reading; measured, `64282149` is the squash commit of **their own**
merged pull request, produced by that merge and reported to me in the message I was replying to. The
provenance was exactly inverted. A figure's first appearance in a conversation is evidence about the
conversation, not about who produced it — and the repository holds the answer for anything that
originates in a merge.

**Correcting an output does not correct the procedure, and the procedure is what outlives the
correction.** A correspondent found an overcount in an issue of theirs, corrected the figure in
three places — title, an in-body banner, and a comment carrying the SHAs — and left standing, in the
same document, the instruction telling a future reader how to re-measure. That instruction described
the *wide* measurement that had produced the wrong number. So the artifact simultaneously warned
that 76 was wrong and told the reader how to regenerate 76, and nothing about it looked
contradictory from inside, because a **method** was being checked against a **figure** and the two
are never compared. When you correct a published number, search the same artifact for the recipe
that made it; a corrected output with an uncorrected procedure has a shorter half-life than no
correction at all, since the next reader derives the bad value themselves and finds it confirmed.

**Expect the durable artifact to be *fresher* than the message reporting on it.** The intuition runs
the other way — artifacts go stale, live prose is current — but a status footer is written from
memory while an artifact is edited on the occasion of a measurement. Verified here: a correspondent's
message reported a probe run with six jobs, and their own issue, updated more recently, named a
*different and later* run with eight; querying the API, the run their message named also had eight,
so the prose was wrong about both which run and how many jobs. The artifact was right on both counts.
Where a message and its artifact disagree, check which one was written while looking.

**Naming a revision does not certify the figures beside it.** A reader binds every number in a
message to the SHA that message names, so a coordinate measured at one revision and published
alongside another is trusted *because* the revision was cited. Naming the tip reads as rigour and
supplies the false confidence. Measure at the tip you name, or attach a revision to each figure
individually — and when reporting that something is absent, say which population you searched, since
*not in the revisions I checked* and *not in any revision* are written identically and differ by
everything.

**Nor do two figures from one measurement certify each other.** A parenthesis here published a pair
of coordinates taken in a single pass — a heading at `L649` and the next one at `L692`. The first is
exact at every revision where it resolves; the second is `L693`, wrong by one, measured by the same
instrument in the same sweep. Neither party checked it for two rounds, because confirming the first
figure reads as validating the *pass*, and a pass is the thing an instrument's output is trusted
wholesale for. **Verifying one output of a measurement verifies that measurement, not the others
beside it** — adjacency inside a single parenthesis is the tightest form of the authority-lending
above, since the two numbers do not merely sit together, they share a provenance that feels like a
warrant.

**And *did I say it* is a different audit from *is it true*, with the first one closing the file.**
Challenged on that coordinate, the author searched the session record to establish whether the figure
had been written, found the question settled, and stopped — never asking whether the number was
right. Provenance is the cheaper question and it arrives wearing the costume of diligence, because
searching a record feels like measuring. When a figure is disputed, re-derive the value; who said it
is a separate matter and answering it settles nothing about the world.

**And a branch name is not a revision at all.** A row labelled `main` in a column of SHAs reads as
one more coordinate; it is a query evaluated against whatever ref namespace the reader happens to
hold. Two sessions comparing a five-revision table agreed exactly on the four rows named by SHA and
came out at 887 against 2421 on the row named `main` — one reading a stale *local* branch from the
previous evening, one reading the tip at their measurement time, neither reading the tip that
existed when the comparison was made. A stale local ref resolves **silently**: no fetch, no warning,
nothing to distinguish it from a current one. So resolve any moving name to a SHA and publish the
SHA, and treat a mixed table of names and SHAs as a table whose rows are not comparable.

**Publish a hash of the bytes you measured, not only the name of the revision you believe they came
from.** This is the remedy the three preceding rules were circling, and it works because of a cost
asymmetry. **Naming a revision is free**: it requires no contact with the artifact, so it can be
written from memory, from a stale local ref, or from the tip the author believes they are on. It is
an assertion produced *beside* the measurement rather than *by* it, which is why nothing local
detects it being wrong, and why it makes matters worse than silence — it reads as rigour while
supplying confidence in figures the revision never certified. A content hash is derived from the
measurement input, so it cannot be recalled and cannot resolve against the wrong artifact; it fails
closed and loudly. Verified in both directions here: a correspondent published four figures with a
blob prefix, and every one reproduced exactly against the named blob — `208967` bytes, `2887` LF,
`2888` split-lines, `db6335a8` — which is the first exchange in a long thread where agreement was
established by construction rather than by both parties being careful.

**But the hash must come from the buffer that produced the figures, not from a second read of the
path.** The cost argument fails the moment the hash is obtained separately, because touching the
artifact *again* is cheap and yields a fresh certificate for stale numbers. Demonstrated: figures
taken from a blob at one revision (`LF=2887`) and paired with `git hash-object` of the working-tree
path (`013982ed`, whose actual `LF` is `2862`) produce a published pair that is internally false and
in which every component individually resolves. That artifact is strictly more dangerous than a bare
SHA, since a hash looks *derived* and a name only looks *asserted*. Hash the buffer you counted.

**And resolving a hash is not checking it.** A reader who confirms the hash denotes a real object
has confirmed the artifact exists, not that it produced the numbers standing next to it. The check
is recomputation of the figures from the hashed bytes, and nothing about a resolvable hash prompts
it. Note what the hash still cannot do: it keys on bytes, so it discriminates *which artifact* and
is blind to *which convention* was applied to them — the mirror of a residual, which discriminates
convention and is invariant to the file. Neither closes the gap and their union does, so publish
both.

**And the region you may not edit is the region nobody reads.** A member-side conformance check
asserts against the lockfile, so it catches a member drifting from what the engine produced and
silently certifies a rendering the engine got wrong — it is a conformance instrument, and being
correct about conformance buys nothing against a malformed render. The residual instrument for a bad
rendering is a human reading the file. But managed regions carry `do not edit here`, which is
exactly the instruction that removes any reason to read them closely: **the rule protecting the
block from members also retires its last reader.**

The sync PR is the one moment those bytes are visible to a human, and the review question defaults
to *did this come from canon?* rather than *is this well-formed?* — conformance again, one level up.
So when a sync PR touches a managed region, read the rendered block itself, and report a malformed
render upstream rather than repairing it locally; a member cannot validate a rendering without
reimplementing the renderer, which is the vendored-copy problem returning.

**And a member that reimplements it holds a snapshot, so the lock has to publish the derivation and
not only the result.** A member vendored the comment-syntax table from `provenance.mjs` while that
file was still the losing half of a two-table split, and the backbone then unified the pair
upstream — so the copy preserved the defect *after* the original was repaired, missing five hash
basenames and three hash extensions. The lock records what to expect and never how the expectation
is computed, and the second is where drift lives: from the member side *your classifier is stale*
and *your file is wrong* arrive as the same message, `canonical provenance marker is missing`, and
only the first is actionable by the member — the second sends someone to inspect a correct file.
**Where a consumer can fail for two reasons and only one is theirs to fix, the protocol must carry
enough to say which.** The engine emits `classifierSha256` in each lockfile it writes, digesting the
family assignment rather than the type list, because moving a type between families drifts a
consumer exactly as much as dropping it and a membership digest is blind to that. The general rule:
**anything a member must reproduce to check canon's output is a versioned contract whether or not
it is published as one.**

**That paragraph read "now emits" for its first day, and no lockfile in the fleet contained the
field.** Measured across all eleven members: `present 0 of 11`. `serializeLock` writes
it unconditionally, so any lock written after the feature would carry it — the feature landed at
`2026-08-12T17:22:14Z` and the most recent distribution run in the entire history is
`2026-08-12T14:27:19Z`, two hours and fifty-five minutes earlier. The field had never been emitted
once, anywhere.

So **a feature can merge, pass its whole suite, and have zero delivered instances, with nothing in
the suite able to see the difference.** The tests exercise the writer directly and are right to;
they establish that the field is *produced*. Receipt is a second axis, and no test in a hub
repository can cover it, because the artifact under test is written into someone else's repository
by a workflow that may not have run. Where a change's value is realised by distribution, green is a
statement about the generator and carries no information about the population.

**The verb tense is the tell, and it is worth policing directly.** *Now emits* is true of the code
and false of every artifact a member holds, and in a distributed document the present tense is
ambiguous between *implemented* and *in effect* — while canon is read almost exclusively by parties
who can observe only the second. Write the delivery state explicitly, in the same sentence as the
capability: implemented at a revision, delivered to N of M, first carried by a named run. A
capability claim with no population attached will be read as a population claim by everyone
downstream of it.

**And the consumer-side constraint falls out of the same fact.** A check written against
`classifierSha256` today skips on 100% of real inputs, so it renders identically to a passing
check — the known-positive rule arriving as a design constraint rather than as a bug report. Any
implementation must carry a **fixture** digest so the comparison path executes regardless of what
the live lock contains, and must fail when the fixture path did not run. A field that is absent
everywhere is the strongest possible case for it, because there is no input on which the check can
demonstrate that it works.

**A digest of a rule is only possible if the rule is closed.** A member reproducing this table
classified unrecognised types by falling back to an HTML marker — an open-world "everything else",
which cannot be digested at all: there is no set to hash. So publishing a digest is a constraint on
the rule's *shape*, not merely a record of its contents, and adopting one forces an implicit
fallback closed. The two classifiers also differ in **failure mode** rather than in strictness:
`commentSyntaxFor` throws on an unrecognised type, while a fallback is confidently wrong and reaches
the user as the synced content being broken. Between two implementations that disagree, ask which
one refuses before asking which one is right.

**And an absence the lock cannot explain is often resolved one layer up, in the dispatch log.** The
lock cannot date a verification, per the measurement recorded earlier in this file — but the
workflow run history can, fleet-wide, in one call. Eleven absent fields support the conclusion by
induction over members; a single run listing reaches it from one fact *and* supplies the date, which
the member-side evidence never could. The hub's incapacity is therefore narrower than stated above:
it cannot date a **per-member** verification, but it can bound delivery for the whole fleet, and a
bound is often the entire answer.

**One caution from getting this wrong first.** The measurement above was undertaken expecting to
*refute* the member: the writer is unconditional, the newest lock was written today, so the field
had to be present, so the deployed engine must differ from the committed one — a serious finding,
nearly reported. It dissolved on one lookup, because `14:27Z` and `17:22Z` are both "today".
**Comparing at day resolution manufactured a contradiction that timestamp resolution dissolves**,
and the manufactured version was much the more alarming of the two. A contradiction derived from two
facts of different precision is a resolution mismatch until shown otherwise; re-date both operands
at the same granularity — `git log -G` for when a symbol entered, the run list for when a job ran —
before drawing any conclusion from their order.

Note where the drift was found and where it was not. That member's suite was green, and could not
have been otherwise: its lock held 49 `.md` and one `.toml`, so every misclassified type was one it
did not yet hold. **A latent drift is bounded by the consumer's current population, which is the
one corpus guaranteed not to exercise it** — the defect is invisible precisely until canon adds a
target of the type in question, so the population that would prove the tables differ is the
population that does not exist yet. It surfaced by reading the other party's current source instead
of a local record of it, which is the same move that settles a disputed attribution.

**A remedy handed across the boundary must be executable with the artifacts the recipient holds.**
A member was told to enumerate the population from canon's manifest; the manifest lives in the
backbone, and the member has exactly two local artifacts — its own tree and
`.studio-sync.lock.json`. The diagnosis was right and the instruction was not runnable, which is a
distinct failure from being wrong: it cannot be refuted by trying it, only by noticing the
prerequisite is missing. The recipient implemented the nearest executable thing and **said so**,
which is the behaviour to copy — substituting silently would have left both sides believing a remedy
had been applied that never could have been. Before prescribing across the boundary, name the
artifact the remedy reads and confirm the recipient has it; when receiving one that is not runnable,
report the substitution rather than the result.

**A remedy can be correct when written and made wrong by a correct change in another repository.**
A member's guard carried prose telling a maintainer to keep two hardcoded tables in step, and named
canon's fallback as HTML. Both were true when written. Canon then unified the write path onto one
classifier and replaced the fallback with a throw, so at HEAD neither named file holds a table and
there is no fallback to describe. The verdict the guard computes stayed correct throughout — only
its instructions rotted, and **following them literally would have reconstructed the duplication the
unification had just removed.** A stale remedy is worse than a stale fact because it is addressed to
someone about to act.

Note which defences were available and were not: canon's change was complete within canon, its tests
pass, and the member's guard still exits correctly, so no run anywhere goes red. Code got a throw for
exactly this — an unknown type now fails loudly — but **prose has no throw**, and a comment
describing another repository's internals has no import to break. That is the same cross-repository
seam recorded above, pointed at documentation, where the compile-time remedy is unavailable by
construction. So when you unify or remove a mechanism, grep the fleet for prose that *instructs*
against the old shape, not just for code that calls it — and when a member's comment describes
canon's internals, prefer a citation to a restatement, since a citation can dangle visibly while a
restatement decays silently into confident misdirection.

### A correct verdict does not make the remedy correct

A guard that fails closed on the right input can still do harm, because the *diagnostic* is a
separate claim from the *verdict* and is usually the part that was never exercised. A member's
text-classification guard correctly flagged a staged PNG as binary and exited 1 — and every sentence
after the file list was written for a different cause, instructing the reader to rewrite the file
with LF terminators, which destroys a PNG. The verdict had been tested; the remedy had not.

Two things follow. **A condition with more than one cause needs the diagnostic to route on the
discriminator, not on the condition** — here, presence of NUL separates ordinary binary from
CR-corrupted text, and both branches can still exit 1, so nothing about the fail-closed property is
given up. And **failing closed buys the reader's attention without guaranteeing what you spend it
on**: the check has just stopped their build, so they have maximal trust and minimal context, which
makes a wrong remedy behind a correct verdict *more* dangerous than one behind a wrong verdict —
nothing downstream contradicts it. Test what a check *says* on each cause, not only which way it
exits.

### The frame of a coverage claim is part of the claim

A mutation that survives tells you nothing until you say *what was watching*. This repo's CI runs three
gates — the sync suite, the principles suite, and `sync/index.mjs --dry-run` — and every survivor
verdict recorded here had been measured against the first one alone and written down unqualified.

The failure this guards against is not hypothetical and it runs in both directions. A peer session
scored a survivor, filed an issue on it, and then killed the same mutant against the *unmodified*
tree: the owner was a test they had not thought to look in, one that reached the same code by a
different route. Attribution drawn from an incomplete population invents gaps as readily as it hides
them, and the invented gap is the one that looks like a finding and gets published.

So state the frame, then measure whether it costs anything. Here it did not: four mutations to
`sync/lib` run against only the other two gates produced 0 observations in 8, and the two included as
**positive controls** — mutations the sync suite kills outright — were equally invisible. That is what
makes it a result rather than a shrug, because it separates "these mutants are subtle" from "these
gates do not look here". Without a control drawn from known-owned code, a silent gate and a blind gate
produce identical output.

The rule is not "run every gate". It is that a coverage claim inherits the boundary of its instrument,
and the boundary is harmless only once someone has checked what falls outside it.

### A probe that produced a filed claim is evidence, not scratch

Deleting probes is good hygiene until one of them is the only record of how a published number was
obtained. A peer destroyed the harness behind an issue they had filed, on exactly that hygiene rule,
and when a later run contradicted the filing they could not establish what the first run had applied.
Neither discipline was wrong on its own terms; they were simply in conflict, and the conflict only
surfaced at the moment the artifact was needed.

Retention class is therefore set by whether the verdict left the session — into an issue, a PR body, or
a message to another repository — and not by tidiness. With one refinement that decides whether
deletion costs anything at all: **a probe is safely destructible only when its published description
determines the mutation uniquely.** "Relaxed `>` to `>=`" and "reduced the line to a bare
`${item.targetPath}`" reconstruct exactly, so those harnesses were a convenience. "The basis was forced
degraded" does not reconstruct, and deleting that harness destroys the claim's only support while
leaving the claim standing.

## Commit Messages

```text
type(scope): description (#N)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## PR Body

```markdown
## Summary

Brief description.

## Changes

- Bullet list.

## Issues

Closes #N

## Testing

- [ ] Repo validation command(s) run
```
