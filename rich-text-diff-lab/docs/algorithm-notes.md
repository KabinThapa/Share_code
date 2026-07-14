# Algorithm Notes

## The Important Shift

The original prototype compares HTML strings split by line breaks. That is useful for learning, but rich text comparison needs a document model.

The new engine uses this model:

```text
Document
  Block[]
    Text block
      type: paragraph | heading | listItem | blockquote
      attrs
      children: text runs with marks
    Table block
      rows
        cells
          children: text runs with marks
```

## Why This Works Better

Rich text changes are not only text changes.

The same visible text can change by:

- text content
- inline marks
- block type
- block attributes
- table row/cell structure
- link attributes
- color or background style

HTML string diff mixes these together. A structured model keeps them separate.

## Matching Strategy

Block matching runs before inline diff.

Priority:

1. Exact hash anchors.
2. Same block kind.
3. Weighted rare terms and phrases.
4. Similar length.
5. Similar position.
6. Similarity threshold.

This solves inserted-paragraph cases:

```text
Old: A, B
New: A, X, Y, B edited
```

The engine should match old `B` to new `B edited`, then mark X and Y as inserted.

## Readable Diff Strategy

The algorithm should choose a human-readable granularity.

- Typo: character/word-level diff.
- Replaced sentence: sentence-level delete plus insert.
- Large formatting range: one range-level format change.
- Inserted table: whole table block.
- Cell edit: cell-level inline diff.

Smallest possible diff is not always the best diff.

## Future Production Improvements

- Use stable editor block IDs when available.
- Add a proper Myers inline diff library.
- Add grapheme-aware tokenization for emoji and complex scripts.
- Add a sanitizer such as DOMPurify.
- Add virtualized rendering for very large documents.
- Add table column matching by header fingerprints.
- Add ambiguous match reporting when scores are too close.
- Add unit tests for every edge case in `rich-text-diff-edge-cases.md`.

