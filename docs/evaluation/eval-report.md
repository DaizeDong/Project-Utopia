# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 20:43:08
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.788 (C)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.96 | A | 20% |
| **Gameplay** (游戏玩法) | 0.764 | C | 30% |
| **Maturity** (游戏成熟度) | 0.733 | C | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.809 | B | AI quality, pathfinding |
| Coverage | 1.07 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.822 | B | 20% | Progressive complexity growth |
| Playability | 0.845 | B | 20% | Tension curves, engagement |
| Efficiency | 0.698 | C | 18% | Labor throughput, utilization |
| Logistics | 0.43 | F | 15% | Infrastructure quality |
| Reasonableness | 0.86 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.932 | A | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.799 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.654 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.793 | C | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.788 | C | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.55 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.672 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.917 | A | 8% | 涌现叙事密度 |
| Decision Consequence | 0.659 | C | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.7 | C | 8% | 交通流质量 |
| Population Dynamics | 0.946 | A | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.613 | D | 8% | 环境响应性 |
| System Coupling Density | 0.672 | C | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 30 | none |
| default/fortified_basin | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| default/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| scarce_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| abundant_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| resource_chains_basic/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| full_processing/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| tooled_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| high_threat/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 27 | none |
| skeleton_crew/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 15 | none |
| large_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 32 | none |
| wildlife_heavy/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 29 | none |
| storm_start/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| developed_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| crisis_compound/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 18 | none |
| island_isolation/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 17 | none |
| population_boom/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 32 | none |
| late_game_siege/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 39.17→40 | 3.7→6 | 7 | 2/3 |
| default | 44.67→46.29 | 3.7→5 | 8 | 1/3 |
| default | 18.5→18.8 | 3→4 | 5 | 0/3 |
| scarce_resources | 49.83→50.86 | 2.8→3.4 | 6 | 1/3 |
| abundant_resources | 56→57 | 2.3→4.6 | 7 | 1/3 |
| resource_chains_basic | 55.83→56 | 4→6.6 | 8 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 55.83→55.86 | 4→5 | 7 | 1/3 |
| high_threat | 54.67→56 | 2.3→5 | 8 | 1/3 |
| skeleton_crew | 50→51.86 | 2.8→3.9 | 4 | 0/3 |
| large_colony | 50.83→51 | 3→5.9 | 7 | 1/3 |
| wildlife_heavy | 10.5→11 | 3→4 | 6 | 0/3 |
| storm_start | 54.67→56 | 2.3→6 | 8 | 1/3 |
| default | 39.17→39.86 | 3.5→6 | 7 | 1/3 |
| developed_colony | 62.83→63 | 4→6.6 | 8 | 1/3 |
| default | 83.5→84.6 | 2.3→5 | 8 | 1/3 |
| default | 39.75→41 | 3.3→6 | 7 | 1/3 |
| crisis_compound | 49.83→51 | 2.8→3 | 4 | 1/3 |
| island_isolation | 7→5.86 | 2→2.7 | 3 | 0/3 |
| population_boom | 50→50.14 | 2.8→3 | 5 | 0/3 |
| late_game_siege | 62.83→63 | 4→7 | 8 | 1/3 |
| no_director | 49→48.71 | 3→4 | 5 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 14 | 14 | none | 1 |
| Roles | 8 | 8 | none | 1 |
| Resources | 7 | 7 | none | 1 |
| Intents | 15 | 10 | none | 1.5 |
| Weathers | 4 | 5 | none | 0.8 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 1 | 0.916 | 1 | 1 | 0.975 |
| default | 1 | 0.903 | 1 | 0.52 | 0.899 |
| default | 0.808 | 0.923 | 1 | 0 | 0.769 |
| scarce_resources | 0.947 | 0.877 | 0.952 | 0.51 | 0.862 |
| abundant_resources | 0.943 | 0.94 | 1 | 0.67 | 0.915 |
| resource_chains_basic | 0.595 | 0.936 | 1 | 0.66 | 0.808 |
| full_processing | 0.909 | 0.923 | 1 | 0.66 | 0.898 |
| tooled_colony | 1 | 0.891 | 1 | 0.63 | 0.912 |
| high_threat | 0.708 | 0.922 | 1 | 0.65 | 0.836 |
| skeleton_crew | 0.798 | 0.858 | 0.935 | 0 | 0.731 |
| large_colony | 0.329 | 0.93 | 1 | 0.64 | 0.724 |
| wildlife_heavy | 1 | 0.887 | 1 | 0.33 | 0.866 |
| storm_start | 0.708 | 0.921 | 1 | 0.65 | 0.836 |
| default | 1 | 0.925 | 1 | 0.7 | 0.933 |
| developed_colony | 1 | 0.917 | 1 | 0.65 | 0.923 |
| default | 0.912 | 0.919 | 1 | 0.77 | 0.914 |
| default | 1 | 0.948 | 1 | 0.89 | 0.968 |
| crisis_compound | 0.771 | 0.917 | 0.952 | 0.58 | 0.831 |
| island_isolation | 1 | 0.841 | 0.548 | 0 | 0.689 |
| population_boom | 0.468 | 0.94 | 0.984 | 0.33 | 0.718 |
| late_game_siege | 0.837 | 0.911 | 1 | 0.65 | 0.872 |
| no_director | 0.652 | 0.909 | 1 | 0 | 0.718 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.434 | 1 | 0.989 | 11.3/min | 1.3 | 0.846 |
| default | 0.391 | 1 | 0.989 | 11.3/min | 1 | 0.706 |
| default | 0.135 | 1 | 0.983 | 11/min | 1 | 0.834 |
| scarce_resources | 0.124 | 1 | 0.983 | 11/min | 1 | 0.832 |
| abundant_resources | 0.131 | 1 | 0.983 | 11/min | 1 | 0.666 |
| resource_chains_basic | 0.443 | 1 | 0.983 | 11/min | 1.3 | 0.846 |
| full_processing | 0.125 | 1 | 0.983 | 11/min | 1.45 | 0.865 |
| tooled_colony | 0.262 | 1 | 0.983 | 11/min | 1.45 | 0.886 |
| high_threat | 0.171 | 1 | 0.95 | 11/min | 1.15 | 0.732 |
| skeleton_crew | 0.167 | 1 | 0.933 | 11/min | 1 | 0.827 |
| large_colony | 0.193 | 1 | 0.99 | 11/min | 1.15 | 0.744 |
| wildlife_heavy | 0.193 | 1 | 0.933 | 11/min | 1 | 0.832 |
| storm_start | 0.145 | 1 | 0.983 | 11/min | 1.15 | 0.735 |
| default | 0.438 | 1 | 0.989 | 11.3/min | 1.45 | 0.913 |
| developed_colony | 0.158 | 1 | 0.983 | 11/min | 1.45 | 0.87 |
| default | 0.268 | 1 | 1 | 11/min | 1 | 0.69 |
| default | 0.276 | 1 | 0.983 | 11/min | 1.15 | 0.755 |
| crisis_compound | 0.119 | 1 | 0.85 | 11/min | 1 | 0.797 |
| island_isolation | 0.409 | 1 | 0.933 | 11/min | 1 | 0.873 |
| population_boom | 0.175 | 1 | 0.99 | 11/min | 1 | 0.843 |
| late_game_siege | 0.131 | 1 | 0.917 | 11/min | 1.45 | 0.853 |
| no_director | 0.244 | 1 | 0.983 | 11/min | 1 | 0.854 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.779 | 1 | 1 | 0.88 | 0.898 |
| default | 0.739 | 1 | 1 | 0.902 | 0.892 |
| default | 0.73 | 1 | 1 | 0.882 | 0.884 |
| scarce_resources | 0.749 | 1 | 1 | 0.894 | 0.893 |
| abundant_resources | 0.776 | 0.833 | 1 | 0.902 | 0.87 |
| resource_chains_basic | 0.804 | 0.833 | 1 | 0.883 | 0.873 |
| full_processing | 0.828 | 0.556 | 1 | 0.886 | 0.825 |
| tooled_colony | 0.792 | 0.278 | 1 | 0.895 | 0.761 |
| high_threat | 0.768 | 1 | 1 | 0.894 | 0.899 |
| skeleton_crew | 0.879 | 1 | 0.67 | 0.96 | 0.885 |
| large_colony | 0.707 | 1 | 1 | 0.877 | 0.875 |
| wildlife_heavy | 0.719 | 1 | 1 | 0.899 | 0.885 |
| storm_start | 0.786 | 1 | 1 | 0.893 | 0.904 |
| default | 0.79 | 1 | 1 | 0.879 | 0.901 |
| developed_colony | 0.823 | 0.278 | 1 | 0.896 | 0.771 |
| default | 0.79 | 0.833 | 0.67 | 0.886 | 0.804 |
| default | 0.774 | 1 | 0.67 | 0.889 | 0.833 |
| crisis_compound | 0.885 | 1 | 1 | 0.953 | 0.951 |
| island_isolation | 0.683 | 0.556 | 1 | 0.937 | 0.797 |
| population_boom | 0.65 | 1 | 0.67 | 0.885 | 0.795 |
| late_game_siege | 0.817 | 0.556 | 1 | 0.89 | 0.823 |
| no_director | 0.752 | 1 | 1 | 0.896 | 0.894 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 51 | 2.12 | 3.4% | 0.452 | 1.7 | 0.947 |
| default | 39 | 1.66 | 2.7% | 0.11 | 4 | 0.688 |
| default | 17 | 1.19 | 4.3% | 0 | 3.6 | 0.748 |
| scarce_resources | 15 | 1.04 | 2.9% | 0 | 3.7 | 0.714 |
| abundant_resources | 19 | 1.31 | 2.9% | 0.1 | 2 | 0.663 |
| resource_chains_basic | 14 | 0.97 | 2.9% | 0.359 | 2.1 | 0.74 |
| full_processing | 1 | 0.07 | 2.9% | 0.511 | 1.4 | 0.687 |
| tooled_colony | 3 | 0.21 | 2.9% | 0.3 | 2 | 0.598 |
| high_threat | 24 | 1.66 | 2.9% | 0.086 | 1.8 | 0.712 |
| skeleton_crew | 5 | 0.92 | 2.4% | 0 | 2.7 | 0.715 |
| large_colony | 13 | 0.58 | 3% | 0.271 | 2 | 0.64 |
| wildlife_heavy | 15 | 1.07 | 3% | 0 | 2.6 | 0.567 |
| storm_start | 14 | 0.97 | 2.9% | 0.177 | 2.1 | 0.648 |
| default | 53 | 2.26 | 2.7% | 0.452 | 1.7 | 0.948 |
| developed_colony | 1 | 0.07 | 2.9% | 0.4 | 1.3 | 0.639 |
| default | 6 | 0.42 | 4.3% | 0.124 | 2.7 | 0.53 |
| default | 34 | 2.36 | 4.3% | 0.546 | 1.7 | 0.971 |
| crisis_compound | 8 | 1.24 | 2.5% | 0 | 2.1 | 0.601 |
| island_isolation | 2 | 0.24 | 3.1% | 0 | 11.9 | 0.351 |
| population_boom | 11 | 0.49 | 3% | 0 | 4.2 | 0.594 |
| late_game_siege | 15 | 1.04 | 2.9% | 0.533 | 1.2 | 0.835 |
| no_director | 24 | 1.66 | 2.9% | 0 | 4.5 | 0.819 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 4 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 4 | 0.957 | 2 | 0.396 | 1 | 0.898 | 0.785 |
| default | 2 | 0.981 | 1 | 0 | 1 | 0.948 | 0.684 |
| scarce_resources | 2 | 1 | 3 | 0.59 | 1 | 1 | 0.877 |
| abundant_resources | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| resource_chains_basic | 2 | 0.888 | 0 | 1 | 1 | 0.821 | 0.931 |
| full_processing | 2 | 0.966 | 0 | 1 | 1 | 0.946 | 0.979 |
| tooled_colony | 2 | 0.985 | 0 | 1 | 1 | 1 | 0.996 |
| high_threat | 2 | 0.926 | 0 | 1 | 1 | 1 | 0.978 |
| skeleton_crew | 2 | 0.82 | 2 | 0.5 | 1 | 1 | 0.796 |
| large_colony | 2 | 0.895 | 0 | 1 | 1 | 0.977 | 0.964 |
| wildlife_heavy | 2 | 0.975 | 0 | 1 | 7 | 0.972 | 0.987 |
| storm_start | 3 | 0.973 | 0 | 1 | 1 | 1 | 0.992 |
| default | 4 | 0.928 | 0 | 1 | 1 | 1 | 0.978 |
| developed_colony | 2 | 0.973 | 0 | 1 | 1 | 0.961 | 0.984 |
| default | 2 | 0.986 | 0 | 1 | 1 | 1 | 0.996 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| crisis_compound | 3 | 1 | 2 | 0.885 | 1 | 1 | 0.965 |
| island_isolation | 2 | 0.571 | 2 | 0.5 | 1 | 0.778 | 0.677 |
| population_boom | 2 | 0.85 | 1 | 0.999 | 1 | 1 | 0.955 |
| late_game_siege | 3 | 0.981 | 0 | 1 | 1 | 0.985 | 0.991 |
| no_director | 2 | 0.969 | 0 | 1 | 1 | 1 | 0.991 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.329 | 0.649 | 0.611 | 0.45 | 0.51 |
| default | 0.339 | 0.586 | 0.667 | 0.288 | 0.47 |
| default | 0.929 | 0.721 | 0 | 0.143 | 0.448 |
| scarce_resources | 0.187 | 0.503 | 0 | 0.173 | 0.216 |
| abundant_resources | 0.342 | 0.555 | 0.667 | 0.259 | 0.456 |
| resource_chains_basic | 0.233 | 0.559 | 0.944 | 0.376 | 0.528 |
| full_processing | 0.367 | 0.481 | 1 | 0.328 | 0.544 |
| tooled_colony | 0.374 | 0.463 | 0.667 | 0.402 | 0.476 |
| high_threat | 0.226 | 0.678 | 0.722 | 0.241 | 0.467 |
| skeleton_crew | 0.171 | 0.452 | 0 | 0.295 | 0.229 |
| large_colony | 0.269 | 0.612 | 0.611 | 0.364 | 0.464 |
| wildlife_heavy | 0.8 | 0.754 | 0 | 0.127 | 0.42 |
| storm_start | 0.226 | 0.669 | 0.722 | 0.236 | 0.463 |
| default | 0.329 | 0.65 | 0.611 | 0.407 | 0.499 |
| developed_colony | 0.449 | 0.403 | 1 | 0.362 | 0.554 |
| default | 0.456 | 0.795 | 0.667 | 0.337 | 0.564 |
| default | 0.315 | 0.688 | 0.583 | 0.355 | 0.485 |
| crisis_compound | 0.187 | 0.42 | 0.056 | 0.182 | 0.211 |
| island_isolation | 0.556 | 0.47 | 0 | 0 | 0.256 |
| population_boom | 0.171 | 0.498 | 0 | 0.24 | 0.227 |
| late_game_siege | 0.449 | 0.458 | 1 | 0.364 | 0.568 |
| no_director | 0.171 | 0.632 | 0 | 0.849 | 0.413 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 1.752 | 0.394 | true | 0.994 |
| default | 1.693 | 0.374 | true | 0.974 |
| default | 1.265 | 0.427 | true | 1 |
| scarce_resources | 1.331 | 0.199 | true | 0.799 |
| abundant_resources | 0.892 | 0.156 | true | 0.756 |
| resource_chains_basic | 0.852 | 0.123 | true | 0.723 |
| full_processing | 0.697 | 0.058 | true | 0.619 |
| tooled_colony | 0.395 | 0.071 | true | 0.519 |
| high_threat | 1.469 | 0.22 | true | 0.82 |
| skeleton_crew | 1.59 | 0.56 | true | 1 |
| large_colony | 1.054 | 0.331 | true | 0.931 |
| wildlife_heavy | 1.112 | 0.125 | true | 0.725 |
| storm_start | 1.142 | 0.235 | true | 0.835 |
| default | 1.096 | 0.315 | true | 0.915 |
| developed_colony | 0.719 | 0.065 | true | 0.635 |
| default | 0.659 | 0.105 | true | 0.652 |
| default | 1.491 | 0.234 | true | 0.834 |
| crisis_compound | 0.89 | 0.368 | true | 0.968 |
| island_isolation | 1.343 | 0.056 | true | 0.656 |
| population_boom | 1.479 | 0.113 | true | 0.713 |
| late_game_siege | 0.598 | 0.039 | true | 0.563 |
| no_director | 1.217 | 0.34 | true | 0.94 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| full_processing | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| skeleton_crew | hunger,rest,morale,social | 6 | deliver,harvest | true | 0.712 |
| large_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| developed_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process | true | 0.744 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process | true | 0.744 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| island_isolation | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest | true | 0.856 |
| population_boom | hunger,rest,morale,social | 6 | deliver,harvest | true | 0.712 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process | true | 0.887 |
| no_director | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.744 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.148 | 0.525 | 0.552 | 0.827 | 0.513 |
| default | 0.683 | 0.702 | 0.619 | 0.4 | 0.601 |
| default | 0.74 | 0.556 | 0.617 | 0.278 | 0.548 |
| scarce_resources | 0.311 | 0.745 | 0.625 | 0.618 | 0.575 |
| abundant_resources | 0.36 | 0.667 | 0.644 | 0.57 | 0.56 |
| resource_chains_basic | 0.319 | 0.679 | 0.62 | 0.58 | 0.549 |
| full_processing | 0.608 | 0.695 | 0.583 | 0.445 | 0.583 |
| tooled_colony | 0.626 | 0.732 | 0.625 | 0.518 | 0.625 |
| high_threat | 0.36 | 0.679 | 0.574 | 0.557 | 0.542 |
| skeleton_crew | 0.344 | 0.717 | 0.665 | 0.617 | 0.586 |
| large_colony | 0.533 | 0.804 | 0.62 | 0.645 | 0.65 |
| wildlife_heavy | 0.881 | 0 | 0.605 | 0.025 | 0.378 |
| storm_start | 0.36 | 0.679 | 0.602 | 0.557 | 0.549 |
| default | 0.148 | 0.525 | 0.572 | 0.827 | 0.518 |
| developed_colony | 0.646 | 0.651 | 0.641 | 0.408 | 0.586 |
| default | 0.485 | 0.765 | 0.609 | 0.419 | 0.569 |
| default | 0 | 0.537 | 0.568 | 0.739 | 0.461 |
| crisis_compound | 0.311 | 0.745 | 0.585 | 0.618 | 0.565 |
| island_isolation | 0.405 | 0 | 0.61 | 0.341 | 0.339 |
| population_boom | 0.311 | 0.745 | 0.632 | 0.632 | 0.58 |
| late_game_siege | 0.646 | 0.651 | 0.595 | 0.408 | 0.575 |
| no_director | 0.524 | 0.854 | 0.56 | 0.634 | 0.643 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 196 | 3 | 32 | 0.446 | 0.359 | 0.688 |
| default | 220 | 3 | 50 | 0.821 | 0.272 | 0.793 |
| default | 99 | 3 | 38 | 0.351 | 0.069 | 0.74 |
| scarce_resources | 124 | 3 | 27 | 0.172 | 0.275 | 0.664 |
| abundant_resources | 103 | 3 | 67 | 0.752 | 0.322 | 0.775 |
| resource_chains_basic | 116 | 3 | 52 | 0.516 | 0.129 | 0.661 |
| full_processing | 90 | 3 | 52 | 0.753 | 0.357 | 0.756 |
| tooled_colony | 133 | 3 | 29 | 0.337 | 0.1 | 0.732 |
| high_threat | 89 | 3 | 47 | 0.438 | 0.459 | 0.67 |
| skeleton_crew | 40 | 3 | 31 | 0.23 | 0 | 0.739 |
| large_colony | 230 | 3 | 40 | 0.726 | 0.143 | 0.8 |
| wildlife_heavy | 120 | 3 | 37 | 0 | 0.071 | 0.667 |
| storm_start | 95 | 3 | 57 | 0.595 | 0.405 | 0.718 |
| default | 173 | 3 | 28 | 0.353 | 0.279 | 0.689 |
| developed_colony | 106 | 3 | 46 | 0.542 | 0.489 | 0.699 |
| default | 137 | 3 | 33 | 0.025 | 0.443 | 0.598 |
| default | 106 | 3 | 31 | 0.401 | 0.467 | 0.661 |
| crisis_compound | 24 | 3 | 27 | 0.172 | 0 | 0.611 |
| island_isolation | 40 | 3 | 31 | 0 | 0.347 | 0.613 |
| population_boom | 168 | 3 | 36 | 0.344 | 0.102 | 0.735 |
| late_game_siege | 93 | 3 | 50 | 0.616 | 0.452 | 0.712 |
| no_director | 97 | 3 | 15 | 0 | 0 | 0.672 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.43 (F)
- **Spatial Layout Intelligence (空间布局智能)**: 0.55 (D)
- **Environmental Responsiveness (环境响应性)**: 0.613 (D)
- **Tile State Richness (地块状态丰富度)**: 0.654 (C)
- **Decision Consequence (决策后果深度)**: 0.659 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
