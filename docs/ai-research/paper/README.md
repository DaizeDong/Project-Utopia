# Paper draft — Project-Utopia (RC2 baseline, 2026-05-10)

LaTeX source for the Project-Utopia academic-benchmark paper.

## Target

- **Primary**: NeurIPS 2026 Datasets & Benchmarks Track
  (deadline 2026-06-07)
- **Backup**: EMNLP 2026 R&E (deadline 2026-06-15) — see
  `../emnlp-readiness-assessment.md` for the framing-shift checklist
- **Workshop fallback**: NeurIPS / ICLR Workshop tracks 2027

## Build

LaTeX build via pdflatex + bibtex (or latexmk):

```bash
cd docs/ai-research/paper
pdflatex main && bibtex main && pdflatex main && pdflatex main
# or: latexmk -pdf main.tex
```

To re-verify the reproducibility claims cited in §8:

```bash
pip install project-utopia[dev]
pytest -q                            # 621 tests, ~3.2 s
project-utopia-determinism --tier 1  # Tier-1 hash check
```

## Implementation

The paper documents a single Python implementation:
**`project-utopia`** (~5,500 LOC, 621 tests) — PyPI package on
branch `refactor/academic-benchmark-py-rc1`; Tier-1 hash
`be19781c…` for 30 ticks @ seed `0xC0FFEE`. PCG64 RNG backend
with sorted-key JSON serialization gives bit-identical
reproduction within a fixed Python version. See
`sections/08-reproducibility.tex` for the full Three-Tier
reproducibility model.

## File map

```
paper/
├── main.tex                      ─ entry document; preamble + section includes
├── abstract.tex                  ─ 4-paragraph abstract anchored to C1–C4
├── references.bib                ─ 79 BibTeX entries across 11 clusters
├── sections/
│   ├── 01-intro.tex              ─ motivation + 4 contribution claims
│   ├── 02-related-work.tex       ─ 6-family literature survey
│   ├── 03-architecture.tex       ─ 4-channel + AgentAdapter + determinism
│   ├── 04-metrics.tex            ─ 4-layer metric stack
│   ├── 05-experiments.tex        ─ E1–E9 (9 sub-sections)
│   ├── 06-discussion.tex         ─ cross-experiment narrative + practitioner advice
│   ├── 07-limitations.tex        ─ 6 limitations + future work
│   ├── 08-reproducibility.tex    ─ 3-tier reproducibility + RMM compliance
│   ├── A1-determinism-report.tex ─ hash table + cross-OS verification
│   ├── A2-prompt-templates.tex   ─ verbatim 4-channel prompts + schema
│   └── A3-scenario-blueprints.tex─ 6 scenarios + oracle policy excerpt
├── figures/                      ─ TODO: 13 figures (placeholders in main text)
├── tables/                       ─ TODO: 3 tables (E3 cells, E6 failure, E9 verification)
└── README.md                     ─ this file
```

## Contribution claims map (paper-framework.md §1.2)

| Claim | Section | Anchored figures |
|---|---|---|
| C1 Architectural — 4-channel x deterministic x 3-tier reproducibility | §3, §8 | Fig 1, Tier table |
| C2 Methodological — 4-layer metric stack | §4 | Fig 2 |
| C3 Empirical — 9 experiments x 3 findings | §5 | Fig 4–10 |
| C4 Position-defining — 5-way unique combination | §1.3, §2 | Position table |

## Status (2026-05-10)

| Item | Status |
|---|---|
| Section drafts | done — all 8 sections + 3 appendices |
| BibTeX | done — 79 entries (5 placeholders need follow-up) |
| Figures | pending — all 13 are placeholders pending experiment runs |
| Tables | pending — E3 cells (placeholder data), E6 / E9 pending runs |
| LaTeX compile-clean | pending — build verification on next pass |
| NeurIPS D&B template port | pending — when official 2026 .sty available |

## Pre-submission checklist

Before submitting to NeurIPS D&B:

- [ ] Port to official NeurIPS 2026 D&B `.sty` file (release expected ~2026-04)
- [ ] Anonymize authors (replace authblk block)
- [ ] Run E1, E2, E3, E5, E6, E7 — all 9 figures populated with real data
- [ ] Replace 5 placeholder bibtex entries with full metadata
- [ ] Datasheet for Datasets appendix (Gebru et al. template) — referenced as A4
- [ ] Croissant metadata file (NeurIPS D&B requirement)
- [ ] Reproducibility checklist
- [ ] Page count: target 9 pages excluding refs/checklist/appendix
- [ ] Word check: pass NeurIPS automated formatting check

## Companion documents

This paper draws on the following research-state documents
(in `../`):

- `paper-framework.md` — section structure + contribution claims +
  reviewer-defense playbook (v2)
- `experimental-design.md` — E1–E9 hypothesis + factor design
- `roadmap.md` — execution schedule + risk register
- `literature-metrics-survey.md` — 25 anchor benchmarks (cluster A–E)
- `literature-game-ai-metrics.md` — 5 RL evaluation methodology
- `literature-frontier-2025-2026.md` — 32 frontier benchmarks
- `emnlp-readiness-assessment.md` — alternate-venue framing
- `determinism-report.md` — Tier 1–3 verification

All committed to branch `refactor/academic-benchmark`,
tagged `refactor/academic-benchmark-py-rc1`.
