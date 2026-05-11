"""Benchmark CLI helpers (port of ``cli.js``).

Pure-Python utilities: argument parsing, markdown formatting, JSON writing.
Kept intentionally minimal — the real entry point lives at
``project_utopia.cli.benchmark_paper`` (Typer app).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

__all__ = ["format_report", "parse_args", "write_results"]


def parse_args(argv: list[str] | None = None) -> dict[str, Any]:
    """Parse ``--key=value`` style CLI args into a flat dict."""
    if argv is None:
        argv = sys.argv[1:]
    args: dict[str, Any] = {}
    for token in argv:
        if not token.startswith("--"):
            continue
        eq = token.find("=")
        if eq < 0:
            args[token[2:]] = True
            continue
        args[token[2:eq]] = token[eq + 1 :]
    return args


def format_report(report: dict[str, Any]) -> str:
    """Format a benchmark report as a compact markdown summary table."""
    lines: list[str] = []
    meta = report.get("meta") or {}
    dimensions = report.get("dimensions") or []
    comparison = report.get("comparison")

    if meta:
        lines.append(f"## {meta.get('name', 'Benchmark Report')}")
        if meta.get("date"):
            lines.append(f"Date: {meta['date']}")
        if meta.get("preset"):
            lines.append(f"Preset: {meta['preset']}")
        if meta.get("ticks"):
            lines.append(f"Ticks: {meta['ticks']}")
        if meta.get("duration"):
            lines.append(f"Duration: {meta['duration']}")
        lines.append("")

    if dimensions:
        lines.append("| Dimension | Mean | CI | P5 | P95 |")
        lines.append("|-----------|------|----|----|-----|")
        for d in dimensions:
            mean = f"{d['mean']:.2f}" if d.get("mean") is not None else "-"
            ci = (
                f"[{d['ci'][0]:.2f}, {d['ci'][1]:.2f}]"
                if d.get("ci") and len(d["ci"]) == 2
                else "-"
            )
            p5 = f"{d['p5']:.2f}" if d.get("p5") is not None else "-"
            p95 = f"{d['p95']:.2f}" if d.get("p95") is not None else "-"
            lines.append(f"| {d['name']} | {mean} | {ci} | {p5} | {p95} |")
        lines.append("")

    if comparison:
        lines.append("### Comparison")
        lines.append("| Dimension | Delta | Cohen's d | Verdict |")
        lines.append("|-----------|-------|-----------|---------|")
        for c in comparison:
            delta = f"{c['delta']:.3f}" if c.get("delta") is not None else "-"
            cohend = f"{c['cohenD']:.3f}" if c.get("cohenD") is not None else "-"
            lines.append(
                f"| {c['name']} | {delta} | {cohend} | {c.get('verdict', '-')} |"
            )
        lines.append("")

    return "\n".join(lines)


def write_results(filepath: str | Path, data: Any) -> None:
    """Write a JSON document to ``filepath``."""
    Path(filepath).write_text(json.dumps(data, indent=2), encoding="utf-8")
