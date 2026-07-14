# Rich Text Diff Viewer Edge Cases And Test Cases

This document lists the major edge cases for a rich text diff viewer that compares an old editor document with a newer editor document. The goal is to detect text changes, formatting changes, structural changes, inserted/deleted blocks, and complex content such as tables while keeping the visual output understandable.

## Core Expectations

- The old document is the baseline.
- The new document is the latest version.
- The app compares on user action, not continuously while typing.
- The algorithm should compare normalized document JSON, not raw HTML strings.
- The algorithm should match blocks first, then compare text and formatting inside matched blocks.
- The UI should prefer readable human-level changes over noisy micro-changes.
- If the algorithm is uncertain, it should avoid pretending certainty and may show delete plus insert.

## Suggested Test Result Types

Use these result types consistently:

- `unchanged`: Same block/text/format.
- `inserted`: New block/text exists only in the new document.
- `deleted`: Old block/text exists only in the old document.
- `edited`: Same block, text changed.
- `format_changed`: Same text, formatting changed.
- `structure_changed`: Same content, block structure changed.
- `text_and_format_changed`: Text and formatting changed in the same range.
- `ambiguous`: Similarity score is too low or multiple possible matches exist.

## 1. Plain Text Changes

### 1.1 Single Character Changed

Old:

```text
Hello world
```

New:

```text
Hallo world
```

Expected:

- Match the same paragraph.
- Highlight only `e` removed and `a` inserted, or highlight the changed word depending on UI mode.
- Do not mark the whole paragraph as deleted and inserted.

Risk:

- Character-level diff can become visually noisy.

### 1.2 Single Word Changed

Old:

```text
The report explains the final decision.
```

New:

```text
The report describes the final decision.
```

Expected:

- Match the same paragraph.
- Highlight `explains` as deleted and `describes` as inserted.

Risk:

- Weak block matching may treat the paragraph as delete plus insert.

### 1.3 Full Sentence Removed And New Sentence Added

Old:

```text
The detective reviewed the file. The witness arrived before midnight.
```

New:

```text
The detective reviewed the file. The camera footage was recovered later.
```

Expected:

- Match the paragraph.
- Treat `The witness arrived before midnight.` as a deleted sentence.
- Treat `The camera footage was recovered later.` as an inserted sentence.
- Prefer full-sentence highlight, not noisy word-by-word changes.

Risk:

- Word-level diff may pair unrelated words and create confusing partial highlights.

### 1.4 Sentence Moved Within Same Paragraph

Old:

```text
First sentence. Second sentence. Third sentence.
```

New:

```text
Second sentence. First sentence. Third sentence.
```

Expected:

- If move detection is not supported, show delete plus insert.
- Keep unchanged sentence `Third sentence.` stable.

Risk:

- Diff may show many tiny edits instead of recognizing sentence-level movement.

### 1.5 Paragraph With Punctuation Change Only

Old:

```text
Are you sure?
```

New:

```text
Are you sure!
```

Expected:

- Highlight `?` deleted and `!` inserted.

Risk:

- Normalization might remove punctuation too early and miss the change.

### 1.6 Whitespace-Only Change

Old:

```text
Hello world
```

New:

```text
Hello   world
```

Expected:

- If whitespace is ignored, show no text change.
- If exact whitespace mode is later added, highlight the whitespace change separately.

Risk:

- Browser/editor may normalize whitespace visually, causing false positives or false negatives.

### 1.7 Line Break Changed Inside Paragraph

Old:

```text
Hello world
```

New:

```text
Hello
world
```

Expected:

- Decide whether soft line breaks matter.
- If soft breaks are ignored, show unchanged.
- If soft breaks are tracked, show line break inserted.

Risk:

- HTML may represent this as `<br>`, paragraph split, or whitespace.

## 2. Block And Paragraph Matching

### 2.1 Paragraph Inserted Between Two Existing Paragraphs

Old:

```text
Paragraph A
Paragraph B
```

New:

```text
Paragraph A
Inserted paragraph X
Inserted paragraph Y
Paragraph B
```

Expected:

- Match old `Paragraph A` to new `Paragraph A`.
- Match old `Paragraph B` to new `Paragraph B`.
- Mark X and Y as inserted.

Risk:

- Position-only matching may mark old B deleted and new B inserted.

### 2.2 Existing Paragraph Edited After Inserted Paragraphs

Old:

```text
Paragraph A
The report explains the final decision.
```

New:

```text
Paragraph A
Inserted paragraph X
Inserted paragraph Y
The report describes the final decision.
```

Expected:

- Match the edited final paragraph to the old second paragraph.
- Highlight `explains` deleted and `describes` inserted.
- Mark X and Y as inserted.

