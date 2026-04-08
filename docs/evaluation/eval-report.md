# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-08 04:04:35
> Version: 0.5.0 (Phase 1: Resource Chains)
> Scenarios: 17 | Duration: 3060s total sim time

## Overall Scorecard

| Dimension | Score | Grade | Description |
|---|---|---|---|
| **Stability** | 1 | A | Long-run correctness, no crashes or data corruption |
| **Development** | 0.309 | F | Progressive complexity growth and objective completion |
| **Coverage** | 0.799 | C | All game elements utilized during play |
| **Playability** | 0.611 | D | Tension curves, decision variety, engagement |
| **Technical** | 0.507 | D | AI quality, pathfinding, state machine validity |
| **Reasonableness** | 0.626 | D | NPC behavior naturalness and thematic coherence |

**Overall Score: 0.642 (D)**

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/archipelago_isles | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| scarce_resources/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| abundant_resources/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| resource_chains_basic/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| full_processing/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| tooled_colony/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| high_threat/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 23 | none |
| skeleton_crew/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 12 | none |
| large_colony/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 28 | none |
| wildlife_heavy/archipelago_isles | YES | 180/180s | 0 | 0 | 0 | 28 | none |
| storm_start/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| developed_colony/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 42→37.77 | 2→2 | 4 | 0/3 |
| default | 39→35.77 | 2→2 | 4 | 0/3 |
| default | 13→9 | 2→2 | 4 | 0/3 |
| scarce_resources | 50→43.16 | 2→2 | 4 | 0/3 |
| abundant_resources | 50→43.84 | 2→2 | 4 | 0/3 |
| resource_chains_basic | 50→43 | 4→4 | 5 | 0/3 |
| full_processing | 45→40 | 7→7 | 7 | 0/3 |
| tooled_colony | 45→40 | 4→4 | 4 | 0/3 |
| high_threat | 50→43 | 2→2 | 4 | 0/3 |
| skeleton_crew | 50→43 | 2→2 | 3 | 0/3 |
| large_colony | 45→40 | 2→2 | 3 | 0/3 |
| wildlife_heavy | 21→17 | 2→2 | 3 | 0/3 |
| storm_start | 50→43 | 2→2 | 4 | 0/3 |
| default | 42.42→50.85 | 2→2 | 4 | 0/3 |
| developed_colony | 45→40 | 2→2 | 4 | 0/3 |
| default | 63→56 | 2→2 | 4 | 0/3 |
| default | 56→49 | 2→2 | 4 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 10 | 13 | KITCHEN, SMITHY, CLINIC | 0.77 |
| Roles | 7 | 8 | HAUL | 0.88 |
| Resources | 7 | 7 | none | 1 |
| Intents | 8 | 10 | eat, cook, smith, heal | 0.8 |
| Weathers | 2 | 5 | none | 0.4 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 0.398 | 0.851 | 1 | 0 | 0.562 |
| default | 0.379 | 0.784 | 1 | 0 | 0.541 |
| default | 0.628 | 0.798 | 1 | 0 | 0.606 |
| scarce_resources | 0.642 | 0.895 | 1 | 0 | 0.634 |
| abundant_resources | 0.589 | 0.87 | 1 | 0 | 0.615 |
| resource_chains_basic | 0.67 | 0.891 | 1 | 0 | 0.64 |
| full_processing | 0.667 | 0.851 | 1 | 0 | 0.63 |
| tooled_colony | 0.677 | 0.785 | 1 | 0 | 0.615 |
| high_threat | 0.551 | 0.891 | 1 | 0 | 0.611 |
| skeleton_crew | 0.649 | 0.839 | 1 | 0 | 0.622 |
| large_colony | 0.572 | 0.879 | 1 | 0 | 0.613 |
| wildlife_heavy | 0.536 | 0.826 | 1 | 0 | 0.591 |
| storm_start | 0.625 | 0.88 | 1 | 0 | 0.626 |
| default | 0.534 | 0.775 | 1 | 0 | 0.577 |
| developed_colony | 0.553 | 0.846 | 1 | 0 | 0.6 |
| default | 0.755 | 0.859 | 1 | 0 | 0.654 |
| default | 0.744 | 0.876 | 1 | 0 | 0.655 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.478 | 1 | 0 | 11/min | 1 | 0.522 |
| default | 0.606 | 1 | 0 | 11/min | 1 | 0.541 |
| default | 0.21 | 1 | 0 | 11/min | 1 | 0.482 |
| scarce_resources | 0.261 | 1 | 0 | 11/min | 1 | 0.489 |
| abundant_resources | 0.341 | 1 | 0 | 11/min | 1 | 0.501 |
| resource_chains_basic | 0.27 | 1 | 0 | 11/min | 1 | 0.491 |
| full_processing | 0.115 | 1 | 0 | 11/min | 1.15 | 0.534 |
| tooled_colony | 0.229 | 1 | 0 | 11/min | 1.45 | 0.684 |
| high_threat | 0.115 | 1 | 0 | 11/min | 1 | 0.467 |
| skeleton_crew | 0.406 | 1 | 0 | 11/min | 1 | 0.511 |
| large_colony | 0.368 | 1 | 0 | 11/min | 1 | 0.505 |
| wildlife_heavy | 0.188 | 1 | 0 | 11/min | 1 | 0.478 |
| storm_start | 0.232 | 1 | 0 | 11/min | 1 | 0.485 |
| default | 0.461 | 1 | 0 | 11/min | 1 | 0.519 |
| developed_colony | 0.1 | 1 | 0 | 11/min | 1 | 0.465 |
| default | 0.11 | 1 | 0 | 11/min | 1 | 0.466 |
| default | 0.205 | 1 | 0 | 11/min | 1 | 0.481 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.76 | 0.389 | 0.67 | 0.984 | 0.735 |
| default | 0.804 | 0.167 | 0.67 | 0.956 | 0.695 |
| default | 0.647 | 0 | 0.67 | 0.491 | 0.475 |
| scarce_resources | 0.731 | 0.222 | 0.67 | 0.775 | 0.63 |
| abundant_resources | 0.794 | 0.519 | 0.67 | 0.713 | 0.69 |
| resource_chains_basic | 0.707 | 0.481 | 0.67 | 0.687 | 0.648 |
| full_processing | 0.659 | 0.222 | 0.67 | 0.597 | 0.555 |
| tooled_colony | 0.63 | 0 | 0.67 | 0.515 | 0.478 |
| high_threat | 0.737 | 0.556 | 0.67 | 0.747 | 0.69 |
| skeleton_crew | 0.938 | 0 | 0.67 | 0.885 | 0.681 |
| large_colony | 0.766 | 0.481 | 0.67 | 0.731 | 0.679 |
| wildlife_heavy | 0.691 | 0.333 | 0.67 | 0.624 | 0.595 |
| storm_start | 0.744 | 0.407 | 0.67 | 0.78 | 0.673 |
| default | 0.767 | 0.944 | 0.67 | 0.948 | 0.838 |
| developed_colony | 0.622 | 0.111 | 0.67 | 0.591 | 0.52 |
| default | 0.675 | 0.167 | 0.67 | 0.586 | 0.546 |
| default | 0.668 | 0 | 0.67 | 0.621 | 0.521 |

---

## Improvement Targets

### Development (F, 0.309)

### Technical (D, 0.507)

### Playability (D, 0.611)
