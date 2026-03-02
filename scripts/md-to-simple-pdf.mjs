import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function usage() {
  console.error("Usage: node scripts/md-to-simple-pdf.mjs <input.md> <output.pdf>");
  process.exit(1);
}

function stripMarkdown(text) {
  const withoutCodeFence = text
    .replace(/```[\s\S]*?```/g, (block) => {
      return block
        .replace(/```[^\n]*\n?/g, "")
        .replace(/```/g, "");
    })
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*-\s*/gm, "- ")
    .replace(/^\s*\d+\.\s*/gm, (m) => m.trimStart())
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  return withoutCodeFence
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function wrapLine(line, maxLen = 92) {
  if (line.length <= maxLen) return [line];
  const out = [];
  let remaining = line;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf(" ", maxLen);
    if (cut < 10) cut = maxLen;
    out.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  out.push(remaining);
  return out;
}

function toPrintableAscii(text) {
  return text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function escapePdfString(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfFromLines(lines) {
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const pageHeight = 792;
  const topMargin = 46;
  const lineHeight = 13;
  const maxLines = Math.floor((pageHeight - topMargin * 2) / lineHeight);

  const pages = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    pages.push(lines.slice(i, i + maxLines));
  }

  const pageObjects = [];
  const contentObjects = [];
  const fontObject = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const pageLines of pages) {
    let stream = "BT\n/F1 10 Tf\n";
    let y = pageHeight - topMargin;
    for (const line of pageLines) {
      stream += `1 0 0 1 46 ${y} Tm (${escapePdfString(line)}) Tj\n`;
      y -= lineHeight;
    }
    stream += "ET\n";
    const contentBody = `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream`;
    const contentObj = addObject(contentBody);
    contentObjects.push(contentObj);
    const pageObj = addObject("<< >>");
    pageObjects.push(pageObj);
  }

  const pagesObj = addObject("<< >>");
  const catalogObj = addObject(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

  for (let i = 0; i < pageObjects.length; i += 1) {
    const pageBody = `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObjects[i]} 0 R >>`;
    objects[pageObjects[i] - 1] = pageBody;
  }

  const kids = pageObjects.map((id) => `${id} 0 R`).join(" ");
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids}] /Count ${pageObjects.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    const off = String(offsets[i]).padStart(10, "0");
    pdf += `${off} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg || !outputArg) usage();

  const input = path.resolve(process.cwd(), inputArg);
  const output = path.resolve(process.cwd(), outputArg);

  const markdown = fs.readFileSync(input, "utf8");
  const plain = toPrintableAscii(stripMarkdown(markdown));

  const lines = [];
  for (const rawLine of plain.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      lines.push("");
      continue;
    }
    lines.push(...wrapLine(line));
  }

  const pdfBuffer = buildPdfFromLines(lines.length ? lines : [" "]);
  fs.writeFileSync(output, pdfBuffer);
  console.log(`PDF generated: ${output}`);
}

main();