Risk:

- Similarity threshold too strict may miss the match.

### 2.3 Paragraph Deleted

Old:

```text
Paragraph A
Paragraph B
Paragraph C
```

New:

```text
Paragraph A
Paragraph C
```

Expected:

- Mark B as deleted.
- Keep A and C matched.

Risk:

- C may be wrongly compared against B if matching only by index.

### 2.4 Paragraph Rewritten Completely

Old:

```text
The finance team approved the project after legal review.
```

New:

```text
We should go ahead.
```

Expected:

- If similarity is too low, show old paragraph deleted and new paragraph inserted.
- Do not force a low-confidence edit match.

Risk:

- Over-aggressive matching can create misleading diff.

### 2.5 Duplicate Paragraphs

Old:

```text
Thank you.
Thank you.
Final note.
```

New:

```text
Thank you.
Final note.
Thank you.
```

Expected:

- Use order and neighboring anchors to choose the most sensible matches.
- If ambiguous, preserve stable document order.

Risk:

- Identical fingerprints cannot distinguish duplicates without position or block IDs.

### 2.6 Many Paragraphs With Repeated Topic Words

Scenario:

- A document about crime investigation where many paragraphs repeat words like `crime`, `suspect`, `evidence`, `police`, `case`.

Expected:

- Common words should have low matching weight.
- Rare phrases and nearby anchors should drive matching.

Risk:

- Simple word-overlap fingerprint may match the wrong paragraph.

### 2.7 Block IDs Available

Old block:

```text
id: p-123
text: Old text
```

New block:

```text
id: p-123
text: Edited text
```

Expected:

- Match by stable block ID first.
- Then diff text and format inside the block.

Risk:

- If pasted content loses IDs, fallback matching must still work.

### 2.8 Block ID Duplicated Accidentally

Scenario:

- Two blocks in the new document have the same ID due to copy/paste or editor bug.

Expected:

- Treat the ID as suspicious.
- Fall back to content and position matching.
- Report internal warning in debug mode.

Risk:

- Duplicate IDs may cause one old block to match two new blocks.

## 3. Formatting Changes

### 3.1 Word Made Bold

Old:

```text
Hello World
```

New:

```text
Hello **World**
```

Expected:

- Text unchanged.
- Mark `World` as `format_changed`.
- Show formatting highlight as a formatting change, not inserted text.

Risk:

- Raw HTML diff may show `<strong>` inserted.

### 3.2 Large Paragraph Made Italic

Old:

```text
This long paragraph has many words and remains textually unchanged.
```

New:

```text
_This long paragraph has many words and remains textually unchanged._
```

Expected:

- Show the paragraph or full range as one formatting change.
- Do not highlight every individual character or word separately.

Risk:

- Mark comparison at character granularity may produce hundreds of tiny changes.

### 3.3 Bold Replaced By Italic

Old:

```text
**Important**
```

New:

```text
_Important_
```

Expected:

- Text unchanged.
- Show bold removed and italic added.

Risk:

- UI must communicate both removed and added formatting.

### 3.4 Bold Plus Italic Added

Old:

```text
verified evidence
```

New:

```text
**_verified evidence_**
```

Expected:

- One format-change range.
- Added marks: `bold`, `italic`.

Risk:

- Nested HTML tags may normalize in different orders.

### 3.5 Equivalent Formatting Tags

Old HTML:

```html
<strong>Hello</strong>
```

New HTML:

```html
<b>Hello</b>
```

Expected:

- No change.
- Both normalize to `marks: { bold: true }`.

Risk:

- Raw HTML comparison creates a false positive.

### 3.6 Equivalent Italic Tags

Old HTML:

```html
<em>Hello</em>
```

New HTML:

```html
<i>Hello</i>
```

Expected:

- No change.
- Both normalize to `marks: { italic: true }`.

Risk:

- Raw HTML comparison creates a false positive.

### 3.7 Style Attribute Equivalent To Semantic Mark

Old HTML:

```html
<strong>Hello</strong>
```

New HTML:

```html
<span style="font-weight: 700;">Hello</span>
```

Expected:

- No change.
- Both normalize to bold.

Risk:

- CSS parsing can be incomplete.

### 3.8 Formatting Removed

Old:

```text
**Important text**
```

New:

```text
Important text
```

Expected:

- Text unchanged.
- Show formatting removed on the before side.

Risk:

- UI might show nothing on the new side, making the change hard to see.

### 3.9 Text And Format Changed Together

Old:

```text
important
```

New:

```text
**very important**
```

Expected:

- Highlight `very` as inserted.
- Highlight `important` as format changed.
- Use layered visual style for text plus formatting changes.

Risk:

- Renderer may apply only one color and hide one change type.

