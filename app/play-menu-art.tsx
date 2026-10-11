const ink = 'var(--shelf-ink)';
const color = 'var(--shelf-color)';
const soft = 'var(--shelf-soft)';
const paper = 'var(--shelf-paper)';

function Tank({ x, y, turn = 0, fill = color }: { x: number; y: number; turn?: number; fill?: string }) {
  return <g transform={`translate(${x} ${y}) rotate(${turn})`}>
    <path d="M-38-42H-22V42H-38ZM22-42H38V42H22Z" fill={ink} />
    <path d="M-24-32H24V32H-24Z" fill={fill} />
    <path d="M-12-19H12V18H-12Z" fill={paper} />
    <path d="M-4-57H4V-8H-4Z" fill={ink} />
    {[-28, -10, 8, 26].map(y => <path key={y} d={`M-35 ${y}h10M25 ${y}h10`} stroke={paper} strokeWidth="3" />)}
  </g>;
}

function Art({ mode }: { mode: string }) {
  switch (mode) {
    case 'party': return <>
      <g transform="translate(103 76) rotate(-10 118 135)">
        <path d="M10 10H244V279H10Z" fill={ink} opacity=".12" stroke="none" />
        <rect width="234" height="269" fill={soft} />
        <path d="M37 193V103L117 57L197 103V193L117 239Z" fill={paper} />
        <path d="M37 103L117 149L197 103M117 149V239" fill="none" />
        <path d="M67 167V121L117 91L167 121V167L117 198Z" fill={color} />
        <path d="M67 121L117 151L167 121M117 151V198" fill="none" />
      </g>
      <g transform="translate(352 53) rotate(9 122 144)">
        <path d="M9 9H254V297H9Z" fill={ink} opacity=".12" stroke="none" />
        <rect width="245" height="288" fill={paper} />
        <path d="M32 38H68M32 87H199M32 108H189M32 129H207M32 169H177M32 190H200M142 242H205" fill="none" opacity=".6" />
        <path d="M169 51C143 34 160 18 174 31C188 12 209 32 169 51Z" fill={color} stroke="none" />
      </g>
    </>;
    case 'formal': return <>
      <path d="M359 65V304M246 322H474M216 120L503 90" fill="none" strokeWidth="5" />
      <circle cx="359" cy="105" r="14" fill={color} />
      {[{ x: 126, y: 140, label: 'A' }, { x: 429, y: 112, label: 'B' }].map(({ x, y, label }) => <g key={label} transform={`translate(${x} ${y})`}>
        <path d="M96-29L25 126H167Z" fill="none" opacity=".5" />
        <rect x="20" y="8" width="152" height="172" fill={soft} />
        <rect x="32" y="20" width="128" height="148" fill={paper} />
        <text x="96" y="124" fontSize="76" textAnchor="middle" fill={ink} stroke="none" fontFamily="Georgia, serif">{label}</text>
      </g>)}
    </>;
    case 'event': return <>
      <g fill="none" strokeWidth="4">
        <circle cx="256" cy="283" r="65" /><circle cx="510" cy="283" r="65" />
        <circle cx="256" cy="283" r="56" opacity=".25" /><circle cx="510" cy="283" r="56" opacity=".25" />
        <path d="M256 283L322 190L379 283ZM322 190L462 190L379 283M462 190L510 283M454 165L465 194" strokeWidth="6" />
        <path d="M307 182H343M445 164H478" strokeWidth="8" strokeLinecap="round" />
        <circle cx="379" cy="283" r="13" /><path d="M379 283L403 294M379 283L355 272M390 295H416M342 271H366" strokeWidth="4" />
        <path d="M246 278L379 270M246 288L379 296" opacity=".45" />
      </g>
      <path d="M299 157L348 213L401 290M320 164L316 214L354 267" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M270 141C251 112 270 84 312 88C341 89 362 108 374 125L388 103C380 76 389 52 410 51C436 48 449 69 440 89L418 108C412 139 402 158 382 169C340 198 289 178 270 141Z" fill={paper} />
      <path d="M284 118C312 100 349 118 362 150C330 175 296 159 284 118Z" fill={soft} />
      <path d="M429 78L554 95L445 105Z" fill={color} />
      <path d="M445 105L540 97C514 135 473 134 445 105Z" fill={soft} />
      <circle cx="423" cy="69" r="4" fill={ink} stroke="none" />
      <path d="M369 132Q405 144 445 164" fill="none" strokeWidth="5" strokeLinecap="round" />
      <path d="M170 263H205M161 288H197" fill="none" opacity=".5" strokeWidth="3" />
    </>;
    case 'guess': return <>
      <g transform="translate(137 57) rotate(-5 173 138)">
        {[0, 1, 2, 3].flatMap(row => [0, 1, 2, 3, 4].map(col => <rect key={`${row}-${col}`} x={col * 65} y={row * 65} width="54" height="54" fill={row === 3 || col === row ? soft : (col + row) % 4 === 0 ? color : paper} />))}
        <path d="M21 218L27 225L40 209M86 218L92 225L105 209M151 218L157 225L170 209M216 218L222 225L235 209M281 218L287 225L300 209" fill="none" strokeWidth="3" />
      </g>
      <circle cx="504" cy="226" r="64" fill={paper} strokeWidth="6" /><path d="M548 273L595 323" strokeWidth="17" />
      <text x="505" y="250" fontSize="77" fill={color} stroke="none" textAnchor="middle" fontFamily="Georgia, serif">?</text>
    </>;
    case 'tierlist': return <g transform="translate(122 41) rotate(-4 240 155)">
      {['S', 'A', 'B', 'C', 'D'].map((label, row) => <g key={label} transform={`translate(0 ${row * 59})`}>
        <rect width="474" height="59" fill={paper} /><rect width="57" height="59" fill={row < 2 ? color : soft} />
        <text x="28" y="40" textAnchor="middle" fill={ink} stroke="none" fontFamily="Georgia, serif" fontSize="32">{label}</text>
        {Array.from({ length: [3, 2, 4, 1, 2][row] }, (_, col) => <g key={col} transform={`translate(${75 + col * 71} 8)`}>
          <rect width="52" height="42" fill={soft} /><path d="M10 32L26 11L42 32Z" fill={paper} stroke="none" />
        </g>)}
      </g>)}
      <path d="M355 58L373 113L383 97L404 93Z" fill={ink} stroke={paper} strokeWidth="3" />
    </g>;
    case 'tanks': return <>
      <path d="M90 20H630V370H90Z" fill="none" opacity=".3" strokeDasharray="5 9" />
      {[0, 1, 2].map(row => <g key={row} fill={soft} transform={`translate(282 ${155 + row * 24})`}><rect width="48" height="22" /><rect x="49" width="48" height="22" /><rect x="98" width="48" height="22" /></g>)}
      <Tank x={183} y={112} turn={135} /><Tank x={537} y={287} turn={-45} />
      <Tank x={530} y={106} turn={-135} fill={soft} /><Tank x={175} y={285} turn={45} fill={soft} />
      <path d="M242 166L259 182M468 167L454 181M242 235L262 216M468 230L450 213" stroke={color} strokeWidth="5" />
    </>;
    case 'werewolf': return <>
      {Array.from({ length: 12 }, (_, index) => { const angle = index * Math.PI / 6; return <circle key={index} cx={360 + Math.cos(angle) * 268} cy={196 + Math.sin(angle) * 164} r="8" fill={index < 4 ? color : soft} />; })}
      <g transform="translate(244 48) rotate(-8 118 144)">
        <rect x="9" y="9" width="236" height="289" fill={soft} /><rect width="236" height="289" fill={paper} />
        <path d="M37 50L90 83L145 83L199 50L181 180L118 236L55 180Z" fill={ink} />
        <path d="M55 122L98 148L69 151M181 122L138 148L167 151" fill={paper} stroke="none" />
        <path d="M82 173L118 197L154 173L118 228Z" fill={color} stroke="none" />
      </g>
      <path d="M555 74A40 40 0 1 0 583 131A35 35 0 0 1 555 74Z" fill={color} stroke="none" />
    </>;
    case 'geoguess': return <>
      <g transform="translate(152 57) rotate(-8 204 134)">
        <rect x="14" y="13" width="407" height="276" fill={soft} /><rect width="407" height="276" fill={paper} />
        <rect x="17" y="17" width="373" height="209" fill={soft} />
        <circle cx="303" cy="69" r="29" fill={color} stroke="none" />
        <path d="M17 206L124 88L193 161L236 119L390 215V226H17Z" fill={ink} />
        <path d="M88 129L124 88L159 125L133 120L118 130Z" fill={paper} stroke="none" />
        <path d="M163 226L246 172L226 226Z" fill={paper} stroke="none" />
        <path d="M22 252H109M316 252H385" fill="none" />
      </g>
      <path d="M531 218C467 219 466 281 531 336C596 281 595 219 531 218Z" fill={color} /><circle cx="531" cy="258" r="17" fill={paper} />
    </>;
    case 'generals': return <g transform="translate(194 39) rotate(-7 176 158)">
      {Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, col) => <rect key={`${row}-${col}`} x={col * 55} y={row * 51} width="55" height="51" fill={col + row < 4 ? soft : col + row > 6 ? color : paper} />))}
      <path d="M81 78H191V231H247" stroke={ink} strokeWidth="4" strokeDasharray="7 6" fill="none" />
      <path d="M75 96V27L121 40L75 57M239 283V214L285 227L239 244" strokeWidth="4" fill={ink} />
      <path d="M163 113L176 92L189 113ZM218 165L231 144L244 165Z" fill={ink} stroke="none" />
    </g>;
    case 'league': return <>
      <path d="M204 263L356 83L520 266Z" fill="none" strokeDasharray="7 8" opacity=".6" />
      {[{ x: 197, y: 238, fill: soft }, { x: 352, y: 73, fill: color }, { x: 513, y: 243, fill: soft }].map(({ x, y, fill }) => <g key={x} transform={`translate(${x} ${y})`}>
        {[24, 12, 0].map(y => <ellipse key={y} cy={y} rx="60" ry="24" fill={fill} />)}
        <path d="M-16-5L0-13L16-5L0 6Z" fill={paper} />
      </g>)}
      <g transform="translate(294 164) rotate(9 65 82)"><rect width="131" height="173" fill={paper} /><rect x="11" y="11" width="109" height="151" fill={ink} /><path d="M65 51L89 85L65 119L41 85Z" fill={color} /></g>
    </>;
    case 'debate': return <>
      <path d="M96 71H365V246H202L147 287V246H96Z" fill={soft} />
      <path d="M341 142H611V315H562V349L510 315H341Z" fill={paper} />
      <text x="229" y="205" textAnchor="middle" fontSize="125" fontFamily="Georgia, serif" fill={ink} stroke="none">!</text>
      <text x="476" y="272" textAnchor="middle" fontSize="115" fontFamily="Georgia, serif" fill={color} stroke="none">?</text>
      <path d="M431 51L445 89M486 50L478 92M528 78L505 108" fill="none" strokeWidth="4" />
    </>;
    case 'ctf': return <>
      {[{ x: 132, fill: soft }, { x: 452, fill: color }].map(({ x, fill }) => <g key={x} transform={`translate(${x} 126)`}>
        <path d="M0 0H35V-25H68V0H103V-25H138V183H0Z" fill={fill} />
        <path d="M27 39H113V79H27ZM27 94H113V134H27Z" fill={paper} />
        <path d="M39 56H78M39 111H78" fill="none" /><circle cx="99" cy="58" r="4" fill={ink} /><circle cx="99" cy="113" r="4" fill={ink} />
        <path d="M69-26V-89L121-72L69-54" fill={paper} strokeWidth="3" />
      </g>)}
      <path d="M288 155H431L411 135M430 252H290L310 272" fill="none" strokeWidth="4" />
      <circle cx="360" cy="207" r="35" fill={paper} /><path d="M360 186V228M339 207H381" strokeWidth="8" stroke={color} />
    </>;
    default: return null;
  }
}

export function PlayMenuArt({ mode }: { mode: string }) {
  return <svg viewBox="0 0 720 390" fill="none" aria-hidden="true" focusable="false">
    <g stroke={ink} strokeWidth="1.6" strokeLinejoin="round"><Art mode={mode} /></g>
  </svg>;
}
