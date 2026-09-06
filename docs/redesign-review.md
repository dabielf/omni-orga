# Redesign review

Baseline: `1be5d4b`. Reviewed combined changes through `ce817c2`, then fixes `69e3f2c` and `24a6b41`. Sources: AGENTS.md, CONTEXT.md, PRODUCT.md, DESIGN.md, issues #39–45, and the approved 90-case list.

## Standards

Two confirmed findings, both resolved:

- Draft date Undo captured an unmounted form after Close/reopen. The correction updates the current session draft and preserves later edits; a generation prevents modifying a discarded draft.
- Calendar's long phone day sheet scrolled Close off screen. Its header is now sticky.

The reviewer independently ran the recovered-draft Undo, Calendar scrolling and Today inheritance regressions: **3 passed**. No remaining standards findings or warranted Fowler refactors.

## Spec

Two confirmed findings, both resolved:

- Today omitted inherited goal links when a scheduled subtask's ancestors were absent. The snapshot now resolves root links for open and completed descendants. A real-store grandchild regression covers the missing-ancestor case.
- Archived Restore allowed duplicate requests. A synchronous per-task guard and disabled state prevent duplicates; failure unlocks retry. The held-request browser regression proves one write and successful retry.

No remaining substantive missing requirements, incorrect behaviour or scope additions found. This code review does not substitute for the separately recorded visual checks.

Standards: 0 open findings. Spec: 0 open findings.