### 3.10 Subscript Added

Old:

```text
H2O
```

New:

```text
H₂O
```

Expected:

- Text may be logically same or different depending on representation.
- If editor stores `2` with subscript mark, show format change.
- If pasted as Unicode `₂`, show character change unless normalized specially.

Risk:

- Unicode subscript and editor subscript mark are not the same representation.

### 3.11 Superscript Added

Old:

```text
2nd priority
```

New:

```text
2ⁿᵈ priority
```

Expected:

- If stored as marks, show format change.
- If stored as Unicode superscript, show character change.

Risk:

- User may visually expect format change while algorithm sees text change.

### 3.12 Text Color Changed

Old:

```text
Risk level
```

New:

```text
Risk level
```

with color changed from black to red.

Expected:

- Text unchanged.
- Show color format changed.

Risk:

- Color values may normalize differently: `red`, `#ff0000`, `rgb(255, 0, 0)`.

### 3.13 Background Highlight Changed

Old:

```text
Important
```

New:

```text
Important
```

with yellow highlight added.

Expected:

- Show format change for background color.

Risk:

- Diff highlight color may conflict visually with user-applied highlight.

### 3.14 Link Added To Existing Text

Old:

```text
OpenAI
```

New:

```text
[OpenAI](https://openai.com)
```

Expected:

- Text unchanged.
- Show link mark added.

Risk:

- Renderer must not navigate accidentally when user clicks in diff view unless intended.

### 3.15 Link URL Changed

Old:

```text
[OpenAI](https://old.example.com)
```

New:

```text
[OpenAI](https://openai.com)
```

Expected:

- Text unchanged.
- Show link attribute changed.

Risk:

- Mark comparison must compare mark attributes, not only mark type.

## 4. Structural Changes

### 4.1 Paragraph Changed To Heading

Old:

```text
Project Goals
```

as paragraph.

New:

```text
Project Goals
```

as heading level 2.

Expected:

- Text unchanged.
- Show structure changed from paragraph to heading.

Risk:

- Renderer may only compare text and miss block type.

### 4.2 Heading Level Changed

Old:

```text
Heading level 2
```

New:

```text
Heading level 3
```

Expected:

- Show structure change: heading level 2 to heading level 3.

Risk:

- Both may normalize simply as heading if level is ignored.

### 4.3 Paragraph Changed To List Item

Old:

```text
Task one
```

New:

```text
- Task one
```

Expected:

- Text unchanged.
- Show structure changed to list item.

Risk:

- HTML parsing may treat list text differently depending on wrapper tags.

### 4.4 Bullet List Changed To Numbered List

Old:

```text
- First
- Second
```

New:

```text
1. First
2. Second
```

Expected:

- Match list items.
- Show list type changed from bullet to ordered.

Risk:

- List container structure may be ignored.

### 4.5 List Item Indentation Changed

Old:

```text
- Parent
- Child
```

New:

```text
- Parent
  - Child
```

Expected:

- Show indentation/nesting structure changed for `Child`.

Risk:

- Flattening list items may lose nesting information.

### 4.6 Text Alignment Changed

Old:

```text
Centered title
```

aligned left.

New:

```text
Centered title
```

aligned center.

Expected:

- Text unchanged.
- Show alignment format/structure changed.

Risk:

- Alignment may be stored as style, class, or block attribute.

### 4.7 Blockquote Added

Old:

```text
Witness statement
```

New:

```text
> Witness statement
```

Expected:

- Text unchanged.
- Show structure changed to blockquote.

Risk:

- Blockquote may contain nested paragraphs.

## 5. Tables

### 5.1 Table Inserted

Old:

```text
No table here.
```

New:

```text
| Name | Status |
| --- | --- |
| Case A | Open |
```

Expected:

- Show table as inserted block.
- Preserve visible table layout in diff view.

Risk:

- Renderer may flatten table text and make it unreadable.

### 5.2 Table Deleted

Expected:

- Show full table as deleted on before side.
- Preserve row/cell layout.

Risk:

- Deleted table may collapse into plain text.

### 5.3 Cell Text Changed

Old table:

```text
Case A | Open
```

New table:

```text
Case A | Closed
```

Expected:

- Match same table, row, and cell.
- Highlight `Open` deleted and `Closed` inserted inside the cell.

Risk:

- Algorithm may treat whole table as changed.

### 5.4 Row Inserted

Old:

```text
Case A | Open
Case C | Closed
```

New:

```text
Case A | Open
Case B | Pending
Case C | Closed
```

Expected:

- Match rows A and C.
- Mark row B inserted.

Risk:

- Position-only row matching may mark C as edited.

### 5.5 Row Deleted

Expected:

