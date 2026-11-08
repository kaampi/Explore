import { useEffect,useRef,useState } from 'react';
import type { CampaignTemplate,CampaignScene,PlaceTemplate,CharacterTemplate,ObjectTemplate,StoryboardLink,StoryboardPosition,StoryboardSection } from '../../library/LibrarySchema';
import { emptyCampaignScene } from '../../library/LibrarySchema';
import { makePlayableScene,newOpportunity,adventureFacts } from '../../library/playableCampaign';
import { removeLinksForScene } from '../../library/storyboardLinks';
import { StoryboardCanvas, type StoryboardContextTarget } from './StoryboardCanvas';
import { StoryboardOutline } from './StoryboardOutline';
import { moveStoryboardSection, removeStoryboardSection, storyboardHierarchy, storyboardSectionTitle } from '../../library/storyboardHierarchy';
import { dialogueTopics } from '../../game/dialogue';
import { SceneMapPlaceField } from './SceneMapPlaceField';
import { bindSceneMapPlace,mapPlaceForScene,type AdventureMapPlace } from '../../library/adventureMap';
import { MessageMenu } from '../components/MessageMenu';
import type { Interaction } from '../../game/EncounterSchema';
import { storyboardIssues, type ActionField, type SceneField, type StoryboardIssue } from './storyboardReadiness';
import './playable-storyboard.css';
export function PlayableStoryboard({campaign,places,characters,objects,busy,onChange,onPlay,onSave,expanded=false,mapPlaces}:{campaign:CampaignTemplate;places:PlaceTemplate[];characters:CharacterTemplate[];objects:ObjectTemplate[];busy:boolean;onChange:(c:CampaignTemplate)=>void;onPlay:(s:CampaignScene)=>void;onSave?:()=>void;expanded?:boolean;mapPlaces?:AdventureMapPlace[]|undefined}){
 const [sceneId,setSceneId]=useState(campaign.scenes[0]?.id??''),[linkId,setLinkId]=useState('');
 const [newActionId,setNewActionId]=useState('');
 const [actionFocus, setActionFocus] = useState<ActionField>('label');
 const [connectionFromId,setConnectionFromId]=useState<string|null>(null);
 const [connectionSourceId, setConnectionSourceId] = useState('');
 const [sectionId,setSectionId]=useState('');
 const [markedScenes,setMarkedScenes]=useState<ReadonlySet<string>>(new Set());
 const [step, setStep] = useState<'scenes' | 'connections' | 'test'>('scenes');
 const [testSceneId, setTestSceneId] = useState(campaign.scenes[0]?.id ?? '');
 const [focus, setFocus] = useState<SceneField | 'objective' | null>(null);
 const inspector = useRef<HTMLElement>(null);
 const root=useRef<HTMLElement>(null),[context,setContext]=useState<StoryboardContextTarget|null>(null);
 const sections = campaign.storyboardSections ?? [];
 const hierarchy = storyboardHierarchy(campaign.scenes, sections);
 const section = hierarchy.byId.get(sectionId);
 const acts = sections.filter(item => item.kind === 'act');
 const scene=campaign.scenes.find(s=>s.id===sceneId),link=campaign.sceneLinks.find(l=>l.id===linkId),facts=adventureFacts(campaign);
 const sceneMapPlace=scene&&mapPlaces?mapPlaceForScene(scene,mapPlaces):undefined;
 const goalFacts=[...facts,...(campaign.goal?.requiresFlags??[]).filter(id=>!facts.some(f=>f.id===id)).map(id=>({id,label:`Unavailable discovery: ${id}`}))];
 const issues = storyboardIssues(campaign, places, new Set(facts.map(fact => fact.id)), mapPlaces);
 const unfinishedScenes = new Set(issues.flatMap(issue => issue.kind === 'scene' ? [issue.id] : []));
 const testScene = campaign.scenes.find(item => item.id === testSceneId) ?? campaign.scenes[0];
 const connectionSource = campaign.scenes.find(item => item.id === connectionSourceId) ?? scene ?? testScene;
 const linkedScenes = new Set(campaign.sceneLinks.flatMap(item => [item.fromSceneId, item.toSceneId]));
 const unconnected = campaign.scenes.filter(item => !linkedScenes.has(item.id));
 const sceneIssue = issues.find(issue => issue.kind === 'scene' && issue.id === sceneId);

 useEffect(() => {
   if (inspector.current) inspector.current.scrollTop = 0;
 }, [step, sceneId, linkId, sectionId]);

 useEffect(() => {
   if (!focus) return;
   const target = inspector.current?.querySelector<HTMLElement>(`[data-storyboard-field="${focus}"]`);
   const control = target?.matches('input, textarea, select, button, summary') ? target
     : target?.querySelector<HTMLElement>('input, textarea, select, button, summary');
   control?.closest('details')?.setAttribute('open', '');
   control?.focus();
   setFocus(null);
 }, [focus]);
 function patchScene(next:CampaignScene){onChange({...campaign,scenes:campaign.scenes.map(s=>s.id===next.id?next:s)});}
 function selectScene(id: string, additive = false) {
   setConnectionFromId(null);
   if (additive) {
     const marked = new Set(markedScenes.size ? markedScenes : sceneId ? [sceneId] : []);
     if (marked.has(id)) marked.delete(id);
     else marked.add(id);
     setMarkedScenes(marked);
     setSceneId(marked.has(id) ? id : Array.from(marked).at(-1) ?? '');
   } else {
     setMarkedScenes(new Set());
     setSceneId(id);
   }
   setSectionId('');
   setLinkId('');
   setNewActionId('');
   setTestSceneId(id);
   setStep('scenes');
 }

 function selectSection(id: string) {
   setConnectionFromId(null);
   setSectionId(id);
   setSceneId('');
   setLinkId('');
   setMarkedScenes(new Set());
   setStep('scenes');
 }

 function selectLink(id: string | null) {
   setLinkId(id ?? '');
   if (id) {
     setConnectionFromId(null);
     setStep('connections');
     setSceneId('');
     setSectionId('');
     setMarkedScenes(new Set());
   }
 }

 function openIssue(issue: StoryboardIssue) {
   if (issue.kind === 'scene') {
     selectScene(issue.id);
     setTestSceneId(testScene?.id ?? '');
     if (issue.action) {
       setNewActionId(issue.action.id);
       setActionFocus(issue.action.field);
     }
     else setFocus(issue.field);
   } else if (issue.kind === 'link') selectLink(issue.id);
   else {
     showTest();
     setFocus('objective');
   }
 }

 function patchSection(next: StoryboardSection) {
   onChange({ ...campaign, storyboardSections: sections.map(item => item.id === next.id ? next : item) });
 }

 function toggleSection(id: string) {
   const target = hierarchy.byId.get(id);
   if (target) patchSection({ ...target, collapsed: !target.collapsed });
 }

 function addSection(kind: StoryboardSection['kind'], position?: StoryboardPosition, members: ReadonlySet<string> = new Set()) {
   const chosenScenes = campaign.scenes.filter(item => members.has(item.id));
   const memberActs = new Set(chosenScenes.map(hierarchy.sceneAct));
   const selectedAct = section?.kind === 'act' ? section.id : section ? hierarchy.parentAct(section) : scene && hierarchy.sceneAct(scene);
   const actId = chosenScenes.length ? (memberActs.size === 1 ? hierarchy.sceneAct(chosenScenes[0]!) : undefined) : selectedAct;
   const common = { id: crypto.randomUUID(), title: kind === 'act' ? 'New act' : 'New scene group', ...(position ? { position } : {}) };
   const next: StoryboardSection = kind === 'act' ? { ...common, kind } : { ...common, kind, actId };
   onChange({
     ...campaign,
     storyboardSections: [...sections.map(item => item.id === actId && kind === 'group' ? { ...item, collapsed: false } : item), next],
     scenes: campaign.scenes.map(item => members.has(item.id) ? { ...item, storyboardSectionId: next.id } : item)
   });
   selectSection(next.id);
 }

 function addScene(position?: StoryboardPosition, parentId = section?.id ?? scene?.storyboardSectionId) {
   const parent = hierarchy.byId.get(parentId ?? '');
   let next = { ...emptyCampaignScene(), name: 'New scene', placeId: scene?.placeId || places[0]?.id || '',
     ...(position ? { position } : {}), ...(parent ? { storyboardSectionId: parent.id } : {}) };
   if (campaign.scenes.some(item => item.encounter) && next.placeId) next = makePlayableScene(campaign, next, places, characters, objects);
   const mapped = mapPlaces?.find(entry => entry.place.id === next.placeId);
   if (mapped) next = bindSceneMapPlace(next, mapped);
   const actId = parent && hierarchy.parentAct(parent);
   onChange({ ...campaign, scenes: [...campaign.scenes, next], ...(parent ? {
     storyboardSections: sections.map(item => item.id === parent.id || item.id === actId ? { ...item, collapsed: false } : item)
   } : {}) });
   selectScene(next.id);
   setFocus('name');
 }
 function removeScene(id: string) {
   if (campaign.scenes.length < 2) return;
   const scenes = campaign.scenes.filter(item => item.id !== id);
   onChange({ ...campaign, scenes, sceneLinks: removeLinksForScene(campaign.sceneLinks, id) });
   selectScene(scenes[0]!.id);
   if (connectionFromId === id) setConnectionFromId(null);
 }
 function addAction(){if(!scene?.encounter)return;const action=newOpportunity();patchScene({...scene,encounter:{...scene.encounter,definition:{...scene.encounter.definition,interactions:[...scene.encounter.definition.interactions,action]}}});setActionFocus('label');setNewActionId(action.id);}
 function patchLink(patch:Partial<StoryboardLink>){if(link){const oldTarget=campaign.scenes.find(s=>s.id===link.toSceneId),newTarget=campaign.scenes.find(s=>s.id===patch.toSceneId);const label=newTarget&&link.label===`Continue to ${oldTarget?.name}`?`Continue to ${newTarget.name}`:link.label;onChange({...campaign,sceneLinks:campaign.sceneLinks.map(l=>l.id===link.id?{...l,label,...patch}:l)});}}
 function flags(field:'requiresFlags'|'requiresAbsentFlags'|'setsFlags',title:string){if(!link)return null;const options=[...facts,...link[field].filter(id=>!facts.some(f=>f.id===id)).map(id=>({id,label:`Saved story fact: ${id}`}))];return <fieldset><legend>{title}</legend>{options.length?options.map(f=><label className="playable-check" key={f.id}><input type="checkbox" checked={link[field].includes(f.id)} onChange={e=>patchLink({[field]:e.target.checked?[...link[field],f.id]:link[field].filter(id=>id!==f.id)})}/><span>{f.label}</span></label>):<p>Add an action in a scene to create a discovery you can use here.</p>}</fieldset>;}
 function addLink(from = scene ?? testScene) {
   if (campaign.scenes.length < 2 || !from) return;
   selectScene(from.id);
   setConnectionFromId(from.id);
   setStep('connections');
 }

 function moveSceneToSection(item: CampaignScene, id: string) {
   const target = hierarchy.byId.get(id);
   const parent = target && hierarchy.parentAct(target);
   onChange({ ...campaign, scenes: campaign.scenes.map(other => other.id === item.id
     ? { ...other, storyboardSectionId: target?.id } : other),
     storyboardSections: sections.map(other => other.id === id || other.id === parent ? { ...other, collapsed: false } : other)
   });
 }

 function onCanvasContext(target: StoryboardContextTarget) {
   if (busy) return;
   if (target.sceneId) {
     setConnectionFromId(null);
     if (markedScenes.has(target.sceneId)) setSceneId(target.sceneId);
     else selectScene(target.sceneId);
     setStep('scenes');
   } else if (target.linkId) selectLink(target.linkId);
   else if (target.sectionId) selectSection(target.sectionId);
   setNewActionId('');
   setContext(target);
 }

 function removeSection(id: string) {
   onChange(removeStoryboardSection(campaign, id));
   selectSection('');
 }
 const goalEditor=(<details className="playable-adventure-goal" data-storyboard-field="objective"><summary>Adventure objective</summary><p>Choose the discoveries that complete this adventure. All selected discoveries are required.</p><label>Objective title<input value={campaign.goal?.title??''} placeholder="What the player is trying to achieve" onChange={e=>{if(campaign.goal)onChange({...campaign,goal:{...campaign.goal,title:e.target.value}});}} disabled={!campaign.goal}/></label><fieldset><legend>Complete after all of these discoveries</legend>{goalFacts.map(f=><label className="playable-check" key={f.id}><input type="checkbox" checked={campaign.goal?.requiresFlags.includes(f.id)??false} onChange={e=>{const required=e.target.checked?[...(campaign.goal?.requiresFlags??[]),f.id]:(campaign.goal?.requiresFlags??[]).filter(id=>id!==f.id);onChange({...campaign,goal:required.length?{title:campaign.goal?.title||'Complete the adventure',requiresFlags:required}:undefined});}}/>{f.label}</label>)}</fieldset></details>);
 const menuItems = context?.linkId ? [
   { label: 'Edit connection', action: () => selectLink(context.linkId!) },
   { label: 'Remove connection', action: () => { onChange({ ...campaign, sceneLinks: campaign.sceneLinks.filter(item => item.id !== context.linkId) }); selectLink(null); } }
 ] : context?.sceneId ? [
   { label: 'Edit scene', action: () => selectScene(context.sceneId!) },
   ...(scene?.encounter ? [{ label: 'Add action', action: addAction }] : []),
   { label: markedScenes.size > 1 ? 'Group selected scenes' : 'Group this scene',
     action: () => addSection('group', undefined, markedScenes.size > 1 ? markedScenes : new Set([context.sceneId!])) },
   ...(campaign.scenes.length > 1 ? [{ label: 'Connect to another scene', action: addLink }] : []),
   ...(scene && issues.length === 0 ? [{ label: 'Test this scene', action: () => onPlay(scene) }] : []),
   ...(campaign.scenes.length > 1 ? [{ label: 'Remove scene', action: () => removeScene(context.sceneId!) }] : [])
 ] : context?.sectionId && section ? [
   { label: section.collapsed ? 'Expand' : 'Collapse', action: () => toggleSection(section.id) },
   { label: 'Add scene to this part', action: () => addScene(undefined, section.id) },
   ...(section.kind === 'act' ? [{ label: 'Add scene group', action: () => addSection('group') }] : []),
   { label: 'Remove this part', action: () => removeSection(section.id) }
 ] : [
   { label: 'Add scene here', action: () => addScene(context?.position) },
   { label: 'Add act here', action: () => addSection('act', context?.position) },
   { label: 'Add scene group here', action: () => addSection('group', context?.position) },
   ...(onSave ? [{ label: 'Save adventure', action: onSave }] : [])
 ];

 const sectionInspector = section && <>
   <small>{section.kind === 'act' ? 'ACT' : 'SCENE GROUP'}</small>
   <h3>{storyboardSectionTitle(section)}</h3>
   <label>{section.kind === 'act' ? 'Act name' : 'Group name'}
     <input value={section.title} onChange={event => patchSection({ ...section, title: event.target.value })} />
   </label>
   {section.kind === 'group' && <label>Parent act
     <select value={hierarchy.parentAct(section) ?? ''} onChange={event => {
       const actId = event.target.value || undefined;
       onChange({ ...campaign, storyboardSections: sections.map(item => {
         if (item.id === section.id) return { ...section, actId };
         return item.id === actId ? { ...item, collapsed: false } : item;
       }) });
     }}>
       <option value="">Campaign</option>
       {acts.map(act => <option key={act.id} value={act.id}>{storyboardSectionTitle(act)}</option>)}
     </select>
   </label>}
   <p className="playable-hint">{hierarchy.sectionSceneIds(section.id).size} scenes in this part. Use the scene’s “Belongs to” field to move it here.</p>
   <button type="button" onClick={() => addScene(undefined, section.id)}>Add scene to this part</button>
   {section.kind === 'act' && <button type="button" onClick={() => addSection('group')}>Add scene group to this act</button>}
   <button type="button" onClick={() => toggleSection(section.id)}>{section.collapsed ? 'Expand on board' : 'Collapse on board'}</button>
   {section.kind === 'group' && section.size && <button type="button" onClick={() => patchSection({ ...section, size: undefined })}>Fit frame to scenes</button>}
   <button type="button" className="playable-remove" title="Keep the scenes and their connections" onClick={() => removeSection(section.id)}>
     {section.kind === 'act' ? 'Remove act' : 'Ungroup scenes'}
   </button>
 </>;

 const sceneSectionField = scene && sections.length > 0 && <label>Belongs to
   <select value={hierarchy.byId.has(scene.storyboardSectionId ?? '') ? scene.storyboardSectionId : ''}
     onChange={event => moveSceneToSection(scene, event.target.value)}>
     <option value="">Campaign</option>
     {sections.map(item => {
       const parentId = hierarchy.parentAct(item);
       const parent = parentId ? hierarchy.byId.get(parentId) : undefined;
       return <option value={item.id} key={item.id}>{parent ? `${storyboardSectionTitle(parent)} / ` : ''}{storyboardSectionTitle(item)}</option>;
     })}
   </select>
 </label>;

 const sceneInspector = scene && <>
   <div className="storyboard-panel-heading"><small>SCENE</small><h3>{scene.name || 'Untitled scene'}</h3></div>
   {sceneIssue && <p className="storyboard-next" role="status">{sceneIssue.message}</p>}
   <div className="storyboard-form-block">
     <label>Scene name<input data-storyboard-field="name" value={scene.name} onChange={event => {
       const name = event.target.value;
       const encounter = scene.encounter;
       patchScene({ ...scene, name, ...(encounter ? { encounter: { ...encounter, definition: { ...encounter.definition, title: name } } } : {}) });
     }} /></label>
     {sceneSectionField}
     <div data-storyboard-field="place">
       {mapPlaces ? <SceneMapPlaceField scene={scene} entries={mapPlaces} onChange={patchScene} /> :
         <label>Place<select aria-label="Place" value={scene.placeId} onChange={event => {
           const placeId = event.target.value;
           const placeName = places.find(place => place.id === placeId)?.name;
           const encounter = scene.encounter;
           patchScene({ ...scene, placeId, ...(encounter && placeName && encounter.definition.places.length === 1 ? {
             encounter: { ...encounter, definition: { ...encounter.definition, places: [{ ...encounter.definition.places[0]!, name: placeName }] } }
           } : {}) });
         }}><option value="">Choose a place</option>{places.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>}
     </div>
     {scene.encounter && <label>What the player sees on arrival<textarea data-storyboard-field="arrival" rows={4}
       value={scene.usePlaceIntro && sceneMapPlace ? sceneMapPlace.place.note : scene.encounter.definition.description}
       onChange={event => {
         const encounter = scene.encounter!;
         patchScene({ ...scene, ...(scene.mapNodeId ? { usePlaceIntro: false } : {}),
           encounter: { ...encounter, definition: { ...encounter.definition, description: event.target.value } } });
       }} /></label>}
   </div>
   {scene.encounter ? <SceneActions key={scene.id} scene={scene} facts={facts} focusActionId={newActionId} focusField={actionFocus} onChange={patchScene} onAdd={addAction} busy={busy} /> :
     <button type="button" data-storyboard-field="playable" disabled={busy || (mapPlaces ? !sceneMapPlace : !places.some(place => place.id === scene.placeId))}
       onClick={() => { patchScene(makePlayableScene(campaign, scene, places, characters, objects)); setFocus('arrival'); }}>Make scene playable</button>}
   <div className="storyboard-panel-actions">
     {campaign.scenes.length > 1 && <button type="button" disabled={busy} onClick={() => setStep('connections')}>Connections →</button>}
     <button type="button" onClick={showTest}>Review & test →</button>
   </div>
   {campaign.scenes.length > 1 && <button type="button" className="playable-remove" onClick={() => removeScene(scene.id)}>Remove scene</button>}
 </>;

 const connectionsPanel = <>
   <div className="storyboard-panel-heading"><small>STEP 2</small><h3>{link ? link.label.trim() || 'Edit connection' : 'Connect scenes'}</h3></div>
   {connectionFromId ? <div className="storyboard-next">
     <strong>Choose a destination on the board</strong>
     <p>Connect from {campaign.scenes.find(item => item.id === connectionFromId)?.name || 'this scene'}.</p>
     <button type="button" onClick={() => setConnectionFromId(null)}>Cancel</button>
   </div> : link ? <>
     <button type="button" className="storyboard-back" onClick={() => selectLink(null)}>← All connections</button>
     <div className="storyboard-form-block">
       <label>From<select aria-label="From" value={link.fromSceneId} onChange={event => patchLink({ fromSceneId: event.target.value })}>
         {!campaign.scenes.some(item => item.id === link.fromSceneId) && <option value={link.fromSceneId}>Missing scene</option>}
         {campaign.scenes.filter(item => item.id !== link.toSceneId || item.id === link.fromSceneId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
       </select></label>
       <label>To<select aria-label="To" value={link.toSceneId} onChange={event => patchLink({ toSceneId: event.target.value })}>
         {!campaign.scenes.some(item => item.id === link.toSceneId) && <option value={link.toSceneId}>Missing scene</option>}
         {campaign.scenes.filter(item => item.id !== link.fromSceneId || item.id === link.toSceneId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
       </select></label>
       <label>What the player chooses<input value={link.label} onChange={event => patchLink({ label: event.target.value })} /></label>
     </div>
     {flags('requiresFlags', 'Open after all of these discoveries')}
     <p className="playable-hint">With no conditions, this connection is available on arrival in the starting scene.</p>
     <details><summary>More conditions & consequences</summary>{flags('requiresAbsentFlags', 'Keep closed after these discoveries')}{flags('setsFlags', 'Record these facts on arrival')}</details>
     <button type="button" className="playable-remove" onClick={() => {
       onChange({ ...campaign, sceneLinks: campaign.sceneLinks.filter(item => item.id !== link.id) });
       selectLink(null);
     }}>Remove connection</button>
   </> : <>
     <p>Choose where the player can go next. Use discoveries from actions to decide when a route opens.</p>
     {campaign.scenes.length < 2 ? <button type="button" disabled={busy} onClick={() => addScene()}>Add a scene</button> : <>
       <label>Connect from<select value={connectionSource?.id ?? ''} onChange={event => setConnectionSourceId(event.target.value)}>
         {campaign.scenes.map(item => <option key={item.id} value={item.id}>{item.name || 'Untitled scene'}</option>)}
       </select></label>
       <button type="button" className="storyboard-primary" disabled={busy} onClick={() => addLink(connectionSource)}>+ Connection</button>
     </>}
     {campaign.scenes.length > 1 && unconnected.length > 0 && <p className="playable-hint">{unconnected.length} {unconnected.length === 1 ? 'scene has' : 'scenes have'} no connection yet.</p>}
     <div className="storyboard-connection-list">{campaign.sceneLinks.map(item => <button type="button" key={item.id} onClick={() => selectLink(item.id)}>
       <strong>{item.label || 'Continue'}</strong>
       <span>{campaign.scenes.find(scene => scene.id === item.fromSceneId)?.name || 'Missing scene'} → {campaign.scenes.find(scene => scene.id === item.toSceneId)?.name || 'Missing scene'}</span>
     </button>)}</div>
   </>}
   {!connectionFromId && <button type="button" onClick={showTest}>Review & test →</button>}
 </>;

 const testPanel = <>
   <div className="storyboard-panel-heading"><small>STEP 3</small><h3>Review & test</h3></div>
   {issues.length > 0 ? <div className="storyboard-review">
     <strong>{issues.length} {issues.length === 1 ? 'item' : 'items'} to finish before testing</strong>
     <ul>{issues.map((issue, index) => <li key={index}><button type="button" onClick={() => openIssue(issue)}>{issue.message} <span aria-hidden="true">→</span></button></li>)}</ul>
   </div> : testScene ? <p className="storyboard-next" role="status">Ready to test. Choose where the playthrough begins.</p> : <p>Add a scene to start building the adventure.</p>}
   {testScene && <label>Start from<select aria-label="Start from" value={testScene.id} onChange={event => setTestSceneId(event.target.value)}>
     {campaign.scenes.map(item => <option key={item.id} value={item.id}>{item.name || 'Untitled scene'}</option>)}
   </select></label>}
   <button type="button" className="storyboard-primary" disabled={busy || !testScene || issues.length > 0}
     onClick={() => testScene && onPlay(testScene)}>Test this scene →</button>
   {goalEditor}
 </>;

 function showScenes() {
   setConnectionFromId(null);
   if (!scene && !section && testScene) selectScene(testScene.id);
   setStep('scenes');
 }

 function showTest() {
   setConnectionFromId(null);
   setStep('test');
 }
 return <section ref={root} className={`playable-storyboard${expanded?' playable-storyboard--expanded':''}`} aria-label="Playable adventure editor">
  {context&&!busy&&<MessageMenu x={context.x} y={context.y} label="Storyboard actions" portalTarget={root.current??undefined} items={menuItems} onClose={()=>setContext(null)}/>}
  <header className="playable-storyboard__intro"><small>BUILD · CONNECT · PLAY</small><h2>Your adventure, one possibility at a time</h2><p>Choose a scene, describe what can happen, then connect it to the next situation. Conditions use the discoveries your actions create.</p></header>
  <div className="playable-storyboard__toolbar">
   <nav className="storyboard-workflow" aria-label="Adventure workflow">
     <button type="button" aria-label="Scenes" aria-current={step === 'scenes' ? 'step' : undefined} onClick={showScenes}>
       <span className="storyboard-workflow__number">1</span><span><strong>Scenes</strong><small>{campaign.scenes.length - unfinishedScenes.size} of {campaign.scenes.length} ready</small></span>
     </button>
     <button type="button" aria-label="Connections" aria-current={step === 'connections' ? 'step' : undefined} onClick={() => setStep('connections')}>
       <span className="storyboard-workflow__number">2</span><span><strong>Connections</strong><small>{campaign.sceneLinks.length} routes</small></span>
     </button>
     <button type="button" aria-label="Test" aria-current={step === 'test' ? 'step' : undefined} onClick={showTest}>
       <span className="storyboard-workflow__number">3</span><span><strong>Test</strong><small>{issues.length ? issues.length + ' to finish' : testScene ? 'Ready to play' : 'Add a scene'}</small></span>
     </button>
   </nav>
   {onSave && <button type="button" disabled={busy} onClick={onSave}>Save adventure</button>}
  </div>
  <div className="playable-storyboard__layout">
   <aside className="playable-storyboard__list">
    <h3>Story outline</h3>
    <div className="storyboard-outline__tools">
      <button type="button" disabled={busy} onClick={() => addSection('act')}>+ Act</button>
      <button type="button" disabled={busy} onClick={() => addSection('group')}>+ Group</button>
    </div>
    {campaign.scenes.length > 1 && <p className="playable-hint storyboard-outline__hint">Shift-click to select several scenes.</p>}
    {markedScenes.size > 1 && <button type="button" disabled={busy} onClick={() => addSection('group', undefined, markedScenes)}>Group selected scenes ({markedScenes.size})</button>}
    <StoryboardOutline scenes={campaign.scenes} sections={sections} selectedScene={sceneId} selectedSection={sectionId}
      markedScenes={markedScenes} onSelectScene={selectScene} onSelectSection={selectSection} onToggleSection={toggleSection} />
    <button type="button" onClick={() => addScene()}>+ Scene</button>
   </aside>
   <div className="playable-storyboard__canvas">
     <StoryboardCanvas scenes={campaign.scenes} links={campaign.sceneLinks} sections={sections} chapters={campaign.chapters}
       campaignName={campaign.name} onScenesChange={scenes => onChange({ ...campaign, scenes })}
       onLinksChange={sceneLinks => onChange({ ...campaign, sceneLinks })}
       onChaptersChange={chapters => onChange({ ...campaign, chapters })} externalInspector
       connectionFromSceneId={connectionFromId} onConnectionEnd={() => setConnectionFromId(null)}
       selectedSceneId={sceneId} activeLinkId={linkId} selectedSectionId={sectionId} markedSceneIds={markedScenes}
       onCanvasContext={onCanvasContext} onSelectScene={selectScene} onSelectLink={selectLink} onSelectSection={selectSection}
       onToggleSection={toggleSection} onMoveSection={(id, delta) => onChange(moveStoryboardSection(campaign, id, delta))}
       onResizeSection={(id, size) => {
         const group = hierarchy.byId.get(id);
         if (group?.kind === 'group') patchSection({ ...group, size });
       }} />
   </div>
   <aside ref={inspector} className="playable-storyboard__inspector" aria-label="Adventure details">
    {step === 'test' ? testPanel : step === 'connections' ? connectionsPanel : section ? sectionInspector : scene ? sceneInspector : <>
      <div className="storyboard-panel-heading"><small>STEP 1</small><h3>{campaign.scenes.length ? 'Choose a scene' : 'Create the opening scene'}</h3></div>
      <p>{campaign.scenes.length ? 'Select a scene from the outline or board to edit it.' : 'Start with where the player arrives and what they can do there.'}</p>
      <button type="button" className="storyboard-primary" disabled={busy} onClick={() => addScene()}>Add a scene</button>
    </>}
   </aside>
  </div>
 </section>;
}
function SceneActions({ scene, facts, focusActionId, focusField, onChange, onAdd, busy }: {
  scene: CampaignScene;
  facts: { id: string; label: string }[];
  focusActionId: string;
  focusField: ActionField;
  onChange: (scene: CampaignScene) => void;
  onAdd: () => void;
  busy: boolean;
}) {
  const actionFields = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusActionId) return;
    const card = Array.from(actionFields.current?.querySelectorAll<HTMLDetailsElement>('[data-action-id]') ?? [])
      .find(item => item.dataset.actionId === focusActionId);
    if (!card) return;
    card.open = true;
    const input = card.querySelector<HTMLElement>(`[data-action-field="${focusField}"]`);
    input?.scrollIntoView?.({ block: 'nearest' });
    input?.focus({ preventScroll: true });
  }, [focusActionId, focusField]);
  const game = scene.encounter!;
  const stats = Object.keys(game.state.actors[game.definition.playerId]!.stats);
  function patch(id: string, value: Partial<Interaction>) {
    onChange({ ...scene, encounter: { ...game, definition: { ...game.definition,
      interactions: game.definition.interactions.map(action => action.id === id ? { ...action, ...value } : action)
    } } });
  }
  return <div ref={actionFields} className="playable-actions storyboard-form-block">
    <div className="storyboard-actions-heading"><h4>Player actions</h4><button type="button" disabled={busy} onClick={onAdd}>+ Action</button></div>
    {!game.definition.interactions.length && <p className="playable-hint">Add an action when the player can discover or change something here.</p>}
    {game.definition.interactions.map(action => <details key={action.id} data-action-id={action.id} className="playable-action">
      <summary>{action.label || 'Untitled action'}</summary>
      <label>Action label<input data-action-field="label" value={action.label} onChange={event => patch(action.id, { label: event.target.value })} /></label>
      <label>What happens on success<textarea data-action-field="success" rows={3} value={action.success.text}
        onChange={event => patch(action.id, { success: { ...action.success, text: event.target.value } })} /></label>
      {action.success.effects.map((effect, index) => effect.kind === 'transfer-item' &&
        <p key={index} className="playable-hint">
          Transfers {game.definition.items.find(item => item.id === effect.itemId)?.name ?? effect.itemId}{' '}
          from {game.state.actors[effect.from]?.name ?? effect.from} to {game.state.actors[effect.to]?.name ?? effect.to}.
        </p>)}
      <label className="playable-check"><input type="checkbox" checked={!!action.check}
        onChange={event => patch(action.id, { check: event.target.checked ? { stat: stats[0] ?? 'Observation', modifier: 0 } : undefined })} />Requires a skill roll</label>
      {action.check && <>
        <label>Skill<select aria-label="Skill" value={action.check.stat} onChange={event => patch(action.id, { check: { ...action.check!, stat: event.target.value } })}>
          {stats.map(stat => <option key={stat}>{stat}</option>)}
        </select></label>
        <label>Difficulty<select aria-label="Difficulty" value={action.check.modifier} onChange={event => patch(action.id, { check: { ...action.check!, modifier: Number(event.target.value) } })}>
          <option value={20}>Easy</option><option value={0}>Standard</option><option value={-20}>Hard</option>
        </select></label>
        <label>What happens on failure<textarea data-action-field="failure" rows={2} value={action.failure.text}
          onChange={event => patch(action.id, { failure: { ...action.failure, text: event.target.value } })} /></label>
      </>}
      <details className="storyboard-action-options"><summary>People, conversation & conditions</summary>
        <label>Who this action concerns<select aria-label="Who this action concerns" value={action.counterpartyId ?? ''}
          onChange={event => patch(action.id, { counterpartyId: event.target.value || undefined })}>
          <option value="">The scene / an object</option>
          {Object.values(game.state.actors).filter(actor => actor.id !== game.definition.playerId).map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
        </select></label>
        <label>Conversation type<select aria-label="Conversation type" value={action.dialogueMode ?? 'question'}
          onChange={event => patch(action.id, { dialogueMode: event.target.value as 'question' | 'report' })}>
          <option value="question">Question</option><option value="report">Share a discovery</option>
        </select></label>
        <label>Conversation topics<input key={dialogueTopics(action).join(';')} defaultValue={dialogueTopics(action).join('; ')}
          onBlur={event => patch(action.id, { dialogueTopics: event.target.value.split(';').map(topic => topic.trim()).filter(Boolean).slice(0, 12) })}
          placeholder="messenger; budbäraren" maxLength={960} /></label>
        <p className="playable-hint">Separate topics with semicolons. Speech uses the same outcome and skill roll as the action.</p>
        <fieldset><legend>Available after these discoveries</legend>
          {facts.filter(fact => ![...action.success.effects, ...action.failure.effects].some(effect => effect.kind === 'flag' && effect.flag === fact.id)).map(fact =>
            <label className="playable-check" key={fact.id}><input type="checkbox" checked={action.requiresFlags.includes(fact.id)} onChange={event => patch(action.id, {
              requiresFlags: event.target.checked ? [...action.requiresFlags, fact.id] : action.requiresFlags.filter(id => id !== fact.id)
            })} />{fact.label}</label>
          )}
        </fieldset>
      </details>
      <button type="button" className="playable-remove" onClick={() => onChange({ ...scene, encounter: { ...game, definition: { ...game.definition,
        interactions: game.definition.interactions.filter(item => item.id !== action.id)
      } } })}>Remove action</button>
    </details>)}
  </div>;
}
