/** A decorative, code-native landscape; no remote images needed. */
export function WorldArtwork({ variant = 0 }: { variant?: number }) {
  const colors =
    variant % 3 === 0
      ? ["#9faeaa", "#d1c8a8", "#7d9890", "#52786e", "#294f46"]
      : variant % 3 === 1
        ? ["#9c9bb8", "#e3c3a0", "#807d9b", "#595c7a", "#3d405e"]
        : ["#b8c6ba", "#f0dfaf", "#91aaa0", "#6d9692", "#496e6a"];
  return (
    <svg
      viewBox="0 0 1000 350"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="sb-world-art"
    >
      <rect width="1000" height="350" fill={colors[0]} />
      <circle cx="765" cy="86" r="42" fill={colors[1]} />
      <path
        d="M0 210 100 135 190 178 300 73 410 180 505 115 600 180 690 75 810 167 910 108 1000 180V350H0Z"
        fill={colors[2]}
      />
      <path
        d="m300 73-49 61 43-21 28 25 25-10ZM690 75l-47 58 39-17 28 24 20-14"
        fill="#d9dccc"
        opacity=".7"
      />
      <path
        d="M0 250 145 180 240 225 375 160 480 240 590 196 680 230 815 160 1000 220V350H0Z"
        fill={colors[3]}
      />
      <path d="M0 310Q230 240 435 275T1000 265V350H0Z" fill={colors[2]} />
      <path
        d="M560 350Q580 290 700 270T770 226Q850 243 752 285T740 350Z"
        fill={colors[1]}
        opacity=".55"
      />
      <path
        d="M0 350V270l75-45 110 65 99-28 110 88ZM1000 350V240l-90-39-60 62-50 87Z"
        fill={colors[4]}
      />
      <g fill={colors[4]}>
        <path d="m860 290 19-75 19 75h-10l17 24h-21v36h-12v-36h-22l18-24ZM936 275l20-91 21 91h-11l18 29h-22v46h-13v-46h-24l18-29Z" />
      </g>
      <g fill={colors[1]} opacity=".7">
        <path d="M713 242v-61h17v61ZM736 240v-45h17v45ZM762 239v-68h18v68ZM704 184l17-25 18 25ZM755 174l16-25 16 25Z" />
      </g>
      <path
        d="m790 40 6-4 6 4m18 13 5-3 5 3"
        fill="none"
        stroke={colors[4]}
        strokeWidth="2"
      />
    </svg>
  );
}