- Mark deleted row clearly.
- Keep remaining rows matched.

Risk:

- Table row index shift can cause false edits.

### 5.6 Column Inserted

Old:

```text
Name | Status
```

New:

```text
Name | Owner | Status
```

Expected:

- Mark inserted column.
- Preserve table readability.

Risk:

- Cell matching by index only may misalign all cells after the inserted column.

### 5.7 Column Deleted

Expected:

- Mark deleted column.
- Keep remaining columns aligned.

Risk:

- Entire table may be treated as deleted and inserted.

### 5.8 Header Changed

Old:

```text
Status
```

New:

```text
Current Status
```

Expected:

- Highlight header text change.

Risk:

- Header rows may not be treated differently from body rows.

### 5.9 Cell Formatting Changed

Old:

```text
Open
```

New:

```text
**Open**
```

Expected:

- Text unchanged.
- Show format change inside table cell.

Risk:

- Inline mark diff may not run inside nested table cells.

### 5.10 Merged Cells

Scenario:

- `colspan` or `rowspan` changes.

Expected:

- Show structure changed at cell level.
- If matching becomes unreliable, show affected rows/cells as structure changed.

Risk:

- Complex table geometry can break simple row/column indexing.

## 6. Pasted And Messy HTML

### 6.1 Pasted From Google Docs

Expected:

- Remove unnecessary wrapper spans/classes.
- Preserve meaningful bold, italic, links, lists, headings, and tables.
- Avoid showing Google Docs internal classes as changes.

Risk:

- Hidden spans and inline styles create false positives.

### 6.2 Pasted From Microsoft Word

Expected:

- Strip Word-specific metadata.
- Normalize styles into semantic marks and block attrs.

Risk:

- Word HTML can include many invisible formatting artifacts.

### 6.3 Pasted From Website

Expected:

- Sanitize unsupported tags.
- Preserve allowed formatting.
- Ignore irrelevant classes and tracking attributes.

Risk:

- Raw HTML may include scripts, unusual styles, or nested elements.

### 6.4 Same Visual Text, Different HTML

Old:

```html
<p><strong>Hello</strong></p>
```

New:

```html
<p><span style="font-weight: bold;">Hello</span></p>
```

Expected:

- No visible change.

Risk:

- Raw HTML diff creates false positive.

### 6.5 Unsupported Formatting

Scenario:

- User pastes a custom CSS effect unsupported by the editor.

Expected:

- Either normalize to a supported mark or intentionally discard it.
- Do not create unstable diff output.

Risk:

- Unsupported styles may appear/disappear unpredictably.

## 7. Unicode And Language Edge Cases

### 7.1 Emoji Added

Old:

```text
Approved
```

New:

```text
Approved ✅
```

Expected:

- Highlight emoji insertion.

Risk:

- Character diff may split emoji incorrectly if not Unicode-aware.

### 7.2 Combining Characters

Old:

```text
café
```

New:

```text
café
```

Expected:

- Normalize Unicode forms so visually identical text is unchanged.

Risk:

- Different Unicode representations produce false character changes.

### 7.3 Non-English Text

Scenario:

- Nepali, Hindi, Arabic, Chinese, Japanese, or mixed-language content.

Expected:

- Preserve text.
- Avoid English-only tokenization assumptions.
- Fall back to character or grapheme-level diff where word splitting is unreliable.

Risk:

- Word-based matching may fail for languages without spaces.

### 7.4 Right-To-Left Text

Scenario:

- Arabic or Hebrew paragraphs.

Expected:

- Render direction correctly.
- Highlight ranges without breaking layout.

Risk:

- Mixed LTR/RTL text can make highlights appear visually confusing.

## 8. Images And Media

### 8.1 Image Inserted

Expected:

- Show image block inserted.
- Include alt text or filename if available.

Risk:

- Renderer may show blank area if image source is unavailable.

### 8.2 Image Deleted

Expected:

- Show image block deleted on before side.

Risk:

- Deleted media may not be available if only stored externally.

### 8.3 Image Source Changed

Expected:

- Same image block ID but different source should show media changed.

Risk:

- If image IDs are not stable, algorithm may treat as delete plus insert.

### 8.4 Image Alt Text Changed

Expected:

- Show attribute change.

Risk:

- Alt text may be ignored if media comparison only checks source.

## 9. Comments, Mentions, And Metadata

### 9.1 Comment Added

Expected:

- If comments are in scope, show comment marker inserted.
- If comments are out of scope, ignore consistently.

Risk:

- Comments can be mistaken for text content.

### 9.2 Mention Added

Old:

```text
Please review this.
```

New:

```text
@Kabin please review this.
```

Expected:

- Show mention inserted with special mark/entity if supported.

Risk:

