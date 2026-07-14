const STOP_WORDS = new Set(
  "the a an and or but is was were are to of in on for from with by it this that after before about during near into has have had be been as at while then later under over".split(" ")
);

const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "li", "blockquote", "table"]);

export function diffDocuments(beforeHtml, afterHtml) {
  const beforeDoc = normalizeDocument(beforeHtml);
  const afterDoc = normalizeDocument(afterHtml);
  const matchResult = matchBlocks(beforeDoc.blocks, afterDoc.blocks);
  const blockDiffs = buildBlockDiffs(beforeDoc.blocks, afterDoc.blocks, matchResult);
  return {
    beforeDoc,
    afterDoc,
    blockDiffs,
    summary: summarize(blockDiffs)
  };
}

export function normalizeDocument(html) {
  const template = document.createElement("template");
  template.innerHTML = sanitizeHtml(html);
  const blocks = [];
  collectBlocks(template.content, blocks);
  return { blocks };
}

function sanitizeHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, "");
}

function collectBlocks(root, blocks) {
  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (text) blocks.push(createTextBlock("paragraph", {}, [{ text, marks: {} }]));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      Array.from(node.children).forEach((child) => {
        if (child.tagName.toLowerCase() === "li") {
          blocks.push(createTextBlock("listItem", { listType: tag === "ol" ? "ordered" : "bullet" }, flattenInline(child, {})));
        }
      });
      return;
    }
    if (tag === "table") {
      blocks.push(createTableBlock(node));
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      const type = tag.startsWith("h") ? "heading" : tag === "blockquote" ? "blockquote" : "paragraph";
      const attrs = tag.startsWith("h") ? { level: Number(tag.slice(1)) } : {};
      blocks.push(createTextBlock(type, attrs, flattenInline(node, {})));
      return;
    }
    collectBlocks(node, blocks);
  });
}

function createTextBlock(type, attrs, children) {
  const text = children.map((part) => part.text).join("").replace(/\s+/g, " ").trim();
  return {
    kind: "text",
    type,
    attrs,
    children: mergeAdjacentRuns(children),
    text,
    normalizedText: normalizeText(text),
    hash: stableString({ type, attrs, text: normalizeText(text), marks: markSignature(children) })
  };
}

function createTableBlock(table) {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) => ({
    cells: Array.from(row.children)
      .filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase()))
      .map((cell) => ({
        header: cell.tagName.toLowerCase() === "th",
        colspan: Number(cell.getAttribute("colspan") || 1),
        rowspan: Number(cell.getAttribute("rowspan") || 1),
        children: mergeAdjacentRuns(flattenInline(cell, {}))
      }))
  }));
  const text = rows.map((row) => row.cells.map((cell) => inlineText(cell.children)).join(" | ")).join("\n");
  return {
    kind: "table",
    type: "table",
    attrs: {},
    rows,
    text,
    normalizedText: normalizeText(text),
    hash: stableString({ type: "table", text: normalizeText(text), shape: tableShape(rows) })
  };
}

function flattenInline(node, inheritedMarks) {
  const tag = node.nodeType === Node.ELEMENT_NODE ? node.tagName.toLowerCase() : "";
  const marks = normalizeMarks(tag, node, inheritedMarks);
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ? [{ text: node.textContent, marks }] : [];
  }
  if (tag === "br") return [{ text: "\n", marks }];
  return Array.from(node.childNodes).flatMap((child) => flattenInline(child, marks));
}

function normalizeMarks(tag, node, inherited) {
  const marks = { ...inherited };
  if (tag === "strong" || tag === "b") marks.bold = true;
  if (tag === "em" || tag === "i") marks.italic = true;
  if (tag === "u") marks.underline = true;
  if (tag === "sub") marks.subscript = true;
  if (tag === "sup") marks.superscript = true;
  if (tag === "a") {
    const href = node.getAttribute("href");
    if (href && !href.trim().toLowerCase().startsWith("javascript:")) marks.link = { href };
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const style = node.getAttribute("style") || "";
    if (/font-weight\s*:\s*(bold|bolder|[7-9]00)/i.test(style)) marks.bold = true;
    if (/font-style\s*:\s*italic/i.test(style)) marks.italic = true;
    if (/text-decoration[^;]*underline/i.test(style)) marks.underline = true;
    const color = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1];
    const background = style.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1];
    if (color) marks.color = normalizeCssValue(color);
    if (background) marks.backgroundColor = normalizeCssValue(background);
  }
  return marks;
}

