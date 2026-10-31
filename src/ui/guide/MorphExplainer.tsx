import { useEffect, useState } from "react";

/** A deliberately simple diagram: the same points drive the face and its mesh. */
export function MorphExplainer() {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mesh, setMesh] = useState(true);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let start: number | undefined;
    const animate = (time: number) => {
      start ??= time;
      setProgress((1 - Math.cos((time - start) / 1600)) / 2);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const points = [[60,65],[150,40],[240,65],[55,155],[105,130],[195,130],[245,155],[150,165],[90,215-progress*25],[150,220+progress*8],[210,215-progress*25],[80,265],[150,285],[220,265]];
  const faces = [[0,1,4],[1,2,5],[1,4,5],[0,3,4],[2,5,6],[3,4,8],[4,7,8],[4,5,7],[5,7,10],[5,6,10],[7,8,9],[7,9,10],[3,8,11],[6,10,13],[8,9,11],[9,11,12],[9,10,13],[9,12,13]];
  const mouth = `M 90 ${215-progress*25} Q 150 ${225+progress*30} 210 ${215-progress*25}`;
  return <figure className="sb-morph-demo">
    <svg viewBox="0 0 300 320" role="img" aria-label="A simple face changing from neutral to smiling. The mesh triangles around the mouth change shape with the expression.">
      <ellipse cx="150" cy="160" rx="112" ry="135" fill="var(--panel-raised, #f1e6d7)" stroke="currentColor" strokeWidth="2" />
      {mesh && <g stroke="var(--page-accent, #847070)" strokeWidth="1" strokeOpacity=".55">{faces.map((face,i)=><polygon key={i} points={face.map(n=>points[n]!.join(',')).join(' ')} fill={face.includes(9)?"var(--page-accent, #847070)":"none"} fillOpacity=".12" />)}</g>}
      <path d="M 85 130 Q 105 120 125 130 M 175 130 Q 195 120 215 130 M 150 140 L 140 170 L 155 170" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d={mouth} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      {mesh && <g fill="var(--page-accent, #847070)">{points.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===8||i===10?5:3}/>)}</g>}
    </svg>
    <div className="sb-morph-demo__controls">
      <button type="button" onClick={()=>setPlaying(value=>!value)}>{playing?"Pause":"Play morph"}</button>
      <label>Neutral → Smile <input aria-label="Morph from neutral to smile" type="range" min="0" max="100" value={Math.round(progress*100)} onChange={event=>{setPlaying(false);setProgress(Number(event.target.value)/100);}} /></label>
      <label><input type="checkbox" checked={mesh} onChange={event=>setMesh(event.target.checked)} /> Show mesh</label>
    </div>
    <figcaption>Watch the mouth corners move upwards. The shaded triangles change shape with them, carrying the surrounding image along. This simplified diagram illustrates mesh movement; portraits also blend between the two images.</figcaption>
  </figure>;
}