- Mention may be stored as inline entity, not plain text.

### 9.3 Metadata Changed But Visual Text Same

Scenario:

- Internal IDs, timestamps, or collaboration metadata changed.

Expected:

- Ignore metadata unless explicitly part of diff requirements.

Risk:

- Comparing raw JSON can create false positives.

## 10. Algorithm Confidence And Ambiguity

### 10.1 Two Similar Candidate Paragraphs

Old:

```text
The suspect denied the accusation during questioning.
```

New candidates:

```text
The suspect denied the allegation during interrogation.
The suspect denied the accusation in court.
```

Expected:

- Choose only if one candidate score is clearly better.
- Otherwise mark ambiguous or use neighboring anchors.

Risk:

- Wrong paragraph match creates misleading inline diff.

### 10.2 Low Similarity But Same Position

Expected:

- Position alone should not force a match.
- Use delete plus insert when text is too different.

Risk:

- Bad edits shown as tiny changes across unrelated paragraphs.

### 10.3 High Similarity But Far Position

Expected:

- Match if content and anchors strongly support it.
- If move detection is not a feature, still allow edited moved paragraph to be matched when clear.

Risk:

- Far-position match could incorrectly skip inserted/deleted sections.

### 10.4 Similarity Threshold Boundary

Scenario:

- Paragraph score is close to threshold.

Expected:

- Test scores just below and above the threshold.
- Ensure behavior is predictable.

Risk:

- Small text changes can flip output drastically.

## 11. Rendering And UX Edge Cases

### 11.1 Long Unbroken Word

Old:

```text
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

New:

```text
aaaaaaaaaaaaaaaaaaaaaaaaaaaabaaaaaaaaaaaaaaaaaaa
```

Expected:

- Highlight change without overflowing container.

Risk:

- Long tokens can break layout.

### 11.2 Very Long Paragraph

Expected:

- Keep readable wrapping.
- Avoid rendering thousands of spans if whole paragraph can be grouped.

Risk:

- Browser DOM becomes heavy.

### 11.3 Huge Formatting Range

Scenario:

- Entire 2-page section made italic.

Expected:

- Group formatting as a range/block-level visual change.
- Avoid per-character marks.

Risk:

- Thousands of inline highlights slow rendering.

### 11.4 Overlapping Change Types

Scenario:

- Same text range is inserted, bolded, and linked.

Expected:

- Use layered visual language.
- Do not let one highlight hide another.

Risk:

- Color-only signals become confusing.

### 11.5 Deleted Formatting In Before View

Expected:

- Formatting removed should be visible on the before side.
- New side may show normal text with a marker, border, or legend.

Risk:

- Users may miss removed formatting if only new document is emphasized.

### 11.6 Empty Document

Old:

```text

