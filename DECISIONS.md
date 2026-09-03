# Decisions

Everything here is argued at length in [`OBSERVATIONS.md`](OBSERVATIONS.md), written
before I wrote any code. This is the short version.

## What I built

A rule pipeline. Every rule in the spec is one pure function that takes a context and
returns reason codes; a registry lists them. `checkEligibility` resolves the opening once,
builds a per-volunteer context once, runs every rule, unions the codes, then derives the
status separately. `checkOpportunity` reuses that one context across every opening.

**I chose this shape because rules change.** Not "might" — the spec I was handed already
has two rules that need renegotiating, and eligibility is exactly what an operations team
asks to adjust every few months. So I optimised for the cost of the *next* change:

- **Adding a rule** is a new file and one line in the registry. If we're told nobody may
  take more than three shifts a week, that's a `weeklyLimitRule`, a new reason code, one
  registry entry. Nothing existing is touched.
- **Removing one** is deleting that line.
- **Changing one** stays inside its own file. The travel-time buffer I flag below would
  touch `schedule.ts` and its test, nothing else.
- **Rules can't interfere.** They're pure functions over a read-only context, so reasons
  accumulate in a set — "return every reason that applies" falls out rather than being
  something I have to maintain.

Two things are deliberately not rules. Capacity is split into an assessment (feeds the
status) and a rule (feeds the reasons), because `WAITLIST` is an outcome, not a reason. The
group restriction is a gate that short-circuits everything, for the reason below.

I considered a data-driven engine — rules as configuration, per organization. That's where
this goes if eligibility becomes customer-configurable. For four rules it's more machinery
than problem, and it would have hidden the contradictions rather than exposed them.

**A report, not a UI.** The spec rules out a UI, and I agree, so `--report` prints one
volunteer's whole catalog as text rather than opening a terminal app. The reasoning is that
a UI's value is invisible in what you actually read — a zip, a diff, a repo. Text pastes
into this document, pipes through `grep`, and gets asserted on in tests. `src/report.ts`
builds the data and `src/render.ts` draws it, so the presentation is testable with no
terminal; a test checks row by row that the report agrees with `checkEligibility` for every
volunteer, because a second implementation of the rules hiding in the display layer is
exactly the failure worth guarding against. `--staff` exists because one flag makes the
hardest decision in the spec visible instead of merely argued.

## Problems I found in the spec

**`DOES_NOT_HAVE_ALL` contradicts its own worked example.** The table says a volunteer
passes when they don't hold *all* the listed qualifications. Fern holds a lifting
restriction and isn't under 18 — so by the table she passes, and the spec then says she's
blocked. I traced her through every other rule to confirm nothing else decides it. No
supplied case covers it.

I implemented the exclusion reading. The errors aren't equally bad: read it permissively
and someone with a lifting restriction loads freight; read it restrictively and a volunteer
sees a code and calls their coordinator. One injures a person. The literal reading also
makes the rule near-useless — it only excludes volunteers holding *every* disqualifier.
**I'd rename it `DOES_NOT_HAVE_ANY`;** the name is where the error came from.

**Rule 5 contradicts the spec's headline promise.** The spec says in bold that a volunteer
should always see why, then requires a silent block for group restrictions — and defines a
`GROUP_RESTRICTED` code it makes impossible to emit. Worse: if the group check stays silent
while other checks report theirs, a volunteer fixes what they were told and is *still*
blocked with nothing new. That's the spec's own worst case, reached by following the spec.
So the gate short-circuits.

Returning *before any rule runs*, rather than computing reasons and stripping the sensitive
one, is the point: the guarantee is structural, not something a future rule can forget. But
that leaves a coordinator unable to explain the refusal either, so the checker takes an
**audience**. `VOLUNTEER` is the default and the spec's contract; `STAFF` is the same
evaluation with the withheld reason kept, and is the only path that ever emits
`GROUP_RESTRICTED`. `npm run check -- --report --staff vol-005` shows both against one
volunteer.

**The real fix is still upstream** — a restricted opening shouldn't appear in browse at all.
I'd also push back on the framing: "this opportunity is limited to specific groups"
discloses a property of the opportunity, not anyone's membership. The spec treats those as
one thing. If we can say the first, the volunteer gets an actionable next step. That's a
product call, so I flagged it rather than deciding it.

