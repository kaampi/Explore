import { useState } from 'react';
import bubbles from '../assets/patterns/double-bubble-outline.webp';
import linen from '../assets/patterns/45degreee_fabric.webp';
import cork from '../assets/patterns/cork-board.png';
import tweed from '../assets/patterns/tweed.png';
import geometric from '../assets/patterns/webb-dark.png';
import { useAppearance } from './ThemeProvider';
import { backgroundFromFile } from './themeStorage';
import type { PlayTheme } from './theme';
import { Modal } from '../components/Modal';

export const BACKGROUND_PATTERNS = [
  {id:'bubbles',name:'Bubbles',url:bubbles}, {id:'linen',name:'Linen',url:linen},
  {id:'cork',name:'Cork',url:cork}, {id:'tweed',name:'Tweed',url:tweed},
  {id:'geometric',name:'Geometric',url:geometric},
] as const;

export function PatternSettings() {
  const {library:{active:theme},update}=useAppearance();
  return <><div className="sb-background-patterns">{BACKGROUND_PATTERNS.map(pattern=><button key={pattern.id} type="button" aria-pressed={theme.backgroundPattern===pattern.id} onClick={()=>update({backgroundPattern:pattern.id})}><span style={{backgroundImage:`url(${pattern.url})`}}/>{pattern.name}</button>)}</div>
    <label className="sb-field">Pattern strength · {Math.round(theme.patternStrength*100)}%<input type="range" min="0" max="1" step="0.05" value={theme.patternStrength} onChange={event=>update({patternStrength:Number(event.target.value)})}/></label></>;
}

export function BackgroundDialog({onClose}:{onClose:()=>void}) {
  const {library:{active:theme},update}=useAppearance();
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  return <Modal title="Choose your background" onClose={onClose}>
    <p>Try a background on your play surface. Changes are saved for this conversation.</p>
    <label className="sb-field">Background<select value={theme.backgroundMode} onChange={event=>update({backgroundMode:event.target.value as PlayTheme['backgroundMode']})}>
      <option value="none">Solid colour</option><option value="pattern">Pattern</option><option value="custom">My image</option><option value="scene">Follow the scene</option>
    </select></label>
    {theme.backgroundMode==='none'&&<label className="sb-field">Colour<input type="color" value={theme.background} onChange={event=>update({background:event.target.value})}/></label>}
    {theme.backgroundMode==='pattern'&&<PatternSettings/>}
    {theme.backgroundMode==='custom'&&<label className="sb-field">Choose an image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={loading} onChange={async event=>{const file=event.target.files?.[0];if(!file)return;setLoading(true);setError('');try{update({backgroundDataUrl:await backgroundFromFile(file)});}catch(err){setError(err instanceof Error?err.message:'Could not load this image.');}finally{setLoading(false);}}}/></label>}
    {error&&<p role="alert">{error}</p>}
    <div className="sb-dialog__actions"><button type="button" onClick={onClose}>Done</button></div>
  </Modal>;
}