function matchBlocks(beforeBlocks, afterBlocks) {
  const matches = [];
  const usedBefore = new Set();
  const usedAfter = new Set();
  beforeBlocks.forEach((beforeBlock, beforeIndex) => {
    const exactIndex = afterBlocks.findIndex((afterBlock, afterIndex) => !usedAfter.has(afterIndex) && beforeBlock.hash === afterBlock.hash);
    if (exactIndex >= 0) {
      matches.push({ beforeIndex, afterIndex: exactIndex, score: 1, reason: "exact-anchor" });
      usedBefore.add(beforeIndex);
      usedAfter.add(exactIndex);
    }
  });

  const frequency = buildFrequency(afterBlocks.filter((_, index) => !usedAfter.has(index)));
  beforeBlocks.forEach((beforeBlock, beforeIndex) => {
    if (usedBefore.has(beforeIndex)) return;
    let best = null;
    afterBlocks.forEach((afterBlock, afterIndex) => {
      if (usedAfter.has(afterIndex)) return;
      const score = blockSimilarity(beforeBlock, afterBlock, frequency, beforeIndex, afterIndex, beforeBlocks.length, afterBlocks.length);
      if (!best || score > best.score) best = { beforeIndex, afterIndex, score, reason: "weighted-similarity" };
    });
    if (best && best.score >= 0.38) {
      matches.push(best);
      usedBefore.add(best.beforeIndex);
      usedAfter.add(best.afterIndex);
    }
  });
  return { matches: matches.sort((a, b) => a.afterIndex - b.afterIndex), usedBefore, usedAfter };
}

function buildBlockDiffs(beforeBlocks, afterBlocks, matchResult) {
  const byBefore = new Map(matchResult.matches.map((match) => [match.beforeIndex, match]));
  const matchedAfter = new Set(matchResult.matches.map((match) => match.afterIndex));
  const diffs = [];
  const emittedAfter = new Set();

  beforeBlocks.forEach((beforeBlock, beforeIndex) => {
    const match = byBefore.get(beforeIndex);
    if (!match) {
      diffs.push({ type: "deleted", beforeBlock, beforeIndex });
      return;
    }
    for (let index = 0; index < match.afterIndex; index += 1) {
      if (!matchedAfter.has(index) && !emittedAfter.has(index)) {
        diffs.push({ type: "inserted", afterBlock: afterBlocks[index], afterIndex: index });
        emittedAfter.add(index);
      }
    }
    const afterBlock = afterBlocks[match.afterIndex];
    diffs.push(compareMatchedBlock(beforeBlock, afterBlock, beforeIndex, match.afterIndex, match));
    emittedAfter.add(match.afterIndex);
  });

  afterBlocks.forEach((afterBlock, afterIndex) => {
    if (!matchedAfter.has(afterIndex) && !emittedAfter.has(afterIndex)) {
      diffs.push({ type: "inserted", afterBlock, afterIndex });
    }
  });
  return diffs;
}

function compareMatchedBlock(beforeBlock, afterBlock, beforeIndex, afterIndex, match) {
  if (beforeBlock.kind === "table" || afterBlock.kind === "table") {
    return {
      type: beforeBlock.kind === afterBlock.kind ? "matched" : "structure_changed",
      beforeBlock,
      afterBlock,
      beforeIndex,
      afterIndex,
      match,
      tableDiff: beforeBlock.kind === afterBlock.kind ? diffTable(beforeBlock, afterBlock) : null,
      structureChanged: beforeBlock.kind !== afterBlock.kind
    };
  }
  const textChanged = beforeBlock.normalizedText !== afterBlock.normalizedText;
  const structureChanged = beforeBlock.type !== afterBlock.type || stableString(beforeBlock.attrs) !== stableString(afterBlock.attrs);
  const formatChanges = diffMarks(beforeBlock.children, afterBlock.children);
  const inlineDiff = textChanged ? diffTextReadable(beforeBlock.text, afterBlock.text) : [];
  return {
    type: textChanged || structureChanged || formatChanges.length ? "matched" : "unchanged",
    beforeBlock,
    afterBlock,
    beforeIndex,
    afterIndex,
    match,
    textChanged,
    structureChanged,
    formatChanges,
    inlineDiff
  };
}

