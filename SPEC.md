# Volunteer shift eligibility

## Background

Volunteers browse shifts and sign up for the ones they want. Not every volunteer can
take every shift—some roles need certifications, some opportunities are limited to a
particular group, some need a signed waiver, and nobody can be in two places at once.

Right now these checks are scattered across the product and different screens give
different answers. We want one component that answers a single question the same way
every time.

**A volunteer should always be able to see why they weren't able to sign up for
something, so they can do something about it.** Telling someone "you can't sign up"
and nothing else is the worst possible outcome for us.

## What to build

```
checkEligibility(volunteerId, openingId) -> { status, reasons }
```

- `status` is one of `ELIGIBLE`, `WAITLIST`, `BLOCKED`
- `reasons` is a list of reason codes from the table at the bottom
- **Return every reason that applies, not just the first one.** A volunteer missing
  two things should be told about both.
- Order doesn't matter—the checker sorts before comparing.

No web service, no UI, no database. A function and a way to run it is all we need.

## The data

Everything lives in `fixtures/fixtures.json`.

| Entity | Notes |
| --- | --- |
| `volunteers` | Hold qualifications, signed waivers, and group memberships |
| `opportunities` | A program of work. Carries qualification rules, an optional required waiver, and optional group restrictions |
| `shifts` | A dated block of time belonging to an opportunity |
| `openings` | A role within a shift, with its own capacity. This is what a volunteer signs up for |
| `signups` | Existing signups, either `CONFIRMED` or `WAITLISTED` |
| `qualifications`, `groups`, `waivers` | Lookup data |

## The rules

### 1. Shift and opening status

A volunteer cannot sign up unless the shift is published and active, and the opening is
active. Use `SHIFT_NOT_PUBLISHED`, `SHIFT_INACTIVE`, and `OPENING_INACTIVE`.

### 2. Capacity

Each opening has `maxVolunteers` and `waitlistMax`.

- Confirmed signups below `maxVolunteers` → the volunteer can take the spot
- Full, and `waitlistMax` is 0 → `AT_CAPACITY`
- Full, but fewer waitlisted than `waitlistMax` → status is `WAITLIST`
- Full, and the waitlist is also full → `WAITLIST_FULL`

A volunteer already signed up for this opening gets `ALREADY_SIGNED_UP`.

### 3. Qualifications

An opportunity carries any number of qualification rules. **The volunteer must pass
every active rule**—rules combine with AND.

| Rule type | The volunteer passes when |
| --- | --- |
| `HAS_ANY` | They hold at least one of the listed qualifications |
| `HAS_ALL` | They hold every one of the listed qualifications |
| `DOES_NOT_HAVE_ALL` | They do not hold all of the listed qualifications |

A failed `HAS_ANY` or `HAS_ALL` gives `MISSING_QUALIFICATION`. A failed
`DOES_NOT_HAVE_ALL` gives `DISALLOWED_QUALIFICATION`.

**Worked example.** The Warehouse Sort and Load opportunity carries a
`DOES_NOT_HAVE_ALL` rule listing *Under 18* and *Lifting Restriction On File*. Fern
Okonjo (`vol-006`) has a lifting restriction on file, and is not under 18.

Fern is blocked from the Monday Sort loader opening with `DISALLOWED_QUALIFICATION`.

### 4. Waiver

An opportunity may require a waiver. The volunteer needs a signature against the
waiver's current version—an older signature doesn't count, because the text changed.
Otherwise `WAIVER_REQUIRED`.

### 5. Group restrictions

Some opportunities are limited to specific groups, listed in `restrictedToGroupIds`.

If the volunteer is not a member of any listed group, return `BLOCKED` with an empty
`reasons` list. Group membership is confidential and must not be disclosed to the
volunteer.

### 6. Schedule conflicts

A volunteer cannot hold two shifts that overlap. If the shift being checked overlaps a
shift the volunteer is already confirmed for, return `SCHEDULE_CONFLICT`. Only confirmed
signups count—a waitlisted one doesn't block anything.

## Reason codes

| Code | Meaning |
| --- | --- |
| `SHIFT_NOT_PUBLISHED` | The shift is not published |
| `SHIFT_INACTIVE` | The shift has been cancelled |
| `OPENING_INACTIVE` | The role is no longer offered |
| `AT_CAPACITY` | The opening is full and has no waitlist |
| `WAITLIST_FULL` | The opening and its waitlist are both full |
| `ALREADY_SIGNED_UP` | The volunteer already holds this opening |
| `MISSING_QUALIFICATION` | A required qualification is absent |
| `DISALLOWED_QUALIFICATION` | The volunteer holds a qualification that excludes them |
| `WAIVER_REQUIRED` | No current signature on the required waiver |
| `GROUP_RESTRICTED` | The opportunity is limited to specific groups |
| `SCHEDULE_CONFLICT` | The volunteer is already committed at this time |

## Checking your work

`fixtures/cases.json` has a set of scenarios with expected results. They cover the
straightforward paths, not everything.

## Nice to have

It would also be good if this worked for a whole opportunity at once, so the volunteer
browse page stays fast.
