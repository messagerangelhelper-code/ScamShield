function USAFlagIcon() {
  const usaPath =
    "M275,35 L268,50 L260,55 L268,60 L255,65 L250,70 L245,78 L248,85 " +
    "L240,88 L245,95 L255,100 L245,108 L240,113 L225,115 L235,125 " +
    "L238,140 L235,155 L225,148 L220,135 L222,120 L205,118 L195,122 " +
    "L185,120 L170,125 L160,130 L140,135 L120,128 L100,120 L85,115 " +
    "L65,110 L45,108 L35,95 L30,80 L28,65 L25,50 L30,45 L50,30 " +
    "L90,25 L130,22 L170,20 L180,28 L190,25 L195,35 L200,50 L195,60 " +
    "L185,50 L200,40 L210,35 L220,30 L230,32 L240,30 L255,32 Z";

  return (
    <svg
      className="usa-flag-icon"
      viewBox="0 0 300 180"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="United States flag silhouette"
    >
      <defs>
        <clipPath id="usaShape">
          <path d={usaPath} />
        </clipPath>
      </defs>

      <g clipPath="url(#usaShape)">
        {/* 7 stripes, alternating red/white */}
        {Array.from({ length: 7 }).map((_, i) => (
          <rect
            key={i}
            className="flag-stripe"
            x="0"
            y={i * (180 / 7)}
            width="300"
            height={180 / 7 + 1}
            fill={i % 2 === 0 ? "#b31942" : "#ffffff"}
          />
        ))}

        {/* Blue canton */}
        <rect x="0" y="0" width="130" height="95" fill="#0a2647" />

        {/* Simplified stars grid */}
        {Array.from({ length: 5 }).map((_, row) =>
          Array.from({ length: 6 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={14 + col * 20}
              cy={14 + row * 17}
              r="2.2"
              fill="#ffffff"
            />
          ))
        )}
      </g>

      {/* Outline for definition against the navy header background */}
      <path d={usaPath} fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}

export default USAFlagIcon;