```

New:

```text
Hello
```

Expected:

- Entire new document inserted.

Risk:

- Null/empty block handling errors.

### 11.7 Both Documents Empty

Expected:

- Show no differences.
- No crash.

Risk:

- Algorithm assumes at least one block.

### 11.8 Only Formatting Toolbar Applied To Empty Selection

Scenario:

- Editor stores future typing mark but no text.

Expected:

- No diff unless document content changed.

Risk:

- Editor state may leak into document JSON.

## 12. Performance Test Cases

### 12.1 100 Paragraphs, 5 Edits

Expected:

- Most paragraphs match by hash.
- Only edited paragraphs receive deeper diff.

Risk:

- Full document character diff wastes work.

### 12.2 1,000 Paragraphs, Many Insertions

Expected:

- Use block hashes, anchors, and candidate indexes.
- UI remains responsive after clicking Compare.

Risk:

- Naive old x new paragraph comparison can become slow.

### 12.3 One Huge Paragraph

Scenario:

- Entire document pasted as one giant paragraph.

Expected:

- Fall back to sentence-level chunking before word/character diff.

Risk:

- One massive inline diff can freeze the browser.

### 12.4 Large Tables

Scenario:

- 200 rows x 20 columns.

Expected:

- Row/column matching should avoid full cell-by-cell brute force when possible.
- Renderer should virtualize or collapse large unchanged regions if necessary.

Risk:

- DOM size and table layout become slow.

### 12.5 Repeated Compare Clicks

Expected:

- Previous diff state clears cleanly.
- No memory leak.
- No duplicate highlights.

Risk:

- Renderer may append results instead of replacing them.

## 13. Data Model And Normalization Tests

### 13.1 Raw HTML Input

Expected:

- Parse into normalized document JSON.
- Sanitization happens before diff.

Risk:

- Unsafe or messy HTML enters renderer.

### 13.2 Editor JSON Input

Expected:

- Prefer editor JSON over HTML when available.
- Preserve stable block IDs and marks.

Risk:

- Converting JSON to HTML and back may lose information.

### 13.3 Unknown Node Type

Scenario:

- Editor introduces a custom node.

Expected:

- Preserve as `unknown` or map to supported structure.
- Do not crash.

Risk:

- Diff engine assumes all nodes are paragraphs.

### 13.4 Unsupported Mark Type

Expected:

- Preserve mark if possible.
- Ignore with warning if unsupported.

Risk:

- Unknown mark causes false text change or render failure.

### 13.5 Attribute Order Changed

Old:

```json
{ "bold": true, "italic": true }
```

New:

```json
{ "italic": true, "bold": true }
```

Expected:

- No change.

Risk:

- Stringifying objects without stable key order creates false positives.

## 14. Security And Safety Tests

### 14.1 Script Tag In Pasted HTML

Input:

```html
<script>alert("x")</script>
```

Expected:

- Strip script.
- Do not execute anything.

Risk:

- Unsafe `innerHTML` rendering can create XSS.

### 14.2 Event Handler Attribute

Input:

```html
<img src="x" onerror="alert(1)">
```

Expected:

- Remove event handler.

Risk:

- Pasted HTML can execute code.

### 14.3 Dangerous Links

Input:

```html
<a href="javascript:alert(1)">Click</a>
```

Expected:

- Strip or neutralize unsafe URL.

Risk:

- Rendered diff view becomes clickable attack surface.

## 15. Recommended Test Suites

### Unit Tests

Test pure functions:

- `normalizeDocument`
- `extractBlocks`
- `normalizeMarks`
- `createBlockHash`
- `buildFrequencyIndex`
- `matchBlocks`
- `diffInlineText`
- `diffMarks`
- `diffTables`
- `buildDiffResult`

### Integration Tests

Test full old/new document comparisons:

- Paragraph insertion plus edited existing paragraph.
- Formatting-only paragraph change.
- Table row insertion plus cell edit.
- Pasted messy HTML normalized to no visible change.
- Duplicate paragraphs with nearby anchors.

### Visual Regression Tests

Capture screenshots for:

- Split before/after view.
- Text plus formatting overlap.
- Large formatting range.
- Inserted/deleted table.
- Mobile/narrow layout.

### Performance Tests

Measure:

- Time to normalize.
- Time to match blocks.
- Time to run inline diffs.
- Number of DOM nodes rendered.
- Memory after repeated compares.

## 16. Implementation Priority

Build and test in this order:

1. Plain paragraph insert/delete/edit.
2. Block matching with inserted paragraphs.
3. Word-level inline diff.
4. Sentence-level grouping for replaced sentences.
5. Character-level detail inside changed words.
6. Inline format diff for bold, italic, underline, subscript, superscript.
7. Block structure diff for headings, lists, quotes, alignment.
8. Tables: inserted/deleted table, row changes, cell text changes.
9. Messy HTML normalization.
10. Performance and ambiguity handling.

## 17. Key Rule For Readable Output

The diff should not always show the smallest possible change. It should show the smallest change that is still understandable.

Examples:

- Single typo: character highlight is useful.
- Replaced sentence: sentence highlight is clearer than many word highlights.
- Whole paragraph italicized: one format range is clearer than many word highlights.
- Table inserted: whole table view is clearer than flattened text.

## 18. Current Prototype-Specific Edge Cases

The existing prototype is React + TypeScript and uses the `diff` package. The current diff logic works mainly on HTML strings split by `<br>` line breaks. This makes it useful for a simple text/HTML demo, but it creates several important edge cases for a richer editor.

### 18.1 `<br>` As The Only Block Boundary

Current behavior risk:

- Paragraphs, headings, lists, table rows, and line breaks may all collapse into line-like strings.
- A real editor may store paragraphs as `<p>`, headings as `<h1>`, lists as `<ul><li>`, and tables as `<table>`.

Expected future behavior:

- Parse the document into semantic blocks.
- Treat paragraphs, headings, list items, table cells, and media as different block types.

### 18.2 HTML Tags Split Across Diff Segments

Current behavior risk:

- The text index map skips tags, then slices the original HTML string.
- A diff range can accidentally cut through nested tags or produce invalid HTML fragments.

Expected future behavior:

- Diff text and marks from a parsed document model, not from HTML string positions.
- Render final output from structured diff data.

### 18.3 Formatting-Only Changes Are Too Broad Or Too Fragile

Current behavior risk:

- The prototype detects formatting when stripped text is equal.
- It may not know which exact mark changed, such as bold removed, italic added, link URL changed, or color changed.

Expected future behavior:

- Compare mark ranges directly.
- Produce `addedMarks`, `removedMarks`, and `changedMarkAttrs`.

### 18.4 Replaced Sentence Becomes Noisy Word Diff

Current behavior risk:

- `diffWordsWithSpace` may compare unrelated sentence fragments word by word.

Expected future behavior:

- First split matched blocks into sentence-like chunks.
- If old sentence and new sentence similarity is low, show sentence delete plus sentence insert.
- Only run word/character diff when sentence similarity is high enough.

### 18.5 Multi-Line Removed And Added Blocks Are Paired By Index

Current behavior risk:

- When a removed group and added group have different lengths, the current algorithm pairs lines by position.
- Inserted paragraphs can shift later lines and make unrelated lines look modified.

Expected future behavior:

- Match blocks by anchors, IDs, similarity, and order.
- Do not pair old/new lines only because their indexes happen to line up.

### 18.6 Tables Flatten Into Text

Current behavior risk:

- HTML tables are not represented as tables in the algorithm.
- Table row/column/cell changes may become unreadable plain text.

Expected future behavior:

- Treat table as a block node with row and cell children.
- Diff rows, columns, and cells separately.
- Render table changes in table layout.

### 18.7 `dangerouslySetInnerHTML` Requires Sanitization

Current behavior risk:

- Rendering diff segments as raw HTML requires strong sanitization.

Expected future behavior:

- Sanitize pasted/imported HTML before normalization.
- Prefer rendering React elements from structured nodes instead of injecting raw diff HTML.
- Only allow safe tags and safe attributes.

### 18.8 Regex HTML Normalization Is Not Enough

Current behavior risk:

- Regex normalization handles a few cases like `<b>` to `<strong>`.
- It will miss nested spans, mixed styles, uppercase/lowercase variations, extra CSS properties, colors, links, lists, and Word/Google Docs HTML.

Expected future behavior:

- Parse HTML using DOMParser or the editor's own parser.
- Walk the DOM tree and emit normalized document JSON.

### 18.9 Levenshtein Similarity Can Become Heavy

Current behavior risk:

- Edit distance is `O(m * n)` for two strings.
- Long lines or paragraphs can become expensive.

Expected future behavior:

- Use cheap hashes and fingerprints first.
- Run edit distance only on small candidate pairs.
- For long paragraphs, compare sentences or chunks before character-level operations.

### 18.10 Line Numbers Do Not Equal Document Positions

Current behavior risk:

- Current `beforeLineNum` and `afterLineNum` work for line-based text.
- Rich documents need block path positions, such as `block 3`, `table 1 row 4 cell 2`, or `list item 2.1`.

Expected future behavior:

- Store positions as document paths.
- Example: `[blockIndex]`, `[tableIndex, rowIndex, cellIndex, blockIndex]`.

## 19. Structured Theory For Solving The Rich Text Diff

This is the recommended mental model before coding.

### 19.1 Use A Document Model, Not HTML Strings

The algorithm should compare normalized JSON like this:

```json
{
  "blocks": [
    {
      "id": "optional-stable-id",
      "type": "paragraph",
      "attrs": {},
      "children": [
        {
          "text": "The archive contains ",
          "marks": {}
        },
        {
          "text": "verified evidence",
          "marks": {
            "bold": true
          }
        }
      ]
    }
  ]
}
```

Do not compare this directly:

```html
<p>The archive contains <strong>verified evidence</strong></p>
```

HTML is an input/output format. The diff engine should work on semantic structure.

### 19.2 Separate The System Into Layers

The clean architecture is:

```text
Editor content
  -> normalizer
  -> document JSON
  -> block matcher
  -> inline text diff
  -> format diff
  -> structure diff
  -> diff result JSON
  -> renderer
