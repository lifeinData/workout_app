# DESIGN.md — Training surface visual system

**Status:** authored 2026-08-24 for the Training-tab redesign
(`agent_plans/agent_agenda_2026_08_24_training_redesign.md`). This file is the **single
source of visual truth**. Every value an agent writes must come from here. If something
you need isn't specified, ask — do not invent a ninth radius.

Product truth lives in `AGENTS.md` + `CLAUDE.md` (data model, flows, gotchas). This file
covers *only* how it looks and why.

**Mode: Operate.** The session screen is a tool used mid-set — one-handed, sweaty,
glanced at between reps. Scanability, thumb reach and consistency outrank expression.
Brand lives in precise details, never in decoration.

---

## 1. Diagnosis — why the current UI reads "vibe-coded"

Not opinion; each is a countable property of the current code.

| # | Symptom | Evidence |
|---|---|---|
| 1 | **Everything is the same box.** Every container is white + `1px #f0d9ce` border + big radius. No hierarchy between page, card, row, input — the screen is a stack of identical outlines, which is what makes it read as a wireframe. | `StartScreen.workoutCard`, `.card`, `.emptyState`; `SessionScreen.tsx:450,481`; `HistoryView.tsx:75,210` |
| 2 | **Eight radii, no scale.** 10, 12, 16, 20, 24, 999, plus `rounded-xl/2xl/3xl`. `--radius: 1rem` is defined and never used. | `global.css:32` vs. every component |
| 3 | **No type scale.** 10, 11, 12, 13, 14, 16, 18, 24, 32 px chosen ad hoc; weights 500/600/700 ad hoc. | all files |
| 4 | **Accent means nothing.** Coral `#e87d6f` is on the CTA, every Set pill, play, PR text, trophy, tab indicator, calendar today-ring, Repeat button. When everything is accented nothing is. | passim |
| 5 | **Numbers jitter.** No `tabular-nums` anywhere, so weights/reps/clock change width per digit — in a screen that is literally a column of numbers. | `SetRow`, `RestTimerBar`, `StartScreen` |
| 6 | **The only cool hue in a warm palette.** Committed rows use `#6f9478`, a desaturated cool green found nowhere in the token set, at 2dp on every logged row — the loudest thing on screen. | `SetRow.tsx:14` |
| 7 | **Opacity modifiers silently render invisible.** Theme vars are hex, so `bg-muted/50` compiles to an invalid color. **4 live invisible elements in the Training surface.** | `ActiveSessionBar.tsx:34`; `HistoryView.tsx:174,180,287` |

**The direction, in one line:** *quiet warm paper, one loud accent, numbers you can read at
a glance.* Same palette — radically more discipline.

---

## 2. Tokens

### 2.1 Color — channel triplets

`src/global.css` moves from hex to **space-separated RGB channels** so
`rgb(var(--x) / <alpha-value>)` makes `/NN` opacity work natively. **The rendered colors do
not change** — this is a format change only.

| Token | Channels | = hex | Meaning |
|---|---|---|---|
| `--background` | `253 246 240` | `#fdf6f0` | the page. Never a card. |
| `--foreground` | `61 43 38` | `#3d2b26` | primary text |
| `--card` | `255 255 255` | `#ffffff` | raised surface |
| `--primary` | `232 125 111` | `#e87d6f` | **the** accent — see §2.2 |
| `--primary-foreground` | `255 255 255` | `#ffffff` | on-accent text |
| `--secondary` | `252 228 216` | `#fce4d8` | tinted chip fill |
| `--secondary-foreground` | `107 58 48` | `#6b3a30` | on-secondary text |
| `--muted` | `250 234 221` | `#faeadd` | recessed fill / trays |
| `--muted-foreground` | `139 114 104` | `#8b7268` | secondary text |
| `--accent` | `255 213 184` | `#ffd5b8` | highlight fill (trophies, resume bar) |
| `--accent-foreground` | `90 51 38` | `#5a3326` | on-accent text |
| `--destructive` | `217 106 90` | `#d96a5a` | destructive only |
| `--border` | `240 217 206` | `#f0d9ce` | **hairlines & inputs only** — see §2.3 |
| `--input-background` | `255 244 234` | `#fff4ea` | field fill |
| `--ring` | `244 162 154` | `#f4a29a` | focus ring |
| `--success` | `155 184 138` | `#9bb88a` | **new name for existing `--chart-4`** — "logged" |

