import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { HealthMeter } from '../components/HealthMeter';
import { CombatSilhouette, silhouetteForAnatomy } from './CombatSilhouette';
import type { Fighter } from './fighters';
import { CombatEmbers } from './CombatEmbers';
import { MAX_COMBAT_IMAGE_BYTES } from '../../state/combatArtwork';
import './combat-stage.css';

export type FightAction = { id: string; label: string; blocked?: string | undefined; run: () => void };
export function CombatStage({ player, opponents, selectedId, onSelect, round, range, actions, busy, onArtwork, activeId=player.id, turnLabel='Your turn' }: {
  player: Fighter; opponents: Fighter[]; selectedId: string; onSelect: (id: string) => void; round: number; range: string;
  actions: FightAction[]; busy: boolean; activeId?:string; turnLabel?:string; onArtwork?: ((id: string, image: string | null) => Promise<void>) | undefined;
}) {
  const target = opponents.find(a => a.id === selectedId) ?? opponents[0], [notice, setNotice] = useState(''), [uploading, setUploading] = useState(false);
  async function upload(id: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || !onArtwork) return;
    if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type) || file.size > MAX_COMBAT_IMAGE_BYTES) { setNotice('Choose a PNG, WebP or JPEG image up to 4 MB. A transparent background works best.'); return; }
    setUploading(true); setNotice('');
    try { const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); await onArtwork(id, image); }
    catch { setNotice('Could not save the figure. Keep the conversation open and try adding it again.'); }
    finally { setUploading(false); }
  }
  if (!target) return null;
  return <section className="combat-stage" aria-label="Combat arena" aria-busy={busy}>
    <header className="combat-stage__heading"><span>COMBAT</span><span>Round {round} · {turnLabel}</span></header>
    <div className="combat-stage__duel">
      <FighterCard fighter={player} side="player" active={activeId===player.id} disabled={busy || uploading} onUpload={onArtwork ? event => void upload(player.id, event) : undefined}/>
      <div className="combat-stage__versus" aria-hidden="true"><CombatEmbers/><span>VS</span></div>
      <FighterCard fighter={target} side="opponent" active={activeId===target.id} disabled={busy || uploading} onUpload={onArtwork ? event => void upload(target.id, event) : undefined}/>
    </div>
    <div className="combat-stage__targets" aria-label="Choose opponent">{opponents.map(actor => <button type="button" key={actor.id} disabled={busy || uploading} aria-label={`Select ${actor.name}`} aria-pressed={actor.id === target.id} onClick={() => onSelect(actor.id)}><span>{actor.name}</span><small>{actor.hp}/{actor.maxHp}{actor.status[0] ? ` · ${actor.status[0]}` : ''}</small></button>)}</div>
    <footer className="combat-stage__controls"><p className="combat-stage__range">{range}</p><div>{actions.map(action => <button key={action.id} type="button" disabled={busy || uploading || !!action.blocked} title={action.blocked} onClick={action.run}>{action.label}</button>)}</div></footer>
    {notice && <p role="status" className="combat-stage__notice">{notice}</p>}
  </section>;
}
function FighterCard({ fighter, side, disabled, onUpload, active }: { fighter: Fighter; side: 'player' | 'opponent'; disabled: boolean; active:boolean; onUpload?: ((event: ChangeEvent<HTMLInputElement>) => void) | undefined }) {
  const picker = useRef<HTMLInputElement>(null), [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [fighter.image]);
  return <article className={`combat-fighter combat-fighter--${side}`} data-active={active} data-down={fighter.hp === 0 || fighter.status.includes('Retreated')} aria-label={`${fighter.name} combatant`}>
    <div className="combat-fighter__identity">{fighter.portrait && <img src={fighter.portrait} alt=""/>}<HealthMeter name={fighter.name} value={fighter.hp} max={fighter.maxHp}/></div>
    <div className="combat-fighter__figure">{fighter.image && !failed ? <img className="combat-fighter__art" src={fighter.image} alt={`${fighter.name} full-body figure`} onError={() => setFailed(true)}/> : <CombatSilhouette kind={silhouetteForAnatomy(fighter.anatomyId, fighter.parts)}/>}</div>
    <p className="combat-fighter__position">{fighter.position}</p>
    <div className="combat-fighter__status">{fighter.status.map(status => <span key={status}>{status}</span>)}</div>
    {onUpload && <><input ref={picker} type="file" hidden accept="image/png,image/webp,image/jpeg" aria-label={`Full-body image for ${fighter.name}`} onChange={onUpload}/><button className="combat-fighter__upload" type="button" disabled={disabled} onClick={() => picker.current?.click()}>{fighter.image ? 'Change figure' : 'Add figure'}</button></>}
  </article>;
}
