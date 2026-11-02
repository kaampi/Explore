import type { Session } from "./StateSchema";
import { isLeftBehind } from "./party";

/** Position changes need engine-authorized travel or explicit movement by a present character. */
export function guardAbsentPositions<T extends {path:string;value:unknown}>(proposals:T[],session:Session,evidence?:{reply:string;focusId:string}):T[]{
 return proposals.filter(proposal=>{
  const match=/^characters\.([^.]+)\.position$/.exec(proposal.path);
  if(!match)return true;
  const id=match[1]!,character=session.characters[id];
  if(!character||character.position.lock!=="unlocked")return true;
  const unchanged=typeof proposal.value==="string"&&proposal.value.trim().toLowerCase()===character.position.value.trim().toLowerCase();
  if(isLeftBehind(session,id))return unchanged;
  if(unchanged||!evidence)return true;
  const subject=(character.name??id).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const named=new RegExp("\\b"+subject+"\\s+(?:walks?|steps?|goes|enters?|leaves?|exits?|heads?|follows?|går|kliver|lämnar)\\b","i");
  const focused=id===evidence.focusId&&/\b(?:she|he|they|I)\s+(?:walks?|steps?|goes|go|enters?|leaves?|exits?|heads?|follows?)\b/i.test(evidence.reply);
  return named.test(evidence.reply)||focused;
 });
}