```

Each layer should be testable by itself.

### 19.3 Normalize First

Normalization removes meaningless differences.

Examples:

- `<b>`, `<strong>`, and `font-weight: 700` all become `marks.bold = true`.
- `<i>` and `<em>` both become `marks.italic = true`.
- `red`, `#ff0000`, and `rgb(255, 0, 0)` should become one normalized color value.
- Empty spans and editor-specific wrappers should be removed.
- Attribute order should be stable.

Without normalization, the app will show false changes.

### 19.4 Match Blocks Before Diffing Text

Do not run character diff across the whole document.

First compare blocks:

- paragraph
- heading
- list item
- quote
- table
- table row
- table cell
- image/media block

Use this priority:

1. Stable block ID match.
2. Exact normalized text hash match.
3. Anchor-based region matching.
4. Rare token and phrase similarity.
5. Position and neighbor hints.
6. Similarity threshold.
7. If uncertain, show delete plus insert.

### 19.5 Use Anchors To Handle Inserted Paragraphs

Example:

```text
Old: A, B, C
New: A, X, Y, B edited, C
```

The algorithm should:

- Match `A` as an exact anchor.
- Match `C` as an exact anchor.
- Compare only the region between them.
- Match `B` to `B edited`.
- Mark `X` and `Y` as inserted.

