export type Silhouette = 'humanoid' | 'quadruped' | 'winged' | 'serpentine' | 'arachnid' | 'cephalopod' | 'centauroid' | 'insectoid' | 'drone' | 'unknown';
export function silhouetteForAnatomy(id?: string, parts: string[] = []): Silhouette {
  const plan = id?.replace(/^builtin-/, '');
  if (plan === 'humanoid' || plan === 'centauroid' || plan === 'serpentine' || plan === 'arachnid' || plan === 'cephalopod' || plan === 'insectoid') return plan;
  if (plan === 'mechanical-drone') return 'drone';
  if (['equine', 'quadruped', 'reptilian'].includes(plan ?? '')) return 'quadruped';
  if (['avian', 'dragon'].includes(plan ?? '')) return 'winged';
  if (parts.some(part => part.includes('wing'))) return 'winged';
  if (parts.filter(part => /^leg_\d/.test(part)).length >= 8) return 'arachnid';
  if (parts.some(part => part === 'front_left_leg')) return 'quadruped';
  if (parts.some(part => part === 'left_hand') && parts.some(part => part === 'left_foot')) return 'humanoid';
  return 'unknown';
}
const humanoid = 'M120 30c-15 0-23 12-22 28 1 10 6 19 13 23v10l-30 11c-10 5-14 14-17 26L48 190l13 7 28-61-1 58-12 115-13 24c-3 6 0 11 7 11h26l6-15 18-101 18 101 6 15h26c7 0 10-5 7-11l-13-24-12-115-1-58 28 61 13-7-16-62c-3-12-7-21-17-26l-30-11V81c7-4 12-13 13-23 1-16-7-28-22-28Z';
const quadruped = 'M38 160 27 123 45 130 59 117 82 131 91 151 163 152 187 132 210 124 211 139 192 155 183 198 189 261 175 268 164 213 144 214 135 263 121 267 120 215 77 211 68 262 54 266 55 207 41 189 22 179 20 165Z';
export function CombatSilhouette({ kind }: { kind: Silhouette }) {
  return <svg className="combat-silhouette" data-silhouette={kind} viewBox="0 0 240 360" role="img" aria-label={`${kind === 'unknown' ? 'Generic' : kind.charAt(0).toUpperCase() + kind.slice(1)} silhouette`}>
    <g fill="currentColor" stroke="var(--figure-outline,#c2ad86)" strokeWidth="1.5" strokeLinejoin="round">
      {kind === 'humanoid' && <path d={humanoid}/>}
      {kind === 'quadruped' && <path d={quadruped}/>}
      {kind === 'winged' && <><path d="M110 123 58 70 14 48 26 103 14 153 65 137 102 178M130 123 182 70 226 48 214 103 226 153 175 137 138 178"/><path d={humanoid}/></>}
      {kind === 'serpentine' && <path d="M112 72c-24-25-57-4-57 20 0 22 22 28 41 39 53 30 70 56 49 83-21 26-99 19-107 59-10 48 96 60 154 28 18-10 29-27 26-40-18 32-113 42-130 14-13-24 71-26 87-63 21-49-25-87-60-113l4-12 22 4 5-15-17-16Z"/>}
      {kind === 'arachnid' && <><ellipse cx="120" cy="198" rx="43" ry="53"/><ellipse cx="120" cy="139" rx="30" ry="26"/><path d="M96 135 59 104 19 116M94 156 38 143 12 174M84 180 37 190 13 229M86 201 49 235 34 281M144 135 181 104 221 116M146 156 202 143 228 174M156 180 203 190 227 229M154 201 191 235 206 281" fill="none" strokeWidth="11"/></>}
      {kind === 'cephalopod' && <><path d="M120 65c-66 0-68 91-36 119h72c32-28 30-119-36-119Z"/><path d="M89 174C20 191 66 286 18 294M101 177C59 232 113 294 58 320M113 179C99 234 125 289 95 328M127 179C141 234 115 289 145 328M139 177C181 232 127 294 182 320M151 174C220 191 174 286 222 294" fill="none" strokeWidth="14"/></>}
      {kind === 'centauroid' && <><path d={quadruped}/><path d="M88 159 86 106 63 92 51 128 39 125 49 83 74 72V60c-22-16-15-47 4-47 20 0 27 31 6 47v12l26 11 13 47-13 3-15-37 8 61Z"/></>}
      {kind === 'insectoid' && <><ellipse cx="120" cy="112" rx="28" ry="24"/><ellipse cx="120" cy="166" rx="24" ry="37"/><ellipse cx="120" cy="225" rx="37" ry="42"/><path d="M104 97 82 66M136 97 158 66M102 141 59 126 27 151M96 169 51 176 21 208M100 194 62 233 49 283M138 141 181 126 213 151M144 169 189 176 219 208M140 194 178 233 191 283" fill="none" strokeWidth="9"/></>}
      {kind === 'drone' && <><path d="M69 147 96 119H144L171 147 152 186H88Z"/><path d="M83 150 45 126 21 135M157 150 195 126 219 135M90 171 54 201M150 171 186 201" fill="none" strokeWidth="10"/><ellipse cx="41" cy="126" rx="27" ry="7"/><ellipse cx="199" cy="126" rx="27" ry="7"/><circle cx="120" cy="151" r="11" fill="#c7a569"/></>}
      {kind === 'unknown' && <><path d="M120 61 182 109 167 217 120 279 73 217 58 109Z"/><circle cx="120" cy="128" r="25" fill="none" strokeWidth="3"/><path d="M119 173v39M119 228v4" fill="none" strokeWidth="7" strokeLinecap="round"/></>}
    </g>
  </svg>;
}
