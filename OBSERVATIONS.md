# Observations on SPEC.md

A record of what I found reading `SPEC.md` and `fixtures/` before writing any code.
Findings are ordered by how much they change what gets built. Each one states the
problem, what it costs if we guess wrong, how I intend to resolve it, and what I would
change about the spec itself.

Sections 1 to 4 are about the function the spec asks for. Section 5 is about what that
function cannot do on its own, and is the part I would want on a backlog rather than
resolved in this exercise.

Every claim about the fixture data in this document was checked against
`fixtures/fixtures.json` rather than read off the prose. Where I say "no case covers
this," I mean I enumerated `fixtures/cases.json` and confirmed it.

---

## 1. Contradictions

These are places where the spec disagrees with itself. They cannot be resolved by
reading more carefully — a decision has to be made.

### 1.1 `DOES_NOT_HAVE_ALL` contradicts its own worked example

**The problem.** The rule table defines the pass condition as "they do not hold all of
the listed qualifications." The Warehouse Sort and Load opportunity carries a
`DOES_NOT_HAVE_ALL` rule listing *Under 18* and *Lifting Restriction On File*. Fern
Okonjo (`vol-006`) holds the lifting restriction and is not under 18. She therefore does
**not** hold all of the listed qualifications, so by the table she **passes** the rule.
The spec then states she is blocked with `DISALLOWED_QUALIFICATION`.

Both readings cannot be true. I traced Fern through every other rule for
`open-warehouse-mon-loader` to confirm nothing else decides it:

| Check | Result |
| --- | --- |
| Shift published and active | yes |
| Opening active | yes |
| Capacity | 0 confirmed of 6 |
| `HAS_ANY` [forklift, driver's license] | passes — she holds a driver's license |
| Required waiver | none for this opportunity |
| Group restriction | none for this opportunity |
| Schedule conflict | her only confirmed signup is Tue 11:00–14:00; this shift is Mon 11:00–15:00 |

So the literal table returns `ELIGIBLE` and the worked example returns `BLOCKED`, and the
disagreement is decisive rather than academic. `fixtures/cases.json` contains no case for
Fern on this opening, and `DISALLOWED_QUALIFICATION` is one of only three reason codes the
fixture cases never exercise. The tests will not catch a wrong choice here.

**What it costs to get wrong.** The two errors are not equally bad. If we implement the
literal reading and the intent was exclusion, a volunteer with a lifting restriction, or
a minor, gets cleared to load freight — someone gets hurt and the organization carries the
liability. If we implement exclusion and the intent was literal, a volunteer is wrongly
told they hold a disqualifying credential, sees a reason code, and can call the
coordinator to sort it out. One failure injures a person; the other inconveniences one.

There is also a design argument: under the literal reading the rule is close to useless.
It only excludes volunteers holding *every* listed disqualifier — a volunteer would have
to be both under 18 *and* have a lifting restriction on file to be blocked. Nobody writes
a safety rule that way.

**How I intend to resolve it.** Implement it as an exclusion list: the volunteer fails if
they hold **any** of the listed qualifications. This follows the worked example and the
evident safety intent over the literal table text. The behaviour will sit behind a single
configuration value so it can be flipped in one line if I have read the intent backwards.

**What I would change about the spec.** Rename the rule type to `DOES_NOT_HAVE_ANY` and
restate the pass condition as "they hold none of the listed qualifications." The current
name is the source of the error — someone wrote the name from the shape of the list rather
than from the behaviour.

### 1.2 Rule 5 contradicts the spec's headline promise

**The problem.** The spec states in bold that a volunteer should *always* be able to see
why they could not sign up, and calls telling someone "you can't sign up" with no
explanation "the worst possible outcome for us." Rule 5 then requires exactly that: a
volunteer outside a restricted group gets `BLOCKED` with an empty `reasons` list.

Compounding it, the reason code table defines `GROUP_RESTRICTED` — a code that rule 5, read
as written, makes it impossible to ever emit. Either the rule is wrong or the code should
not be in the table.

**What it costs to get wrong.** There is a worse failure hiding underneath. If the group
check returns no reason but the other checks still report theirs, a volunteer sees
"missing qualification," goes and earns the certification, comes back, and is still
blocked with no new information. That is the spec's own worst-case outcome, reached by
following the spec. It also wastes the volunteer's time and the coordinator's, and it is
the kind of thing that generates a support ticket nobody can answer without disclosing the
confidential thing.

**How I resolved it.** The group restriction is a visibility gate that runs first and
short-circuits: if the volunteer is not in a listed group, return `BLOCKED` with empty
reasons and evaluate nothing else. This honours rule 5 literally and avoids the
partial-information trap, at the cost of the volunteer learning nothing — which is what
rule 5 asks for.

Returning *before any rule runs*, rather than computing the reasons and stripping the
sensitive one, is deliberate. It makes the guarantee structural: there is no populated
reason set in scope on the volunteer path for a future rule to leak through. A redaction
step would need to be remembered every time someone adds a rule.

That leaves the coordinator with the same problem the volunteer has, so the checker takes
an **audience**. `VOLUNTEER` is the default and the contract SPEC.md specifies. `STAFF` is
the same evaluation with the withheld reason kept, for someone who has to explain the
refusal — and it is the only path on which `GROUP_RESTRICTED` is ever emitted, which is how
a code the spec defines but forbids finally has a use. `npm run check -- --report --staff
vol-005` shows the difference against the same volunteer.

**What I would change about the spec.** The audience split is a mitigation, not the fix.
The real fix is upstream of this function: a restricted opening should never be shown to
an ineligible volunteer at all, so the browse page filters it out and the question is
never asked. I would also press on the confidentiality claim: emitting `GROUP_RESTRICTED`
discloses that *the opportunity is restricted*, which is a property of the opportunity,
not that any particular volunteer is or is not in any particular group. Those are
different disclosures and the spec conflates them. If the product is willing to say "this
opportunity is limited to specific groups — contact your coordinator," the volunteer gets
an actionable next step and no membership is revealed. That is a product decision, not an
engineering one, which is why I am flagging it rather than deciding it.

---

## 2. Underspecified

The spec does not say enough here. I can pick a defensible answer, but each is a guess
and each changes observable behaviour.

### 2.1 How `status` is derived when several outcomes apply

`WAITLIST` is a capacity outcome. `BLOCKED` covers everything else. The spec never says
what to return when the waitlist has room *and* the volunteer is missing a qualification.

**Assumption:** any blocking reason wins. Status is `BLOCKED` if the reasons list is
non-empty or the group gate fired, otherwise `WAITLIST` if the opening is full with
waitlist room, otherwise `ELIGIBLE`. Offering someone a waitlist place they are not
qualified to take would be a false promise.

**Would have asked:** should a volunteer who is only blocked by something recoverable
(an unsigned waiver) still see that a waitlist place exists, so they know it is worth
signing the waiver quickly?

### 2.2 A volunteer's own signup counted as a conflict with itself

A volunteer confirmed on the opening being checked is, by definition, confirmed on a shift
that overlaps the shift being checked — itself. Naive conflict detection emits a spurious
`SCHEDULE_CONFLICT` alongside `ALREADY_SIGNED_UP`.

**Assumption:** exclude the opening under examination from conflict detection. Only one
fixture case touches `ALREADY_SIGNED_UP` (`vol-002` on `open-meals-mon-am-server`) and it
expects that code alone, which supports this reading without proving it.

### 2.3 What counts as an overlap

`shift-meals-mon-am` ends at 12:00 and `shift-meals-mon-pm` starts at 12:00. The fixtures
contain that touching pair deliberately.

**Assumption:** treat shifts as half-open intervals — they overlap when
`startA < endB && startB < endA`. Shifts that merely touch do not conflict, so a volunteer
can work a morning and an afternoon block back to back. Treating them as closed intervals
would block the single most common real-world pattern in the data.

### 2.4 Whether a waitlisted signup counts as `ALREADY_SIGNED_UP`

Rule 2 says "a volunteer already signed up for this opening gets `ALREADY_SIGNED_UP`" but
signups have two states and rule 6 explicitly says only confirmed signups count for
conflicts. It says nothing about this case. `vol-003` is `WAITLISTED` on
`open-meals-tue-server` and no case checks them against it.

**Assumption:** both states count. A volunteer holding a waitlist place should not be able
to join the same waitlist twice.

### 2.5 Conflicts against cancelled or unpublished shifts

If a volunteer is confirmed on a shift that has since been cancelled, rule 6 as written
still blocks them from an overlapping shift. That is almost certainly wrong — the
cancelled shift is not happening.

**Assumption:** ignore confirmed signups whose shift is inactive or unpublished when
detecting conflicts. No fixture data exercises this.

### 2.6 Waiver version comparison

Rule 4 says an older signature does not count. It does not say what to do with a signature
recording a *newer* version than the waiver's current one, which happens when a waiver
revision is rolled back.

**Assumption:** accept `signedVersion >= currentVersion`. Blocking someone for having
signed a version that was current when they signed it would be a self-inflicted support
ticket. `vol-006` holds `waiver-general` at version 1 against a current version 2, which
correctly yields `WAIVER_REQUIRED` under either comparison.

### 2.7 Unknown or missing IDs

The spec does not say what happens when `volunteerId` or `openingId` does not exist.

**Assumption:** raise a distinct error rather than returning `BLOCKED`. A missing record is
a programming or data-integrity fault, not a statement about a volunteer's eligibility, and
returning `BLOCKED` would silently hide broken calling code.

### 2.8 Duplicate reason codes

An opportunity can carry several qualification rules. If two of them fail, does the
volunteer get `MISSING_QUALIFICATION` once or twice?

**Assumption:** reasons are a set. Telling a volunteer "missing qualification, missing
qualification" is noise. This does mean the result does not say *which* qualification is
missing — see 4.1.

### 2.9 No rule for shifts in the past

There is no rule preventing signup for a shift that has already happened, and no reason
code that could express one. Every shift in the fixture is in the future, so nothing tests
it.

**Assumption:** do not implement it. Adding an unlisted reason code would be inventing
product behaviour. Flagged here because a real browse page will hit this on day one.

---

## 3. Observations about the data

Things the fixtures reveal that the spec does not discuss.

### 3.1 Timestamps are timezone-naive but the data spans two timezones

Shift times are recorded without an offset (`2026-09-14T09:00:00`). Opportunities carry a
`city`, and the cities are Indianapolis (Eastern) and **Denver** (Mountain). The `city`
field is otherwise unused by every rule in the spec.

The conflict check compares these naive strings directly, which silently assumes every
shift is in the same timezone. It is not. `shift-meals-mon-am` (Indianapolis, 09:00–12:00)
and `shift-warehouse-mon` (Denver, 11:00–15:00) overlap on paper. Converted to real
instants they do not overlap at all — the Denver shift starts at 13:00 Eastern, an hour
after the Indianapolis one ends.

**Consequence.** As specified, the checker will block volunteers from shifts they could
genuinely work, and clear them for shifts that genuinely collide, whenever an organization
operates in more than one timezone. The error is up to a full working day at the extreme
and is invisible — it produces a plausible-looking answer every time.

**How I intend to resolve it.** Compare the naive timestamps as the spec describes, and
document this as a known limitation rather than inventing a timezone model the data cannot
support. Fixing it properly requires either storing shift times as instants with an offset
or attaching a timezone to the organization or opportunity, and that is a data-model change,
not a change to this function.

### 3.2 There is no travel-time rule

Adjacent shifts in different cities are physically impossible to work but pass the overlap
check, because rule 6 only asks about overlap. Combined with 3.1 this means the schedule
rules are geographically naive in both directions. Noting it; not building it. A buffer
would need a policy decision about how long, and per what — organization, opportunity, or
volunteer.

### 3.3 A qualification rule with an empty list

`opp-youth` carries `rule-youth-1`: a `HAS_ALL` rule with `qualificationIds: []` and
`isActive: true`. Read literally this is vacuously true and every volunteer passes it. By
contrast `opp-kitchen` carries `qualificationRules: []` — an empty list of rules, which is
a different shape expressing the same outcome.

**Assumption:** treat the empty rule as vacuously passing. It is far more likely to be a
half-configured rule someone saved before choosing qualifications than an intent to block
everyone, and blocking everyone from an opportunity because of an empty field would be a
severe failure mode for a misconfiguration this easy to create.

**What I would change.** The product should not let a rule be saved with an empty
qualification list, and the checker should log it as a data-quality warning rather than
pass it silently.

### 3.4 `open-kitchen-sat-cleaner` is unreachable for every volunteer in the fixture

The Kitchen Deep Clean opportunity is restricted to `group-acme` and requires
`waiver-kitchen` at version 1. The members of `group-acme` are `vol-001` and `vol-004`.
The only volunteer holding a current `waiver-kitchen` signature is `vol-002`, who is not in
the group. The intersection is empty, so no volunteer in the fixture can ever be
`ELIGIBLE` for this opening.

This is probably deliberate — it means the group gate can be tested without any case
producing a positive result. Worth knowing before concluding the implementation is broken.

---

## 4. Where the supplied cases do not reach

`fixtures/cases.json` covers twelve scenarios. Enumerating the reason codes they exercise:

**Covered:** `SHIFT_NOT_PUBLISHED`, `SHIFT_INACTIVE`, `OPENING_INACTIVE`, `AT_CAPACITY`,
`ALREADY_SIGNED_UP`, `MISSING_QUALIFICATION`, `WAIVER_REQUIRED`, `SCHEDULE_CONFLICT`.

**Never exercised:** `DISALLOWED_QUALIFICATION`, `GROUP_RESTRICTED`, `WAITLIST_FULL`.

The three uncovered codes are precisely the two contested rules from section 1 plus one
capacity boundary. The spec is honest about this — it says the cases "cover the
straightforward paths, not everything" — but it is worth stating plainly that passing all
twelve supplied cases demonstrates very little about the parts of the spec that are
actually in dispute. My own tests will target the gaps above rather than restate the
supplied cases.

Additionally, no supplied case exercises: multiple reason codes accumulating beyond the
single two-reason case, shifts that touch without overlapping, a volunteer's signup
conflicting with itself, an inactive qualification rule being skipped, or the empty-list
rule in 3.3.

### 4.1 A reservation about the reason codes themselves

`MISSING_QUALIFICATION` tells a volunteer that something is missing but not *what*. The
spec's stated goal is that a volunteer can "do something about it," and a volunteer cannot
act on "missing qualification" without contacting someone. The same applies to
`WAIVER_REQUIRED`, though there the required waiver is at least unambiguous per opportunity.

This is a real limitation of the specified interface, not a bug in it. I intend to build
the interface as specified and carry the detail internally so it is available when the
product decides to surface it, rather than widening the contract on my own initiative.

---

## 5. The check cannot be the enforcement

Everything above treats `checkEligibility` as a question about a fixed world. It isn't one.
The spec asks "can this volunteer sign up," and that sentence hides two different questions:

- **Would they be allowed to?** — what a browse page needs, and what a pure function over a
  snapshot can answer.
- **May they, right now, to the exclusion of everyone else asking?** — what the signup
  button needs, and what no read-only function can answer at all.

The spec never distinguishes them, so it is possible to build exactly what was asked for
and still ship a system that over-subscribes shifts. Nothing below is a defect in the
function as specified; they are defects in *believing the function is a gate*.

### 5.1 Two volunteers can both be told yes for the same last place

Three of four places are taken. Two volunteers load the page, both are told `ELIGIBLE`, both
press sign up. Both writes succeed and the opening holds five people. This is the ordinary
time-of-check-to-time-of-use race, and it needs no unusual timing — a browse page and a
click is seconds of gap.

**Consequence.** A kitchen shift turns up one station short of the people standing in it.
For the warehouse it is worse: `maxVolunteers` on a dock role is a staffing ratio, and
exceeding it is the kind of thing that is only noticed after somebody is hurt. Nobody finds
out until the day, because every individual answer was correct when it was given.

**What it needs.** The signup write re-runs the capacity check inside a transaction holding
a lock on the opening row, or a constraint that makes over-subscription unrepresentable.
`checkEligibility` stays advisory and the write path becomes authoritative. They can share
the same rule functions — that is a good reason for the rules to be pure and free of I/O,
which they are.

### 5.2 The schedule conflict race is harder than the capacity race

Capacity is an invariant over one opening, so a row lock on that opening closes it. A
schedule conflict is an invariant over *two different openings*, usually under different
opportunities. Locking the opening being signed up for does not help: two concurrent
signups to two different overlapping shifts each read a world in which the other does not
exist, and both are correct.

**Consequence.** A volunteer is confirmed for two shifts at once. Two coordinators each
believe they have someone who will not arrive, and the volunteer discovers the clash when
it is too late to backfill either.

**What it needs.** The lock belongs on the *volunteer*, not the opening — or serializable
isolation, or a database constraint over the interval. Postgres can express the last one
directly: an exclusion constraint over `(volunteer_id WITH =, during WITH &&)` makes
double-booking unrepresentable rather than merely checked. That is the version I would
argue for, because it survives a future code path that forgets to check.

### 5.3 Double submission makes `ALREADY_SIGNED_UP` advisory too

A double-clicked button sends two requests. Both read a world in which the volunteer is not
signed up, and both insert. The fixture's `signups` records carry no id and express no
natural key, so nothing prevents the duplicate.

**Consequence.** Cosmetically a volunteer appears twice on a roster; substantively they
consume two of the places others were competing for, which turns a UI stutter into someone
else's rejection.

**What it needs.** A unique constraint on `(volunteerId, openingId)`. That demotes the
`ALREADY_SIGNED_UP` check to what it should be — a way to give a clear answer early, not
the thing keeping the invariant.

### 5.4 The waitlist has no order

`signups` carries `volunteerId`, `openingId`, and `state`. There is no timestamp, no
sequence, and no position. Rule 2 can therefore say a waitlist place *exists* but nothing in
the data can say *whose* it is.

**Consequence.** When a confirmed volunteer cancels, there is no defined answer to who gets
promoted, so whatever the implementation happens to do becomes the policy — probably
insertion order in a table, which is not a promise anyone made. Volunteers who waited
longest have no reason to believe they were treated fairly, and no coordinator can explain
the outcome. Concurrent cancellations make it worse: two promotions racing over one freed
place can confirm two people or, if written defensively, neither.

**What it needs.** A position or a created-at on the signup, and an explicit policy — first
come first served, or something else the product actually wants. This is a missing field
rather than a race, but it is invisible until you ask the concurrency question.

### 5.5 Editing an opportunity silently invalidates the volunteers already on it

The check happens once, at signup. Nothing re-runs it, and everything it depends on stays
editable — including by a coordinator in an admin screen who has no way to see what they are
about to break.

Two kinds of change do it. A volunteer's own record drifts:

| What changes | What it silently invalidates |
| --- | --- |
| A waiver's `currentVersion` is bumped | Every existing signature, on every confirmed signup |
| A qualification lapses or is revoked | Any `HAS_ANY` / `HAS_ALL` rule that depended on it |
| A qualification is *added* | A `DOES_NOT_HAVE_ALL` exclusion that should now fire |
| A volunteer leaves a group | Confirmed places on restricted opportunities |

And the opportunity itself is edited underneath them:

| The edit | What it does to volunteers already confirmed |
| --- | --- |
| A shift is rescheduled | Creates overlaps with their other shifts — and they agreed to a time that no longer exists |
| A qualification rule is added or activated | They may no longer qualify; if it is a `DOES_NOT_HAVE_ALL`, they may now be excluded on safety grounds |
| A rule is removed or deactivated | Nobody is wrong any more, but nobody blocked under the old rule is told, and no waitlist is reconsidered |
| `requiredWaiverId` is set where there was none | Every confirmed volunteer is now unwaivered |
| `restrictedToGroupIds` is added | Confirmed volunteers outside the group must come off — and §1.2 says we cannot tell them why |
| `maxVolunteers` is lowered below the confirmed count | The opening is over-subscribed by an edit rather than a race, and nothing decides who loses their place |

**Consequence.** The roster quietly fills with people who would not be allowed to sign up
today, and the coordinator who caused it has no idea. The `DOES_NOT_HAVE_ALL` case is the
one that matters: adding a lifting-restriction exclusion to the warehouse opportunity on
Tuesday does not take anybody off Saturday's dock shift, because nothing ever asks again.
That is the same safety failure §1.1 is about, arriving by a different route — and resolving
§1.1 correctly does nothing to prevent it.

The `maxVolunteers` case is worth separating out because it is not drift at all. It is the
capacity invariant being broken by a single-user edit, with no concurrency involved, and
§5.1's fix — a lock on the write path — does nothing about it.

**Why you cannot just re-run `checkEligibility`.** This is the part that has to be designed
rather than bolted on. `checkEligibility` answers a question about *acquiring* a place, and
some of its reasons are meaningless once you hold one. Re-running it over existing signups
would revoke everybody: they are all `ALREADY_SIGNED_UP`, and the ones who filled the last
places are all `AT_CAPACITY`.

The reason codes split cleanly in two:

- **Acquisition** — `ALREADY_SIGNED_UP`, `AT_CAPACITY`, `WAITLIST_FULL`. About getting a
  place. Never grounds for losing one.
- **Continuing** — `SHIFT_NOT_PUBLISHED`, `SHIFT_INACTIVE`, `OPENING_INACTIVE`,
  `MISSING_QUALIFICATION`, `DISALLOWED_QUALIFICATION`, `WAIVER_REQUIRED`,
  `GROUP_RESTRICTED`, `SCHEDULE_CONFLICT`. About whether someone should be there at all,
  which is as true on the day as it was at signup.

The useful accident is that this split falls exactly on one rule boundary: `capacityRule` is
the only rule that emits acquisition codes, and every other rule emits continuing ones. So
supporting re-validation is not a second implementation of the rules — it is one scope tag
on one entry in the registry, and a second entry point that runs the continuing subset. I
have not built it, because there is no write path here to hang it on, but the shape is
small and the rules being pure and I/O-free is what keeps it that way.

**The check that would actually help.** Of the three places to put one, only the first
happens while a human is present to decide:

1. **At edit time, before the change is saved.** Compute the impact and show it: *this
   change affects 14 confirmed volunteers, 3 of whom would no longer be eligible* — with the
   three named. That turns a silent breakage into a decision, which is the whole point.
2. **A sweep before each shift**, re-running the continuing rules over its confirmed
   signups, to catch drift from the volunteer side that no opportunity edit triggered.
3. **A guard on capacity specifically**, refusing to lower `maxVolunteers` below the
   confirmed count without the admin choosing who comes off.

None of that says what to *do* with someone who is no longer eligible. Revoke, flag to a
coordinator, or grandfather them is a product decision, and it probably differs by reason —
auto-revoking a safety exclusion is defensible where auto-revoking a lapsed waiver is not.
Because the rules are already separate functions, that policy can live per rule rather than
in one branching statement.

Whatever is chosen, the edit and the revocations it caused belong in the same audit record;
see §5.7.

### 5.6 The browse answer is stale before it is rendered

`checkOpportunity` answers for the whole catalog at one instant. By the time the page paints
and the volunteer decides, capacity may have moved. A volunteer shown `ELIGIBLE` and then
refused on submit needs an explanation that does not read as a bug.

This also bounds what is cacheable, and the split falls along a line the code already has.
The per-volunteer half of the context — qualifications, waivers, group membership, committed
shifts — changes rarely and can be cached until that volunteer's record changes. The
capacity half cannot be cached at all. If the browse page ever becomes a performance
problem, that is the seam to cut along.

Relatedly, the bulk API reads openings one at a time. Over the in-memory fixture that is
consistent by construction; over a database it is several queries that may observe different
states, so a browse page could show one opening full and its neighbour open as of two
different instants. It needs a single consistent snapshot, not N independent reads.

### 5.7 Nothing records why a volunteer was refused

The result is returned and discarded. If a coordinator is asked next month why someone was
blocked, or if the rules have changed since — and §1.1 says they will — the answer cannot be
reconstructed. For `DISALLOWED_QUALIFICATION` the inputs are effectively age and medical
information, so there is a retention question attached to logging it as well as a reason to.

**What it needs.** A decision log stamped with the rule configuration in force at the time,
and a retention policy written by someone who has thought about the second half of that
sentence.

### What I would change about the spec

State plainly whether `checkEligibility` is advisory or authoritative. Everything in this
section follows from the spec not saying, and the answer changes what the write path has to
do rather than what this function has to do. Then: add an ordering field to `signups`, and
say what happens to a confirmed signup when the facts underneath it change.

---

## 6. Questions I would ask

In the order I would want them answered:

1. Which reading of `DOES_NOT_HAVE_ALL` is correct — the table or the Fern example? This
   is the only finding that could make the implementation wrong in a way that matters for
   volunteer safety.
2. Is the confidentiality requirement in rule 5 about concealing *group membership*, or
   about concealing *that a restriction exists*? The answer decides whether
   `GROUP_RESTRICTED` becomes a volunteer-facing code or stays staff-only, as I have
   built it.
3. Do any organizations operate across timezones today? If so, 3.1 is a live defect rather
   than a latent one and should be scheduled.
4. Should a volunteer blocked only by a recoverable reason still be told a waitlist place
   exists?
5. Is `rule-youth-1`'s empty qualification list intentional?
6. Is `checkEligibility` advisory or authoritative — does anything else enforce capacity at
   write time? See §5. If nothing does, that is a larger problem than either contradiction
   in §1.
7. When a volunteer's qualifications, waivers, or group membership change *after* they are
   confirmed for a shift, should the place be revoked, flagged, or left alone? Same question
   when a coordinator edits the opportunity underneath them — see §5.5. Does the answer
   differ by reason? Auto-revoking a safety exclusion is defensible where auto-revoking a
   lapsed waiver probably is not.
8. Can a coordinator lower `maxVolunteers` below the number already confirmed, and if so who
   decides which volunteers lose their place?

---

## Method

Findings were verified by querying `fixtures/fixtures.json` directly — joining volunteers
to opportunities through openings and shifts, enumerating overlapping shift pairs,
intersecting group membership against waiver signatures, and diffing the reason codes in
`fixtures/cases.json` against the full table in `SPEC.md`. The trace in 1.1, the empty
intersection in 3.4, the overlap pairs in 2.3 and 3.1, and the coverage gaps in section 4
are all results of that pass rather than readings of the prose.
