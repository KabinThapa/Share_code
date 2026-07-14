import { diffDocuments } from "./diff-engine.js";

const beforeEditor = document.querySelector("#beforeEditor");
const afterEditor = document.querySelector("#afterEditor");
const beforeDiff = document.querySelector("#beforeDiff");
const afterDiff = document.querySelector("#afterDiff");
const matchMap = document.querySelector("#matchMap");
const summaryStrip = document.querySelector("#summaryStrip");
const sampleBtn = document.querySelector("#sampleBtn");
const clearBtn = document.querySelector("#clearBtn");
const compareBtn = document.querySelector("#compareBtn");

const sample = {
  before: `
    <h2>Riverside Case Notes</h2>
    <p>The detective reviewed the witness statement before midnight.</p>
    <p>The second report explains the final decision. It was approved by the team after legal review.</p>
    <p>The archive contains <strong>verified evidence</strong> and a timeline of events.</p>
    <table>
      <thead><tr><th>Case</th><th>Owner</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>Case A</td><td>Maya</td><td>Open</td></tr>
        <tr><td>Case C</td><td>Kabin</td><td>Closed</td></tr>
      </tbody>
    </table>
  `,
  after: `
    <h2>Riverside Case Summary</h2>
    <p>The detective reviewed the witness statement before midnight.</p>
    <p>A new paragraph was inserted about camera footage near the motel entrance.</p>
    <p>The second report describes the final decision. It was approved by the product team after legal review.</p>
    <p>The archive contains <strong><em>verified evidence</em></strong> and a timeline of events.</p>
    <table>
      <thead><tr><th>Case</th><th>Owner</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>Case A</td><td>Maya</td><td>Open</td></tr>
        <tr><td>Case B</td><td>Riya</td><td>Pending</td></tr>
        <tr><td>Case C</td><td>Kabin</td><td>Reopened</td></tr>
      </tbody>
    </table>
  `
};

sampleBtn.addEventListener("click", loadSample);
clearBtn.addEventListener("click", clearAll);
compareBtn.addEventListener("click", runCompare);
beforeEditor.addEventListener("paste", handleEditorPaste);
afterEditor.addEventListener("paste", handleEditorPaste);

loadSample();

function loadSample() {
  beforeEditor.innerHTML = sample.before.trim();
  afterEditor.innerHTML = sample.after.trim();
  runCompare();
}

function clearAll() {
  beforeEditor.innerHTML = "";
  afterEditor.innerHTML = "";
  beforeDiff.innerHTML = emptyState("Before diff will appear here after comparing.");
  afterDiff.innerHTML = emptyState("After diff will appear here after comparing.");
  matchMap.innerHTML = emptyState("Block matches will appear here.");
  summaryStrip.innerHTML = "";
  beforeEditor.focus();
}

function handleEditorPaste(event) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;

  const html = clipboard.getData("text/html");
  const text = clipboard.getData("text/plain");

  if (html) {
    event.preventDefault();
    insertHtmlAtSelection(sanitizePastedHtml(html));
    return;
  }

  if (looksLikeHtml(text)) {
    event.preventDefault();
    insertHtmlAtSelection(sanitizePastedHtml(text));
  }
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value || "");
}

function sanitizePastedHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = value;
  template.content.querySelectorAll("script, style, iframe, object, embed, meta, link").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) node.removeAttribute(attr.name);
      if ((name === "href" || name === "src") && val.startsWith("javascript:")) node.removeAttribute(attr.name);
    });
  });
  return template.innerHTML;
}

function insertHtmlAtSelection(html) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();

  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = template.content;
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);

  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function runCompare() {
  const result = diffDocuments(beforeEditor.innerHTML, afterEditor.innerHTML);
  renderSummary(result.summary);
  renderDiff(result);
  renderMap(result.blockDiffs);
}

function renderSummary(summary) {
  summaryStrip.innerHTML = Object.entries(summary)
    .map(([key, value]) => `<span class="summary-pill"><strong>${value}</strong>${escapeHtml(key)}</span>`)
    .join("");
}

function renderDiff(result) {
  beforeDiff.innerHTML = "";
  afterDiff.innerHTML = "";
  result.blockDiffs.forEach((diff) => {
    const beforeNode = renderBeforeBlock(diff);
    const afterNode = renderAfterBlock(diff);
    if (beforeNode) beforeDiff.append(beforeNode);
    if (afterNode) afterDiff.append(afterNode);
  });
}

function renderBeforeBlock(diff) {
  if (diff.type === "inserted") return placeholderBlock("inserted-block-gap");
  if (diff.beforeBlock?.kind === "table") return renderTableSide(diff, "before");
  const block = diff.beforeBlock;
  const classNames = ["diff-block"];
  if (diff.type === "deleted") classNames.push("deleted");
  if (diff.structureChanged) classNames.push("structure");
  if (diff.formatChanges?.length) classNames.push("format");
  const element = document.createElement(block.type === "heading" ? `h${block.attrs.level || 2}` : "div");
  element.className = classNames.join(" ");
  if (diff.inlineDiff?.length) {
    element.innerHTML = renderInline(diff.inlineDiff, "before");
  } else {
    element.innerHTML = renderRuns(block.children, diff.formatChanges);
  }
  return element;
}

