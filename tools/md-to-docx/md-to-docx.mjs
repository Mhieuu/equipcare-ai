import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table,
  TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageOrientation,
} from 'docx';

const [, , inputPath, outputPath] = process.argv;
const md = readFileSync(resolve(inputPath), 'utf8');
const lines = md.split(/\r?\n/);

const out = [];
let i = 0;
let inCode = false;
let codeBuf = [];

function parseInline(text) {
  const runs = [];
  let pos = 0;
  const len = text.length;
  while (pos < len) {
    let m;
    m = text.slice(pos).match(/^\*\*\*([^*]+?)\*\*\*/);
    if (m) { runs.push(new TextRun({ text: m[1], bold: true, italics: true })); pos += m[0].length; continue; }
    m = text.slice(pos).match(/^\*\*([^*]+?)\*\*/);
    if (m) { runs.push(new TextRun({ text: m[1], bold: true })); pos += m[0].length; continue; }
    m = text.slice(pos).match(/^\*([^*]+?)\*/);
    if (m) { runs.push(new TextRun({ text: m[1], italics: true })); pos += m[0].length; continue; }
    m = text.slice(pos).match(/^`([^`]+)`/);
    if (m) {
      runs.push(new TextRun({ text: m[1], font: 'Consolas' }));
      pos += m[0].length;
      continue;
    }
    const rest = text.slice(pos);
    const nextMatch = rest.match(/[\*`_[]/);
    const stopAt = nextMatch ? nextMatch.index : rest.length;
    if (stopAt > 0) {
      runs.push(new TextRun(rest.slice(0, stopAt)));
      pos += stopAt;
    } else {
      pos += 1;
    }
  }
  return runs;
}

console.log('Start parse. lines=', lines.length);

while (i < lines.length) {
  const line = lines[i];

  if (line.startsWith('```')) {
    if (!inCode) { inCode = true; codeBuf = []; }
    else {
      inCode = false;
      out.push(new Paragraph({ children: [new TextRun({ text: codeBuf.join('\n'), font: 'Consolas', size: 18 })], shading: { type: ShadingType.SOLID, color: 'F4F4F5', fill: 'F4F4F5' }, spacing: { before: 100, after: 100 } }));
      codeBuf = [];
    }
    i++;
    continue;
  }
  if (inCode) { codeBuf.push(line); i++; continue; }

  if (/^---+\s*$/.test(line)) { out.push(new Paragraph({ text: '' })); i++; continue; }

  let m;
  if ((m = line.match(/^#\s+(.+)$/))) { out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: parseInline(m[1]) })); i++; continue; }
  if ((m = line.match(/^##\s+(.+)$/))) { out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: parseInline(m[1]) })); i++; continue; }
  if ((m = line.match(/^###\s+(.+)$/))) { out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: parseInline(m[1]) })); i++; continue; }
  if ((m = line.match(/^####\s+(.+)$/))) { out.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: parseInline(m[1]) })); i++; continue; }

  if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s\-\|:]+\|?\s*$/.test(lines[i + 1])) {
    const tableLines = [];
    let j = i;
    while (j < lines.length && /^\|/.test(lines[j])) { tableLines.push(lines[j]); j++; }
    const parseRow = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const rowsRaw = tableLines.filter((l) => !/^\|[\s\-\|:]+\|?\s*$/.test(l));
    const header = parseRow(rowsRaw[0]);
    const body = rowsRaw.slice(1).map(parseRow);
    const n = header.length;
    const cellOpts = { width: { size: 100 / n, type: WidthType.PERCENTAGE } };
    const headerCells = header.map((h) => new TableCell({ ...cellOpts, shading: { type: ShadingType.SOLID, color: '1F2937', fill: '1F2937' }, children: [new Paragraph({ children: parseInline(h) })] }));
    const bodyRows = body.map((r) => new TableRow({ children: r.map((c) => new TableCell({ ...cellOpts, children: [new Paragraph({ children: parseInline(c) })] })) }));
    out.push(new Table({ rows: [new TableRow({ tableHeader: true, children: headerCells }), ...bodyRows], width: { size: 100, type: WidthType.PERCENTAGE } }));
    i = j;
    continue;
  }

  if (/^>\s+/.test(line)) {
    const bqLines = [];
    while (i < lines.length && /^>\s+/.test(lines[i])) { bqLines.push(lines[i].replace(/^>\s+/, '')); i++; }
    out.push(new Paragraph({ children: parseInline(bqLines.join(' ')), indent: { left: 360 } }));
    continue;
  }

  if (/^[-*]\s+/.test(line)) {
    while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
      const m2 = lines[i].match(/^[-*]\s+(.+)$/);
      out.push(new Paragraph({ children: parseInline(m2[1]), bullet: { level: 0 } }));
      i++;
    }
    continue;
  }

  if (/^\d+\.\s+/.test(line)) {
    while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
      const m2 = lines[i].match(/^\d+\.\s+(.+)$/);
      out.push(new Paragraph({ children: parseInline(m2[1]) }));
      i++;
    }
    continue;
  }

  if (/^\s*$/.test(line)) { i++; continue; }

  const paraLines = [];
  while (
    i < lines.length &&
    !/^\s*$/.test(lines[i]) &&
      !/^(?:[#>\-]|\d+\.\s|\|)/.test(lines[i]) &&
    !/^---+\s*$/.test(lines[i])
  ) {
    paraLines.push(lines[i]);
    i++;
  }
  if (paraLines.length > 0) {
    out.push(new Paragraph({ children: parseInline(paraLines.join(' ')) }));
  }
}

console.log('Parsed', out.length, 'elements');

const doc = new Document({ sections: [{ children: out }] });
const buf = await Packer.toBuffer(doc);
writeFileSync(resolve(outputPath), buf);
console.log('OK', buf.length);