function diffTable(beforeTable, afterTable) {
  const rowMatches = matchRows(beforeTable.rows, afterTable.rows);
  const rows = [];
  const matchedAfter = new Set(rowMatches.map((match) => match.afterIndex));
  const emittedAfter = new Set();
  beforeTable.rows.forEach((beforeRow, beforeIndex) => {
    const match = rowMatches.find((item) => item.beforeIndex === beforeIndex);
    if (!match) {
      rows.push({ type: "deleted", beforeRow, beforeIndex });
      return;
    }
    for (let index = 0; index < match.afterIndex; index += 1) {
      if (!matchedAfter.has(index) && !emittedAfter.has(index)) {
        rows.push({ type: "inserted", afterRow: afterTable.rows[index], afterIndex: index });
        emittedAfter.add(index);
      }
    }
    rows.push({ type: "matched", beforeRow, afterRow: afterTable.rows[match.afterIndex], beforeIndex, afterIndex: match.afterIndex, cells: diffCells(beforeRow, afterTable.rows[match.afterIndex]) });
    emittedAfter.add(match.afterIndex);
  });
  afterTable.rows.forEach((afterRow, afterIndex) => {
    if (!matchedAfter.has(afterIndex) && !emittedAfter.has(afterIndex)) rows.push({ type: "inserted", afterRow, afterIndex });
  });
  return { rows };
}

function matchRows(beforeRows, afterRows) {
  const matches = [];
  const usedAfter = new Set();
  beforeRows.forEach((beforeRow, beforeIndex) => {
    let best = null;
    afterRows.forEach((afterRow, afterIndex) => {
      if (usedAfter.has(afterIndex)) return;
      const score = jaccard(tokensFor(rowText(beforeRow)), tokensFor(rowText(afterRow)));
      if (!best || score > best.score) best = { beforeIndex, afterIndex, score };
    });
    if (best && best.score >= 0.34) {
      matches.push(best);
      usedAfter.add(best.afterIndex);
    }
  });
  return matches;
}

function diffCells(beforeRow, afterRow) {
  const length = Math.max(beforeRow.cells.length, afterRow.cells.length);
  return Array.from({ length }, (_, index) => {
    const beforeCell = beforeRow.cells[index];
    const afterCell = afterRow.cells[index];
    if (!beforeCell) return { type: "inserted", afterCell };
    if (!afterCell) return { type: "deleted", beforeCell };
    const beforeText = inlineText(beforeCell.children);
    const afterText = inlineText(afterCell.children);
    const textChanged = normalizeText(beforeText) !== normalizeText(afterText);
    return {
      type: textChanged ? "edited" : "unchanged",
      beforeCell,
      afterCell,
      inlineDiff: textChanged ? diffTextReadable(beforeText, afterText) : [],
      formatChanges: diffMarks(beforeCell.children, afterCell.children)
    };
  });
}

function diffTextReadable(beforeText, afterText) {
  const beforeSentences = splitSentences(beforeText);
  const afterSentences = splitSentences(afterText);
  if (!looksLikeTechnicalLine(beforeText) && !looksLikeTechnicalLine(afterText) && (beforeSentences.length > 1 || afterSentences.length > 1)) {
    return diffSequence(beforeSentences, afterSentences, normalizeText, 0.58, "sentence");
  }
  return diffSequence(tokenizeDiffUnits(beforeText), tokenizeDiffUnits(afterText), tokenKey, 0.72, "word");
}

