function ResourceIcon({ resource, size = 18 }) {
  const stroke = "#2d261f";
  const fill = "#f9f2e7";

  if (resource === "wheat") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v16" stroke={stroke} strokeWidth="1.8" fill="none" />
        <path d="M12 7c-2 0-3 1.2-3 2.6 2 0 3-1.2 3-2.6z" fill={fill} stroke={stroke} strokeWidth="1.2" />
        <path d="M12 10c2 0 3 1.2 3 2.6-2 0-3-1.2-3-2.6z" fill={fill} stroke={stroke} strokeWidth="1.2" />
        <path d="M12 13c-2 0-3 1.2-3 2.6 2 0 3-1.2 3-2.6z" fill={fill} stroke={stroke} strokeWidth="1.2" />
        <path d="M12 16c2 0 3 1.2 3 2.6-2 0-3-1.2-3-2.6z" fill={fill} stroke={stroke} strokeWidth="1.2" />
      </svg>
    );
  }

  if (resource === "wood") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="12,3 4,14 20,14" fill={fill} stroke={stroke} strokeWidth="1.4" />
        <rect x="10" y="14" width="4" height="7" fill={fill} stroke={stroke} strokeWidth="1.4" />
      </svg>
    );
  }

  if (resource === "stone") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="5,16 8,7 16,5 20,12 15,19 8,20" fill={fill} stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
  }

  if (resource === "brick") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <path d="M3 12h18M9 6v6M15 12v6" stroke={stroke} strokeWidth="1.2" fill="none" />
      </svg>
    );
  }

  if (resource === "sheep") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="12" r="4.5" fill={fill} stroke={stroke} strokeWidth="1.3" />
        <circle cx="14" cy="11" r="4.5" fill={fill} stroke={stroke} strokeWidth="1.3" />
        <circle cx="17.5" cy="13" r="3.2" fill={fill} stroke={stroke} strokeWidth="1.3" />
        <circle cx="7" cy="18" r="1.2" fill={stroke} />
        <circle cx="14" cy="18" r="1.2" fill={stroke} />
      </svg>
    );
  }

  return null;
}

export default ResourceIcon;