> **`--success` replaces `#6f9478`.** `#9bb88a` is already in the palette (`--chart-4`), and
> it is warm. This honors "keep the same color scheme" while removing the one off-system hue.
> Keep `--chart-4` as an alias so nothing else breaks.

Dark-mode block in `global.css` converts identically. Dark mode is **not** a deliverable of
this pass — just don't break the parse.

### 2.2 The one-accent rule

Coral `--primary` is permitted in exactly three roles:

1. **The primary action** on a surface (max one per screen: Start empty workout / Finish / Add exercise).
2. **Active state** of a control (selected tab, running timer, focused input ring).
3. **A personal record.**

Everything else that is coral today becomes `--muted-foreground`, `--secondary`, or plain
`--foreground`. This single rule does more for "ultra modern" than any other change here.

### 2.3 Border discipline

**Cards do not get borders.** Depth comes from `--card` on `--background` plus `e1` (§2.6).
`--border` is reserved for:
- input field outlines,
- hairline dividers *between* items,
- the dashed empty-state outline (one place per screen, max).

Removing the outline from every card is the highest-leverage single change in this document.

### 2.4 Type scale

RN has no font tokens, so these live in `src/lib/theme.ts` as objects and in
`tailwind.config.js` as `fontSize` entries. **No size outside this table.**

| Token | Size | Weight | Letter-spacing | Use |
|---|---|---|---|---|
| `display` | 28 | 700 | −0.5 | screen title ("Training") |
| `title` | 22 | 700 | −0.3 | sheet headline, timer clock, stat values |
| `heading` | 17 | 600 | −0.2 | exercise name, card title, session title |
| `body` | 15 | 500 | 0 | primary content, input values |
| `label` | 13 | 500 | 0 | buttons, secondary content |
| `caption` | 12 | 500 | 0 | meta lines |
| `micro` | 11 | 600 | +1.2, **uppercase** | eyebrows, column headers, unit suffixes |

**Every numeric value** — weight, reps, clock, volume, duration, calendar dates, stats —
carries `fontVariant: ['tabular-nums']`. Non-negotiable; it is the difference between a
logbook and a form.

### 2.5 Spacing — 4pt grid

`4 · 8 · 12 · 16 · 20 · 24 · 32`. No other gaps.

- Screen horizontal padding: **16** (was 20 — reclaims 8dp of width per side)
- Card padding: **16**
- Gap between cards: **12**
- Gap between sections: **20**
- Gap inside a row: **10**

### 2.6 Radius & elevation

| Token | Value | Applies to |
|---|---|---|
| `r.sm` | 10 | input fields, small chips |
| `r.md` | 14 | set rows, buttons, timer bar |
| `r.lg` | 20 | cards |
| `r.xl` | 24 | sheets (top corners only) |
| `r.full` | 999 | pills, avatars, circular buttons |

Two elevation levels. **Warm shadow — never neutral black.**

```ts
e1 = { shadowColor: '#3d2b26', shadowOpacity: 0.06, shadowRadius: 12,
       shadowOffset: { width: 0, height: 2 }, elevation: 2 }   // cards
e2 = { shadowColor: '#3d2b26', shadowOpacity: 0.12, shadowRadius: 24,
       shadowOffset: { width: 0, height: -4 }, elevation: 12 } // sheets
```

### 2.7 Motion

Restrained. `150ms` for state (press, focus), `220ms` for entry. Presses use `opacity: 0.85`
or the `active:` variant already in use — no scale transforms, no spring. The rest-timer
progress track is the only continuously animating element.

### 2.8 Touch targets

**≥44dp for everything interactive**, achieved with `hitSlop` where the visual is smaller
(the existing `HIT_SLOP` pattern in `RestTimerBar.tsx:25` is correct — keep it). Density
increases must never come out of tap area.

---

## 3. Component specs

### 3.1 Set row — the centerpiece

Currently ~72dp tall + 12dp gap = **84dp per set**; a 4-set exercise is ~450dp, so one
exercise fills the screen. Target: **52dp row + 6dp gap.**

