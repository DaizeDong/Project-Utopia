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

__all__ = [
    "DecisionTokenEfficiencyPlugin",
    "GroupDynamicsPlugin",
    "HierarchicalCoordinationPlugin",
    "MemoryDegradationPlugin",
    "ResourceAllocationEfficiencyPlugin",
    "crafter_geometric_mean",
]