function diffSequence(beforeItems, afterItems, keyFn, similarityThreshold, unit) {
  const dp = Array.from({ length: beforeItems.length + 1 }, () => Array(afterItems.length + 1).fill(0));
  for (let i = beforeItems.length - 1; i >= 0; i -= 1) {
    for (let j = afterItems.length - 1; j >= 0; j -= 1) {
      dp[i][j] = keyFn(beforeItems[i]) === keyFn(afterItems[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < beforeItems.length || j < afterItems.length) {
    if (i < beforeItems.length && j < afterItems.length && keyFn(beforeItems[i]) === keyFn(afterItems[j])) {
      out.push({ type: "unchanged", text: beforeItems[i], unit });
      i += 1;
      j += 1;
    } else if (i < beforeItems.length && j < afterItems.length) {
      const sim = simpleSimilarity(beforeItems[i], afterItems[j]);
      if (sim >= similarityThreshold) {
        if (unit === "sentence") {
          out.push({ type: "edited", beforeText: beforeItems[i], afterText: afterItems[j], unit, children: diffSequence(tokenizeDiffUnits(beforeItems[i]), tokenizeDiffUnits(afterItems[j]), tokenKey, 0.72, "word") });
        } else {
          out.push({ type: "deleted", text: beforeItems[i], unit });
          out.push({ type: "inserted", text: afterItems[j], unit });
        }
        i += 1;
        j += 1;
      } else if (j < afterItems.length && (i === beforeItems.length || dp[i][j + 1] >= dp[i + 1]?.[j])) {
        out.push({ type: "inserted", text: afterItems[j], unit });
        j += 1;
      } else {
        out.push({ type: "deleted", text: beforeItems[i], unit });
        i += 1;
      }
    } else if (j < afterItems.length) {
      out.push({ type: "inserted", text: afterItems[j], unit });
      j += 1;
    } else {
      out.push({ type: "deleted", text: beforeItems[i], unit });
      i += 1;
    }
  }
  return out;
}

function diffMarks(beforeRuns, afterRuns) {
  if (inlineText(beforeRuns) !== inlineText(afterRuns)) return [];
  const beforeRanges = markRanges(beforeRuns);
  const afterRanges = markRanges(afterRuns);
  const changes = [];
  const length = Math.max(beforeRanges.length, afterRanges.length);
  for (let index = 0; index < length; index += 1) {
    const before = beforeRanges[index];
    const after = afterRanges[index];
    if (!before || !after) continue;
    if (stableString(before.marks) !== stableString(after.marks)) {
      changes.push({
        text: after.text,
        beforeMarks: before.marks,
        afterMarks: after.marks,
        addedMarks: Object.keys(after.marks).filter((key) => stableString(after.marks[key]) !== stableString(before.marks[key])),
        removedMarks: Object.keys(before.marks).filter((key) => !(key in after.marks))
      });
    }
  }
  return groupFormatChanges(changes);
}

function markRanges(runs) {
  return mergeAdjacentRuns(runs).map((run) => ({ text: run.text, marks: run.marks }));
}

function groupFormatChanges(changes) {
  const grouped = [];
  changes.forEach((change) => {
    const last = grouped[grouped.length - 1];
    if (last && stableString(last.beforeMarks) === stableString(change.beforeMarks) && stableString(last.afterMarks) === stableString(change.afterMarks)) {
      last.text += change.text;
    } else {
      grouped.push({ ...change });
    }
  });
  return grouped;
}

function blockSimilarity(beforeBlock, afterBlock, frequency, beforeIndex, afterIndex, beforeTotal, afterTotal) {
  if (beforeBlock.kind !== afterBlock.kind) return 0.12;
  if (beforeBlock.hash === afterBlock.hash) return 1;
  const beforeTerms = termsFor(beforeBlock.text);
  const afterTermSet = new Set(termsFor(afterBlock.text));
  let shared = 0;
  let total = 0;
  beforeTerms.forEach((term) => {
    const weight = 1 / Math.max(1, frequency.get(term) || 1);
    total += weight;
    if (afterTermSet.has(term)) shared += weight;
  });
  const tokenScore = total ? shared / total : 0;
  const lengthScore = Math.min(beforeBlock.text.length, afterBlock.text.length) / Math.max(beforeBlock.text.length || 1, afterBlock.text.length || 1);
  const sequenceScore = orderedTokenSimilarity(beforeBlock.text, afterBlock.text);
  const charScore = charNgramSimilarity(beforeBlock.text, afterBlock.text);
  const typeScore = beforeBlock.type === afterBlock.type ? 1 : 0.5;
  const beforeRatio = beforeTotal > 1 ? beforeIndex / (beforeTotal - 1) : 0;
  const afterRatio = afterTotal > 1 ? afterIndex / (afterTotal - 1) : 0;
  const positionScore = 1 - Math.min(1, Math.abs(beforeRatio - afterRatio));
  return tokenScore * 0.38 + sequenceScore * 0.22 + charScore * 0.12 + lengthScore * 0.08 + typeScore * 0.08 + positionScore * 0.12;
}

function buildFrequency(blocks) {
  const frequency = new Map();
  blocks.forEach((block) => {
    new Set(termsFor(block.text)).forEach((term) => frequency.set(term, (frequency.get(term) || 0) + 1));
  });
  return frequency;
}

function termsFor(text) {
  const tokens = tokensFor(text);
  const phrases = [];
  for (let index = 0; index < tokens.length - 1; index += 1) phrases.push(`${tokens[index]} ${tokens[index + 1]}`);
  for (let index = 0; index < tokens.length - 2; index += 1) phrases.push(`${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`);
  return tokens.concat(phrases);
}

function tokensFor(text) {
  return normalizeText(text).split(" ").filter((token) => token && !STOP_WORDS.has(token));
}

function orderedTokenSimilarity(beforeText, afterText) {
  const beforeTokens = tokenizeDiffUnits(beforeText).map(tokenKey).filter(Boolean);
  const afterTokens = tokenizeDiffUnits(afterText).map(tokenKey).filter(Boolean);
  if (!beforeTokens.length || !afterTokens.length) return 0;
  const dp = Array.from({ length: beforeTokens.length + 1 }, () => Array(afterTokens.length + 1).fill(0));
  for (let i = beforeTokens.length - 1; i >= 0; i -= 1) {
    for (let j = afterTokens.length - 1; j >= 0; j -= 1) {
      dp[i][j] = beforeTokens[i] === afterTokens[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp[0][0] / Math.max(beforeTokens.length, afterTokens.length);
}

function splitSentences(text) {
  const matches = String(text).match(/[^.!?]+[.!?]+|\S[^.!?]*$/g);
  return (matches || [text]).map((item) => item.trim()).filter(Boolean);
}

function tokenizeDiffUnits(text) {
  return String(text).match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]+|\s+/gu) || [];
}

function tokenKey(value) {
  const normalized = normalizeText(value);
  return normalized || String(value).trim();
}

function looksLikeTechnicalLine(text) {
  return /https?:\/\/|\/[\w-]+|HTTP\/\d|[A-Z][A-Za-z-]*:\s|[+=_{}[\]<>]/.test(String(text));
}

function normalizeText(text) {
  return String(text).normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function simpleSimilarity(a, b) {
  return Math.max(jaccard(tokensFor(a), tokensFor(b)), orderedTokenSimilarity(a, b), charNgramSimilarity(a, b));
}

function charNgramSimilarity(a, b) {
  const left = charNgrams(normalizeText(a), 4);
  const right = charNgrams(normalizeText(b), 4);
  return jaccard(left, right);
}

function charNgrams(value, size) {
  if (!value) return [];
  if (value.length <= size) return [value];
  const grams = [];
  for (let index = 0; index <= value.length - size; index += 1) {
    grams.push(value.slice(index, index + size));
  }
  return grams;
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);
  let shared = 0;
  setA.forEach((item) => {
    if (setB.has(item)) shared += 1;
  });
  return union.size ? shared / union.size : 0;
}

function summarize(blockDiffs) {
  const summary = { inserted: 0, deleted: 0, edited: 0, formatting: 0, structure: 0, unchanged: 0, ambiguous: 0 };
  blockDiffs.forEach((diff) => {
    if (diff.type === "inserted") summary.inserted += 1;
    else if (diff.type === "deleted") summary.deleted += 1;
    else if (diff.type === "unchanged") summary.unchanged += 1;
    else {
      if (diff.textChanged || diff.inlineDiff?.some((item) => item.type !== "unchanged")) summary.edited += 1;
      if (diff.formatChanges?.length) summary.formatting += diff.formatChanges.length;
      if (diff.structureChanged) summary.structure += 1;
      if (diff.tableDiff) {
        diff.tableDiff.rows.forEach((row) => {
          if (row.type === "inserted") summary.inserted += 1;
          if (row.type === "deleted") summary.deleted += 1;
          if (row.cells?.some((cell) => cell.type === "edited")) summary.edited += 1;
        });
      }
    }
  });
  return summary;
}

function mergeAdjacentRuns(runs) {
  const merged = [];
  runs.forEach((run) => {
    if (!run.text) return;
    const last = merged[merged.length - 1];
    if (last && stableString(last.marks) === stableString(run.marks)) {
      last.text += run.text;
    } else {
      merged.push({ text: run.text, marks: { ...run.marks } });
    }
  });
  return merged;
}

function markSignature(children) {
  return mergeAdjacentRuns(children).map((run) => `${normalizeText(run.text)}:${stableString(run.marks)}`).join("|");
}

function inlineText(children) {
  return children.map((part) => part.text).join("");
}

function tableShape(rows) {
  return rows.map((row) => row.cells.map((cell) => `${cell.header ? "h" : "d"}:${cell.colspan}:${cell.rowspan}`).join(",")).join("|");
}

function rowText(row) {
  return row.cells.map((cell) => inlineText(cell.children)).join(" ");
}

function normalizeCssValue(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function stableString(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableString).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableString(value[key])}`).join(",")}}`;
}
