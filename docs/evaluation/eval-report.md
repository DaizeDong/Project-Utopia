# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-08 13:52:45
> Version: 0.5.0 (Phase 1: Resource Chains)
> Scenarios: 17 | Duration: 2280s total sim time

## Overall Scorecard

| Dimension | Score | Grade | Description |
|---|---|---|---|
| **Stability** | 1 | A | Long-run correctness, no crashes or data corruption |
| **Development** | 0.879 | B | Progressive complexity growth and objective completion |
| **Coverage** | 1.04 | A | All game elements utilized during play |
| **Playability** | 0.902 | A | Tension curves, decision variety, engagement |
| **Technical** | 0.905 | A | AI quality, pathfinding, state machine validity |
| **Reasonableness** | 0.914 | A | NPC behavior naturalness and thematic coherence |

**Overall Score: 0.94 (A)**

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 23 | none |
| default/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/archipelago_isles | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| scarce_resources/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 20 | none |
| abundant_resources/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 23 | none |
| resource_chains_basic/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 20 | none |
| full_processing/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 20 | none |
| tooled_colony/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 20 | none |
| high_threat/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 23 | none |
| skeleton_crew/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 12 | none |
| large_colony/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 28 | none |
| wildlife_heavy/archipelago_isles | YES | 120/120s | 0 | 0 | 0 | 28 | none |
| storm_start/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 23 | none |
| developed_colony/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 23 | none |
| default/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 20 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 49.17→52.62 | 4.9→6 | 7 | 2/3 |
| default | 43.92→41.85 | 4→4.7 | 6 | 1/3 |
| default | 21.33→18.92 | 3.6→4 | 6 | 0/3 |
| scarce_resources | 52.17→54.15 | 2.9→3 | 6 | 1/3 |
| abundant_resources | 54.92→61 | 3.2→5 | 6 | 2/3 |
| resource_chains_basic | 57→57.62 | 4.1→6 | 7 | 1/3 |
| full_processing | 59→58.92 | 7→7 | 8 | 1/3 |
| tooled_colony | 55→55 | 4.7→5 | 7 | 1/3 |
| high_threat | 54.92→55 | 3.2→5 | 6 | 1/3 |
| skeleton_crew | 53.25→56.69 | 2.9→2.8 | 3 | 1/3 |
| large_colony | 50→50.15 | 3→4.2 | 6 | 1/3 |
| wildlife_heavy | 27.58→33 | 3.3→4.5 | 6 | 1/3 |
| storm_start | 54.92→55 | 3.2→5 | 6 | 1/3 |
| default | 49.17→54.92 | 4.9→6 | 7 | 2/3 |
| developed_colony | 62→61.92 | 5.1→6 | 8 | 1/3 |
| default | 67.88→72.11 | 3.6→5 | 6 | 2/3 |
| default | 62→69.11 | 3.8→4.8 | 7 | 1/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 13 | 13 | none | 1 |
| Roles | 8 | 8 | none | 1 |
| Resources | 7 | 7 | none | 1 |
| Intents | 12 | 10 | wander | 1.2 |
| Weathers | 5 | 5 | none | 1 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 1 | 0.872 | 1 | 1 | 0.961 |
| default | 1 | 0.88 | 0.967 | 0.5 | 0.881 |
| default | 1 | 0.918 | 0.582 | 0 | 0.721 |
| scarce_resources | 1 | 0.893 | 0.762 | 0.5 | 0.834 |
| abundant_resources | 1 | 0.876 | 1 | 1 | 0.963 |
| resource_chains_basic | 1 | 0.93 | 1 | 0.62 | 0.921 |
| full_processing | 1 | 0.959 | 1 | 0.5 | 0.913 |
| tooled_colony | 1 | 0.945 | 1 | 0.91 | 0.97 |
| high_threat | 0.827 | 0.883 | 1 | 0.72 | 0.87 |
| skeleton_crew | 1 | 0.927 | 0.975 | 0.5 | 0.897 |
| large_colony | 1 | 0.855 | 0.902 | 0.5 | 0.857 |
| wildlife_heavy | 1 | 0.87 | 1 | 0.59 | 0.9 |
| storm_start | 0.838 | 0.898 | 1 | 0.82 | 0.893 |
| default | 1 | 0.886 | 1 | 1 | 0.966 |
| developed_colony | 1 | 0.963 | 1 | 0.83 | 0.964 |
| default | 1 | 0.875 | 1 | 1 | 0.963 |
| default | 1 | 0.901 | 0.89 | 0.5 | 0.868 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.412 | 1 | 0.994 | 11/min | 1.45 | 0.911 |
| default | 0.527 | 1 | 0.994 | 11/min | 1.45 | 0.928 |
| default | 0.27 | 1 | 0.994 | 11/min | 1.45 | 0.889 |
| scarce_resources | 0.222 | 1 | 0.992 | 11/min | 1.3 | 0.815 |
| abundant_resources | 0.22 | 1 | 0.992 | 11/min | 1.45 | 0.881 |
| resource_chains_basic | 0.572 | 1 | 0.992 | 11/min | 1.45 | 0.934 |
| full_processing | 0.553 | 1 | 0.992 | 11/min | 1.45 | 0.931 |
| tooled_colony | 0.629 | 1 | 0.992 | 11/min | 1.45 | 0.943 |
| high_threat | 0.49 | 1 | 0.983 | 11/min | 1.45 | 0.92 |
| skeleton_crew | 0.639 | 1 | 0.975 | 11/min | 1 | 0.926 |
| large_colony | 0.433 | 1 | 0.995 | 11/min | 1.45 | 0.914 |
| wildlife_heavy | 0.341 | 1 | 0.958 | 11/min | 1.3 | 0.826 |
| storm_start | 0.518 | 1 | 0.992 | 11/min | 1.45 | 0.926 |
| default | 0.292 | 1 | 0.994 | 11/min | 1.45 | 0.893 |
| developed_colony | 0.545 | 1 | 0.992 | 11/min | 1.45 | 0.93 |
| default | 0.344 | 1 | 0.992 | 11/min | 1.45 | 0.9 |
| default | 0.426 | 1 | 0.983 | 11/min | 1.45 | 0.911 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.768 | 1 | 1 | 0.901 | 0.901 |
| default | 0.791 | 1 | 1 | 0.915 | 0.912 |
| default | 0.789 | 1 | 1 | 0.966 | 0.926 |
| scarce_resources | 0.727 | 1 | 1 | 0.954 | 0.904 |
| abundant_resources | 0.728 | 1 | 1 | 0.899 | 0.888 |
| resource_chains_basic | 0.853 | 1 | 1 | 0.902 | 0.926 |
| full_processing | 0.916 | 1 | 1 | 0.878 | 0.938 |
| tooled_colony | 0.885 | 1 | 1 | 0.851 | 0.921 |
| high_threat | 0.79 | 1 | 1 | 0.914 | 0.911 |
| skeleton_crew | 0.944 | 1 | 1 | 0.893 | 0.951 |
| large_colony | 0.731 | 1 | 1 | 0.809 | 0.862 |
| wildlife_heavy | 0.767 | 1 | 1 | 0.923 | 0.907 |
| storm_start | 0.816 | 1 | 1 | 0.908 | 0.917 |
| default | 0.77 | 1 | 1 | 0.936 | 0.912 |
| developed_colony | 0.93 | 1 | 1 | 0.876 | 0.942 |
| default | 0.736 | 1 | 1 | 0.92 | 0.897 |
| default | 0.789 | 1 | 1 | 0.931 | 0.916 |

---

## Improvement Targets

### Development (B, 0.879)

### Playability (A, 0.902)

### Technical (A, 0.905)
