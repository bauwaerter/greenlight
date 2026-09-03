# Volunteer shift eligibility—take-home exercise

Thanks for taking the time.

This exercise comes from Bloomerang Volunteer, the volunteer management product in the
Bloomerang Giving Platform. It's a simplified version of a problem the team actually
solves. You won't need to know anything about nonprofits or volunteering to do it.
Everything you need is in this folder.

## How long this should take

**About two to three hours.**

It isn't timed. We don't know or record when you started, and there's no clock running.
If you reach three hours and aren't finished, **stop** and write down what you'd do
next. We'd rather read that than an exhausted submission—it tells us more about how you
think.

## The task

Read [`SPEC.md`](SPEC.md) and build what it describes. Any language, any tools, any
structure. Use whatever you normally reach for, including AI assistants—we do, and we'd
rather see how you work than watch you work with one hand tied.

## One thing you should know about the spec

`SPEC.md` was written by a product manager working quickly, and it hasn't had an
engineering review.

**Part of the job is telling us what's wrong with it.** Some of it is unclear, some of
it doesn't say enough, and at least one part argues with itself. That isn't a trick—it's
what most specs look like on the day they reach an engineer. We're interested in what
you notice and, more than that, what you decide to do about it.

Building something different from what we'd have built costs you nothing, as long as you
tell us why.

## What to send back

1. **Your code and tests**, with a note in your own README saying how to run them.
2. **`DECISIONS.md`**—the template is in this folder. This is the part we read most
   carefully.
3. **Your AI transcript or prompt log**, if you used one. We're not checking up on you.
   Directing a model well is a real skill, and we'd like to see how you do it.

Send it back as a zip, or a link to a repository—whichever is easier. If you used git,
we'd enjoy seeing the history, but it isn't required.

## What we're looking for

Working code matters, but it isn't what separates submissions. We're most interested in
your judgment: what you decided, what you deliberately left out, and what you'd tell a
product manager who asked you to build this.

## Questions

If something is genuinely blocking you, email and ask. Noticing that a question needs
asking is a good sign, not a bad one.

Good luck—we're looking forward to reading it.

---

# Running this

My submission. The exercise brief is above; what follows is the code.

## Requirements

Node 20 or newer. No other tooling, and no runtime dependencies.

## Install

```bash
npm install
```

## Run the tests

```bash
npm test          # once
npm run test:watch
npm run typecheck # tsc --noEmit
```

`tests/cases.test.ts` runs all twelve scenarios from `fixtures/cases.json` unmodified.
`tests/eligibility.test.ts` covers the three reason codes those cases never exercise
(`DISALLOWED_QUALIFICATION`, `GROUP_RESTRICTED`, `WAITLIST_FULL`) and the rule
interactions they miss.

## Run the checker

```bash
npm run check -- --help          # every mode and flag
npm run check -- --list          # volunteer ids and names
```

**Browse one volunteer's whole catalog.** Every opening, whether they can take it, and why
not — the readable surface:

```bash
npm run check -- --report vol-006
npm run check -- --report --all
```

```
  Fern Okonjo  (vol-006)
  volunteer view · 0 eligible, 0 waitlist, 11 blocked

  Weekly Meal Service — Indianapolis
    x Monday Lunch Prep · Prep Cook       BLOCKED   waiver required
    x Tuesday Lunch Service · Server      BLOCKED   already signed up, waiver required
    x Wednesday Lunch Service · Server    BLOCKED   shift not published, waiver required
    ...

  Warehouse Sort and Load — Denver
    x Monday Sort · Loader                BLOCKED   disallowed qualification

  Kitchen Deep Clean — Indianapolis
    x Saturday Deep Clean · Cleaner       BLOCKED   (no reason given)
```

That last row is `SPEC.md` rule 5: group membership is confidential, so the volunteer is
told nothing. `--staff` shows the same evaluation as a coordinator sees it, and is the only
way `GROUP_RESTRICTED` is ever emitted:

```bash
npm run check -- --report --staff vol-005
#   x Saturday Deep Clean · Cleaner   BLOCKED   group restricted, waiver required
```

**Single answers, as JSON:**

```bash
npm run check -- vol-001 open-meals-mon-pm-server
npm run check -- --opportunity vol-001 opp-meals
npm run check -- --literal-disallowed vol-006 open-warehouse-mon-loader
```

## Where things are

| Path | What it holds |
| --- | --- |
| `src/eligibility.ts` | `checkEligibility` and `checkOpportunity`, and how status is derived |
| `src/rules/` | One file per rule in `SPEC.md`; `rules/index.ts` is the registry |
| `src/policy.ts` | Every behaviour the spec left ambiguous, with the default chosen |
| `src/context.ts` | Per-volunteer facts resolved once and reused across openings |
| `src/report.ts` | One volunteer's whole catalog as data — no rendering decisions |
| `src/render.ts` | That data as plain text — no lookups, no rules |
| `OBSERVATIONS.md` | What I found wrong in the spec and how I resolved each one |
| `DECISIONS.md` | The short version, for a reader with ten minutes |

## The two decisions worth arguing about

`SPEC.md` contradicts itself twice. Both resolutions are in `src/policy.ts` and both
can be flipped without touching rule logic.

1. **`DOES_NOT_HAVE_ALL`** — the rule table and the Fern worked example give opposite
   answers for the same volunteer. I implemented it as an exclusion list, following the
   example, because the failure modes are not symmetric. `OBSERVATIONS.md` §1.1.
2. **Group restrictions** — rule 5 requires a block with no explanation, contradicting
   the spec's own headline promise. I short-circuit so the volunteer is never given a
   partial list they can act on fruitlessly. `OBSERVATIONS.md` §1.2.
