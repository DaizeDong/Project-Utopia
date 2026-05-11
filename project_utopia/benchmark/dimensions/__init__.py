"""Dimension plugins for the academic benchmark (5 dimensions, S6/RC3)."""

from __future__ import annotations

from .decision_token_efficiency import DecisionTokenEfficiencyPlugin
from .group_dynamics import GroupDynamicsPlugin
from .hierarchical_coordination import HierarchicalCoordinationPlugin
from .memory_degradation import MemoryDegradationPlugin
from .resource_allocation_efficiency import (
    ResourceAllocationEfficiencyPlugin,
    crafter_geometric_mean,
)

# Short-name aliases for ergonomic imports (mirrors the JS naming).
DecisionTokenEfficiency = DecisionTokenEfficiencyPlugin
GroupDynamics = GroupDynamicsPlugin
HierarchicalCoordination = HierarchicalCoordinationPlugin
MemoryDegradation = MemoryDegradationPlugin
ResourceAllocationEfficiency = ResourceAllocationEfficiencyPlugin

# Canonical 5-plugin default registry, consumed by SeedMatrix when no
# explicit ``opts["dimensions"]`` is provided. Order matches the JS
# `ACADEMIC_BENCHMARK_DIMENSIONS` constant.
ACADEMIC_BENCHMARK_DIMENSIONS = (
    ResourceAllocationEfficiencyPlugin(),
    GroupDynamicsPlugin(),
    MemoryDegradationPlugin(),
    DecisionTokenEfficiencyPlugin(),
    HierarchicalCoordinationPlugin(),
)

__all__ = [
    "DecisionTokenEfficiency",
    "DecisionTokenEfficiencyPlugin",
    "GroupDynamics",
    "GroupDynamicsPlugin",
    "HierarchicalCoordination",
    "HierarchicalCoordinationPlugin",
    "MemoryDegradation",
    "MemoryDegradationPlugin",
    "ResourceAllocationEfficiency",
    "ResourceAllocationEfficiencyPlugin",
    "crafter_geometric_mean",
]
