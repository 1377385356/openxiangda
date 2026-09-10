# OpenDesign Craft 原文

固定上游提交：`07170f8d2213936b7862db04139d27e0af5437ed`；适配版本：1；能力摘要：`bd35b8a8f525210316d9711b6e5773d3b23d5d9b5aea96a66502137ad0d5dc16`。

这些原文是设计参考；先读[享搭适配与工作流](design-workflow.md)。上游 preview/outputs 是示例产物，Best Pairings 是可选建议，并不表示这些工具已安装。实际授权与应用事实以当前任务为准。

Craft 来自 OpenDesign，并注明改编自 Refero Design 的 MIT 许可 refero_skill；各条目保留原文署名和来源。

## typography

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/craft/typography.md

### Typography craft rules

Universal typography rules that apply on top of any `DESIGN.md`. The
active design system decides *which* fonts; this file decides *how* they
behave at every size.

> Adapted from [refero_skill](https://github.com/referodesign/refero_skill)
> (MIT) — distilled and re-tuned for OpenDesign's token system.

#### Type scale

Use a multiplicative scale (1.2 or 1.25). Cap at 6–8 sizes per artifact.

| Role | Range |
|---|---|
| Display | 48–72 px |
| H1 | 32–48 px |
| H2 | 24–32 px |
| H3 | 20–24 px |
| Body | 15–18 px |
| Small | 13–14 px |
| Caption | 11–12 px |

#### Line height (leading)

| Text size | Line height |
|---|---|
| Display / H1 (≥32 px) | `1.0`–`1.2` (tight) |
| Body (15–18 px) | `1.5`–`1.6` |
| Small (≤14 px) | `1.5` |

##### CJK overrides — these are not optional

The table above is Latin leading. Latin display type can go to `1.0`
because the ascender/descender slack inside the em box keeps lines
apart. **CJK glyphs fill the em box**, so the same value makes
consecutive lines touch, and multi-line Chinese headlines visibly
collide.

| Text size | Latin | CJK |
|---|---|---|
| Display / H1 (≥32 px) | `1.0`–`1.2` | **`1.3`–`1.4`** |
| Body (15–18 px) | `1.5`–`1.6` | `1.7`–`1.8` |

The CJK floor has **no upper size tier**. It applies to every heading
level, including the **cover / hero main title** — the single biggest
headline on a deck's first slide. A Chinese cover title at 72 px,
96 px, or larger, especially one split into multiple lines with
`<br>`, is still CJK display text: set `line-height: 1.3`–`1.4` on
it, never the Latin `1.0`–`1.2`. At 96 px a `1.05` leading makes the
two lines of a Chinese cover headline visibly collide. This is the
single most common violation, so check the cover main title first.

Negative tracking is Latin-only for the same reason: CJK is already
set on a fixed em grid, so `-0.02em` on a Chinese headline crowds the
glyphs instead of tightening the word. Use `0` for CJK display text.

When one artifact mixes both — an English kicker over a Chinese
headline is the common case — set the tight Latin values on the Latin
element only. Do not inherit them onto the CJK block from a shared
parent rule.

#### Letter-spacing — the rule that makes or breaks craft

This is the single most-skipped rule in AI-generated design. **No
exceptions.**

| Context | Letter-spacing |
|---|---|
| Body text (14–18 px) | `0` (default) |
| Small text (11–13 px) | `0.01em` to `0.02em` (positive) |
| UI labels and button text | `0.02em` |
| **ALL CAPS** | **`0.06em` to `0.1em` (required)** |
| Headings 32 px+ | `-0.01em` to `-0.02em` |
| Display 48 px+ | `-0.02em` to `-0.03em` |

ALL CAPS without positive tracking looks cramped and amateur. Display
text without negative tracking looks loose and weak. These two failures
are the most reliable AI-slop tells.

The `0.06em` floor is not arbitrary: it is the empirical lower bound
that print and web typographers have converged on for uppercase
tracking (cf. Bringhurst's *Elements of Typographic Style* §3.2.7,
which recommends 5–10% of the em for caps; modern screen practice
rounds the lower end to 0.06em). Anything tighter and the counters
collide on screen; the upper bound `0.1em` keeps the word from
disintegrating into letters.

#### Font pairing

- Maximum 2 typefaces per artifact (display + body, or one variable face
  used at multiple weights).
- Always declare a system fallback chain. If the active `DESIGN.md`
  ships a webfont URL, the fallback must still produce a coherent look.
- Never set `font-family: system-ui` alone on a heading — that is the
  textbook AI default; always pair it with an intentional first choice.

#### Line length

Limit body copy to **50–75 characters** per line. In CSS:
`max-width: 65ch` is a safe default.

#### Three-weight system

Most well-crafted UIs use exactly 3 weights:
- **Read** (400 / 450) — body copy
- **Emphasize** (510 / 550) — UI text, labels, navigation
- **Announce** (590 / 600) — headlines, buttons

Weight 700+ is rarely needed. If your design uses bold for "emphasis on
emphasis," it likely lacks weight discipline elsewhere.

#### Common mistakes (lint these)

- ALL CAPS without `letter-spacing` ≥ `0.06em`.
- Display text (≥32 px) without negative tracking (Latin only — see the CJK overrides).
- CJK display text at Latin leading (`≤1.2`), which makes the lines overlap.
- Multi-line CJK cover / hero titles (72–96 px+, e.g. split with `<br>`) below `1.3` line-height.
- Negative tracking applied to CJK text.
- More than 3 type sizes visible above the fold.
- Mixed serif and slab on the same screen without a clear role split.
- Body copy in `text-align: justify` (creates rivers; never use on the web).


## typography-hierarchy

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/craft/typography-hierarchy.md

### Typography hierarchy craft rules

Shared hierarchy contracts that layer on top of `typography.md`. This file does
not repeat scale ranges or tracking values — those live in `typography.md`.
This file defines how hierarchy *behaves*: entry points, rhythm, tension, and
the conditions under which controlled violations are allowed. This contract
applies per-surface (a page with multiple pacing resets may establish new
primaries at intentional intervals), not globally.

> Opt in via `od.craft.requires: [typography, typography-hierarchy]`.
> Aesthetic-specific variants (e.g. `typography-hierarchy-editorial`) extend this.

---

#### The core contract

Every typographic surface must satisfy all three:

1. **One dominant entry point.** The eye needs a place to start. One element
   wins the hierarchy — not two, not three. If everything competes, nothing leads.
2. **Intentional rhythm between levels.** Hierarchy is not a list of sizes.
   It is the *contrast* between them. Adjacent levels that are too close
   in scale, weight, or spacing produce a flat, undifferentiated surface.
3. **Recoverable information flow.** Hierarchy may be inverted, collapsed,
   or disrupted — but a reader must still be able to reconstruct the content
   structure without re-reading. If they can't, it's chaos, not tension.

---

#### Hierarchy vectors

Scale is one lever. Use all five.

| Vector | What it controls | Hierarchy direction |
|---|---|---|
| Scale | Size contrast between levels | Large → small reads as primary → secondary |
| Weight | Mass contrast between levels | Heavier reads as primary (see Controlled violations for weight inversion) |
| Spacing | Breathing room around an element | More space = more visual importance |
| Tracking | Tension and velocity | Tighter = faster; wider = ceremonial, slower |
| Alignment | Relationship to the grid/edge | Breaking alignment signals importance |

No single vector is required. A heading may lead through spacing alone if
scale is deliberately suppressed. A pull quote may lead through alignment
break. Identify which vectors are active and make sure at least two are
working in the same direction for the dominant element.

---

#### Semantic role ≠ visual role

Allowed. Not an error. Not a lint violation.

An `<h1>` may render visually quieter than a nearby `<p>` if the
composition requires it. Body copy may behave like display typography.
A label may visually outrank a heading.

**The condition:** information flow must remain intact. A user who reads
linearly must still understand what is important, what supports it, and
what is incidental — regardless of which element "wins" visually.

---

#### Hierarchy rhythm — the two failure modes

##### Flat hierarchy

Everything lands at roughly the same visual weight. The surface reads as
a wall. Usually caused by:
- Scale steps that are too close (e.g. 18 / 20 / 22 px for three levels)
- Weight used only once (everything is regular, or everything is medium)
- Uniform spacing between all elements

Fix: increase contrast between levels. Use at least two vectors simultaneously.

##### Noise hierarchy

Too many elements fighting for dominance. Everything is bold, large, or
accented. The eye has no resting point and no path.

Fix: promote one element deliberately. Demote everything else — including
things that feel important. Hierarchy is relative, not absolute.

---

#### Controlled violations

The following are explicitly allowed when the three core contracts are met:

| Violation | Allowed when |
|---|---|
| Body copy at display scale | It is the intended entry point and nothing else competes |
| Heading rendered lighter than body | Intentional visual inversion with intact information flow |
| Zero scale contrast between levels | Hierarchy is carried entirely by spacing or tracking |
| No heading-level element visible | Hierarchy is emergent from layout/spacing alone |
| Primary-level spacing applied to secondary element | Creates deliberate tension while maintaining information flow |

**"Information flow remains intact" safeguards:**
- DOM/reading order still matches content meaning (no layout inversion breaks narrative)
- Proximity groups the inverted element with its parent/context
- Only one primary exists in the visual region (no competing co-primaries)
- A quick scan can identify entry point / support / incidental roles without rereading

---

#### Spacing as hierarchy

Spacing is a full hierarchy vector. A typographic level can be elevated
entirely through surrounding whitespace without changing its size or weight.

Rules:
- Space above an element signals its relationship to what came before.
- Space below an element signals its relationship to what follows.
- An isolated element with large surrounding space reads as display-level
  regardless of its font size.
- Uniform spacing between all elements destroys spatial hierarchy.

---

#### Three-level working model

Most surfaces can be mapped to three functional levels:

| Level | Role | Typical vectors |
|---|---|---|
| **Primary** | Entry point. One at a time per visual region; long-form surfaces may re-establish at intentional pacing resets. | Scale, spacing, or alignment break |
| **Secondary** | Structure. Subdivides or supports primary. | Weight, scale step, or tracking shift |
| **Tertiary** | Incidental. Labels, captions, metadata. | Scale reduction, weight reduction, or positive tracking |

More than three visible levels above the fold is usually a composition problem,
not a hierarchy opportunity. Collapse or demote before adding a fourth level.

**Long-form surfaces:** May re-establish a primary at intentional pacing resets
(e.g. a new section with its own headline and breathing room). Never maintain
two simultaneous primaries within the same visual region.

---

#### Anti-patterns

- **Graduated weight ladder** — regular → medium → semibold → bold → extrabold,
  each level one step heavier. Reads as a default scale, not authored hierarchy.
  Weight should jump, not step.
- **Uniform section spacing** — every section gap is the same value. No
  hierarchy information is carried by spacing. Vary it deliberately.
- **Heading as the only hierarchy vector** — the heading is large and bold;
  everything else is flat. The heading does all the work. This is a sign
  that spacing and tracking are not being used as vectors.
- **Symmetrical emphasis** — two elements receive equal visual weight as
  co-primaries. Pick one. The other becomes secondary.
- **Size-only hierarchy** — all contrast is in font size alone. Weight,
  spacing, tracking, and alignment are uniform across levels. Fragile —
  any layout constraint that collapses the size contrast destroys the hierarchy.

---

#### Lint

- [ ] One element is unambiguously dominant above the fold.
- [ ] At least two hierarchy vectors are active on the dominant element.
- [ ] No two adjacent levels share the same scale, weight, AND spacing.
- [ ] Spacing between levels varies — at least one gap is ≥1.5× the others or
      represents one typographic scale step (e.g. one token unit like `gap-md` vs `gap-sm`). (guidance)
- [ ] Semantic/visual role inversions remain structurally readable.
- [ ] Flat hierarchy: scale steps between levels are ≥1.25× apart OR compensated by a weight or spacing jump. (guidance)
- [ ] Noise hierarchy: no more than one element reads as primary above the fold.


## color

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/craft/color.md

### Color craft rules

Universal color rules applied on top of the active `DESIGN.md`. The
design system supplies the palette tokens; this file enforces how to
*use* them.

> Adapted from [refero_skill](https://github.com/referodesign/refero_skill)
> (MIT). All examples reference OpenDesign's standard tokens
> (`--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent`).

#### Palette structure

A coherent palette has four layers. Plan all four before writing any CSS.

| Layer | Share of pixels | Tokens |
|---|---|---|
| **Neutrals** | 70–90% | `--bg`, `--surface`, `--fg`, `--muted`, `--border` |
| **Accent** (one) | 5–10% | `--accent` only — never invent a second accent |
| **Semantic** | 0–5% | `--success`, `--warn`, `--danger` |
| **Effect** | <1% | gradients, glows; rarely justified |

#### Accent discipline

The single biggest readability failure in AI-generated UIs is accent
overuse. Hard caps:

- **At most 2 visible uses of `--accent` per screen.** Typical pair:
  one eyebrow / chip + one primary CTA. Or one accent card + one tab
  pill. Pick a pair, not a flood.
- Links count as accent; demote to `--fg` underline if you also have a
  CTA on the same screen.
- Hover/focus rings count as accent. Ration accordingly.

#### Contrast minimums

Run these as gates, not goals:

| Pair | Minimum |
|---|---|
| Body text (≤16 px) on background | **4.5:1** |
| Large text (>18 px or 14 px bold) | **3:1** |
| UI components against adjacent surfaces | **3:1** |

When the brand color clashes (low-contrast indigo on light background is
common), darken the accent to a `600`-level shade for text use; reserve
the brand-bright variant for fills only.

#### Dark themes

Avoid pure black and pure white — both cause vibration and eye strain.

| Token | Dark theme | Light theme |
|---|---|---|
| Background | `#0f0f0f` (not `#000`) | `#fafafa` (not `#fff`) |
| Foreground | `#f0f0f0` (not `#fff`) | `#111111` (not `#000`) |

On dark surfaces, prefer **semi-transparent white borders** over solid
dark borders — a 1px `rgba(255,255,255,0.08)` reads as structure
without adding visual noise.

#### Semantic color naming

Always name tokens by **purpose**, never by hue:

```css
/* good */
--accent: #2f6feb;
--success: #17a34a;

/* bad — locks you out of theming */
--blue-500: #2f6feb;
--green-500: #17a34a;
```

#### Anti-defaults

- **Indigo `#6366f1`** (Tailwind `indigo-500`) is the most reliable
  AI-slop tell. The active `DESIGN.md` provides `--accent`; use it. If
  the brief truly needs indigo, make the user say so explicitly. If
  your `DESIGN.md` encodes indigo as `--accent`, that is intentional —
  the linter only flags hardcoded hex, so `var(--accent)` uses are
  unaffected even when the resolved color happens to be `#6366f1`.
- **Two-stop "trust" gradient** (purple → blue, blue → cyan, etc.) on a
  hero is the second most reliable tell. A flat surface + one
  type-driven hierarchy beats it every time.
- **Decorative gradients with no functional purpose**. Gradients should
  separate hierarchies (header → body, primary CTA → secondary), not
  decorate empty space.


## state-coverage

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/craft/state-coverage.md

### State coverage craft rules

Universal rules for what every interactive surface must render. The active
`DESIGN.md` decides how each state looks; this file decides which states must
exist and what they must contain. The single most reliable AI-design failure
is shipping only the populated state.

> Distilled from WCAG 2.2, NN/g, Material Design 3, Apple HIG, and Baymard
> Institute checkout research.

#### The five required states

Every surface that fetches, transforms, or accepts data must render all five.

| State | Triggered when | Must contain |
|---|---|---|
| **Loading** | Data is in flight | Skeleton, spinner, or shell — plus a 15 s "taking longer than expected" fallback |
| **Empty** | No records yet, or query returned nothing | Headline, plain explanation, primary CTA |
| **Error** | Fetch failed, server failure, validation rejection | Plain-language cause, recovery action, preserved user input |
| **Populated** | Data present, primary case | The state the design was actually drawn for |
| **Edge** | Extreme volume, long strings, missing optional fields, RTL or long-word content, partial network | Layout that does not break |

Render-and-screenshot test: every list, table, card, form, and panel in the
artifact has all five. Missing states are the most common silent failure of
AI-generated UI.

**Test matrix.** Concrete edge scenarios the surface must survive:

| Skill type | Edge scenario |
|---|---|
| Dashboard / table | 10,000+ rows, all numeric columns, sort + filter applied |
| Mobile card / list | 200-char title, missing avatar, missing secondary CTA |
| Form | All optional fields empty, all required fields at max length |
| Search results | Single-character query, query with only special chars, 1,000+ result count |
| Detail view | Missing all optional metadata, RTL primary content with LTR embeds |

#### Form-specific states

Forms add three states on top of the five.

| State | Triggered when | Behavior |
|---|---|---|
| **Untouched** | Field has not yet had focus | Default styling; no validation messages |
| **Dirty (valid)** | User typed and field passes validation | Persistent helper text remains; no success-coloring |
| **Submitted-pending** | Submit clicked, awaiting server | Submit button enters loading state; fields lock against re-submission |

Validation timing: validate **on blur**, not on first keystroke. For password
and similar live fields, validate on each keystroke *only after the first
blur*. Remove the error message the instant input becomes valid.

#### Empty state composition

Empty is not the absence of state. It is its own state with a job.

- **First-use empty** — illustration + headline + value sentence + primary CTA. The empty is the onboarding moment.
- **No-results empty** — echo the query, suggest alternatives, never leave a true blank.
- **Cleared empty** — celebratory phrasing, optional next-action.
- **Error-as-empty** — never. An error is its own state with recovery information; do not collapse error into empty.

**Server-driven vs client-driven.** When a search or query API can return fallback content in the empty payload (suggestions, related categories, popular results), prefer that over a client-side echo. Algolia, Elastic, and most modern search backends support this — the server has more context for what "no results, but maybe try X" should mean.

#### Error state composition

Every error must answer three questions, in this order:

1. **What happened.** "Your card was declined." Not "Something went wrong."
2. **Why, if knowable.** "Insufficient funds." Or "Network unreachable — check your connection."
3. **What the user can do.** A retry button, an alternative path, or a support link.

Preserve user input across the error. The form must not clear on submit
failure.

Severity tiers:

- **Field-level** — red border, inline message, focus moves to the field.
- **Form-level** — error summary banner at top + per-field markers.
- **Section-level** — inline panel with retry, surrounding sections still functional.
- **Page-level** — full error state with illustration and recovery CTA.
- **App-level** — persistent banner or modal for critical loss-of-functionality.

Match severity to surface scope. A field validation failure does not warrant
a page-level error.

**Retry discipline.** A retry surface is not a button alone. It has timing rules:

- First retry fires immediately on user click.
- Second and third retries use exponential backoff: 2 s, 4 s, 8 s max.
- After 3 failed retries, replace "Retry" with "Contact support" plus a copyable error ID. The user has done their job; the system now needs a human.
- Show "Last attempted: Xs ago" on the error surface after the first retry, so the user knows how stale the failure is.

#### Loading state thresholds

Pick the indicator by expected duration, not by what's available in the
component library.

| Duration | Indicator |
|---|---|
| 0–300 ms | None. Render synchronously; users perceive no delay. |
| 300 ms – 2 s | Subtle spinner or skeleton. |
| 2 – 10 s | Skeleton matched to expected layout, or labelled spinner ("Loading payments…"). |
| 10 – 30 s | Determinate progress bar with cancel option. |
| 30 – 60 s | Progress bar with explicit cancel affordance. The "taking longer than expected" notice already appeared at 15 s; do not repeat it. |
| 60 s+ | Stop animation. Show error with retry, cancel, or continue. |

Never leave a spinner running indefinitely. Start a timeout on every request.

#### ARIA and focus rules

State changes must be announced and focused correctly.

| Change | ARIA | Focus action |
|---|---|---|
| Inline error on submit | `role="alert"` on the message | Move focus to first error field |
| Toast / non-urgent confirmation | `role="status"` (polite live region) | Do not move focus |
| Critical error or destructive confirmation | `role="alertdialog"` (assertive) | Move focus to dialog |
| Loading begins | `role="status"` announcement ("Loading…") | Do not move focus to spinner |
| Loading ends, content appears | — | Move focus to loaded content if action was user-initiated |

Live region containers must exist in the DOM before content is injected.
Adding `aria-live` simultaneously with content does not trigger an
announcement.

#### Common mistakes (lint these)

- Surface renders only the populated state; loading, empty, error, and edge are absent.
- Empty state is a literal blank or "No data" text with no headline, explanation, or action.
- Error message reads "Something went wrong" with no cause or recovery.
- Spinner with no timeout; runs indefinitely on slow or failed requests.
- Submit clears form fields on validation failure, forcing re-entry.
- Inline validation fires on first keystroke instead of on blur.
- Full-page loading replaces the chrome when only one section is fetching.
- Toast appears at a different screen position than previous toasts in the same artifact.
- Color alone conveys error state — no icon, no text label.
- Auto-dismissing toast cannot be paused on hover or focus (WCAG SC 2.2.1).


## accessibility-baseline

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/craft/accessibility-baseline.md

### Accessibility baseline craft rules

Universal rules for the legal floor of accessibility plus the craft
commitments that go beyond it. The active `DESIGN.md` decides brand
appearance; this file decides which rules an artifact has to clear
before it ships.

> Grounded in primary sources: WCAG 2.2 Understanding pages,
> ISO/IEC 40500:2025, ADA Title II 2024 + 2026 IFR, EN 301 549 v3.2.1,
> WAI-ARIA 1.3 + AccName 1.2 + Core AAM 1.2, WebAIM Million 2026
> (February 2026 crawl), A11yn (arXiv 2510.13914), APCA W3C silver
> branch.

#### Prior art and scope

Existing OSS a11y guidance for AI agents (`fecarrico/A11Y.md`,
`awesome-copilot agents/accessibility.agent.md`,
`Community-Access/accessibility-agents`) tends to inline a checklist of
WCAG SCs without versioning the legal floor or specifying which
constraints survive on iOS / Android / Flutter. This file scopes
narrower: the compliance floor an OD artifact must clear, with
jurisdiction notes and native-mobile parity. Heuristic rules and
linter-checked items live in sibling craft files
(`anti-ai-slop.md`, `state-coverage.md`); WCAG SC numbers map to
specific rules below rather than being re-listed.

#### The legal floor changes by jurisdiction

- **EU (EAA, enforcement live 2025-06-28):** EN 301 549 v3.2.1 is the OJ-cited harmonised standard; it references **WCAG 2.1 AA**. EN 301 549 v4.1.1 (which incorporates WCAG 2.2's nine new SCs) is OJ-citation-targeted late 2026 / 2027. Until then, EAA references WCAG 2.1. The Web Accessibility Directive (WAD, EU 2016/2102) covers public-sector bodies separately and also points at EN 301 549.
- **US public sector — ADA Title II 2024 final rule:** **WCAG 2.1 AA**. The 2026-04-20 IFR slipped deadlines: 2027-04-26 for jurisdictions with population ≥ 50,000; 2028-04-26 for sub-50,000 and special districts.
- **US federal procurement — Section 508 (Revised 508 Standards):** harmonised with EN 301 549 → references **WCAG 2.0 AA** in the current published rev. The Access Board has WCAG 2.x updates in flight; until they ship, federal IT procurement floor is WCAG 2.0.
- **US private sector — ADA Title III:** no federal regulation specifies a technical standard. Settlements and DOJ guidance routinely cite **WCAG 2.1 AA** as the de-facto target, but the legal mechanism is case-by-case, not rule-based.
- **ISO/IEC 40500:2025** (October 2025) ratified WCAG 2.2 verbatim. Does not by itself change EU or US legal floors.

**Practical rule for craft:** target **WCAG 2.2 AA** as the working
ceiling. It clears the WCAG 2.1 AA legal floor in both jurisdictions
and prepares for v4.1.1. Anything below 2.2 AA is craft debt.

#### Color contrast

| Pair | WCAG 2.x AA minimum |
|---|---|
| Normal text below 18 pt regular / 14 pt bold (covers most body and UI text) | 4.5:1 |
| Large text (≥18 *pt* regular ≈24 px, or ≥14 *pt* bold ≈18.5 px) | 3:1 |
| Non-text UI components and graphical objects | 3:1 |
| Focus indicator vs adjacent and unfocused state | 3:1 |

Thresholds are **inclusive** — exactly 4.5:1 or 3:1 passes. Don't round
up: 2.999:1 fails because rounding is not a permitted mechanism.

"Large text" means **18 pt** regular, not 18 px. 18 px regular needs
4.5:1; 14 pt bold (≈18.5 px) qualifies for 3:1, 14 px bold does not.

**APCA as a parallel design check.** APCA's Lc value catches font-weight
and stem-thickness effects that WCAG 2.x luminance ratios miss. Body
copy at Lc ≥60 is a reasonable parallel pass; APCA's actual lookup
table is size- and weight-dependent (heavier weights at larger sizes
clear at lower Lc, thin small text needs Lc ≥75+). APCA is not part
of WCAG, EN 301 549, ADA, or Section 508 compliance as of 2026-05 —
keep WCAG 2.2 AA as the compliance floor and treat APCA as
design-review only. If you ship APCA tooling, use the `apca-w3`
package; the SAPC repo is non-commercial.

#### Touch targets

| Bar | SC | Size |
|---|---|---|
| AA (legal floor) | 2.5.8 Target Size (Minimum) | **24×24 CSS px** |
| AAA (craft commitment) | 2.5.5 Target Size (Enhanced) | 44×44 CSS px |
| iOS HIG | — | 44×44 pt |
| Material 3 | — | 48×48 dp |

WCAG 2.5.8 lists five exceptions where the 24×24 minimum doesn't
apply: **Spacing** (a 24-CSS-px exclusion circle around the target
doesn't intersect adjacent ones), **Equivalent** (an alternative
control of sufficient size achieves the same function), **Inline**
(target sits inside a sentence, e.g. links in body copy), **User
agent control** (browser default like a native scrollbar), and
**Essential** (the smaller size is required to convey information,
e.g. a map pin). The Spacing exception is the one icon-button
toolbars rely on; the others are narrower than they read and
shouldn't be used to justify undersized primary actions.

#### Focus visibility

Removing the focus outline via CSS is a **triple failure**: 1.4.11
Non-text Contrast, 2.4.7 Focus Visible, and 2.4.13 Focus Appearance
(AAA). Use `:focus-visible` for keyboard users; suppress the outline
for mouse clicks only when an alternative non-color affordance exists.

For AAA (2.4.13): indicator area must equal at least a 2 CSS px
perimeter of the component, contrast ≥3:1 between focused and
unfocused states. A 1-px outline at 3:1 doesn't qualify.

#### Form input labels

WebAIM Million 2026 (which uses WAVE, not axe-core): **51% of top 1M
home pages have at least one missing form-input label; 33.1% of all
6.9M inputs are unlabeled**. The page-level rate moved from 48.2%
(2025) to 51% (2026) — missing-label prevalence is one of the few
categories WebAIM explicitly calls out as rising in 2026, against an
overall errors-per-page count of 56.1.

Default form-error wiring (WCAG 2.2 + ARIA APG):

```html
<label for="email">Email</label>
<input id="email" type="email" required
       aria-describedby="email-hint email-error"
       aria-invalid="true">
<span id="email-hint">Used for receipts only.</span>
<span id="email-error" role="alert">Email must include @ and a domain.</span>
```

`aria-describedby` is the production default; `aria-errormessage` has
incomplete screen-reader support as of 2026-05 (full on NVDA, partial
on JAWS / VoiceOver / TalkBack) — treat as progressive enhancement.

WCAG 3.3.7 Redundant Entry is **Level A** (legal floor). Re-asking for
data the user already entered "in the same process" fails unless the
site auto-populates or offers a selectable shortcut. Browser autofill
does not satisfy it.

#### Keyboard operability and semantic structure

Visual contrast and labelled inputs don't matter if a keyboard or
screen-reader user can't reach the control or parse the page. The
bullets below are Level A / AA WCAG essentials plus a small set of
structural conventions OD treats as craft commitments. WCAG levels
are noted per item.

- **Tab reachability** (2.1.1 Keyboard, Level A): every interactive element must be reachable and operable via keyboard. `tabindex="-1"` removes from the tab order; `tabindex` values >0 break document order and should not be used. (2.1.3 No Exception extends 2.1.1 to AAA by removing the underlying-function exception.)
- **Activation keys** (2.1.1, Level A): `<button>` activates on Enter and Space; `<a href="…">` activates on Enter. A bare `<a>` without `href` is not a link, not focusable, and not keyboard-operable — use `<a href="…">` for navigation or `<button>` for actions, never a placeholder anchor. Custom controls must implement the matching key handlers and `role`.
- **No keyboard trap** (2.1.2, Level A): focus must be able to leave any component via the same standard keys it entered with. Modal dialogs are a focus-trap *by design*, not a violation — they trap until dismissed by Escape or the close button.
- **Focus order** (2.4.3, Level A): tab order must follow the meaningful reading order. Don't rely on positive `tabindex` to fix DOM that's out of order; fix the DOM.
- **Native control first** (craft convention, anchored on 4.1.2 Name/Role/Value Level A): a `<button>` is keyboard-operable, focusable, name-resolvable, and announced as a button by every AT for free. `<div role="button" tabindex="0">` requires you to re-implement all of that and most reimplementations miss `aria-pressed`, disabled state, or Space-on-keyup. Reach for ARIA only when no native element fits.
- **Document language** (3.1.1, Level A): `<html lang="...">` is required. Sub-tree language switches use `lang` on the inner element.
- **Heading hierarchy** (1.3.1 Info and Relationships Level A; 2.4.6 Headings and Labels Level AA): WCAG requires programmatically-determined structure and descriptive headings, not a specific outline shape. OD craft convention layers on: prefer one `<h1>` per page and don't skip levels (`<h1>` → `<h3>` without `<h2>`). Visual size and heading level are independent.
- **Landmarks** (1.3.1, 2.4.1 Bypass Blocks Level A): use `<header>` `<nav>` `<main>` `<aside>` `<footer>` rather than `<div role="banner">` etc. AT users navigate by landmark; a page with no landmarks is a wall of divs.
- **Text alternatives** (1.1.1 Non-text Content, Level A): `<img alt="...">` for content images, `alt=""` for decorative; `aria-label` on icon-only buttons; long-form description for charts and SVG data viz. A chart without a text alternative is unreadable to a screen reader.

#### ARIA discipline

WebAIM Million 2026 shows ARIA pages average **59.1 errors** vs
**42** on non-ARIA pages — about 17 extra errors on the ARIA side.
The gap was 30 in 2025 (57 vs 27) and 15 in 2024; YoY direction is
noisy, but ARIA usage is up (82.7% of home pages in 2026 vs 79.4% in
2025) while correctness lags. ARIA deployment outpaces ARIA
correctness.

Decision order, per ARIA APG:

1. Native HTML element with the right semantics.
2. Native element under custom visuals if restyling is required.
3. APG pattern verbatim if neither fits.
4. Closest APG pattern + documented deviation. Last resort.

Never invent ARIA.

#### Reduced motion and flashing

See `animation-discipline.md` for the full rule set. The non-negotiable
that anchors here: WCAG 2.3.1 (Level A) — flashing more than three
times per one-second period is non-conformant unless the flash area
stays below the general and red flash thresholds. Photosensitive
epilepsy is the protected concern.

#### Native mobile parity

Web ARIA does not auto-translate. Each platform has its own labelling API.

| Platform | Label | Role |
|---|---|---|
| iOS UIKit | `accessibilityLabel` | `accessibilityTraits` |
| iOS SwiftUI | `.accessibilityLabel(…)` | `.accessibilityAddTraits(.isButton)` |
| Android Compose | `Modifier.semantics { contentDescription = … }` | `Modifier.semantics { role = Role.Button }` |
| Flutter | `Semantics(label: …)` | `Semantics(button: true, …)` |
| React Native | `accessibilityLabel` | `accessibilityRole` |

Use the platform API for each target. AI-generated mobile UI that
mirrors web ARIA verbatim usually misses the platform-native screen
reader path.

#### Common mistakes (lint these)

- "Target Size 44×44" cited as the AA bar. 44×44 is **AAA** (2.5.5). AA is **24×24** (2.5.8).
- "18 px = large text" — wrong. Threshold is 18 *pt* regular (~24 px) or 14 pt bold (~18.5 px).
- "EAA = WCAG 2.2 AA" — wrong. EN 301 549 v3.2.1 is anchored to WCAG 2.1.
- "Section 508 = WCAG 2.1 AA" — wrong as of 2026-05. Revised 508 still references WCAG 2.0 AA; the Access Board update is in flight, not shipped.
- "Tabindex fixes focus order" — `tabindex` >0 reorders against DOM and almost always makes it worse. Fix the DOM.
- "Modal traps focus → keyboard trap" — confusing 2.1.2. A modal trapping focus until Escape / close is correct behaviour, not a violation.
- "Heading size = heading level" — visual hierarchy and `<h1>`/`<h2>`/`<h3>` are independent. Style the level you mean.
- "WebAIM Million uses axe-core" — uses WAVE.
- "WCAG 3 will use APCA" — APCA was dropped from WCAG 3 in July 2023.
- "Adding ARIA improves accessibility" — empirically the opposite. WebAIM Million 2026: ARIA pages average 59.1 errors, non-ARIA pages 42.
- "Bare `<a>` with click handler is a link" — wrong. `<a>` without `href` is not focusable, not keyboard-operable, and not a link. Use `<a href="…">` for navigation, `<button>` for actions.
- Removing the focus outline via `outline: none` without a replacement. Triple failure: 1.4.11, 2.4.7, 2.4.13.
- Placeholder text as the only label for a form input. Fails 1.3.1 and 3.3.2; placeholder disappears on input.
- Using `aria-description` as the sole state-carrier on `role="row"`. JAWS 2025/2026 silently drops it ([FreedomScientific standards-support #927](https://github.com/FreedomScientific/standards-support/issues/927)).
- Native HTML `<button>` reimplemented as `<div role="button">` without keyboard handling, focus, or `aria-pressed`.
- A11y treated as web-only. Flutter / iOS / Android have their own labelling APIs that web ARIA doesn't reach.


## animation-discipline

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/craft/animation-discipline.md

### Animation discipline craft rules

Universal rules for when motion earns its place in a UI and what numbers
constrain it. The active `DESIGN.md` decides brand-specific motion
personality; this file decides whether motion should run at all and at
what duration, easing, and accessibility floor.

> Grounded in primary sources: Tversky/Morrison/Bétrancourt 2002
> (IJHCS), Heer & Robertson TVCG 2007, Harrison/Yeo/Hudson CHI 2010,
> Doherty & Thadani IBM Systems Journal 1982, Chang & Ungar UIST 1993,
> Material 3 motion tokens, IBM `@carbon/motion`, Apple SwiftUI
> Animation API, W3C View Transitions, WCAG 2.2.2 + 2.3.3, WebKit's
> 2017 `prefers-reduced-motion` rationale.

#### When motion earns its place

Tversky/Morrison/Bétrancourt's 2002 meta-analysis (IJHCS 57, pp. 247-262)
found that every study claiming animation aids comprehension had a
broken control — the static version had less information, different
procedures, or hidden interactivity. When equalised, animation does
**not** beat static for teaching complex systems. The single use case
the paper endorses is real-time spatial or temporal reorientation:
page transitions, container morphs, viewpoint changes, progress
indicators (p. 257).

A follow-on hazard: Palmiter & Elkerton found animation-trained users
*declined* one week after training, while text-trained users *improved*
(Tversky 2002, p. 255). Animation's apparent short-term parity hides
worse retention.

So animate when the user is moving through space, time, or state —
navigation, container expansion, progress feedback, gesture
follow-through. Don't animate to teach, decorate, signal "premium",
or fill silence.

#### Duration thresholds

The cross-design-system convergence is **150 ms** — Material 3 `short3`,
IBM Carbon `moderate-01`, Shopify Polaris `150`, Tailwind default,
SLDS `duration-fast` all land here. Use it as the default duration for
state-confirmation feedback.

| Duration | Use |
|---|---|
| 50–100 ms | Instant feedback (button press, toggle commit, hover) |
| 150 ms | Default for state-confirmation |
| 200–300 ms | Entering UI (modals, sheets, dropdowns) |
| 300–500 ms | Cross-screen transitions, container morphs |
| > 500 ms | Reserved for cross-screen, staged, or platform-native transitions (e.g. M3 `long2`-`extraLong4`, Heer & Robertson 2007's per-stage recommendation). |

Non-navigation microinteractions — hover, press, toggle, validation,
chip selection, row expansion — should stay under 500 ms. Past that the
user notices the motion as motion and waits on the UI rather than
working through it. Two qualifications: frequent animations (a hover
effect seen 50 times per session) need to stay ≤200 ms; mobile
animations should run 20–30% shorter than desktop equivalents because
travel distances are shorter.

#### Curve vs spring

Use a curve for opacity, color, and any property that changes value
between two known points. Use a spring for position, scale, rotation,
and gesture-driven motion — anything that should feel physical.

Material 3 standard easing is `cubic-bezier(0.2, 0, 0, 1)` — front-loaded;
the trailing zero makes the curve hit its target instantly and settle.
M2 standard was the symmetric `cubic-bezier(0.4, 0, 0.2, 1)`, preserved
in M3 under the name `legacy`. Anyone shipping the M2 curve and calling
it "M3" is on legacy tokens. M3 `emphasized` is a **two-segment Bézier
path**, not a single cubic-bezier; single-cubic approximations silently
lose the front-loaded character. CSS `linear()` (Chrome 113+) is the
only way to replicate it on a single property.

Apple's published SwiftUI default spring is
`(response: 0.5, dampingFraction: 0.825, blendDuration: 0)`. The widely
cited `.snappy = 0.25 s, .smooth = 0.35 s` numbers are wrong — Apple's
docs assign all three presets a 0.5 s base, differing only in bounce
(0 / 0.15 / 0.3).

Spring framework defaults disagree. motion.dev's physics-mode default
is ζ ≈ 0.5 (bouncy). React Spring's `default` is ζ = 0.997 (critically
damped). Same word "default", opposite feel — React Spring's `wobbly`
is the actual feel-equivalent of motion.dev's `default`. Pick
consciously.

#### Reduced motion

Every animation that translates, scales, rotates, or parallaxes must
respect `@media (prefers-reduced-motion: reduce)`. WebKit shipped this
in 2017 to address vestibular triggers; the W3C MQ5 spec lets the UA
or author **strip motion entirely or substitute static imagery** —
the spec does not mandate which.

Working rule: strip motion-on-an-axis (translate, scale, rotate,
parallax). Keep opacity/color crossfades as substitutes when a state
change still needs to be conveyed. Be explicit — the View Transitions
API does **not** apply `prefers-reduced-motion` automatically; the
author must add a query override on the pseudo-elements or skip
`startViewTransition` entirely.

WCAG calibration: 2.2.2 (Pause/Stop/Hide) is Level A — the legal floor
under ADA Title II 2024 / EN 301 549 / EAA — but it names cognitive,
attentional, and reading populations, not vestibular. Vestibular
language lives in 2.3.3, which is **AAA**. Don't conflate the two.
Building for vestibular users is a craft commitment beyond the legal
floor, not a WCAG mandate.

**Flashing limits.** WCAG 2.3.1 (Level A) permits flashing only when
there are no more than three flashes within any one-second period, or
the flashing area stays below the general and red flash thresholds.
WCAG 2.3.2 (AAA) forbids flashing more than three times within any
one-second period, regardless of area or brightness. The protected
concern is photosensitive epilepsy; the legal floor isn't negotiable. For gamified UI, onboarding celebrations, sparkles,
confetti, level-up bursts, and shimmer: avoid rapid flashing unless
tested against the thresholds, and prefer one-shot animations over
loops.

#### Repeated and ambient motion

The rules above target one-shot transitions. Looping motion (skeleton
shimmer, idle backgrounds, autoplay, reward bursts) has different
constraints.

- Cap iteration count: carousels at 3-5 cycles then pause; skeleton shimmer until content lands, never indefinitely.
- WCAG 2.2.2 (Level A) requires a pause control for any motion running longer than 5 seconds — moving, blinking, or scrolling content, not only video.
- Cancel ambient motion on route change.
- Reward animations are one-shot. Confetti, sparkles, level-up bursts fire once and dismiss; no looping timer.
- Spinners must not run indefinitely. Escalate to progress/cancel states and stop animation at 60 s, matching `state-coverage.md`.

#### Cross-platform handoff

Native conventions diverge.

- **iOS** uses spring physics with perceptual `(response, dampingFraction)` parameters. Apple HIG documents principles, not numerical curves; the SwiftUI Animation API JSON is the source for actual numbers. UIView curve cubic-beziers commonly cited online are reverse-engineered, not Apple-published.
- **Android** uses cubic-bezier curves through M3 motion tokens (50–1000 ms range, 16 named durations). Predictive back is a *gesture-progress primitive*, not a transition primitive — `BackEvent.progress` is sampled per-frame from the touch stream and the destination is rendered behind the current surface while still on it. Cancellation is a first-class lifecycle state.
- **Web** has the View Transitions API (default 0.25 s, no easing specified by the spec — falls through to CSS `ease`). Same-document support 90.94%; cross-document 87.82%. Cross-document is same-origin and user-initiated only.

A "one curve fits all platforms" approach loses on each. If the brief
specifies platform fidelity, follow the platform; if it specifies brand
consistency, pick one motion vocabulary and apply it everywhere.

#### Common mistakes (lint these)

- "Skeleton screens feel 11% faster" — Harrison/Yeo/Hudson CHI 2010 measured *backwards-decelerating ribbed determinate progress bars* (n=16). The induced-motion mechanism doesn't transfer to skeletons.
- "Heer & Robertson recommend 300–1000 ms eased transitions" — they tested 1.25 s and 2 s only. Their recommendation is "~1 second per stage".
- "Doherty Threshold = 400 ms" — the 1982 paper does not contain "400". The lowest threshold actually measured is 300 ms.
- M2 standard easing `cubic-bezier(0.4, 0, 0.2, 1)` labelled as "Material 3". M3's standard is `cubic-bezier(0.2, 0, 0, 1)`.
- Animations that *perform* a state change rather than *confirming* one that has already happened. Optimistic UI first; motion second.
- More than 500 ms on any non-cross-screen transition.
- Animation as the only signal of state change. Reduced-motion users miss it; always pair with a static affordance (color, position, label).
- Ignoring `prefers-reduced-motion` on transform-based animations — the highest-cost vestibular triggers.
- Curve-based animation on a `transform: scale()` that should feel physical. Use a spring.
- Hero choreography in productivity tools. Motion budget belongs inside the product on functional micro-feedback, not on landing-page sequences.
- Decorative motion in the working canvas of a productivity tool.


## laws-of-ux

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/craft/laws-of-ux.md

### Laws of UX craft rules

Universal cognitive, perceptual, and behavioral heuristics that decide
what a UI composes — how many pricing tiers fit on a screen, where a
primary action anchors in scanning order, when a progress indicator
earns its place, why a settings list needs grouping. The active
`DESIGN.md` decides brand visual language; the existing craft files
decide rendering rules (color, typography, motion, states, ARIA, RTL,
forms); this file decides composition rules grounded in named research.

> Distilled from primary sources: Hick (1952) + Hyman (1953), Miller
> (1956) for chunking / `7±2` channel capacity, Cowan (2001) for the
> modern ~4 working-memory bound, Fitts (1954), Wertheimer (1923) for
> proximity / similarity / Prägnanz, Palmer (1992) for Common Region,
> Palmer & Rock (1994) for Uniform Connectedness, Kahneman /
> Fredrickson / Schreiber / Redelmeier (1993) for Peak-End, Zeigarnik
> (1927), Csíkszentmihályi (1975), Hull (1932), von Restorff (1933),
> Broadbent (1958), Sweller (1988), Postel (RFC 760, 1980), Carroll &
> Rosson (1987), Tversky & Kahneman (1974) for Anchoring, Kurosu &
> Kashimura (1995), Iyengar & Lepper (2000), Toffler (1970), Pareto
> (c.1906) / Juran (*Quality Control Handbook*, 1951), Ebbinghaus
> (1885), Ockham (14th c.), Tesler at Apple (1980s), Nielsen (2000),
> Norman *POET* (1988), Parkinson (1955).

#### Prior art and scope

Existing public catalogs of UX heuristics (Yablonski's lawsofux.com,
NN/g's 10 usability heuristics, Material 3 motion + interaction
guidance, Apple HIG, Baymard Institute checkout research) inventory the
laws but rarely tie each one to a concrete code-gen directive. This
file does the translation: every entry ends with one actionable move
for an HTML / Tailwind / React-emitting agent. Sibling craft files
(`accessibility-baseline.md`, `state-coverage.md`, `typography.md`,
`anti-ai-slop.md`, `color.md`, `animation-discipline.md`,
`form-validation.md`) own the auto-checked rules; this file names the
underlying law and surfaces the folklore. Out of scope: Weber-Fechner
psychophysics and Signal Detection Theory — both apply to UI but the
prompt-emission directives are too narrow to earn a slot here. Add
later if a skill needs them.

The rules below are guidance, not auto-checked. Reviewers and the agent
apply them; the linter does not. Where a law has a sibling rule already
auto-checked elsewhere — touch-target floor in
`accessibility-baseline.md`, the 300 ms / 2 s / 10 s / 30 s / 60 s
loading thresholds in `state-coverage.md`, ALL CAPS letter-spacing in
`typography.md`, the indigo / gradient / emoji-icon list in
`anti-ai-slop.md` — the entry below cross-references rather than
duplicates.

#### Perception and visual grouping

Five Gestalt laws plus three attention-and-recognition laws govern how
the eye groups elements before the brain reads them.

- **Law of Proximity** (Wertheimer, 1923). Objects near each other read
  as a group. Cheapest grouping signal — cheaper than borders or shared
  color. Apply variable vertical rhythm: 8–12 px within a group,
  32–48 px between groups. Uniform spacing reads as nothing being
  grouped.
- **Law of Similarity** (Wertheimer, 1923). Visually similar elements
  read as a group. Equivalent affordances must share treatment — every
  list row identical class set, every secondary button identical, every
  destructive action identical. Visible deviation is reserved for the
  one item meant to draw attention (the recommended pricing tier, the
  selected nav item).
- **Law of Common Region** (Palmer, 1992). A shared bounded area binds
  enclosed elements. Use enclosure when proximity is not enough — and
  reserve it. Concrete numbers: padding ≥16 px inside the region,
  distinct surface (border + tinted background, or card chrome at
  ≥1 px hairline). A page where every section is bordered destroys the
  signal.
- **Law of Prägnanz / Good Figure** (Wertheimer, 1923). The eye
  resolves complex layouts into the simplest underlying form. Designs
  that align with a clear underlying grid (12-column, F-pattern,
  4-quadrant) feel inevitable; ornate breaks that add nothing semantic
  feel arbitrary.
- **Law of Uniform Connectedness** (Palmer & Rock, 1994). The
  strongest grouping signal in the Gestalt hierarchy: connected lines,
  shared toolbars, or bracketing containers tie items together more
  strongly than proximity or similarity. Use for wizard steps,
  comparison sets, and explicit navigation flows.
- **Selective Attention** (Broadbent, *Perception and Communication*,
  1958). Cognitive bandwidth is finite. Users filter aggressively and
  ignore anything that looks irrelevant to their goal — banner blindness
  comes from this. Reserve the strongest visual contrast for the single
  goal-relevant action; let supporting content recede in weight.
- **Von Restorff Effect** (von Restorff, 1933). The item that differs
  from a uniform field is the one most likely to be remembered. Make
  the recommended pricing tier, the active nav item, the warning state
  visually distinct. Pair contrast with a non-color signal (icon, text
  label, position) — `accessibility-baseline.md` rules out color-alone
  signaling.
- **Aesthetic-Usability Effect** (Kurosu & Kashimura, Hitachi Design
  Center, 1995). Visual polish biases perceived usability. Refined
  typography, generous whitespace, and a calm palette earn the benefit
  of the doubt for minor friction. Never substitutes for measurable
  usability or for `state-coverage.md`'s required-states rule.

#### Decision-making

Six laws govern how fast and how well users decide when an interface
offers a choice.

- **Hick's Law** (Hick, 1952; Hyman, 1953 replication). Decision time
  grows roughly log(n+1) with the number of equivalent options. Cap any
  single decision-screen to 3–5 visible primary options; collapse the
  rest behind a "More" / progressive disclosure pattern; visually
  distinguish the recommended choice. Aggressive truncation that hides
  the path forward is the opposite failure mode — surface the full
  option set, just don't render every option at the same visual weight.
- **Choice Overload** (Iyengar & Lepper, *Journal of Personality and
  Social Psychology*, 2000; framing dates to Toffler, *Future Shock*,
  1970). Too many roughly-equivalent options stall or abandon the
  decision. Pricing pages: 3–4 tiers, exactly one marked recommended.
  Product grids: 6–9 hero cards above the fold. Settings panels: ≤5
  named groups. Never emit a flat wall of equivalents.
- **Anchoring** (Tversky & Kahneman, *Science* 185:1124–1131, 1974).
  The first number a user sees re-weights every subsequent number.
  Place the recommended pricing tier where it anchors the comparison;
  render yearly-billing savings as concrete dollar deltas, not just
  percentage badges; pre-select the safer default in radio groups.
  Visual weight matches intended decision weight.
- **Pareto Principle / 80-20** (Pareto, c.1906; Juran, *Quality Control
  Handbook*, 1951 — popularized the management-application framing). A
  small share of features drives most of the value. Identify the 2–3 actions
  that drive the dominant journey for the target persona; emphasize
  those visually; demote the long tail to overflow menus, footer
  surfaces, or settings.
- **Tesler's Law / Conservation of Complexity** (Tesler, Apple, 1980s).
  Every product has an irreducible amount of complexity. The design
  choice is *where* it lives — engineering team, interface, user — not
  whether to eliminate it. When complexity reaches the user, surface
  contextual guidance (tooltips, smart defaults, inline empty-state
  coaching, progressive disclosure) at the exact step where it
  surfaces. Hiding it is not the same as removing it.
- **Occam's Razor** (Ockham, 14th c.). Among options that explain the
  data equally well, prefer the one with the fewest assumptions. Specify
  a minimal element inventory; forbid decorative chrome that doesn't
  serve a stated user task. The law constrains assumptions, not feature
  count — a "minimum viable" framing misreads it.

#### Memory and learning

Five laws cover how working memory handles information density and
what the user retains afterward.

- **Miller's Law and Chunking** (Miller, *The Magical Number Seven,
  Plus or Minus Two*, *Psychological Review*, 1956 — channel capacity /
  `7±2` and chunking; Cowan, *Behavioral and Brain Sciences* 24:1, 2001
  for the modern ~4-item working-memory bound). Working memory holds
  about four items reliably and up to seven for short-term recall. Each
  slot can hold a *larger familiar unit*, constrained by the user's
  domain knowledge — chunking does not let you pack arbitrary content
  into a single slot. Often misread as a rule about menu length;
  Miller's paper is about chunks. Group related fields with clear
  section headings, dividers, or card containers. A settings page with
  sections "Account / Notifications / Privacy / Billing / Danger zone"
  beats one flat list of 30 toggles.
- **Working Memory** (Baddeley & Hitch, 1974; lineage to Atkinson &
  Shiffrin, 1968). Items decay in seconds without rehearsal. Recognition
  beats recall: persisting prior context across screens, marking visited
  elements, and surfacing comparison views beats forcing the user to
  memorize. On dashboards specifically: sticky filter chips, last-N
  selections persisted, breadcrumbs that include applied filters.
- **Serial Position Effect** (Ebbinghaus, *Über das Gedächtnis*, 1885).
  Recall favors the extremes — primacy at the start, recency at the
  end — while middle items fade. Anchor the most important nav items at
  the leftmost and rightmost positions of a horizontal menu; cluster
  utilities in the middle.
- **Peak-End Rule** (Kahneman, Fredrickson, Schreiber, Redelmeier,
  *Psychological Science*, 1993). Memory of an experience is dominated
  by the emotional peak and the ending, not the average. Stage a
  high-effort celebratory success state; let intermediate steps stay
  calm. Mediocre middles matter less than a strong close. The peak
  belongs at the *end* of a flow, not as arbitrary mid-flow motion —
  `animation-discipline.md` rejects motion that performs (rather than
  confirms) a state change.
- **Zeigarnik Effect** (Zeigarnik, *Über das Behalten erledigter und
  unerledigter Handlungen*, 1927). Uncompleted tasks create cognitive
  tension that pulls the user back. Visible progress ("3 of 5 steps",
  greyed-out next sections) converts that tension into completion
  pressure. Reserve for genuinely beneficial flows like onboarding;
  applying the same lever to streaks, daily-quest counters, or notification-
  reduction nags is a dark pattern.

#### Interaction and motor

Five laws cover how fast and how accurately users can act on the UI.

- **Fitts's Law** (Fitts, *Journal of Experimental Psychology*, 1954).
  Time to acquire a target depends on its distance and size — bigger
  and closer is faster. Spacing between adjacent hit zones matters as
  much as size. Pair with `accessibility-baseline.md`'s 24 × 24 CSS px
  AA touch-target floor; on mobile, place high-frequency controls in
  the natural thumb arc.
- **Doherty Threshold** (Doherty & Thadani, *IBM Systems Journal*,
  1982). Sub-second feedback keeps users in flow; latency above ~1 s
  breaks attention. The implementable directive lives in
  `state-coverage.md`'s loading-threshold table (no indicator under
  300 ms; skeleton 300 ms – 2 s; labelled spinner 2 – 10 s; determinate
  bar with cancel 10 – 60 s; stop and offer error/retry past 60 s).
  This entry exists to name the underlying law and flag its folklore
  (the 400 ms number doesn't appear in the 1982 paper — see
  `animation-discipline.md` for the 400 ms folklore trace).
- **Flow** (Csíkszentmihályi, *Beyond Boredom and Anxiety*, 1975). Flow
  sits in the balance between challenge and skill — too hard breeds
  frustration, too easy breeds boredom. Continuous feedback and a clear
  sense of control keep the user inside the state. System friction and
  latency are the fastest ways to break it.
- **Goal-Gradient Effect** (Hull, *Psychological Review*, 1932; Kivetz,
  Urminsky, Zheng, 2006 for the punch-card replication). Motivation to
  finish rises as the goal gets closer. Multi-step flows render with a
  prominent progress indicator that reflects *real* endowed progress —
  show completed prerequisites when they truly exist (saved profile,
  imported team, prior survey answer). When no real prerequisite
  exists, render the current step honestly as `1 of N` with the
  empty/current-step state clearly marked. Hull's hypothesis is
  descriptive; treating it as license for fabricated progress, streak
  dark patterns, or loyalty-program quota inflation is a misread.
- **Postel's Law / Robustness Principle** (Postel, RFC 760, 1980). "Be
  liberal in what you accept, conservative in what you send." Take
  input in whatever shape users naturally give it (phone numbers with
  or without dashes, dates in mixed formats, percentages with or
  without `%`); normalize internally to a canonical form; emit one
  consistent format on output. The error-timing and ARIA-wiring half
  lives in `form-validation.md`; the input-tolerance half is the
  directive above. RFC 9413 (Thomson, IAB, 2023; built on the earlier
  `draft-iab-protocol-maintenance`) retracts the maxim for protocol
  design citing security surface; the UX-input application stands.

#### Behavior and expectation

Five laws cover what users predict and how that prediction interacts
with the rendered surface.

- **Jakob's Law** (Nielsen, Nielsen Norman Group, 2000). Users spend
  most of their time on other sites and expect yours to work the same.
  Reuse category convention — nav placement, cart icon, settings gear,
  primary CTA in the upper right of a SaaS landing — so the user spends
  zero cycles relearning interaction grammar. Novelty must earn its
  keep against the convention's ROI; "innovate everywhere" is the
  opposite failure mode.
- **Mental Model** (Craik, *The Nature of Explanation*, 1943; Norman,
  *POET / The Psychology of Everyday Things*, 1988). Every user
  arrives with a prior built from competitor products and the physical
  world. When the prediction holds, the product feels intuitive; when
  it breaks, friction shows up as confusion, not curiosity. When the
  brief names a reference product, anchor explicitly — capture the
  reference in the prompt and the agent inherits a transferable
  interaction grammar.
- **Paradox of the Active User** (Carroll & Rosson, in *Interfacing
  Thought: Cognitive Aspects of Human-Computer Interaction*, MIT Press,
  1987, pp. 80–111). Users skip the manual and start using the
  software immediately, even when reading it would speed them up. Bake
  guidance into the surface itself — empty-state coaching, inline
  tooltips, contextual hints — at the action point.
- **Parkinson's Law** (Parkinson, *The Economist*, 1955). Work expands
  to fill the time allotted to it. Loose interfaces let users dawdle;
  cut friction and pre-fill what you can — autofill, smart defaults,
  saved state — so a checkout finishes faster than the user expected.
  Beating anticipated duration becomes the felt win.
- **Cognitive Load** (Sweller, *Cognitive Science*, 1988). Total
  mental effort splits into intrinsic (the task's inherent difficulty)
  and extraneous (poor layout, jargon, inconsistent patterns, visual
  noise). Designers can't reduce intrinsic load; they own extraneous
  fully. The visual-restraint directives (single accent in `color.md`,
  three-weight typography rhythm in `typography.md`, P0 anti-default
  list in `anti-ai-slop.md`) already constrain extraneous load; this
  entry exists to name the cognitive cost the sibling rules reduce.

#### Common mistakes (lint these)

Folklore corrections that don't survive a primary-source check, in the
same vein as the busts already documented in `animation-discipline.md`
and `accessibility-baseline.md`. The first three are attribution
corrections (year / venue / institution) the body entries already
applied — restated here so a reviewer reading just this section sees
them. The remainder are folklore not addressed in the body.

- "Anchoring effect = Tversky & Kahneman 1972." Wrong year. The
  *Science* paper introducing the anchoring framing is 1974; the 1972
  paper is "Subjective probability: A judgment of representativeness"
  (different work).
- "Tesler's Law was developed at Xerox PARC." Tesler left PARC for
  Apple in 1980; the Conservation-of-Complexity formulation traces to
  his Apple years.
- "Paradox of the Active User was a CACM article." It's a chapter in
  Carroll's *Interfacing Thought* (MIT Press, 1987), not CACM.
- "Selective Attention = solved by red dots and badges." Repeated
  attention-grabbers train banner blindness. Reserve the strongest
  contrast for one goal-relevant action per surface.
- "Fitts's Law alone is enough for touch targets." Fitts gives the
  speed-accuracy tradeoff. WCAG 2.2 SC 2.5.8 sets the AA floor at
  24 × 24 CSS px (`accessibility-baseline.md`); iOS HIG suggests
  44 × 44 pt; Material 3 suggests 48 × 48 dp. Fitts plus the
  platform floor — never just Fitts.


## form-validation

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/craft/form-validation.md

### Form validation craft rules

Universal rules for form validation lifecycle, error wiring beyond the
accessibility baseline, and the schema-as-contract layer that makes
the same validation work on the server and the client. The active
`DESIGN.md` decides how the field looks; this file decides *when* the
field tells the user it's wrong, *how* the error reaches assistive
tech, and *where* the rule lives.

> Grounded in primary sources: WHATWG HTML Living Standard
> (Constraint Validation section under "Form control infrastructure"),
> CSS Selectors L4 (`:user-invalid`), WCAG 2.2 SC 3.3.x
> Understanding pages, ARIA APG forms patterns, Standard Schema spec
> (`@standard-schema/spec`), Baymard 2024 inline-validation research
> checkout-UX benchmark, WebAIM Million 2026 forms findings.

#### Prior art and scope

Existing OSS forms guidance for AI agents pins to one layer at a time
— `szilu/ux-designer-skill` is UX-opinion grade with no spec anchors,
`Community-Access/accessibility-agents/forms-specialist` is
WCAG-anchored but AT-only and doesn't reach the platform validity
layer or the schema contract. This file connects the four layers a
real form spans: **WHATWG Constraint Validation as the platform
floor, validation timing as a state machine on the input, WCAG 3.3.x
as the announcement and recovery contract, schema as the cross-stack
truth.** A11y wiring lives next door in `accessibility-baseline.md`
(label + describedby + invalid + `role="alert"` for inline errors);
this file picks up where that ends.

#### The input state machine

Every input passes through these states. The names trace back to RHF /
Formik vocabulary on web; the *shape* applies regardless of stack.
Drive error chrome off the state, not off raw `:invalid` or
focus/blur booleans.

| State | Meaning | UI |
|---|---|---|
| `pristine` | User has not interacted | No error chrome, no green check |
| `dirty` | User has typed but not committed (still focused) | No error chrome yet |
| `touched` | User has blurred at least once after editing | Field-level constraint runs |
| `invalid-after-touched` | Constraint failed after blur | Show error, link via `aria-describedby` |
| `invalid-after-submit` | Submit attempted, field still invalid | Same plus focus management to summary or first invalid field |
| `recovering` | User editing an already-invalid field | Re-validate on `input`, not on next blur |
| `submitting` | Action in flight | Disable submit, announce status via a polite live region |
| `server-error` | Server returned an error for this field | Use server's message text; treat as `invalid-after-submit` |

Decision rule that collapses validation-timing debates: errors appear
on transition into `invalid-after-touched`, clear on transition out
of any invalid state, and never appear from `pristine` or plain
`dirty`. CSS `:user-invalid` matches the `invalid-after-touched` /
`invalid-after-submit` states for free.

#### Validation timing

Baymard's checkout-UX benchmark (2024-01-09 inline-validation article):
**31% of sites have no inline validation, and most of the rest fire
too early.** The participant quote that anchors the research: *"Why
are you telling me my email address is wrong, I haven't had a chance
to fill it all out yet?"* Premature firing is the loudest UX failure
in this space.

The four rules:

1. **First blur after edit** runs the field-level constraint. Not on focus, not on first keystroke, not on every keystroke.
2. **Once a field is invalid, switch to `input`-event re-validation** so the error clears the moment input becomes valid. Don't make the user blur again to dismiss it.
3. **On submit**, run the schema parse. Move focus to the error summary at the top of the form (a heading-led container with `tabindex="-1"`, no `role="alert"` — see the wiring section), or to the first invalid field if no summary exists. Don't move focus on every keystroke.
4. **Async checks** split into two paths. *Background preflight* (uniqueness while typing, address lookup) debounces 250-500 ms, announces via a polite live region, and never gates typing or keeps the submit button disabled indefinitely. *Authoritative server validation on submit* is different: the submit path must await the server's response and surface field errors from it, since the server is the truth. Don't conflate the two — the rule is "don't let a slow background check freeze the form," not "don't ever wait for the server."

CSS gets you most of timing rule 1 for free: style off `:user-invalid`
not `:invalid`. The `:user-invalid` selector is Baseline Newly
available 2023 (Chrome 119, Firefox 88, Safari 16.5; Firefox shipped
the prefixed `:-moz-ui-invalid` years earlier and unprefixed in v88)
and matches only after the user has either submitted the form or
blurred the field with bad input.

#### Constraint Validation API as the platform floor

Native HTML constraints are not an alternative to JS validation; they
are the substrate the rest of the layers run on. They survive JS
failure, they integrate with autofill, and they are what
`reportValidity()` and screen-reader native announcements key off.

```html
<input type="email" name="email" required>
```

Use these declaratively for every field that has them: `required`,
`type` (email, url, number, tel), `pattern`, `min`/`max`,
`minlength`/`maxlength`, `step`. Cross-field rules and dynamic
constraints go through `setCustomValidity()` on both `input` and
`change` events — autofill flows historically fired one without the
other on some browsers, so listening on both is the cheap defense.

Rules of the API:

- **Empty string clears `setCustomValidity`.** Not `null`, not no-arg.
- **`form.requestSubmit()` honors validation; `form.submit()` skips it.** Never call the second.
- `disabled` controls are barred from validation and not submitted. The HTML spec says `readonly` is also barred, but `readonly` only has defined behavior on `<input>` and `<textarea>` — implementations diverge for `<select readonly>` and `<button readonly>` ([whatwg/html#11841](https://github.com/whatwg/html/issues/11841)). For non-input controls where the value must still submit, the safe pattern is `disabled` plus a same-named hidden `<input>` carrying the value, or rendering the non-editable text alongside a hidden `<input>`. `aria-readonly` alone is not enough — a `<select>` or custom widget tagged `aria-readonly="true"` is still interactable, so the visible control can drift while the hidden input ships a stale or different value. If you do use `aria-readonly`, you must also block the interaction or keep both values in sync.
- `inputmode` is a virtual-keyboard hint, **not** validation. `<input type="text" inputmode="numeric" pattern="[0-9]*">` is the Baymard-recommended shape for ZIPs / OTPs / card numbers; `pattern="[0-9]*"` is the historical iOS-Safari trigger for the numeric keypad on top of `inputmode`. `type="number"` adds spinners, strips leading zeros, applies locale-decimal handling, and varies field width across browsers — wrong for any of these.

#### Error wiring beyond the baseline

The default error pattern in `accessibility-baseline.md` (`<label>` +
`aria-describedby` + `aria-invalid` + `role="alert"`) covers WCAG
3.3.1 / 3.3.2. Three additions matter for real forms:

**Adaptive error messages.** Baymard 2023: 98% of audited sites use
generic catch-all errors ("Provide a valid phone number") rather than
the specific subrule that fired ("Phone number is too short"). The
back end already knows the subrule; surfacing it cuts re-submit
attempts. Ship 4-7 distinct messages per high-traffic complex field
(email, phone, card, postal code). The scale of the problem matches
WebAIM Million 2026: missing form-input labels appear on **51% of
the top 1M home pages** (input-level rate **33.1%** of all 6.9M
inputs sampled) — labels and error messages are the categories
trending sideways or worse year-over-year while overall a11y errors
drop.

**Error summary at the top, on submit only.** Long forms benefit from
a summary list of in-page anchor links to invalid fields, focused on
submit:

```html
<div id="form-errors" tabindex="-1">
  <h2>2 problems</h2>
  <ul>
    <li><a href="#email">Email is required</a></li>
    <li><a href="#dob">Date of birth must be in the past</a></li>
  </ul>
</div>
```

The container is heading-led with `tabindex="-1"` so JS can move
focus to it on submit (render the summary into the DOM, *then*
`.focus()` it; a `hidden` element can't take focus). It does **not**
carry `role="alert"` because combining a moved-focus target with an
alert role causes double-announcement: alert fires on insertion,
focus fires the accessible name + role. Reserve `role="alert"` for
inline per-field errors that appear without focus moving — that's
the canonical baseline pattern in `accessibility-baseline.md`. WCAG
technique G139 covers the summary; not required, high-value for long
forms.

**Preserve user input on error.** Baymard 2024: 34% of audited
checkouts wipe the credit-card field when an unrelated error reloads
the page. Direct cause of abandonment. Either field-level-validate
non-sensitive fields first, or split the payment step. PCI-wise,
persisting card values across an error reload is fine via tokenized
hosted iframes; never store raw PAN in your own session.

#### Schema as the cross-stack contract

Validation expressed once, consumed everywhere. The 2026 React shape
— `useActionState` + Server Actions + Conform (which added Standard
Schema support during the v1.x line) + a Zod 4 / Valibot / ArkType
schema — is the most-cited concrete instance: one schema,
server-authoritative, validator hot-swappable via the `~standard`
interface. The same architecture works in TanStack Form, oRPC, Hono
validator middleware, Nuxt UForm, and any other consumer that reads
`~standard`.

```ts
const Signup = z.object({
  email: z.email(),                  // Zod 4 top-level form
  password: z.string().min(12),
});
// Same schema parses on the Server Action and on the Conform client.
```

Three rules that survive across stacks:

- **Server is the truth, client is the optimization.** Same schema runs in both. Returning `{ errors }` from the action (not throwing) is what feeds back into `useActionState`'s state slot — throwing routes to the Error Boundary and loses the form data.
- **Standard Schema is the contract, not Zod.** A form library that ships per-validator resolver shims (`zodResolver`, `valibotResolver`, etc.) is yesterday's stack. Accept any `~standard`-compliant validator.
- **`novalidate` on `<form>` does not mean "skip validation".** It means "let the form library repaint errors instead of the browser's bubble." But the trade-off is real: a literal server-rendered `<form novalidate>` disables the browser's submit-blocking and native validation UI **even when JS is unavailable**, which loses the no-JS constraint-validation floor. Pick one of two patterns. **A:** render `<form>` without `novalidate` server-side and have the form library set `form.noValidate = true` after hydration — the no-JS user keeps the browser's native validation, the JS user gets the library's chrome. **B:** ship `novalidate` from the start only when the submit path reaches server validation without JS (Server Action, classic POST handler) so the no-JS user is still protected by the server. Either way, keep `required` / `pattern` / `type` attributes — they survive JS failure and integrate with autofill. (HTML attribute is lowercase `novalidate`; the IDL property on the form element is `noValidate`.)

#### WCAG 3.3.x beyond Error Identification

`accessibility-baseline.md` covers 3.3.1 (Error ID), 3.3.2 (Labels),
and 3.3.7 (Redundant Entry). The rest of 3.3 binds harder on
transactional forms:

- **3.3.3 Error Suggestion (AA):** when the fix is determinable, suggest it in text. Adaptive errors satisfy this. "Date must be MM/DD/YYYY. You entered 5-3-26. Did you mean 05/03/2026?"
- **3.3.4 Error Prevention — Legal, Financial, Data (AA):** for any submission with legal / financial / data-modifying consequence, provide one of: reversibility, server-side check + correction step, or a confirm-summary screen before commit.
- **3.3.8 Accessible Authentication (AA, WCAG 2.2):** auth steps must not require a cognitive function test (remember a password, transcribe a code, recognize images) without an alternative. CAPTCHAs are the canonical thing this SC restricts; only object-recognition or personal-content variants escape via the narrow exceptions, and not all CAPTCHAs do. Practical floor: never block paste on password / verification-code fields, support password managers, accept verification-code paste from a clipboard.
- **3.3.9 Accessible Authentication, No Exception (AAA):** removes even the object-recognition / personal-content exceptions. Aspirational; flag if a project commits to it.

#### Native mobile parity

Web validation primitives don't auto-translate. Each platform has its
own validity machinery and its own AT path. Skills that emit web-only
artifacts can skim this section; it's the entry point for skills
that ship to mobile (mobile-onboarding, mobile-app, etc.).

| Platform | Validity primitive | Error announcement |
|---|---|---|
| iOS UIKit | Hand-rolled state on the view controller; `UITextField` doesn't carry a built-in invalid flag | `UIAccessibility.post(notification: .announcement, argument: "Email is required")` |
| iOS SwiftUI | `TextField` + `@State`-driven validation; no built-in `Form`-level validity API as of iOS 18 | `AccessibilityNotification.Announcement("…").post()` (iOS 17+) |
| Android Compose | `OutlinedTextField(isError = true, supportingText = { Text("…") })` — `isError` wires the AT error semantic for you | `Modifier.semantics { liveRegion = LiveRegionMode.Polite }` on the supporting-text node, or `LocalView.current.announceForAccessibility(message)` |
| Flutter | `TextFormField(validator: (v) => …)` inside a `Form`, `formKey.currentState!.validate()` | `SemanticsService.announce(message, Directionality.of(context))` — never hardcode `TextDirection.ltr`; pull ambient direction so Arabic / Hebrew / Persian flows announce correctly |
| React Native | Hand-rolled per field; no platform validity flag | `accessibilityLiveRegion="polite"` on the error node (Android) + `AccessibilityInfo.announceForAccessibility(...)` (iOS) |

Two parity rules that catch most AI-generated mobile forms:

- **Use the platform's native validation flag — and pair it with the platform's error-message semantic where one exists.** On Compose, `isError = true` is the right boolean state for the field visuals and AT error-state cue, but it does *not* carry the localized error message. Pair it with `Modifier.semantics { error(message) }` so accessibility services get the actual text — the same string you render in `supportingText`. The trap is duplication: a hand-rolled `Modifier.semantics { error("Email is required") }` next to a different supporting-text string desyncs. Source `error()` from the same state field as `supportingText` so they stay in sync.
- **Don't mirror web ARIA into mobile semantics.** `aria-describedby` on a SwiftUI `TextField` is a no-op. Use the platform announcement primitive (`AccessibilityNotification.Announcement` on SwiftUI, `UIAccessibility.post` on UIKit, `announceForAccessibility` on Android, `SemanticsService.announce` on Flutter) for state-change events that need to reach the screen reader.

#### Common mistakes (lint these)

- Styling off `input:invalid` instead of `input:user-invalid`. Red borders on page load is the loudest "this validation was added without testing" signal.
- Validating on every keystroke. Hostile; fires before the user has finished typing.
- Generic catch-all error messages ("Invalid input") when the back end already knows which subrule fired. Baymard 2023 found 98% of audited sites do this — the most-cited preventable validation failure in their corpus.
- Throwing from a Server Action on validation failure. Routes to the Error Boundary and loses the form data. Return `{ errors }` instead.
- `role="alert"` on the error-summary container that focus moves to. Double-announces. Reserve `role="alert"` for inline per-field errors that appear without focus moving.
- `aria-busy="true"` on the submit button while submitting. `aria-busy` is for stale containers; for buttons use `disabled` plus a polite live-region status message.
- Email-confirm fields ("retype your email"). 3.3.7 redundant entry — exceptions are essential / security / no-longer-valid, not "we want to catch typos." Allow paste and validate the single field instead.
- Per-validator resolver shims (`zodResolver`, `valibotResolver`) on a 2026 stack. Accept Standard Schema's `~standard` interface and the validator becomes swappable.
- Wiping the credit-card field when an unrelated field errors. Baymard 2024: 34% of audited e-commerce sites; direct abandonment cause.
- `setCustomValidity(null)` to clear an error. Pass empty string; `null` does not clear.
- Mirroring web ARIA onto SwiftUI / Compose / Flutter. Each platform has its own validity API; `aria-*` attributes don't reach the mobile AT path.


## anti-ai-slop

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/craft/anti-ai-slop.md

### Anti-AI-slop rules

Concrete, checkable rules that distinguish "designed by a human who has
shipped product" from "default LLM output." Several rules below are
auto-enforced by the daemon's `lint-artifact` linter — failing an
enforced rule is not a style preference, it is a regression. The
rest are guidance for agents and reviewers and are flagged inline as
"(guidance, not auto-checked)" so the contract with the linter stays
honest.

> Adapted from [refero_skill](https://github.com/referodesign/refero_skill)
> (MIT), tightened to match OpenDesign's lint surface.

#### The seven cardinal sins

These are the patterns the linter blocks at P0 (must-fix):

1. **Default Tailwind indigo as accent** — exactly `#6366f1`, `#4f46e5`,
   `#4338ca`, `#3730a3`, `#8b5cf6`, `#7c3aed`, `#a855f7`. The active
   `DESIGN.md` provides `--accent`; use it. Indigo is the textbook AI
   tell. (The daemon's `lint-artifact` flags any of these as a solid
   accent; keep this list in sync with `AI_DEFAULT_INDIGO` in
   `apps/daemon/src/lint-artifact.ts`.)
2. **Two-stop "trust" gradient on the hero** — purple→blue, blue→cyan,
   indigo→pink. A flat surface + intentional type beats this every
   time.
3. **Emoji as feature icons** — `✨`, `🚀`, `🎯`, `⚡`, `🔥`, `💡`
   inside `<h*>`, `<button>`, `<li>`, or `class*="icon"`. Use
   1.6–1.8px-stroke monoline SVG with `currentColor`.
4. **Sans-serif on display text when the seed binds a serif** — h1/h2
   must use `var(--font-display)`, not a hardcoded Inter / Roboto /
   `system-ui`.
5. **Rounded card with a colored left-border accent** — the canonical
   "AI dashboard tile" shape. Drop either the radius or the left
   border.
6. **Invented metrics** — "10× faster", "99.9% uptime", "3× more
   productive". Either pull from a real source or use a labelled
   placeholder.
7. **Filler copy** — `lorem ipsum`, `feature one / two / three`,
   `placeholder text`, `sample content`. An empty section is a design
   problem to solve with composition, not by inventing words.

#### Soft tells (P1 — should fix)

- **Standard "Hero → Features → Pricing → FAQ → CTA" sequence with no
  variation** *(guidance, not auto-checked)*. This is the AI-template
  skeleton; introduce at least one unconventional section (testimonial
  wall as full-bleed quote, pricing as comparison-against-status-quo,
  an inline mini-product-demo).
- **External placeholder image CDNs** (`unsplash.com`, `placehold.co`,
  `placekitten.com`, `picsum.photos`). Fragile and obvious. Use the
  shipped `.ph-img` placeholder class.
- **More than ~12 raw hex values outside `:root`.** Tokens were not
  honoured.
- **`var(--accent)` used 6+ times in the rendered body.** Cap at 2
  visible uses per screen.

#### Polish tells (P2 — nice to fix)

- **Sections without `data-od-id`** — comment mode can't target them.
- **Decorative blob / wave SVG backgrounds** *(guidance, not
  auto-checked)* — meaningless geometry.
- **Perfect symmetric layout with no visual tension** *(guidance, not
  auto-checked)* — alternating density (one tight section, one
  breathing section) reads as intentional.

#### How to add soul without breaking the rules

Aim for **~80% proven patterns + ~20% distinctive choice**. The 20%
should live in:

- One bold visual move — a typography choice, a single color decision,
  an unexpected proportion.
- Voice and microcopy — a button that says "Start tracking" beats one
  that says "Get started".
- One micro-interaction the user will remember — a button press that
  moves 2px, a number that counts up.
- One detail that could only have been put there by someone who used
  the product (a subtle kbd shortcut hint, a status badge with
  product-specific phrasing).

If a reviewer screenshots the artifact and someone outside the project
can identify which product it's from — you have soul. If not, you
shipped a template.

