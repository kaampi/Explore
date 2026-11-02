import { useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
export function CheckUpdates(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[available,setAvailable]=useState(false);
 async function check(){setBusy(true);setMessage('Checking GitHub…');setAvailable(false);try{
  const revision=import.meta.env.VITE_EXPLORE_REVISION as string|undefined;
  if(!revision)throw Error('This build has no version identifier. See the latest builds on GitHub.');
  const response=await fetch(`https://api.github.com/repos/kaampi/Explore/compare/${encodeURIComponent(revision)}...main`,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  if(response.status===404)throw Error('This development version cannot be compared with GitHub. See the latest builds there.');
  if(!response.ok)throw Error(response.status===403||response.status===429?'GitHub is temporarily limiting checks. Try again later.':'Could not check for updates. Try again later.');
  const result=await response.json() as {ahead_by?:number};if(typeof result.ahead_by!=='number')throw Error('GitHub returned an unexpected result.');
  setAvailable(result.ahead_by>0);setMessage(result.ahead_by>0?'A newer Explore version is available. Open the latest successful Windows build to download its installer.':'You have the latest Explore code on main.');
 }catch(e){setMessage(e instanceof Error?e.message:'Could not check for updates.');}finally{setBusy(false);}}
 const url='https://github.com/kaampi/Explore/actions/workflows/desktop-build.yml';
 return <div className="sb-update-check"><button type="button" className="sb-button" disabled={busy} onClick={()=>void check()}>{busy?'Checking…':'Check for updates'}</button>{message&&<p role="status">{message}</p>}{message&&<a href={url} target="_blank" rel="noreferrer" onClick={e=>{if(isTauri()){e.preventDefault();void openUrl(url).catch(()=>setMessage('Could not open the browser. Visit kaampi/Explore on GitHub for downloads.'));}}}>{available?'View update':'View available builds'}</a>}</div>;
}
