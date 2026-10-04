import ResourceIcon from "./ResourceIcon";

// A resource icon on its own tinted disc, so it reads on any dark surface.
export default function ResourceChip({ resource, size = 16 }) {
  return (
    <span className={`res-chip resource-${resource}`}>
      <ResourceIcon resource={resource} size={size} />
    </span>
  );
}
