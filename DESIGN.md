---
name: Omni-orga
description: A calm local tool for choosing what to do now.
---

# Design System: Omni-orga

## Overview

**Creative North Star: "A Clear Desk"**

Keep the interface quiet and focused. Use Things 3 for task flow, Apple Calendar for date views, and standard macOS controls for familiar behavior. Show one main action and few choices at a time.

Use motion only to explain a state change. Respect reduced-motion settings. Never add flavor text or decoration to create personality.

## Colors

Use the approved Pen palette. Tokens live in `src/styles.css`.

| Role | Color |
| --- | --- |
| Paper / content | `#FCFDFC` |
| Sidebar / secondary controls | `#F0F4F0` |
| Main text | `#24382F` |
| Secondary text | `#5D6E63` |
| Structural dividers | `#DCE4DD` |
| Input and unchecked control borders | `#728779` |
| Selected background | `#B8E2C8` |
| Actions / focus | `#285B40` |
| Danger text | `#963E34` |
| Danger background | `#FFF2EF` |

Main and secondary text meet 4.5:1 on paper and sidebar. Input boundaries meet 3:1 on paper. Use white text on green primary actions. Structural dividers are not input boundaries.

**The Restrained Rule.** Keep `#B8E2C8` to a small part of each screen. Use it for selected backgrounds and small accents. Never use it as text on a light background. Choose a darker matching green for actions and focus after contrast checks.

## Typography

Use the locally bundled Outfit Variable font for all interface text, with system sans-serif as the fallback. Desktop page titles use 44 px; phone titles use 36 px. Keep body text at 70 characters per line or less. Use quiet metadata beside larger task names.

**The Necessary Words Rule.** Use sentence case and short labels. Remove text that does not help the user decide or act.

**The Product Copy Rule.** Keep design rationale in documents and conversations, not inside the product. Interface text must help the user act, choose, or understand state.

## Elevation

Keep surfaces flat. Separate areas with spacing, tinted backgrounds, or a quiet one-pixel border. Reserve a soft shadow for temporary floating controls.

## Layout

The approved source is `design-proposal-previews/README.md`, with screen and state PDFs beside it. At 1280 px, use a 204 px sidebar and 64 px content inset. The sidebar has five visible icon-and-label links. At 1024 px and below, those same links become a fixed bottom tab bar. Phone content has 24 px side insets and enough bottom space to clear navigation and safe areas.

Temporary sheets scroll within the viewport. On phones they fill the viewport, with Close kept at the top. Notices sit above phone navigation. Long names wrap inside flexible columns instead of widening the page.

## Interaction

- Focus uses a 2 px green outline with a 3 px gap. All five navigation labels remain visible; icons are decorative and hidden from assistive technology.
- Main and secondary buttons have a 44 px minimum height. Secondary actions use the quiet sidebar tint. Disabled actions retain readable text and show a nearby reason where needed.

- Today is for doing. Task creation, planning, rescheduling, and removal live in Tasks.
- Reorderable lists use long-press drag and drop. The personal first version has no reorder buttons.
- Prefer a visible, reversible state change over a second confirmation message.

## Do's and Don'ts

### Do:

- **Do** show one clear main action.
- **Do** use familiar macOS controls and visible keyboard focus.
- **Do** keep layouts stable after an action.

### Don't:

- **Don't** make dense productivity dashboards.
- **Don't** use scores, streaks, badges, confetti, praise, or blame.
- **Don't** copy Habitica's game framing or busy decoration.
- **Don't** use surprise movement or changing content.
- **Don't** add flavor text, motivational copy, repeated headings, or long explanations.
- **Don't** add decoration that does not carry information.