function renderAfterBlock(diff) {
  if (diff.type === "deleted") return placeholderBlock("deleted-block-gap");
  if (diff.afterBlock?.kind === "table") return renderTableSide(diff, "after");
  const block = diff.afterBlock;
  const classNames = ["diff-block"];
  if (diff.type === "inserted") classNames.push("inserted");
  if (diff.structureChanged) classNames.push("structure");
  if (diff.formatChanges?.length) classNames.push("format");
  const element = document.createElement(block.type === "heading" ? `h${block.attrs.level || 2}` : "div");
  element.className = classNames.join(" ");
  if (diff.inlineDiff?.length) {
    element.innerHTML = renderInline(diff.inlineDiff, "after");
  } else {
    element.innerHTML = renderRuns(block.children, diff.formatChanges);
  }
  return element;
}

function renderTableSide(diff, side) {
  if ((side === "before" && diff.type === "inserted") || (side === "after" && diff.type === "deleted")) {
    return placeholderBlock(`${side}-table-gap`);
  }
  if (!diff.tableDiff) {
    const tableBlock = side === "before" ? diff.beforeBlock : diff.afterBlock;
    const wrapper = document.createElement("div");
    wrapper.className = `diff-block ${diff.type === "deleted" ? "deleted" : "inserted"} table-wrap`;
    wrapper.append(renderRawTable(tableBlock.rows));
    return wrapper;
  }
  const table = document.createElement("table");
  table.className = "diff-table";
  diff.tableDiff.rows.forEach((row) => {
    if (side === "before" && row.type === "inserted") return;
    if (side === "after" && row.type === "deleted") return;
    const tr = document.createElement("tr");
    if (row.type === "inserted") tr.className = "inserted";
    if (row.type === "deleted") tr.className = "deleted";
    if (row.type !== "matched") {
      const sourceRow = side === "before" ? row.beforeRow : row.afterRow;
      sourceRow.cells.forEach((cell) => appendCell(tr, cell, row.type));
    } else {
      row.cells.forEach((cellDiff) => {
        const cell = side === "before" ? cellDiff.beforeCell : cellDiff.afterCell;
        const td = appendCell(tr, cell, cellDiff.type);
        if (cellDiff.inlineDiff?.length) td.innerHTML = renderInline(cellDiff.inlineDiff, side);
      });
    }
    table.append(tr);
  });
  const wrapper = document.createElement("div");
  wrapper.className = "table-wrap";
  wrapper.append(table);
  return wrapper;
}

function appendCell(row, cell, type) {
  const td = document.createElement(cell.header ? "th" : "td");
  td.className = type === "edited" ? "edited" : type === "inserted" ? "inserted" : type === "deleted" ? "deleted" : "";
  td.colSpan = cell.colspan || 1;
  td.rowSpan = cell.rowspan || 1;
  td.innerHTML = renderRuns(cell.children, []);
  row.append(td);
  return td;
}

function renderRawTable(rows) {
  const table = document.createElement("table");
  table.className = "diff-table";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.cells.forEach((cell) => appendCell(tr, cell, ""));
    table.append(tr);
  });
  return table;
}

function renderInline(items, side) {
  return items.map((item) => {
    if (item.type === "unchanged") return escapeHtml(item.text);
    if (item.type === "edited" && item.children) return renderInline(item.children, side);
    if (side === "before" && item.type === "deleted") return `<span class="mark deleted">${escapeHtml(item.text)}</span>`;
    if (side === "after" && item.type === "inserted") return `<span class="mark inserted">${escapeHtml(item.text)}</span>`;
    if (side === "before" && item.type === "inserted") return "";
    if (side === "after" && item.type === "deleted") return "";
    if (item.beforeText || item.afterText) return escapeHtml(side === "before" ? item.beforeText || "" : item.afterText || "");
    return escapeHtml(item.text || "");
  }).join("");
}

function renderRuns(runs, formatChanges) {
  return runs.map((run) => {
    let text = escapeHtml(run.text);
    if (run.marks.bold) text = `<strong>${text}</strong>`;
    if (run.marks.italic) text = `<em>${text}</em>`;
    if (run.marks.underline) text = `<u>${text}</u>`;
    if (run.marks.subscript) text = `<sub>${text}</sub>`;
    if (run.marks.superscript) text = `<sup>${text}</sup>`;
    if (formatChanges?.some((change) => change.text.includes(run.text.trim()) || run.text.includes(change.text.trim()))) {
      text = `<span class="mark format">${text}</span>`;
    }
    return text;
  }).join("");
}

function placeholderBlock(className) {
  const element = document.createElement("div");
  element.className = `diff-block placeholder ${className}`;
  element.innerHTML = "&nbsp;";
  return element;
}

function renderMap(blockDiffs) {
  if (!blockDiffs.length) {
    matchMap.innerHTML = emptyState("No blocks detected.");
    return;
  }
  matchMap.innerHTML = blockDiffs.map((diff) => {
    if (diff.type === "inserted") {
      return `<div class="map-row"><span>New ${diff.afterIndex + 1}</span><strong>inserted</strong><p>${escapeHtml(shortText(diff.afterBlock.text))}</p></div>`;
    }
    if (diff.type === "deleted") {
      return `<div class="map-row"><span>Old ${diff.beforeIndex + 1}</span><strong>deleted</strong><p>${escapeHtml(shortText(diff.beforeBlock.text))}</p></div>`;
    }
    const score = Math.round((diff.match?.score || 0) * 100);
    return `<div class="map-row"><span>Old ${diff.beforeIndex + 1} -> New ${diff.afterIndex + 1}</span><strong>${score}% ${escapeHtml(diff.match?.reason || "")}</strong><p>${escapeHtml(shortText(diff.afterBlock.text))}</p></div>`;
  }).join("");
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function shortText(text) {
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
