# Rich Text Diff Lab

A browser-only prototype for a rich text diff engine.

This project is intentionally dependency-free so the algorithm can be studied without framework noise. It demonstrates the architecture needed for a production rich-text diff viewer:

```text
HTML/editor content
  -> normalize into document JSON
  -> match blocks
  -> diff text inside matched blocks
  -> diff formatting on aligned text
  -> diff tables as structured grids
  -> render split before/after diff
```

## Run Locally

From this folder:

```bash
python3 -m http.server 8770
```

Then open:

```text
http://127.0.0.1:8770
```

## What This Prototype Covers

- Paragraph insertions and deletions.
- Edited paragraphs after inserted paragraphs.
- Sentence-level replacement grouping.
- Word-level edits for small changes.
- Formatting-only changes grouped as ranges.
- Text plus formatting changes on the same text.
- Heading/paragraph structure changes.
- Basic list item normalization.
- Basic table insertion, deletion, row matching, and cell text diff.
- HTML normalization for equivalent tags such as `<b>` and `<strong>`.
- Weighted block matching with rare-token hints and position signals.

## What This Is Not Yet

- It is not a full production editor.
- It does not implement every edge case from the checklist.
- It does not include collaboration, accept/reject changes, comments, image storage, or backend persistence.
- It is a learning implementation that shows the right architecture.

## Key Files

- `index.html`: App shell.
- `src/styles.css`: UI styling.
- `src/app.js`: UI wiring and sample scenarios.
- `src/diff-engine.js`: Core algorithm.
- `src/fixtures.js`: Test scenarios.
- `docs/algorithm-notes.md`: Theory and implementation notes.

