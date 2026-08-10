---
name: ui-house-style
description: House conventions for web and app UI layout — spacing, typography, colour, hierarchy, and component patterns. Use this skill whenever building, editing, or reviewing any user interface, web page, dashboard, form, landing page, admin console, or front-end component, and whenever the user asks for a mockup, prototype, design, or "make this look better". Apply it even when the user does not mention design explicitly — if the output is something a person will look at in a browser, these conventions apply.
---

# UI House Style

A constrained set of layout conventions. The point of constraint is consistency: a UI built from a small fixed vocabulary of spacing, type, and colour values reads as deliberate, while one built from arbitrary values reads as unfinished, even when the individual choices are fine.

Treat the scales below as closed sets. Reaching for a value that is not on a scale is almost always a sign that the underlying structure is wrong, not that the scale is missing a value.

## Default aesthetic

Calm, dense-but-breathable product UI. Reference points are Linear, Stripe's dashboard, and Vercel — restrained neutral palette, a single accent colour carrying all interactive meaning, generous whitespace, no decorative gradients or drop shadows doing work that spacing should do.

Content is the interface. Chrome recedes.

## Non-negotiables

Check every one of these before delivering any UI:

1. Every spacing value comes from the spacing scale.
2. Every font size comes from the type scale.
3. Every colour comes from the palette, referenced by token name.
4. One primary action per view. Everything else is secondary, tertiary, or a plain link.
5. Body text is capped at 60–75 characters per line.
6. Text and background meet a 4.5:1 contrast ratio.
7. Interactive targets are at least 44×44px on touch, 32px minimum height on desktop.
8. Every interactive element has a visible focus state.

## Spacing

Base unit 4px. The scale:

```
4  8  12  16  24  32  48  64  96  128
```

Nothing else. No 10px, no 20px, no 30px.

**Proximity is the main tool.** Related elements sit close, unrelated elements sit far apart. The gap between groups must be visibly larger than the gap within a group — as a rule of thumb, at least double. Uniform spacing everywhere is the single most common failure mode: it removes the reader's ability to find structure, so the eye has to parse the whole screen instead of scanning it.

Typical applications:

| Relationship | Gap |
|---|---|
| Label to its input | 4–8 |
| Icon to its adjacent text | 8 |
| Between form fields | 16–24 |
| Between form field groups | 32–48 |
| Card internal padding | 16–24 |
| Between cards in a grid | 16–24 |
| Between page sections | 64–96 |
| Page top padding | 32–48 |

**Vertical space beats horizontal rules.** Reach for a divider only when spacing alone genuinely cannot separate two regions — usually in dense tables or nav rails.

## Typography

One typeface. A second is permitted only for monospace (code, IDs, timestamps, log output). Prefer the system stack or Inter for UI, and a monospace like JetBrains Mono or ui-monospace for code.

Type scale:

```
12  14  16  20  24  32  48
```

Adjacent sizes must be far enough apart to read as intentional. Sizes one step apart (15 vs 16) look like a bug.

| Role | Size | Weight | Line height |
|---|---|---|---|
| Page title | 32 | 600 | 1.2 |
| Section heading | 20 | 600 | 1.3 |
| Card / group heading | 16 | 600 | 1.4 |
| Body | 14–16 | 400 | 1.5 |
| Secondary / meta | 12–14 | 400 | 1.5 |
| Labels, table headers | 12 | 500 | 1.4 |

Rules:

- Left-align body text. Never centre a paragraph longer than two lines. Centring is for short hero copy and empty states only.
- Never justify text on the web. Browser justification produces uneven word spacing with no hyphenation control.
- Establish hierarchy with weight and colour before reaching for size. Bumping a heading up a size is the blunt instrument; going from 400 to 600 weight, or from muted to primary text colour, often reads better.
- Sentence case for headings, labels, and buttons. Title Case reads as marketing copy; ALL CAPS is acceptable only for 12px labels with letter-spacing.

## Colour

Build from a neutral ramp plus one accent. Roughly 60% neutral surfaces, 30% neutral text and borders, 10% accent.

Semantic tokens, not raw hex values, everywhere in the output:

```
surface            page background
surface-raised     cards, panels, modals
border             hairlines, input outlines, dividers
text-primary       headings and body
text-secondary     supporting copy, metadata
text-muted         placeholders, disabled
accent             primary actions, active states, focus rings
accent-hover
success  warning  danger    status only
```

Rules:

- The accent colour carries interactive meaning and nothing else. If it appears on something that is not clickable or not the current state, it stops signalling anything.
- Status colours convey status. A red button that is not destructive teaches the user that red is meaningless.
- Never rely on colour alone to convey information. Pair with an icon, label, or shape.
- Borders should be low contrast. A visible grey grid competes with content; a hairline at around 8–12% contrast against the surface is usually enough.
- Prefer a subtle background shift over a shadow for elevation. Shadows are for things that genuinely float — dropdowns, popovers, modals.

## Layout

- Cap content containers at 1280px. Cap prose columns at around 700px. Full-bleed backgrounds are fine; full-bleed text is not.
- Build on a 12-column grid, or CSS Grid with named areas for app shells. Keep column counts consistent within a page.
- Design mobile-first. Standard breakpoints: 640, 768, 1024, 1280.
- Establish a small number of alignment lines and hold them across the whole page. Elements that nearly line up but do not are worse than elements that clearly do not.
- Every screen needs an obvious first thing, second thing, and third thing. If everything is emphasised, nothing is. Test by squinting: the intended focal point should still be the thing that stands out.
- Respect platform convention over novelty. Logo top-left linking home, primary nav across the top or in a left rail, account controls top-right. People arrive with expectations formed by every other product they use; spend originality on content and craft, not on where the navigation lives.

## Components

**Buttons.** Primary (filled accent), secondary (outlined or subtle fill), tertiary (text only), destructive (danger, and only for genuinely destructive actions). Minimum 32px height on desktop, 44px on touch. Horizontal padding at least 16.

**Forms.** Labels above inputs, always visible — placeholder-as-label disappears the moment someone starts typing and fails for screen readers. Errors sit below the field, in words, describing the fix rather than restating the rule. Mark optional fields rather than required ones when most are required.

**Tables.** Left-align text, right-align numbers, and use tabular figures so digits line up. Row height at least 40. Sticky headers on anything that scrolls.

**Cards.** Consistent internal padding, consistent radius. Do not nest cards inside cards — that is a signal the hierarchy needs rethinking rather than more containers.

**Empty states.** Every list, table, and board that can be empty needs a designed empty state: what this is, why it is empty, and one clear action to fill it. An empty region with no explanation reads as a bug.

**Loading and errors.** Skeletons over spinners for content that has a known shape. Every async surface needs a loading state, an error state, and an empty state, not just a success state.

**Radius.** Pick one small radius (4–8px) for controls and one slightly larger (8–12px) for containers. Two values total.

## Motion

Motion clarifies where things came from and where they went. Anything else is decoration.

- Duration 150–250ms for most transitions. Anything over 400ms feels broken.
- Ease-out for entrances, ease-in for exits.
- Animate transform and opacity. Animating layout properties causes jank.
- Honour `prefers-reduced-motion`.

## Anti-patterns

Do not produce these:

- Arbitrary spacing values, or spacing tuned by eye until it "looks right".
- Centred body paragraphs.
- Multiple competing primary buttons in one view.
- Decorative gradients, glassmorphism, or heavy shadows used to add visual interest that spacing and hierarchy should be providing.
- Icon-only buttons with no accessible label or tooltip.
- Text over a busy image without a scrim.
- Emoji as UI iconography.
- More than two typefaces, or more than one accent colour.
- Hover-only affordances, which do not exist on touch.

## Self-check before delivering

Run through this and fix anything that fails:

- Does every spacing, size, and colour value trace back to a scale or token?
- Squinting at it, is the intended focal point still the thing that stands out?
- Are groups visibly separated by space rather than only by borders?
- Is the longest line of body text under 75 characters?
- Does it work at 375px wide?
- Can every action be reached and triggered by keyboard, with a visible focus ring?
- Does every async region have loading, empty, and error states?
- If the accent colour were removed, would the layout still be readable and the hierarchy still clear?

## Tuning this skill

The values above are defaults, not laws handed down. The parts most worth adjusting to taste are the default aesthetic paragraph, the accent colour, the typeface choice, and the radius values. Change those and the rest of the system holds.
