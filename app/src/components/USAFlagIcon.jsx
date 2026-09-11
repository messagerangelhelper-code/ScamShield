function USAFlagIcon() {
  return (
    <svg
      className="usa-flag-icon"
      viewBox="0 0 200 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="United States flag silhouette"
    >
      <defs>
        {/* Simplified continental US outline used as a clip mask */}
        <clipPath id="usaShape">
          <path
            d="M30,25 L45,15 L55,18 L60,12 L75,10 L85,15 L95,12
               L110,15 L125,10 L140,14 L150,20 L160,18 L170,25
               L175,35 L172,45 L178,55 L170,62 L172,72 L160,78
               L155,90 L145,95 L148,105 L135,108 L125,100 L115,102
               L100,98 L90,105 L78,100 L70,108 L60,100 L50,95
               L45,85 L35,82 L28,72 L32,60 L25,50 L30,40 Z"
          />
        </clipPath>
      </defs>

      <g clipPath="url(#usaShape)">
        {/* 7 stripes, alternating red/white */}
        {Array.from({ length: 7 }).map((_, i) => (
          <rect
            key={i}
            className="flag-stripe"
            x="0"
            y={i * (120 / 7)}
            width="200"
            height={120 / 7 + 1}
            fill={i % 2 === 0 ? "#b31942" : "#ffffff"}
          />
        ))}

        {/* Blue canton */}
        <rect x="0" y="0" width="85" height="55" fill="#0a2647" />

        {/* Simplified stars grid */}
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 5 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={10 + col * 16}
              cy={10 + row * 12}
              r="1.6"
              fill="#ffffff"
            />
          ))
        )}
      </g>

      {/* Outline for definition against the navy header background */}
      <path
        d="M30,25 L45,15 L55,18 L60,12 L75,10 L85,15 L95,12
           L110,15 L125,10 L140,14 L150,20 L160,18 L170,25
           L175,35 L172,45 L178,55 L170,62 L172,72 L160,78
           L155,90 L145,95 L148,105 L135,108 L125,100 L115,102
           L100,98 L90,105 L78,100 L70,108 L60,100 L50,95
           L45,85 L35,82 L28,72 L32,60 L25,50 L30,40 Z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1"
        opacity="0.6"
      />
    </svg>
  );
}

export default USAFlagIcon;
