# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 20:56:29
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.797 (C)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.956 | A | 20% |
| **Gameplay** (游戏玩法) | 0.77 | C | 30% |
| **Maturity** (游戏成熟度) | 0.75 | C | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.817 | B | AI quality, pathfinding |
| Coverage | 1.05 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.823 | B | 20% | Progressive complexity growth |
| Playability | 0.851 | B | 20% | Tension curves, engagement |
| Efficiency | 0.722 | C | 18% | Labor throughput, utilization |
| Logistics | 0.432 | F | 15% | Infrastructure quality |
| Reasonableness | 0.857 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.931 | A | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.791 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.653 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.853 | B | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.789 | C | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.557 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.737 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.926 | A | 8% | 涌现叙事密度 |
| Decision Consequence | 0.624 | D | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.698 | C | 8% | 交通流质量 |
| Population Dynamics | 0.956 | A | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.724 | C | 8% | 环境响应性 |
| System Coupling Density | 0.671 | C | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| default/fortified_basin | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| default/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| scarce_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| abundant_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| resource_chains_basic/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| full_processing/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| tooled_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| high_threat/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 27 | none |
| skeleton_crew/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 15 | none |
| large_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 32 | none |
| wildlife_heavy/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 30 | none |
| storm_start/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| developed_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| crisis_compound/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 18 | none |
| island_isolation/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 18 | none |
| population_boom/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 32 | none |
| late_game_siege/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 39.17→40 | 3.5→5 | 7 | 1/3 |
| default | 44.67→46 | 3.7→4 | 8 | 1/3 |
| default | 18.5→19.2 | 3→3.6 | 5 | 0/3 |
| scarce_resources | 49.83→51.14 | 2.8→4 | 6 | 1/3 |
| abundant_resources | 56→57 | 2.3→4.1 | 7 | 1/3 |
| resource_chains_basic | 55.83→56 | 4→7 | 8 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 55.83→56 | 4→4.9 | 7 | 1/3 |
| high_threat | 54.67→55.43 | 2.3→5 | 8 | 1/3 |
| skeleton_crew | 50→50.86 | 2.8→3 | 4 | 0/3 |
| large_colony | 50.83→51 | 3→5 | 7 | 1/3 |
| wildlife_heavy | 10.5→10.86 | 3→3 | 6 | 0/3 |
| storm_start | 54.67→55.71 | 2.3→4 | 8 | 1/3 |
| default | 39.17→40 | 3.5→6 | 7 | 1/3 |
| developed_colony | 62.83→63 | 4→7 | 8 | 1/3 |
| default | 83.5→84 | 2.3→5 | 7 | 1/3 |
| default | 39.75→41 | 3.3→6 | 7 | 1/3 |
| crisis_compound | 49.83→51 | 2.8→4 | 5 | 1/3 |
| island_isolation | 7→6.29 | 2→2.9 | 3 | 0/3 |
| population_boom | 50→50.71 | 2.8→4 | 5 | 0/3 |
| late_game_siege | 62.83→63 | 4→7 | 8 | 1/3 |
| no_director | 49→49 | 3→4 | 5 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 14 | 14 | none | 1 |
| Roles | 8 | 8 | none | 1 |
| Resources | 7 | 7 | none | 1 |
| Intents | 14 | 10 | wander | 1.4 |
| Weathers | 4 | 5 | none | 0.8 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 1 | 0.925 | 1 | 0.95 | 0.969 |
| default | 0.915 | 0.919 | 1 | 0.57 | 0.886 |
| default | 1 | 0.943 | 0.952 | 0 | 0.821 |
| scarce_resources | 0.863 | 0.885 | 0.952 | 0.58 | 0.848 |
| abundant_resources | 0.943 | 0.926 | 1 | 0.67 | 0.911 |
| resource_chains_basic | 0.991 | 0.937 | 1 | 0.58 | 0.915 |
| full_processing | 0.835 | 0.941 | 1 | 0.64 | 0.878 |
| tooled_colony | 1 | 0.926 | 1 | 0.67 | 0.929 |
| high_threat | 0.708 | 0.897 | 1 | 0.52 | 0.809 |
| skeleton_crew | 0.921 | 0.822 | 0.935 | 0 | 0.757 |
| large_colony | 0.299 | 0.911 | 1 | 0.65 | 0.711 |
| wildlife_heavy | 1 | 0.87 | 1 | 0.33 | 0.861 |
| storm_start | 0.788 | 0.91 | 1 | 0.67 | 0.859 |
| default | 1 | 0.934 | 1 | 0.94 | 0.971 |
| developed_colony | 0.991 | 0.941 | 1 | 0.65 | 0.927 |
| default | 0.93 | 0.946 | 1 | 0.91 | 0.949 |
| default | 1 | 0.951 | 1 | 0.75 | 0.948 |
| crisis_compound | 0.894 | 0.933 | 0.952 | 0.59 | 0.874 |
| island_isolation | 1 | 0.787 | 0.565 | 0 | 0.677 |
| population_boom | 0.654 | 0.869 | 0.984 | 0 | 0.703 |
| late_game_siege | 0.84 | 0.912 | 1 | 0.66 | 0.874 |
| no_director | 0.453 | 0.877 | 1 | 0 | 0.649 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.521 | 1 | 0.989 | 11.3/min | 1.45 | 0.926 |
| default | 0.439 | 1 | 0.989 | 11.3/min | 1 | 0.714 |
| default | 0.155 | 1 | 0.983 | 11/min | 1 | 0.837 |
| scarce_resources | 0.154 | 1 | 0.983 | 11/min | 1 | 0.837 |
| abundant_resources | 0.164 | 1 | 0.983 | 11/min | 1 | 0.671 |
| resource_chains_basic | 0.245 | 1 | 0.983 | 11/min | 1.45 | 0.883 |
| full_processing | 0.111 | 1 | 0.983 | 11/min | 1.45 | 0.863 |
| tooled_colony | 0.256 | 1 | 0.983 | 11/min | 1.45 | 0.885 |
| high_threat | 0.332 | 1 | 0.95 | 11/min | 1.15 | 0.757 |
| skeleton_crew | 0.182 | 1 | 0.933 | 11/min | 1 | 0.83 |
| large_colony | 0.198 | 1 | 0.99 | 11/min | 1 | 0.678 |
| wildlife_heavy | 0.135 | 1 | 0.95 | 11/min | 1 | 0.825 |
| storm_start | 0.106 | 1 | 0.983 | 11/min | 1 | 0.663 |
| default | 0.501 | 1 | 0.989 | 11.3/min | 1.45 | 0.923 |
| developed_colony | 0.126 | 1 | 0.983 | 11/min | 1.45 | 0.866 |
| default | 0.272 | 1 | 1 | 11/min | 1 | 0.691 |
| default | 0.217 | 1 | 0.983 | 11/min | 1.45 | 0.879 |
| crisis_compound | 0.082 | 1 | 0.9 | 11/min | 1 | 0.803 |
| island_isolation | 0.336 | 1 | 0.933 | 11/min | 1 | 0.859 |
| population_boom | 0.2 | 1 | 0.99 | 11/min | 1 | 0.848 |
| late_game_siege | 0.157 | 1 | 0.917 | 11/min | 1.45 | 0.857 |
| no_director | 0.331 | 1 | 0.983 | 11/min | 1 | 0.87 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.739 | 1 | 1 | 0.898 | 0.891 |
| default | 0.771 | 1 | 1 | 0.891 | 0.899 |
| default | 0.758 | 1 | 0.67 | 0.891 | 0.829 |
| scarce_resources | 0.739 | 1 | 1 | 0.896 | 0.891 |
| abundant_resources | 0.716 | 0.556 | 1 | 0.9 | 0.796 |
| resource_chains_basic | 0.806 | 1 | 1 | 0.891 | 0.909 |
| full_processing | 0.81 | 1 | 1 | 0.888 | 0.909 |
| tooled_colony | 0.758 | 0.556 | 1 | 0.902 | 0.809 |
| high_threat | 0.717 | 0.556 | 1 | 0.896 | 0.795 |
| skeleton_crew | 0.845 | 1 | 0.67 | 0.96 | 0.875 |
| large_colony | 0.613 | 1 | 1 | 0.892 | 0.851 |
| wildlife_heavy | 0.705 | 1 | 1 | 0.899 | 0.881 |
| storm_start | 0.721 | 1 | 1 | 0.897 | 0.885 |
| default | 0.777 | 1 | 1 | 0.885 | 0.899 |
| developed_colony | 0.799 | 0.556 | 1 | 0.9 | 0.821 |
| default | 0.778 | 1 | 0.67 | 0.889 | 0.834 |
| default | 0.749 | 1 | 0.67 | 0.883 | 0.824 |
| crisis_compound | 0.882 | 1 | 1 | 0.938 | 0.946 |
| island_isolation | 0.727 | 0.556 | 1 | 0.923 | 0.806 |
| population_boom | 0.601 | 1 | 1 | 0.886 | 0.846 |
| late_game_siege | 0.785 | 0.556 | 1 | 0.89 | 0.814 |
| no_director | 0.708 | 0.833 | 1 | 0.901 | 0.849 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 51 | 2.17 | 2.7% | 0.384 | 1.7 | 0.914 |
| default | 29 | 1.24 | 2.7% | 0.106 | 3.3 | 0.634 |
| default | 23 | 1.6 | 4.3% | 0 | 3.8 | 0.825 |
| scarce_resources | 25 | 1.73 | 2.9% | 0 | 5.6 | 0.616 |
| abundant_resources | 11 | 0.76 | 2.9% | 0.067 | 2.2 | 0.561 |
| resource_chains_basic | 15 | 1.04 | 2.9% | 0.404 | 2.7 | 0.763 |
| full_processing | 13 | 0.9 | 2.9% | 0.422 | 1.5 | 0.772 |
| tooled_colony | 11 | 0.76 | 2.9% | 0.233 | 1.9 | 0.65 |
| high_threat | 17 | 1.18 | 2.9% | 0.188 | 2.6 | 0.677 |
| skeleton_crew | 9 | 1.65 | 2.4% | 0 | 2.3 | 0.873 |
| large_colony | 22 | 0.98 | 3% | 0.169 | 2.1 | 0.647 |
| wildlife_heavy | 20 | 1.42 | 3% | 0 | 2.5 | 0.621 |
| storm_start | 14 | 0.97 | 2.9% | 0 | 2.6 | 0.552 |
| default | 54 | 2.3 | 2.7% | 0.542 | 1.6 | 0.973 |
| developed_colony | 14 | 0.97 | 2.9% | 0.689 | 1.2 | 0.826 |
| default | 18 | 1.25 | 4.3% | 0.133 | 3.2 | 0.651 |
| default | 30 | 2.08 | 4.3% | 0.683 | 1.8 | 0.97 |
| crisis_compound | 6 | 0.93 | 2.5% | 0 | 2.3 | 0.728 |
| island_isolation | 3 | 0.35 | 2.7% | 0 | 10.6 | 0.405 |
| population_boom | 20 | 0.89 | 3% | 0 | 5 | 0.654 |
| late_game_siege | 13 | 0.9 | 2.9% | 0.533 | 1.4 | 0.812 |
| no_director | 21 | 1.45 | 2.9% | 0 | 5.2 | 0.761 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 4 | 0.926 | 0 | 1 | 1 | 0.898 | 0.957 |
| default | 2 | 0.945 | 1 | 0 | 1 | 0.955 | 0.674 |
| scarce_resources | 2 | 0.993 | 2 | 0.885 | 1 | 1 | 0.963 |
| abundant_resources | 2 | 0.998 | 0 | 1 | 1 | 1 | 0.999 |
| resource_chains_basic | 2 | 0.9 | 0 | 1 | 1 | 1 | 0.97 |
| full_processing | 2 | 0.99 | 0 | 1 | 1 | 0.957 | 0.988 |
| tooled_colony | 2 | 0.951 | 0 | 1 | 1 | 1 | 0.985 |
| high_threat | 2 | 0.995 | 1 | 0 | 1 | 1 | 0.699 |
| skeleton_crew | 2 | 0.866 | 2 | 0.5 | 1 | 1 | 0.81 |
| large_colony | 2 | 0.928 | 0 | 1 | 1 | 0.977 | 0.974 |
| wildlife_heavy | 2 | 0.989 | 0 | 1 | 7 | 0.964 | 0.99 |
| storm_start | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| developed_colony | 2 | 0.97 | 0 | 1 | 1 | 0.983 | 0.988 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| crisis_compound | 3 | 0.983 | 2 | 0.885 | 1 | 0.951 | 0.951 |
| island_isolation | 2 | 0.794 | 2 | 0.5 | 1 | 0.778 | 0.744 |
| population_boom | 2 | 0.878 | 2 | 0.5 | 1 | 1 | 0.813 |
| late_game_siege | 3 | 0.969 | 0 | 1 | 1 | 0.985 | 0.988 |
| no_director | 2 | 0.959 | 0 | 1 | 1 | 1 | 0.988 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.329 | 0.634 | 0.611 | 0.443 | 0.504 |
| default | 0.35 | 0.604 | 0.722 | 0.271 | 0.487 |
| default | 0.929 | 0.722 | 0 | 0.145 | 0.449 |
| scarce_resources | 0.187 | 0.591 | 0 | 0.194 | 0.243 |
| abundant_resources | 0.342 | 0.585 | 0.667 | 0.258 | 0.463 |
| resource_chains_basic | 0.233 | 0.568 | 0.944 | 0.347 | 0.523 |
| full_processing | 0.367 | 0.475 | 1 | 0.318 | 0.54 |
| tooled_colony | 0.374 | 0.449 | 0.667 | 0.39 | 0.47 |
| high_threat | 0.226 | 0.668 | 0.667 | 0.244 | 0.451 |
| skeleton_crew | 0.171 | 0.414 | 0 | 0.296 | 0.22 |
| large_colony | 0.269 | 0.582 | 0.611 | 0.366 | 0.457 |
| wildlife_heavy | 0.8 | 0.771 | 0 | 0.129 | 0.425 |
| storm_start | 0.226 | 0.612 | 0.667 | 0.238 | 0.436 |
| default | 0.329 | 0.643 | 0.611 | 0.416 | 0.5 |
| developed_colony | 0.449 | 0.475 | 1 | 0.363 | 0.572 |
| default | 0.456 | 0.768 | 0.667 | 0.358 | 0.562 |
| default | 0.315 | 0.682 | 0.583 | 0.347 | 0.482 |
| crisis_compound | 0.184 | 0.512 | 0 | 0.208 | 0.226 |
| island_isolation | 0.667 | 0.478 | 0 | 0.006 | 0.288 |
| population_boom | 0.171 | 0.602 | 0 | 0.22 | 0.248 |
| late_game_siege | 0.449 | 0.417 | 1 | 0.363 | 0.557 |
| no_director | 0.171 | 0.588 | 0 | 0.857 | 0.404 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 1.306 | 0.359 | true | 0.959 |
| default | 1.737 | 0.337 | true | 0.937 |
| default | 1.438 | 0.428 | true | 1 |
| scarce_resources | 1.264 | 0.266 | true | 0.866 |
| abundant_resources | 0.95 | 0.06 | true | 0.66 |
| resource_chains_basic | 1.233 | 0.154 | true | 0.754 |
| full_processing | 0.871 | 0.158 | true | 0.758 |
| tooled_colony | 0.628 | 0.016 | true | 0.552 |
| high_threat | 1.343 | 0.158 | true | 0.758 |
| skeleton_crew | 1.275 | 0.325 | true | 0.925 |
| large_colony | 1.187 | 0.091 | true | 0.691 |
| wildlife_heavy | 1.331 | 0.449 | true | 1 |
| storm_start | 0.805 | 0.045 | true | 0.645 |
| default | 1.022 | 0.264 | true | 0.864 |
| developed_colony | 0.533 | 0.026 | true | 0.526 |
| default | 1.107 | 0.303 | true | 0.903 |
| default | 0.913 | 0.253 | true | 0.853 |
| crisis_compound | 1.085 | 0.355 | true | 0.955 |
| island_isolation | 1.132 | 0.05 | true | 0.65 |
| population_boom | 1.418 | 0.182 | true | 0.782 |
| late_game_siege | 0.565 | 0.015 | true | 0.527 |
| no_director | 1.227 | 0.246 | true | 0.846 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| full_processing | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| skeleton_crew | hunger,rest,morale,social | 6 | deliver,harvest,socialize | true | 0.744 |
| large_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| developed_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize | true | 0.806 |
| island_isolation | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.806 |
| population_boom | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.856 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| no_director | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.856 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.148 | 0.525 | 0.55 | 0.827 | 0.513 |
| default | 0.697 | 0.717 | 0.614 | 0.415 | 0.611 |
| default | 0.524 | 0.667 | 0.612 | 0.452 | 0.564 |
| scarce_resources | 0.311 | 0.745 | 0.626 | 0.618 | 0.575 |
| abundant_resources | 0.36 | 0.667 | 0.647 | 0.57 | 0.561 |
| resource_chains_basic | 0.319 | 0.679 | 0.611 | 0.58 | 0.547 |
| full_processing | 0.608 | 0.695 | 0.593 | 0.445 | 0.585 |
| tooled_colony | 0.626 | 0.732 | 0.598 | 0.518 | 0.619 |
| high_threat | 0.36 | 0.679 | 0.608 | 0.557 | 0.551 |
| skeleton_crew | 0.344 | 0.731 | 0.65 | 0.61 | 0.583 |
| large_colony | 0.533 | 0.804 | 0.633 | 0.645 | 0.654 |
| wildlife_heavy | 0.881 | 0 | 0.594 | 0.025 | 0.375 |
| storm_start | 0.36 | 0.679 | 0.62 | 0.557 | 0.554 |
| default | 0.148 | 0.525 | 0.536 | 0.827 | 0.509 |
| developed_colony | 0.646 | 0.651 | 0.611 | 0.408 | 0.579 |
| default | 0.485 | 0.774 | 0.596 | 0.424 | 0.57 |
| default | 0 | 0.537 | 0.564 | 0.739 | 0.46 |
| crisis_compound | 0.311 | 0.745 | 0.643 | 0.618 | 0.579 |
| island_isolation | 0.417 | 0.667 | 0.57 | 0.421 | 0.519 |
| population_boom | 0.289 | 0.8 | 0.626 | 0.632 | 0.587 |
| late_game_siege | 0.646 | 0.651 | 0.618 | 0.408 | 0.581 |
| no_director | 0.289 | 0.816 | 0.594 | 0.627 | 0.582 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 141 | 3 | 28 | 0.353 | 0.385 | 0.663 |
| default | 253 | 3 | 51 | 0.731 | 0.119 | 0.805 |
| default | 85 | 3 | 38 | 0.051 | 0.101 | 0.672 |
| scarce_resources | 106 | 3 | 27 | 0.172 | 0.331 | 0.653 |
| abundant_resources | 103 | 3 | 65 | 0.72 | 0.304 | 0.773 |
| resource_chains_basic | 107 | 3 | 44 | 0.391 | 0.315 | 0.697 |
| full_processing | 91 | 3 | 56 | 0.834 | 0.45 | 0.755 |
| tooled_colony | 109 | 3 | 29 | 0.337 | 0.353 | 0.676 |
| high_threat | 82 | 3 | 45 | 0.406 | 0.264 | 0.71 |
| skeleton_crew | 37 | 3 | 32 | 0.247 | 0 | 0.639 |
| large_colony | 180 | 3 | 42 | 0.777 | 0.075 | 0.827 |
| wildlife_heavy | 100 | 3 | 39 | 0 | 0.05 | 0.669 |
| storm_start | 82 | 3 | 67 | 0.752 | 0.157 | 0.703 |
| default | 157 | 3 | 28 | 0.353 | 0.339 | 0.67 |
| developed_colony | 95 | 3 | 48 | 0.579 | 0.528 | 0.693 |
| default | 116 | 3 | 33 | 0.03 | 0.5 | 0.585 |
| default | 115 | 3 | 31 | 0.401 | 0.487 | 0.656 |
| crisis_compound | 46 | 3 | 27 | 0.172 | 0 | 0.723 |
| island_isolation | 37 | 3 | 30 | 0 | 0.026 | 0.669 |
| population_boom | 143 | 3 | 34 | 0.323 | 0.072 | 0.735 |
| late_game_siege | 92 | 3 | 46 | 0.542 | 0.448 | 0.703 |
| no_director | 91 | 3 | 15 | 0 | 0 | 0.679 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.432 (F)
- **Spatial Layout Intelligence (空间布局智能)**: 0.557 (D)
- **Decision Consequence (决策后果深度)**: 0.624 (D)
- **Tile State Richness (地块状态丰富度)**: 0.653 (C)
- **System Coupling Density (系统耦合密度)**: 0.671 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
