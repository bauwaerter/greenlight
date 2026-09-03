# Decisions

Each point below is argued in full in [`OBSERVATIONS.md`](OBSERVATIONS.md), written before
any code; section numbers point at it. This is the summary.

## What I built

A rule pipeline. Each rule in the spec is one pure function taking a context and returning
reason codes; a registry lists them. `checkEligibility` resolves the opening once, builds a
per-volunteer context once, runs every rule, unions the codes, then derives the status
separately. `checkOpportunity` reuses that context across every opening.

**I chose this shape because rules change** — the spec already ships two that need
renegotiating. Adding a rule is a new file and a registry line; removing one deletes that
line. Rules are pure over a read-only context, so reasons accumulate in a set and "return
every reason that applies" falls out rather than being something I maintain. I rejected a
configuration-driven engine: for four rules that is more machinery than problem.

**The tests are checked, not assumed.** A count proves nothing, so I injected twelve
deliberate bugs — off-by-ones on both capacity boundaries, an inverted `HAS_ANY`, the
exclusion semantics flipped, the self-conflict guard removed, the group reason leaking to a
volunteer. All twelve failed a test. The supplied cases never exercise
`DISALLOWED_QUALIFICATION`, `GROUP_RESTRICTED` or `WAITLIST_FULL` — the disputed rules — so
mine target those gaps.

## Problems I found in the spec

**`DOES_NOT_HAVE_ALL` contradicts its own worked example** (§1.1). By the rule table Fern
passes; the spec then says she is blocked. I traced her through every other rule to confirm
nothing else decides it, and no supplied case covers it. I implemented the exclusion
reading: read permissively and someone with a lifting restriction loads freight; read
restrictively and a volunteer sees a code and calls their coordinator. I would rename it
`DOES_NOT_HAVE_ANY`.

**Rule 5 contradicts the spec's headline promise** (§1.2) — a silent block, plus a
`GROUP_RESTRICTED` code it makes impossible to emit. And a volunteer told only the *other*
reasons fixes them and is still blocked — the spec's own worst case, reached by following
it. So the gate returns before any rule runs, making the guarantee structural rather than a
redaction step someone must remember, and `--staff` gives a coordinator the withheld reason.
The real fix is upstream: a restricted opening should not reach browse at all.

**Timestamps are timezone-naive across two timezones** (§3.1). Indianapolis and Denver, no
offsets. We will block volunteers from shifts they could work and clear them for shifts that
collide, with a plausible-looking answer every time. Not fixed: it needs a data-model change
rather than a change to this function.

**The check cannot be what enforces the rule** (§5). "Can this volunteer sign up" hides two
*would they be allowed to*, which a pure function answers, and *may they right now, to the
exclusion of everyone else asking*, which nothing read-only does. Two volunteers both told
`ELIGIBLE` for the last place both take it, and on a dock `maxVolunteers` is a staffing
ratio. Same when a coordinator edits an opportunity people are already on. Re-running the
check over existing signups would revoke everybody — they are all `ALREADY_SIGNED_UP`.

## Assumptions I made

Eight, all in `src/policy.ts` and each argued in §2: blocking reasons beat capacity; shifts
that touch do not conflict; a shift does not conflict with itself; a waitlist place counts
as signed up; a cancelled shift blocks nothing; a newer signature is acceptable; an empty
qualification list passes; unknown IDs throw.

## What I deliberately did not build

A terminal UI: the spec rules one out and I agree, so `--report` prints a volunteer's whole
catalog as text instead — which pastes into this document and gets asserted on in tests. A
travel-time buffer, which needs a policy answer I do not have. A past-shift rule: there is
no reason code for it, and inventing one is inventing product behaviour. Per-qualification
detail in the reasons — it limits the spec's own goal, but widening the contract
unilaterally seemed worse than flagging it.

And robustness the fixture does not need: the CLI ignores unknown flags, and the fixture
load is an unchecked cast. Both are real and cheap, and both defend against inputs this
exercise does not have — as would CI, a linter and a coverage gate.

## What I'd do with three more hours

1. Timezone-correct conflict detection — the only live correctness defect here.
2. Say *which* qualification is missing. Cheapest move toward the spec's stated goal.
3. Filter restricted openings out of browse, removing the need for the silent block.
4. Property-based tests on the interval logic.

Bigger than three hours, and the first thing I would raise in planning: making the write
path authoritative (§5).

## How I used AI

I used Claude Code throughout and directed it rather than accepted from it.

The most useful thing I did was make it read the fixtures as *data* before any code —
tracing Fern through every rule, enumerating overlapping shift pairs, diffing `cases.json`
against the spec's reason table. That is how `DOES_NOT_HAVE_ALL` went from "these paragraphs
feel inconsistent" to a named volunteer and proof the supplied tests cannot catch it. I also
had it write the observations and a plan before any code, so the contradictions were settled
on paper rather than mid-implementation.

What it got wrong that I caught: a test that passed for the wrong reason, because both
openings sat on the same shift and the self-conflict guard made it pass regardless; and a
CLI calling `process.exit()`, which would have truncated piped output.

The judgment calls are mine. It argued them well once I had said what mattered, but was
equally willing to argue the other way.