This avoids the common mistake of comparing by index only.

### 19.6 Use Weighted Fingerprints, Not Simple Keywords

Documents often repeat topic words. In a crime document, words like `crime`, `suspect`, and `evidence` may appear everywhere.

Better matching should use:

- rare words
- rare two-word and three-word phrases
- nearby anchors
- block type
- length similarity
- stable IDs when available

Common words should have low weight. Rare phrases should have high weight.

### 19.7 Decide The Right Granularity Per Situation

Readable diff is not always the smallest diff.

Use different levels:

- Character diff for typos.
- Word diff for small edits.
- Sentence diff for replaced sentences.
- Paragraph/block diff for heavy rewrites.
- Range-level format diff for large formatting changes.
- Table row/cell diff for tables.

Example rule:

```text
If two sentences have low similarity, show deleted sentence plus inserted sentence.
If they have high similarity, show word/character edits inside the sentence.
```

### 19.8 Compare Formatting After Text Alignment

Text alignment answers:

```text
Which old text corresponds to which new text?
```

Then formatting comparison answers:

```text
What marks changed on that aligned text?
```

Format changes should output structured data:

```json
{
  "type": "format_changed",
  "text": "verified evidence",
  "addedMarks": ["italic"],
  "removedMarks": [],
  "changedAttrs": []
}
```

For big ranges, group adjacent text with the same formatting change.

### 19.9 Treat Block Structure Separately

Text can stay the same while structure changes.

Examples:

- paragraph to heading
- heading level 2 to heading level 3
- bullet list to numbered list
- paragraph to blockquote
- left aligned to centered
- table cell merged or split

These should not be hidden inside text diff.

### 19.10 Tables Need Their Own Mini-Diff

Tables should be compared as structured grids.

Recommended order:

1. Match table blocks.
2. Match rows using row IDs or cell text fingerprints.
3. Match columns using headers or column fingerprints.
4. Diff cells as small rich-text documents.
5. Render inserted/deleted rows and columns in visible table layout.

Avoid flattening tables into plain text.

### 19.11 Output A Diff Result JSON

The renderer should receive structured diff data, not raw HTML fragments.

Example:

```json
{
  "summary": {
    "insertedBlocks": 2,
    "deletedBlocks": 1,
    "editedBlocks": 3,
    "formatChanges": 2,
    "structureChanges": 1
  },
  "blocks": [
    {
      "type": "matched",
      "oldPath": [0],
      "newPath": [0],
      "score": 1,
      "changes": []
    },
    {
      "type": "inserted",
      "newPath": [1]
    },
    {
      "type": "matched",
      "oldPath": [1],
      "newPath": [3],
      "score": 0.82,
      "changes": [
        {
          "type": "text",
          "oldText": "explains",
          "newText": "describes"
        }
      ]
    }
  ]
}
```

This makes rendering, testing, and debugging much easier.

### 19.12 Recommended Implementation Roadmap

Build in phases:

1. Replace line-based HTML diff with normalized block JSON.
2. Add block hashing and exact anchors.
3. Add similarity-based block matching.
4. Add sentence-aware inline diff.
5. Add mark/range diff for bold, italic, underline, subscript, superscript.
6. Add block structure diff for headings, lists, alignment, quotes.
7. Add table-specific diff.
8. Add paste normalization for Google Docs, Word, and web HTML.
9. Add ambiguity handling and confidence scores.
10. Add performance protections for large documents.

### 19.13 Practical Library Choices

Use custom logic for:

- normalization into your editor model
- block matching
- format mark comparison
- table structure comparison

Use a proven library for:

- inline word/character diff

Candidate libraries:

- `diff`, already used in the prototype
- `diff-match-patch`
- `fast-diff`

The key is not the library itself. The key is only using it after the correct old/new blocks have already been matched.

### 19.14 Browser Or Node

For this prototype:

- Run the algorithm in browser JavaScript.
- Use React for UI.
- Use TypeScript for safer data modeling.

Use Node/backend later if:

- documents are very large
- comparison results must be saved
- audit logs are required
- background processing is needed
- consistent server-side results are more important than local responsiveness

### 19.15 Main Principle

Find the corresponding document parts first. Then inspect what changed inside those parts.

The wrong approach:

```text
Compare old HTML string against new HTML string.
```

The right approach:

```text
Normalize to document JSON.
Match blocks.
Diff text inside matched blocks.
Diff formatting on aligned text.
Diff structure around the text.
Render from structured results.
```
