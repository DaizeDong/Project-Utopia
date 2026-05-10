import sys, re, os, collections
buckets = collections.defaultdict(list)
PATS = [
    ('benchmark',           r'(benchmark|long-horizon|long-run|soak|monoton|sim-stepper|rng-determ|snapshot|harness|simstepper)'),
    ('navigation',          r'(astar|navigation-repath|path-fail|reachab|spatial-hash|grid-cache|boids|gate-faction|road-(network|planner|astar|compoun)|pathfinding)'),
    ('ai-llm',              r'(^test/(a7|ai-|agent-director|alpha-|llm-|colony-|strategic|enriched-perceiver|prompt|policy|skill-library|decision-scheduler|automation|exchange|evaluation|evaluator|guardrails|tune|brain|perceiver|build-proposer|placement-specialist|plan-evaluator|outage|interval|memory-|fallback-|next-action|director|advisor|warehouse-need|priority-fsm|state-graph|state-planner|fog-aware|recovery|raid-fallback|cascade-mit|crisis|probe))'),
    ('worker-npc-combat',   r'(worker|fsm|visitor|combat|wall-hp|sabotage|guard|raid-escalator|threat|role-assign|carry-|mortality|death|obituary|lineage|m3-m4|cannibal|food-floor|drain|honor-reservation|hotfix|eat-pipeline|prey|warehouse-queue|warehouse-density|deliver|job-reservation|recruit)'),
    ('wildlife',            r'(wildlife|animal|ecology|predator|herbivore|hunt|species|atmosphere)'),
    ('progression-score',   r'(progression|milestone|dev-index|dev-mode|survival|score|run-outcome|end-panel|finale|tone-gate|speedrunner|playabil|opening-runway|fail-state|exploit|world-explain|event-pacing|afk|leaderboard|alpha-scenario|balance-)'),
    ('building-economy',    r'(build-|construction|demolish|cost|escalat|food-|farm|warehouse|kitchen|smithy|clinic|herb|spoil|recycl|haul|salin|node-layer|resource|logistic|stall|inspector|tool-tier|map-generation|terrain|process|saturation|pressure|world-event|grid-terrain|tile-text|toolbar|carry-spoil|carry-fatigue)'),
    ('ui-hud-render',       r'(hud|panel|toast|render|tooltip|modal|sidebar|click|button|onboard|splash|story|author|chip|chat|dialog|i18n|asset|icon|night|menu|launcher|narrative|voice|jargon|casual|focus|lens|game-state-overlay|help-|shortcut|scene|chronicle|next-action|truncation|placement-lens|fog-reset|fog-vis|control-sanit|striking|responsive|debug-leak|index-html|visual-asset|procedural-tile|atmosphere-profile|view|status|popover)'),
]
for line in sys.stdin:
    f = line.strip()
    if not f: continue
    placed = False
    full = f.lower().replace(chr(92),'/')
    for bn, pat in PATS:
        if re.search(pat, full):
            buckets[bn].append(f); placed=True; break
    if not placed: buckets['other'].append(f)
total = sum(len(v) for v in buckets.values())
for bn,_ in PATS+[('other','')]:
    print(f'{bn:25s} {len(buckets.get(bn,[])):4d} files')
print(f'TOTAL                     {total:4d}')
print('--- OTHER FILES (sample) ---')
for f in buckets.get('other',[])[:80]: print(' ', f)
