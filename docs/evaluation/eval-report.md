# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-08 10:22:20
> Version: 0.5.0 (Phase 1: Resource Chains)
> Scenarios: 17 | Duration: 2280s total sim time

## Overall Scorecard

| Dimension | Score | Grade | Description |
|---|---|---|---|
| **Stability** | 1 | A | Long-run correctness, no crashes or data corruption |
| **Development** | 0.719 | C | Progressive complexity growth and objective completion |
| **Coverage** | 1.015 | A | All game elements utilized during play |
| **Playability** | 0.698 | C | Tension curves, decision variety, engagement |
| **Technical** | 0.647 | D | AI quality, pathfinding, state machine validity |
| **Reasonableness** | 0.857 | B | NPC behavior naturalness and thematic coherence |

**Overall Score: 0.823 (B)**

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 23 | none |
| default/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/archipelago_isles | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| scarce_resources/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 20 | none |
| abundant_resources/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 24 | none |
| resource_chains_basic/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 23 | none |
| full_processing/fortified_basin | YES | 82.27/120s | 0 | 0 | 0 | 23 | win |
| tooled_colony/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 23 | none |
| high_threat/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 23 | none |
| skeleton_crew/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 12 | none |
| large_colony/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 28 | none |
| wildlife_heavy/archipelago_isles | YES | 120/120s | 0 | 0 | 0 | 28 | none |
| storm_start/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 23 | none |
| developed_colony/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 23 | none |
| default/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 23 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 46→50.38 | 2→4 | 4 | 2/3 |
| default | 43→46.54 | 2.3→4 | 4 | 1/3 |
| default | 18.33→12.92 | 2→3 | 4 | 0/3 |
| scarce_resources | 51.5→52.31 | 1.9→4 | 4 | 1/3 |
| abundant_resources | 54.17→58 | 2.2→4 | 4 | 2/3 |
| resource_chains_basic | 57→60.54 | 4.2→6 | 6 | 2/3 |
| full_processing | 59→59.78 | 7→7 | 7 | 3/3 |
| tooled_colony | 55→58.31 | 4.6→6 | 6 | 2/3 |
| high_threat | 54→54 | 2.2→4 | 4 | 1/3 |
| skeleton_crew | 51.92→53 | 1.9→2 | 3 | 1/3 |
| large_colony | 49→48.92 | 2→2 | 4 | 1/3 |
| wildlife_heavy | 25.92→26.69 | 2.3→2 | 3 | 0/3 |
| storm_start | 54→57.54 | 2.2→4 | 4 | 2/3 |
| default | 46→50.77 | 2→4 | 4 | 2/3 |
| developed_colony | 60→60 | 3→5 | 5 | 1/3 |
| default | 67→72 | 2.1→3.9 | 4 | 2/3 |
| default | 60→65.33 | 2.1→4 | 4 | 2/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 13 | 13 | none | 1 |
| Roles | 7 | 8 | HAUL | 0.88 |
| Resources | 7 | 7 | none | 1 |
| Intents | 12 | 10 | none | 1.2 |
| Weathers | 5 | 5 | none | 1 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 0.611 | 0.555 | 1 | 0.67 | 0.708 |
| default | 0.616 | 0.715 | 0.967 | 0.33 | 0.658 |
| default | 0.737 | 0.876 | 0.672 | 0 | 0.571 |
| scarce_resources | 0.506 | 0.639 | 0.975 | 0.33 | 0.613 |
| abundant_resources | 0.526 | 0.553 | 1 | 0.67 | 0.686 |
| resource_chains_basic | 0.605 | 0.764 | 1 | 0.67 | 0.759 |
| full_processing | 0.862 | 0.879 | 1 | 1 | 0.935 |
| tooled_colony | 0.874 | 0.826 | 1 | 0.67 | 0.842 |
| high_threat | 0.547 | 0.665 | 1 | 0.33 | 0.636 |
| skeleton_crew | 0.609 | 0.8 | 0.869 | 0.33 | 0.653 |
| large_colony | 0.568 | 0.68 | 1 | 0.33 | 0.645 |
| wildlife_heavy | 0.472 | 0.797 | 0.721 | 0 | 0.498 |
| storm_start | 0.567 | 0.587 | 1 | 0.67 | 0.705 |
| default | 0.592 | 0.582 | 1 | 0.67 | 0.71 |
| developed_colony | 0.996 | 0.739 | 1 | 0.33 | 0.767 |
| default | 0.557 | 0.698 | 1 | 0.67 | 0.73 |
| default | 0.609 | 0.719 | 1 | 0.67 | 0.749 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.219 | 1 | 0.75 | 11/min | 1 | 0.633 |
| default | 0.548 | 1 | 0.689 | 11/min | 1 | 0.67 |
| default | 0.216 | 1 | 0.939 | 11/min | 1 | 0.67 |
| scarce_resources | 0.496 | 1 | 0.542 | 11/min | 1 | 0.633 |
| abundant_resources | 0.206 | 1 | 0.692 | 11/min | 1 | 0.619 |
| resource_chains_basic | 0.51 | 1 | 0.183 | 11/min | 1.45 | 0.763 |
| full_processing | 0.257 | 1 | 0 | 11.7/min | 1.45 | 0.689 |
| tooled_colony | 0.329 | 1 | 0 | 11/min | 1.45 | 0.699 |
| high_threat | 0.506 | 1 | 0.575 | 11/min | 1 | 0.641 |
| skeleton_crew | 0.636 | 1 | 0.475 | 11/min | 1 | 0.64 |
| large_colony | 0.512 | 1 | 0.795 | 11/min | 1 | 0.686 |
| wildlife_heavy | 0.207 | 1 | 0.758 | 11/min | 1 | 0.633 |
| storm_start | 0.26 | 1 | 0.675 | 11/min | 1 | 0.624 |
| default | 0.203 | 1 | 0.789 | 11/min | 1 | 0.638 |
| developed_colony | 0.52 | 1 | 0.158 | 11/min | 1 | 0.56 |
| default | 0.3 | 1 | 0.533 | 11/min | 1 | 0.602 |
| default | 0.348 | 1 | 0.45 | 11/min | 1 | 0.592 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.61 | 0.5 | 1 | 0.969 | 0.774 |
| default | 0.813 | 1 | 1 | 0.923 | 0.921 |
| default | 0.765 | 0.583 | 0.67 | 0.843 | 0.733 |
| scarce_resources | 0.716 | 1 | 1 | 0.981 | 0.909 |
| abundant_resources | 0.517 | 0.667 | 0.67 | 0.984 | 0.718 |
| resource_chains_basic | 0.84 | 1 | 1 | 0.982 | 0.947 |
| full_processing | 0.861 | 1 | 0.67 | 0.976 | 0.885 |
| tooled_colony | 0.811 | 1 | 0.67 | 0.98 | 0.871 |
| high_threat | 0.699 | 1 | 1 | 0.977 | 0.903 |
| skeleton_crew | 0.72 | 1 | 0.67 | 0.984 | 0.845 |
| large_colony | 0.76 | 1 | 1 | 0.98 | 0.922 |
| wildlife_heavy | 0.777 | 0.917 | 0.67 | 0.984 | 0.845 |
| storm_start | 0.633 | 1 | 1 | 0.978 | 0.883 |
| default | 0.671 | 0.75 | 1 | 0.957 | 0.838 |
| developed_colony | 0.795 | 1 | 1 | 0.98 | 0.932 |
| default | 0.675 | 1 | 0.67 | 0.976 | 0.829 |
| default | 0.654 | 1 | 0.67 | 0.97 | 0.821 |

---

## Improvement Targets

### Technical (D, 0.647)

### Playability (C, 0.698)

### Development (C, 0.719)
