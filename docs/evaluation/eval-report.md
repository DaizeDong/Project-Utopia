# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 07:55:51
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.774 (C)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.939 | A | 20% |
| **Gameplay** (游戏玩法) | 0.739 | C | 30% |
| **Maturity** (游戏成熟度) | 0.73 | C | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.767 | C | AI quality, pathfinding |
| Coverage | 1.05 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.821 | B | 20% | Progressive complexity growth |
| Playability | 0.842 | B | 20% | Tension curves, engagement |
| Efficiency | 0.652 | C | 18% | Labor throughput, utilization |
| Logistics | 0.403 | F | 15% | Infrastructure quality |
| Reasonableness | 0.87 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.819 | B | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.794 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.657 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.792 | C | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.768 | C | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.573 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.713 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.854 | B | 8% | 涌现叙事密度 |
| Decision Consequence | 0.654 | C | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.7 | C | 8% | 交通流质量 |
| Population Dynamics | 0.899 | B | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.675 | C | 8% | 环境响应性 |
| System Coupling Density | 0.653 | C | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 22 | none |
| default/fortified_basin | YES | 90/90s | 0 | 0 | 0 | 21 | none |
| default/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 21 | none |
| scarce_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 21 | none |
| abundant_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| resource_chains_basic/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| full_processing/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| tooled_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| high_threat/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 26 | none |
| skeleton_crew/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 14 | none |
| large_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| wildlife_heavy/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 29 | none |
| storm_start/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 22 | none |
| developed_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 22 | none |
| crisis_compound/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 17 | none |
| island_isolation/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 15 | none |
| population_boom/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| late_game_siege/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 20 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 39.5→40 | 3.3→4 | 7 | 1/3 |
| default | 43.83→45 | 3→3.6 | 6 | 1/3 |
| default | 21→24.6 | 3→4.6 | 6 | 0/3 |
| scarce_resources | 49→53.29 | 2.8→4.3 | 6 | 1/3 |
| abundant_resources | 55.5→56 | 3→4 | 7 | 1/3 |
| resource_chains_basic | 55→55 | 4→6 | 7 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 55→56 | 4→6 | 7 | 1/3 |
| high_threat | 55.5→56 | 3→5 | 7 | 1/3 |
| skeleton_crew | 51.5→53 | 2.8→3.1 | 5 | 1/3 |
| large_colony | 50→50 | 3→3.1 | 6 | 1/3 |
| wildlife_heavy | 11.5→11.86 | 3→3 | 5 | 0/3 |
| storm_start | 55.5→56 | 3→6 | 7 | 1/3 |
| default | 39.5→40 | 3.3→6 | 7 | 1/3 |
| developed_colony | 62→62 | 4→7 | 8 | 1/3 |
| default | 84.25→85 | 3.5→4 | 7 | 1/3 |
| default | 40.25→41 | 3→6 | 7 | 1/3 |
| crisis_compound | 49→52.57 | 2.8→4.4 | 5 | 1/3 |
| island_isolation | 7→6.57 | 2→2.6 | 2 | 0/3 |
| population_boom | 51.5→53 | 2.8→3.1 | 6 | 1/3 |
| late_game_siege | 62→62 | 4→7 | 8 | 1/3 |
| no_director | 49→47.57 | 3→4 | 5 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 14 | 14 | none | 1 |
| Roles | 8 | 8 | none | 1 |
| Resources | 7 | 7 | none | 1 |
| Intents | 14 | 10 | none | 1.4 |
| Weathers | 4 | 5 | none | 0.8 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 1 | 0.897 | 0.855 | 0.5 | 0.858 |
| default | 0.992 | 0.918 | 0.952 | 0.51 | 0.888 |
| default | 1 | 0.926 | 1 | 0.41 | 0.888 |
| scarce_resources | 1 | 0.924 | 0.952 | 0.52 | 0.894 |
| abundant_resources | 0.708 | 0.938 | 1 | 0.66 | 0.842 |
| resource_chains_basic | 0.592 | 0.929 | 1 | 0.64 | 0.802 |
| full_processing | 1 | 0.918 | 1 | 0.65 | 0.923 |
| tooled_colony | 0.824 | 0.924 | 1 | 0.51 | 0.852 |
| high_threat | 0.708 | 0.921 | 1 | 0.66 | 0.837 |
| skeleton_crew | 1 | 0.945 | 0.984 | 0.5 | 0.904 |
| large_colony | 0.295 | 0.811 | 1 | 0.65 | 0.679 |
| wildlife_heavy | 1 | 0.885 | 1 | 0 | 0.815 |
| storm_start | 0.708 | 0.923 | 1 | 0.67 | 0.839 |
| default | 1 | 0.919 | 1 | 0.7 | 0.931 |
| developed_colony | 1 | 0.93 | 1 | 0.66 | 0.927 |
| default | 0.51 | 0.942 | 1 | 0.66 | 0.784 |
| default | 1 | 0.923 | 1 | 0.6 | 0.916 |
| crisis_compound | 1 | 0.919 | 0.935 | 0.51 | 0.886 |
| island_isolation | 1 | 0.623 | 0.5 | 0 | 0.612 |
| population_boom | 0.75 | 0.896 | 0.984 | 0.57 | 0.826 |
| late_game_siege | 0.877 | 0.927 | 1 | 0.64 | 0.887 |
| no_director | 0.665 | 0.911 | 1 | 0 | 0.723 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.253 | 1 | 0.989 | 11.3/min | 1.15 | 0.752 |
| default | 0.414 | 1 | 0.989 | 11.3/min | 1.15 | 0.777 |
| default | 0.114 | 1 | 0.983 | 11/min | 1.15 | 0.73 |
| scarce_resources | 0.126 | 1 | 0.983 | 11/min | 1.15 | 0.732 |
| abundant_resources | 0.126 | 1 | 0.983 | 11/min | 1 | 0.666 |
| resource_chains_basic | 0.181 | 1 | 0.983 | 11/min | 1.3 | 0.807 |
| full_processing | 0.191 | 1 | 0.983 | 11/min | 1.45 | 0.875 |
| tooled_colony | 0.151 | 1 | 0.983 | 11/min | 1.45 | 0.869 |
| high_threat | 0.222 | 1 | 0.933 | 11/min | 1 | 0.67 |
| skeleton_crew | 0.175 | 1 | 0.933 | 11/min | 1 | 0.663 |
| large_colony | 0.262 | 1 | 0.99 | 11/min | 1 | 0.687 |
| wildlife_heavy | 0.218 | 1 | 0.933 | 11/min | 1 | 0.837 |
| storm_start | 0.159 | 1 | 0.983 | 11/min | 1.15 | 0.737 |
| default | 0.391 | 1 | 0.989 | 11.3/min | 1.15 | 0.773 |
| developed_colony | 0.193 | 1 | 0.983 | 11/min | 1.45 | 0.876 |
| default | 0.11 | 1 | 1 | 11/min | 1 | 0.667 |
| default | 0.202 | 1 | 0.983 | 11/min | 1.15 | 0.744 |
| crisis_compound | 0.238 | 1 | 0.85 | 11/min | 1.15 | 0.722 |
| island_isolation | 0.394 | 1 | 0.933 | 11/min | 1 | 0.87 |
| population_boom | 0.296 | 1 | 0.99 | 11/min | 1 | 0.692 |
| late_game_siege | 0.161 | 1 | 0.933 | 11/min | 1.45 | 0.861 |
| no_director | 0.31 | 1 | 0.983 | 11/min | 1 | 0.867 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.747 | 1 | 1 | 0.92 | 0.9 |
| default | 0.772 | 1 | 1 | 0.863 | 0.891 |
| default | 0.743 | 1 | 1 | 0.882 | 0.888 |
| scarce_resources | 0.736 | 1 | 1 | 0.897 | 0.89 |
| abundant_resources | 0.736 | 1 | 1 | 0.91 | 0.894 |
| resource_chains_basic | 0.773 | 1 | 1 | 0.9 | 0.902 |
| full_processing | 0.826 | 0.278 | 1 | 0.894 | 0.771 |
| tooled_colony | 0.75 | 0.556 | 1 | 0.902 | 0.807 |
| high_threat | 0.784 | 1 | 1 | 0.904 | 0.907 |
| skeleton_crew | 0.872 | 1 | 0.67 | 0.96 | 0.883 |
| large_colony | 0.815 | 0.556 | 1 | 0.603 | 0.736 |
| wildlife_heavy | 0.747 | 0.556 | 1 | 0.925 | 0.813 |
| storm_start | 0.76 | 0.833 | 1 | 0.902 | 0.865 |
| default | 0.781 | 1 | 1 | 0.888 | 0.901 |
| developed_colony | 0.813 | 1 | 1 | 0.886 | 0.91 |
| default | 0.777 | 1 | 0.67 | 0.898 | 0.836 |
| default | 0.718 | 1 | 1 | 0.896 | 0.884 |
| crisis_compound | 0.901 | 1 | 1 | 0.951 | 0.956 |
| island_isolation | 0.771 | 1 | 0.67 | 0.963 | 0.854 |
| population_boom | 0.714 | 1 | 1 | 0.697 | 0.823 |
| late_game_siege | 0.812 | 1 | 1 | 0.888 | 0.91 |
| no_director | 0.78 | 1 | 1 | 0.93 | 0.913 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 23 | 1.12 | 3.5% | 0.632 | 4.6 | 0.791 |
| default | 21 | 1.08 | 3.2% | 0.046 | 6.9 | 0.52 |
| default | 10 | 0.77 | 4.8% | 0.07 | 8.3 | 0.463 |
| scarce_resources | 14 | 1.06 | 2.9% | 0.109 | 3.4 | 0.608 |
| abundant_resources | 8 | 0.56 | 2.9% | 0.067 | 3.5 | 0.509 |
| resource_chains_basic | 14 | 0.98 | 2.9% | 0.3 | 2.8 | 0.7 |
| full_processing | 2 | 0.14 | 2.9% | 0.4 | 1.6 | 0.643 |
| tooled_colony | 10 | 0.7 | 2.9% | 0.333 | 1.7 | 0.693 |
| high_threat | 18 | 1.25 | 2.9% | 0.267 | 3.7 | 0.71 |
| skeleton_crew | 7 | 1.31 | 2.4% | 0 | 2.2 | 0.609 |
| large_colony | 5 | 0.25 | 3.2% | 0 | 7.1 | 0.369 |
| wildlife_heavy | 4 | 0.31 | 3.3% | 0 | 11.2 | 0.383 |
| storm_start | 23 | 1.6 | 2.9% | 0.5 | 4 | 0.874 |
| default | 28 | 1.36 | 3.1% | 0.361 | 4 | 0.769 |
| developed_colony | 12 | 0.83 | 2.9% | 0.356 | 1.4 | 0.728 |
| default | 22 | 1.53 | 4.3% | 0.5 | 2.9 | 0.883 |
| default | 20 | 1.47 | 4.6% | 0.58 | 4.3 | 0.849 |
| crisis_compound | 10 | 1.8 | 2.3% | 0.103 | 2.8 | 0.725 |
| island_isolation | 5 | 0.71 | 3.2% | 0 | 11.3 | 0.46 |
| population_boom | 18 | 0.9 | 3.2% | 0 | 4.8 | 0.504 |
| late_game_siege | 13 | 0.9 | 2.9% | 0.511 | 1.5 | 0.811 |
| no_director | 14 | 1.17 | 3.2% | 0 | 3.4 | 0.749 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 4 | 0.88 | 2 | 0 | 1 | 0.845 | 0.633 |
| default | 3 | 1 | 1 | 0 | 1 | 0.909 | 0.682 |
| default | 2 | 1 | 1 | 0 | 1 | 0.981 | 0.696 |
| scarce_resources | 2 | 0.884 | 2 | 0.254 | 1 | 1 | 0.742 |
| abundant_resources | 2 | 0.97 | 0 | 1 | 1 | 0.987 | 0.988 |
| resource_chains_basic | 2 | 0.865 | 1 | 0.999 | 0 | 1 | 0.959 |
| full_processing | 2 | 0.964 | 0 | 1 | 1 | 0.93 | 0.975 |
| tooled_colony | 2 | 0.855 | 1 | 0 | 1 | 0.817 | 0.62 |
| high_threat | 2 | 0.911 | 1 | 0.999 | 1 | 0.949 | 0.963 |
| skeleton_crew | 2 | 0.843 | 1 | 0 | 1 | 1 | 0.653 |
| large_colony | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| wildlife_heavy | 2 | 1 | 1 | 0 | 7 | 0.924 | 0.685 |
| storm_start | 3 | 0.944 | 1 | 0.999 | 1 | 0.943 | 0.972 |
| default | 4 | 1 | 1 | 0.25 | 1 | 0.922 | 0.759 |
| developed_colony | 2 | 0.936 | 0 | 1 | 1 | 0.977 | 0.976 |
| default | 2 | 0.919 | 1 | 0.999 | 1 | 0.89 | 0.953 |
| default | 2 | 0.976 | 2 | 0 | 1 | 0.919 | 0.677 |
| crisis_compound | 3 | 0.95 | 2 | 0.259 | 1 | 1 | 0.763 |
| island_isolation | 2 | 0.952 | 2 | 0 | 1 | 0.9 | 0.666 |
| population_boom | 2 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| late_game_siege | 3 | 0.961 | 0 | 1 | 1 | 0.937 | 0.976 |
| no_director | 2 | 0.947 | 0 | 1 | 1 | 1 | 0.984 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.292 | 0.638 | 0.611 | 0.196 | 0.434 |
| default | 0.248 | 0.322 | 0.278 | 0.247 | 0.274 |
| default | 0.806 | 0.569 | 0.25 | 0.156 | 0.445 |
| scarce_resources | 0.181 | 0.476 | 0.167 | 0.164 | 0.247 |
| abundant_resources | 0.217 | 0.511 | 0.667 | 0.278 | 0.418 |
| resource_chains_basic | 0.233 | 0.599 | 0.667 | 0.497 | 0.499 |
| full_processing | 0.367 | 0.409 | 1 | 0.342 | 0.529 |
| tooled_colony | 0.343 | 0.443 | 0.667 | 0.346 | 0.45 |
| high_threat | 0.217 | 0.57 | 0.667 | 0.326 | 0.445 |
| skeleton_crew | 0.183 | 0.686 | 0.167 | 0.315 | 0.338 |
| large_colony | 0.231 | 0.451 | 0.333 | 0.296 | 0.328 |
| wildlife_heavy | 0.588 | 0.502 | 0 | 0.142 | 0.308 |
| storm_start | 0.217 | 0.545 | 0.667 | 0.311 | 0.435 |
| default | 0.297 | 0.65 | 0.611 | 0.332 | 0.472 |
| developed_colony | 0.424 | 0.405 | 1 | 0.366 | 0.549 |
| default | 0.376 | 0.573 | 0.667 | 0.339 | 0.489 |
| default | 0.281 | 0.644 | 0.583 | 0.31 | 0.455 |
| crisis_compound | 0.181 | 0.362 | 0.167 | 0.249 | 0.24 |
| island_isolation | 0.667 | 0.448 | 0 | 0.004 | 0.28 |
| population_boom | 0.183 | 0.628 | 0.111 | 0.179 | 0.275 |
| late_game_siege | 0.424 | 0.448 | 1 | 0.366 | 0.56 |
| no_director | 0.171 | 0.592 | 0 | 0.828 | 0.398 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 1.73 | 0.517 | true | 1 |
| default | 1.342 | 0.421 | true | 1 |
| default | 0.805 | 0.417 | true | 1 |
| scarce_resources | 1.046 | 0.33 | true | 0.93 |
| abundant_resources | 0.939 | 0.094 | true | 0.694 |
| resource_chains_basic | 0.801 | 0.226 | true | 0.826 |
| full_processing | 0.718 | 0.054 | true | 0.623 |
| tooled_colony | 0.325 | 0.03 | true | 0.452 |
| high_threat | 0.952 | 0.305 | true | 0.905 |
| skeleton_crew | 1.417 | 0.347 | true | 0.947 |
| large_colony | 0 | 0.001 | true | 0.301 |
| wildlife_heavy | 1.236 | 0.158 | true | 0.758 |
| storm_start | 1.117 | 0.228 | true | 0.828 |
| default | 1.006 | 0.32 | true | 0.92 |
| developed_colony | 0.748 | 0.076 | true | 0.656 |
| default | 1.051 | 0.297 | true | 0.897 |
| default | 1.162 | 0.332 | true | 0.932 |
| crisis_compound | 1.091 | 0.248 | true | 0.848 |
| island_isolation | 0.366 | 0.139 | true | 0.576 |
| population_boom | 0.933 | 0.276 | true | 0.876 |
| late_game_siege | 0.594 | 0.05 | true | 0.572 |
| no_director | 1.181 | 0.33 | true | 0.93 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| full_processing | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| skeleton_crew | hunger,rest,morale,social | 6 | deliver,harvest,process | true | 0.744 |
| large_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.744 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.744 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| developed_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process | true | 0.744 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process | true | 0.887 |
| island_isolation | hunger,rest,morale,social | 6 | deliver,harvest | true | 0.712 |
| population_boom | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| no_director | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.744 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.94 | 0.65 | 0.651 | 0.705 | 0.737 |
| default | 0.696 | 0.733 | 0.681 | 0.508 | 0.655 |
| default | 0.767 | 0.36 | 0.638 | 0.489 | 0.563 |
| scarce_resources | 0.286 | 0.704 | 0.615 | 0.598 | 0.551 |
| abundant_resources | 0.294 | 0.679 | 0.666 | 0.583 | 0.555 |
| resource_chains_basic | 0.346 | 0.691 | 0.579 | 0.586 | 0.55 |
| full_processing | 0.612 | 0.695 | 0.622 | 0.439 | 0.592 |
| tooled_colony | 0.626 | 0.714 | 0.61 | 0.519 | 0.617 |
| high_threat | 0.294 | 0.679 | 0.598 | 0.583 | 0.538 |
| skeleton_crew | 0.276 | 0.755 | 0.619 | 0.598 | 0.562 |
| large_colony | 0.532 | 0.82 | 0.631 | 0.617 | 0.65 |
| wildlife_heavy | 0.448 | 0.182 | 0.794 | 0.645 | 0.517 |
| storm_start | 0.294 | 0.679 | 0.601 | 0.583 | 0.539 |
| default | 0.105 | 0.525 | 0.588 | 0.81 | 0.507 |
| developed_colony | 0.65 | 0.661 | 0.68 | 0.402 | 0.598 |
| default | 0.515 | 0.776 | 0.6 | 0.452 | 0.586 |
| default | 0.041 | 0.537 | 0.572 | 0.702 | 0.463 |
| crisis_compound | 0.286 | 0.717 | 0.593 | 0.605 | 0.55 |
| island_isolation | 0.417 | 0.667 | 0.579 | 0.421 | 0.521 |
| population_boom | 0.286 | 0.717 | 0.552 | 0.605 | 0.54 |
| late_game_siege | 0.65 | 0.661 | 0.66 | 0.402 | 0.593 |
| no_director | 0.524 | 0.851 | 0.517 | 0.637 | 0.632 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 234 | 3 | 28 | 0.353 | 0.395 | 0.682 |
| default | 133 | 3 | 62 | 0.313 | 0.455 | 0.668 |
| default | 76 | 3 | 36 | 0.915 | 0.104 | 0.85 |
| scarce_resources | 102 | 3 | 26 | 0.126 | 0.052 | 0.698 |
| abundant_resources | 125 | 3 | 77 | 0.909 | 0.302 | 0.815 |
| resource_chains_basic | 76 | 3 | 42 | 0.373 | 0.244 | 0.702 |
| full_processing | 64 | 3 | 56 | 0.834 | 0.318 | 0.788 |
| tooled_colony | 89 | 3 | 50 | 0.799 | 0.405 | 0.661 |
| high_threat | 83 | 3 | 43 | 0.375 | 0.31 | 0.693 |
| skeleton_crew | 73 | 3 | 27 | 0.152 | 0 | 0.714 |
| large_colony | 180 | 3 | 44 | 0.867 | 0.265 | 0.807 |
| wildlife_heavy | 228 | 3 | 34 | 0 | 0.28 | 0.663 |
| storm_start | 89 | 3 | 49 | 0.469 | 0.175 | 0.639 |
| default | 138 | 3 | 39 | 0.609 | 0.38 | 0.724 |
| developed_colony | 118 | 3 | 68 | 0.976 | 0.377 | 0.716 |
| default | 92 | 3 | 47 | 0.164 | 0.255 | 0.562 |
| default | 97 | 3 | 34 | 0.469 | 0.368 | 0.695 |
| crisis_compound | 9 | 3 | 27 | 0.152 | 0 | 0.709 |
| island_isolation | 30 | 2 | 21 | 0 | 0.338 | 0.542 |
| population_boom | 151 | 3 | 28 | 0.168 | 0.313 | 0.642 |
| late_game_siege | 97 | 3 | 62 | 0.863 | 0.533 | 0.758 |
| no_director | 42 | 3 | 15 | 0 | 0 | 0.663 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.403 (F)
- **Spatial Layout Intelligence (空间布局智能)**: 0.573 (D)
- **Efficiency**: 0.652 (C)
- **System Coupling Density (系统耦合密度)**: 0.653 (C)
- **Decision Consequence (决策后果深度)**: 0.654 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
