---
description: Execute the next incomplete task in tasks.md, one task at a time, with a mandatory question phase before implementation.
---

Your job is to advance the SuiScope build by exactly **one task** from
`tasks.md`, then stop and wait.

---

## Step 1 — Orient yourself

Read these files now, in this order:

1. `tasks.md` — find the **first task that is `[ ]` (not started)**.
   - If a task is `[~]` (in progress), that is your task — it was already
     started but not finished.
   - If all tasks in the current milestone are `[x]`, announce
     "Milestone MN complete — ready to open MN+1" and ask the user to
     confirm before proceeding to the first task of the next milestone.
   - If every task in every milestone is `[x]`, announce that the project
     is complete and stop.

2. `copilot-instructions.md` (in `.github/`) — re-read only the sections
   directly relevant to this task: stack, coding conventions, measurement
   definitions, key constraints. Do not re-read the whole file on every
   run; focus on what applies.

3. `architecture.md` — review the component(s) this task touches.

4. `decisions.md` — check for any closed ADRs that constrain this task.
   Do not re-open closed ADRs.

5. Any already-existing source files under `packages/` and `config/`
   that this task will touch or build on.

---

## Step 2 — Question phase (MANDATORY — do not skip)

Before writing a single line of code or creating any file, present:

### Current task
Quote the full task row from `tasks.md` verbatim (ID + description).

### Dependency check
Identify any tasks this one logically depends on and confirm their
status is `[x]`. If a dependency is not `[x]`, stop here and explain
what must be completed first.

### My questions
Ask **every** question the user must answer before you can implement
correctly. Questions come from three sources:

1. **Ambiguities in the task description** — anything with more than one
   reasonable interpretation. Be specific: "The task says X — I see two
   ways to do this: A or B. Which do you prefer?"

2. **Conflicts with existing code or decisions** — if something already
   in `packages/` or a closed ADR in `decisions.md` contradicts or
   complicates the task, surface it.

3. **Version choices** — for any new dependency, confirm: "I plan to use
   `{package}@{latest-stable}` — is that correct?" Always verify latest
   stable from the registry; never assume.

Format your questions as a numbered list. For each question:
- State the question clearly.
- Offer 2–3 concrete options where relevant, with a recommended default
  marked.
- Explain in one sentence why the choice matters.

If you have **no questions**, say so explicitly:
> "I have no questions — this task is fully specified. Ready to implement."

Then stop and wait for the user to say "proceed."

---

## Step 3 — Wait

Do not proceed until the user has answered your questions (or confirmed
there are none) and explicitly said something like "proceed", "looks good",
"do it", or equivalent.

If the user answers some questions but not others, ask the unanswered ones
again. Never assume an answer that was not given.

---

## Step 4 — Implement

Execute the task:

- Create or edit only the files directly required by this task.
  Do not touch other files unless a hard dependency forces it (e.g.
  a shared type file must be updated to support the new module).
- Honour every constraint in `copilot-instructions.md` and `decisions.md`.
  Do not relitigate locked decisions.
- **Versions:** Use the exact version confirmed in Step 2. Pin it in
  `package.json`. Do not use `^` or `~` ranges without explicit user approval.
- **Design tasks (M3):** Dashboard UI must be purpose-built for SuiScope.
  No off-the-shelf component themes. Every visual decision must be
  deliberate and consistent with the design system defined in T-10.
- **TypeScript:** Strict mode, no `any`, all exported symbols explicitly
  typed.
- **Environment variables:** Validate with Zod at startup if this task
  introduces any new env vars.
- If a decision was made during this task (open question resolved, version
  chosen, approach selected), record it in the **Change log** at the
  bottom of `tasks.md`:
  `- YYYY-MM-DD · {TASK-ID} · {Decision summary in one sentence.}`
- If the decision affects `architecture.md` or `decisions.md`, update
  those files too.

---

## Step 5 — Verify

After implementation, state the result for each of the following
(adapted to the task type):

**For all tasks:**
```
✓/✗ pnpm turbo typecheck passes
✓/✗ pnpm turbo lint passes
✓/✗ pnpm turbo test passes
```

**For probe tasks (T-05 through T-09, T-15):**
```
✓/✗ Probe emits a valid MeasurementEvent for at least one provider
✓/✗ Cold connection used — no connection reuse between cycles
✓/✗ User-Agent header set to SuiScope-Probe/<version>
```

**For API tasks (T-08, T-14):**
```
✓/✗ Zod validation rejects a malformed payload
✓/✗ All new env vars validated at startup
```

**For dashboard tasks (T-10 through T-13, T-17):**
```
✓/✗ Page renders without console errors
✓/✗ No off-the-shelf theme classes used — design is custom
✓/✗ Consistent with design system defined in T-10
```

Fix anything marked `✗` before Step 6.

---

## Step 6 — Mark done and report

1. In `tasks.md`, change the task's status from `[ ]` (or `[~]`) to `[x]`.
2. If this was the last task in a milestone, report:
   "Milestone MN complete. Next milestone: MN+1."
3. Report a brief summary:
   - Files created or modified.
   - Key decisions made and logged.
   - The **next task** ID and description (do not start it).
4. Stop. Wait for the user to invoke this prompt again.

---

## Guardrails

- **One task per run.** Never start the next task speculatively.
- **Never skip the question phase**, even for simple tasks. Simple tasks
  often carry hidden decisions (version choices, file locations, naming).
- **Never mark a task `[x]` if any verify criterion is false.** Mark it
  `[~]`, explain the blocker, and stop.
- **Never modify `tasks.md` structure** (task order, milestone names,
  IDs) without explicit user instruction.
- **Never store secrets or credentials** in any file. Keys go in
  environment variables or Fly secrets only.
- **Probe cycles must be stateless.** No shared mutable state between
  probe cycles. Flag any pattern that violates this.
