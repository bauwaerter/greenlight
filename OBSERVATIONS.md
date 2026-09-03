# Observations on SPEC.md

A record of what I found reading `SPEC.md` and `fixtures/` before writing any code.
Findings are ordered by how much they change what gets built. Each one states the
problem, what it costs if we guess wrong, how I intend to resolve it, and what I would
change about the spec itself.

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

Compounding it, the reason code table defines `GROUP_RESTRICTED` — a code that rule 5
makes it impossible to ever emit. Either the rule is wrong or the code should not be in
the table.

**What it costs to get wrong.** There is a worse failure hiding underneath. If the group
check returns no reason but the other checks still report theirs, a volunteer sees
"missing qualification," goes and earns the certification, comes back, and is still
blocked with no new information. That is the spec's own worst-case outcome, reached by
following the spec. It also wastes the volunteer's time and the coordinator's, and it is
the kind of thing that generates a support ticket nobody can answer without disclosing the
confidential thing.

**How I intend to resolve it.** Treat the group restriction as a visibility gate that runs
first and short-circuits: if the volunteer is not in a listed group, return `BLOCKED` with
empty reasons and evaluate nothing else. This honours rule 5 literally and avoids the
partial-information trap, at the cost of the volunteer learning nothing — which is what
rule 5 asks for.

**What I would change about the spec.** The real fix is upstream of this function.
A restricted opening should never be shown to an ineligible volunteer in the first place,
so the browse page filters it out and the question is never asked. I would also press on
the confidentiality claim: emitting `GROUP_RESTRICTED` discloses that *the opportunity is
restricted*, which is a property of the opportunity, not that any particular volunteer is
or is not in any particular group. Those are different disclosures and the spec conflates
them. If the product is willing to say "this opportunity is limited to specific groups —
contact your coordinator," the volunteer gets an actionable next step and no membership is
revealed. That is a product decision, not an engineering one, which is why I am flagging
it rather than deciding it.

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

## 5. Questions I would ask

In the order I would want them answered:

1. Which reading of `DOES_NOT_HAVE_ALL` is correct — the table or the Fern example? This
   is the only finding that could make the implementation wrong in a way that matters for
   volunteer safety.
2. Is the confidentiality requirement in rule 5 about concealing *group membership*, or
   about concealing *that a restriction exists*? The answer decides whether
   `GROUP_RESTRICTED` is a live code or should be deleted from the table.
3. Do any organizations operate across timezones today? If so, 3.1 is a live defect rather
   than a latent one and should be scheduled.
4. Should a volunteer blocked only by a recoverable reason still be told a waitlist place
   exists?
5. Is `rule-youth-1`'s empty qualification list intentional?

---

## Method

Findings were verified by querying `fixtures/fixtures.json` directly — joining volunteers
to opportunities through openings and shifts, enumerating overlapping shift pairs,
intersecting group membership against waiver signatures, and diffing the reason codes in
`fixtures/cases.json` against the full table in `SPEC.md`. The trace in 1.1, the empty
intersection in 3.4, the overlap pairs in 2.3 and 3.1, and the coverage gaps in section 4
are all results of that pass rather than readings of the prose.