**Timestamps are timezone-naive across two timezones.** Shifts carry no offset but
opportunities span Indianapolis and Denver. We will block volunteers from shifts they could
work and clear them for shifts that collide — by up to a working day, with a
plausible-looking answer every time. Documented, not fixed: it needs a data-model change.

**The check can't be the thing that enforces the rule.** The spec asks "can this volunteer
sign up," which hides two questions: *would they be allowed to* — a browse page, which a
pure function can answer — and *may they right now, to the exclusion of everyone else
asking*, which nothing read-only can. Three of four places taken, two people both told
`ELIGIBLE`, both press the button, opening holds five. On a warehouse dock `maxVolunteers`
is a staffing ratio, so that one is a safety failure nobody notices until the day.

Schedule conflicts are harder still: the invariant spans two openings, so locking the one
being signed up for doesn't help. And the check runs *once* while everything under it keeps
moving — a lifting restriction added on Tuesday doesn't take anyone off Saturday's dock
shift, because nothing asks again. Same failure as `DOES_NOT_HAVE_ALL`, by a route that
fixing `DOES_NOT_HAVE_ALL` doesn't close.

Not fixable here; there's no store and no write path to fix it in. But the spec should say
whether this function is advisory or authoritative, and if nothing enforces capacity at
write time that is a bigger problem than either contradiction above. `OBSERVATIONS.md` §5
has the rest, including a waitlist with no ordering field at all.

**The supplied cases don't reach the disputed rules.** They never exercise
`DISALLOWED_QUALIFICATION`, `GROUP_RESTRICTED`, or `WAITLIST_FULL`. Passing all twelve
proves little about what's actually in dispute, so my tests target the gaps.

## Assumptions I made

All in `src/policy.ts` or commented against the section that argues for them: blocking
reasons beat capacity; shifts that touch don't conflict; a shift doesn't conflict with
itself; a waitlist place counts as signed up; a cancelled shift blocks nothing; a signature
newer than current is acceptable; an empty qualification list passes; unknown IDs throw.

The two I'd most want answered: should someone blocked only by an unsigned waiver still
learn a waitlist place exists? And is `rule-youth-1`'s empty list intentional?

## What I deliberately did not build

A travel-time buffer (needs a policy answer — how long, per what). A past-shift rule
(there's no reason code, and inventing one is inventing product behaviour). Per-qualification
detail in the reasons — `MISSING_QUALIFICATION` doesn't say which, which limits the spec's
own goal, but widening the contract unilaterally seemed worse than flagging it. The detail
is carried internally already.

## What I'd do with three more hours

1. Timezone-correct conflicts — the only live correctness defect here.
2. Say *which* qualification is missing. Cheapest move toward the stated goal.
3. Filter restricted openings out of browse, which removes the need for the silent block.
4. Property-based tests on the interval logic.

Bigger than three hours, and the first thing I'd raise in planning: making the write path
authoritative (`OBSERVATIONS.md` §5). The rules are pure and do no I/O precisely so they can
be re-run inside the write transaction rather than reimplemented beside it.

## How I used AI

I used Claude Code throughout and directed it rather than accepted from it.

The most useful thing I did was make it read the fixtures as *data* before writing code —
tracing Fern through every rule, enumerating overlapping shift pairs, intersecting group
membership against waiver signatures, diffing the reason codes in `cases.json` against the
spec's table. That's how `DOES_NOT_HAVE_ALL` went from "these paragraphs feel inconsistent"
to a named volunteer, a named opening, and proof the tests can't catch it. I also had it
write the observations and a full plan before any code, so the contradictions were settled
on paper rather than patched over mid-implementation.

What it got wrong that I caught: one test would have passed for the wrong reason — it
checked that a waitlisted signup doesn't block, but both openings sat on the same shift, so
the self-conflict guard would have returned empty regardless. And a CLI calling
`process.exit()` would have truncated piped output intermittently. Both surfaced by
reviewing the plan against the spec before executing it — the step I'd skip last.

The judgment calls are mine. It argued them well once I'd said what mattered, but it was
equally willing to argue the other way.