```
┌──┬────┬─────────────────┬─────────────────┬──────┐
│▌ │ 1  │  225      lb    │  8       reps   │  ⋯   │
└──┴────┴─────────────────┴─────────────────┴──────┘
 rail idx      weight            reps         action
  3   24        flex-1           flex-1         32
```

- **Rail** (3dp, full height, left edge): `transparent` idle · `--success` committed. This
  replaces the 2dp all-round green box. Quiet, unmistakable, costs zero layout.
- **Index**: 24dp fixed, `micro` + tabular, `--muted-foreground`. **Not a pill.** A pill on
  every row is 100% noise — pills are for things that vary.
- **Fields**: `r.sm`, fill `--input-background`, **no border idle**; focus = 1.5dp `--ring`.
  Input height 44 (touch target) inside a 52dp row. Value is `body` + tabular, centered.
  The unit (`lb` / `reps`) is a `micro` suffix **inside** the field's right edge, not a
  separate sibling in the flex line.
- **Action slot**: 32dp, **fixed width, always rendered.** Holds delete, or the PR marker,
  or nothing. ⚠️ **This is the fix for the PR-reflow bug** — the `PR` text must never be a
  conditional child of the flex line (`SetRow.tsx:180`), or PR rows get narrower inputs than
  their neighbours (visible in `Workout2.jpg`).
