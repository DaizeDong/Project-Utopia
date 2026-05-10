// Dimension plugin registry — S6.
// Each plugin conforms to DimensionPlugin protocol (see framework/DimensionPlugin.js)
// and is auto-validated by validatePlugin() at framework boot.

export { ResourceAllocationEfficiencyPlugin } from "./ResourceAllocationEfficiency.js";
export { GroupDynamicsPlugin } from "./GroupDynamics.js";
export { MemoryDegradationPlugin } from "./MemoryDegradation.js";
export { DecisionTokenEfficiencyPlugin } from "./DecisionTokenEfficiency.js";
export { HierarchicalCoordinationPlugin } from "./HierarchicalCoordination.js";

import { ResourceAllocationEfficiencyPlugin } from "./ResourceAllocationEfficiency.js";
import { GroupDynamicsPlugin } from "./GroupDynamics.js";
import { MemoryDegradationPlugin } from "./MemoryDegradation.js";
import { DecisionTokenEfficiencyPlugin } from "./DecisionTokenEfficiency.js";
import { HierarchicalCoordinationPlugin } from "./HierarchicalCoordination.js";

export const ACADEMIC_BENCHMARK_DIMENSIONS = Object.freeze([
  ResourceAllocationEfficiencyPlugin,
  GroupDynamicsPlugin,
  MemoryDegradationPlugin,
  DecisionTokenEfficiencyPlugin,
  HierarchicalCoordinationPlugin,
]);
