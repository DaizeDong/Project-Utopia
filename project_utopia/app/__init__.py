"""Application-level utilities (port of JS ``src/app/``).

Modules under this subpackage host process-wide singletons such as the seeded
RNG, the simulation clock, ID minting, run-outcome evaluation, and the
``create_services`` factory used by the headless benchmark harness.
"""

from __future__ import annotations