- **Committed state**: rail fills, field fill goes `--card`, value weight → 600. Border width
  never changes between states (today it's 1→2, so rows are different heights).
- **Warmup**: flame glyph replaces the index digit's color, not an extra element.

**Column header must not be hand-aligned.** Export from `SetRow.tsx`:

```ts
export const SET_ROW_METRICS = { railW: 3, idxW: 24, actionW: 32, gap: 10, padX: 12 } as const;
```

`SetRowHeader` and both row variants consume it. Today the header uses `px-3` + bare
`flex-1` while rows use `px-3.5` + `flex-1 + 22/30dp` siblings, so the labels sit left of
their columns and weight/reps aren't even equal width.

### 3.2 Exercise card

`--card`, `r.lg`, `e1`, **no border**, padding 16.

```
CHEST                                            ▶
Barbell Bench Press                        4 × 5–8
PR 60 × 60
────────────────────────────────────────────────
SET   WEIGHT   REPS
[rows]
+ Add set
```

- Eyebrow `micro` muted · name `heading` · PR line `caption` with only the number in coral.
- **Target moves to the right** as a `caption` chip on the name's baseline — it's reference
  data, not a third stacked line. Kills one line of vertical space per exercise.
- Demo button: 32dp `r.full`, `--muted` fill.
- "Add set": full-width, `r.md`, `--muted` fill, `label` — **not dashed**. Dashed outlines
  are for empty states, and using them for a live control is a big part of the sketchy read.

### 3.3 Rest timer — inline, redesigned

The user chose an **inline** bar (stays in the scroll flow, first item under the sticky
header) rather than a pinned one. One height, one radius, one grammar.

```
┌────────────────────────────────────────────────┐
│  1:30                      −15   +15   ↺   ( ▶)│
│▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬                              │
└────────────────────────────────────────────────┘
```

- **56dp**, `--card`, `r.md`, `e1`, **no border** (today `borderWidth` flips 1 → 1.5 on
  start, shifting layout by 0.5dp every time the timer runs).
- **Clock is the hero**: `title` + tabular, left. Tappable to edit — a subtle dotted
  underline carries "editable", so the separate `Pencil` icon **and** the orphaned `REST`
  eyebrow both go. The chip fill goes too; the numeral alone is the element.
- **Three ghost buttons, one size** (32dp `r.full`, `--muted`): `−15`, `+15`, `↺`. Today
  these are a joined pill *plus* a 36dp circle *plus* a 40dp circle — three shapes, two
  diameters, for four peer actions.
- **One emphasis**: play/pause, 44dp `r.full`, `--primary`. The only coral on the bar.
- **Progress** is a 3dp track pinned to the bar's bottom edge, `--primary`, width =
  progress. Today it's a 22%-alpha block behind the whole bar, which reads as a random tint.
- Running state: clock turns `--primary`. Nothing else changes.

⚠️ **Preserve `commitAndRun`** (`RestTimerBar.tsx:102`) exactly — commit draft → blur →
dismiss keyboard → act, synchronously. It is the fix for the "press play twice" bug.

### 3.4 Session header — sticky

The whole reason the screen looks squished: `TrainingTab.tsx:121–159` renders the
"Training" title **and** the Train|History toggle above `SessionScreen`, costing ~139dp
(≈20% of an S23 Ultra's usable height) that a live workout cannot use.

During a session both are hidden and `SessionScreen` owns a sticky header via
`ScrollView stickyHeaderIndices={[0]}`:

```
‹   Upper Body Power             ✎   [ Finish ]  ⋯
    0:55 · 3 sets · 5,364 lb
────────────────────────────────────────────────
```

- 56dp bar + a `caption` meta line, tabular. Background `--background`, hairline
  `--border` bottom edge.
- Title `heading`, single line, ellipsized, the only flexing element.
- Finish: `--primary`, `r.md`, height 36, `label` 600.

### 3.5 Start screen

- **Kill the second segmented control.** Two identical tray-and-pill toggles stacked
  (`TrainingTab.toggleRow` + `StartScreen.listTabs`, ~102dp combined) read as one broken
  4-way control. My Workouts / Coach's Playbook becomes **underlined text tabs**:
  `heading`, active = `--foreground` + 2dp coral underline, inactive = `--muted-foreground`.
  Zero container chrome.
- **Order: CTA → tabs → list.** "Start empty workout" is the primary action, not a list
  item. `--primary`, `r.md`, height 52, full width.
- **Session card**: `r.lg`, `e1`, no border, padding 14.
  ```
  Upper Body Power                              ↺
  Aug 22 · 2 exercises · 3 sets · 1 min · 5,364 lb
  ```
  One meta line (volume folded in), tabular. Repeat becomes a 32dp ghost icon button in a
  fixed slot — today it's a coral pill competing with the title.
- **Empty sessions** (`0 exercises · 0 sets`, as in `Workout1.jpg`) render at reduced
  weight: name `--muted-foreground`, meta replaced by "No sets logged", no volume line.
  They must not look like real workouts.
- **Trophy Room paging is broken** (`StartScreen.tsx:423,592`): slide width is hardcoded
  `300` while `pagingEnabled` snaps to *screen* width, so dots desync from position
  immediately. Fix: measure with `onLayout`, use `snapToInterval={slideW}` +
  `decelerationRate="fast"`, and divide by the measured width.

### 3.6 Sheets

All five (`SessionSummarySheet`, `SettingsSheet`, `DemoVideoSheet`, `ImportWorkoutSheet`,
`HistoryView`'s detail sheet) share one primitive:

- Backdrop `--foreground` at 50% — expressible as `bg-foreground/50` **once §2.1 lands**.
- Top corners `r.xl`, `--card`, `e2`, padding 20.
- 36×4dp `--border` grabber, centered, 8dp from the top.
- Header: `heading` title + 32dp `r.full` `--muted` close button.

---

## 4. Non-negotiables

1. **≥44dp touch targets.** Density never comes out of tap area.
2. **`maxFontSizeMultiplier={1.3}`** on every `Text` touched. Layouts survive 1.3× OS scale.
3. **No `var(--*)` in inline RN styles** — NativeWind only compiles `className`. `StyleSheet`
   files import constants from `src/lib/theme.ts`.
4. **Never a `/opacity` modifier on a themed color until §2.1 ships and is verified.**
5. **Keep each file's existing style idiom.** `StartScreen`/`TrainingTab` stay
   `StyleSheet.create`; the rest stay NativeWind `className`. Values come from tokens either
   way. Converting idioms is diff noise and is not in scope.
6. **Behavior is frozen.** This is a visual and layout pass. No endpoint, query-key, mutation,
   optimistic-update, PR-math or `local_date` semantics change. See the agenda's
   do-not-regress list.
7. **Every agent that edits UI invokes `/impeccable` first** — sub-command per task, native
   reference variants, and `craft-floor.md` before the first edit. See "Using the
   `/impeccable` skill — MANDATORY" in
   `agent_plans\agent_agenda_2026_08_24_training_redesign.md`. Where the skill's generic
   guidance and this file disagree, **this file wins** (the palette and Operate mode are
   pinned by the human).
