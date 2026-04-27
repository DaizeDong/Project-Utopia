import { writeFileSync } from "node:fs";

/**
 * Parse CLI arguments from --key=value format.
 * @param {string[]} [argv]
 * @returns {Record<string, string|boolean>}
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const eqIndex = token.indexOf("=");
    if (eqIndex < 0) {
      args[token.slice(2)] = true;
      continue;
    }
    args[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
  }
  return args;
}

/**
 * Format a benchmark report as a compact markdown summary table.
 * @param {object} report - { meta, dimensions, comparison? }
 */
export function formatReport(report) {
  const lines = [];
  const { meta, dimensions, comparison } = report;

  if (meta) {
    lines.push(`## ${meta.name ?? "Benchmark Report"}`);
    if (meta.date) lines.push(`Date: ${meta.date}`);
    if (meta.preset) lines.push(`Preset: ${meta.preset}`);
    if (meta.ticks) lines.push(`Ticks: ${meta.ticks}`);
    if (meta.duration) lines.push(`Duration: ${meta.duration}`);
    lines.push("");
  }

  if (dimensions && dimensions.length > 0) {
    lines.push("| Dimension | Mean | CI | P5 | P95 |");
    lines.push("|-----------|------|----|----|-----|");
    for (const d of dimensions) {
      const mean = d.mean?.toFixed(2) ?? "-";
      const ci = d.ci ? `[${d.ci[0].toFixed(2)}, ${d.ci[1].toFixed(2)}]` : "-";
      const p5 = d.p5?.toFixed(2) ?? "-";
      const p95 = d.p95?.toFixed(2) ?? "-";
      lines.push(`| ${d.name} | ${mean} | ${ci} | ${p5} | ${p95} |`);
    }
    lines.push("");
  }

  if (comparison) {
    lines.push("### Comparison");
    lines.push("| Dimension | Delta | Cohen's d | Verdict |");
    lines.push("|-----------|-------|-----------|---------|");
    for (const c of comparison) {
      const delta = c.delta?.toFixed(3) ?? "-";
      const cohenD = c.cohenD?.toFixed(3) ?? "-";
      lines.push(`| ${c.name} | ${delta} | ${cohenD} | ${c.verdict ?? "-"} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Write JSON results to file.
 */
export function writeResults(filepath, data) {
  writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}
