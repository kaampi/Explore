import { useEffect,useRef } from 'react';
/** Adapted from the supplied ember demo: local canvas, elapsed time and a bounded particle pool. */
export function CombatEmbers(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
  const host=canvas.parentElement;if(!host)return;
  const sprite=document.createElement('canvas');sprite.width=sprite.height=32;const brush=sprite.getContext('2d');if(!brush)return;
  const glow=brush.createRadialGradient(16,16,0,16,16,16);glow.addColorStop(0,'#fff0bc');glow.addColorStop(.12,'#ffbd59');glow.addColorStop(.35,'#ff781e99');glow.addColorStop(1,'#ff781e00');brush.fillStyle=glow;brush.fillRect(0,0,32,32);
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let width=0,height=0,frame=0,last=0,accumulator=0;
  type Ember={x:number;y:number;angle:number;speed:number;size:number};let particles:Ember[]=[];
  // Separate cosmetic generator: never consumes the game engine’s randomness.
  let seed=(performance.now()*1000)>>>0;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const spawn=():Ember=>({x:width/2,y:height/2,angle:random()*Math.PI*2,speed:(1+random()*2.5)*12,size:(1+random()*3)*.6});
  function draw(dt:number){
   ctx!.clearRect(0,0,width,height);ctx!.globalCompositeOperation='lighter';accumulator+=dt*6;
   while(accumulator>=1&&particles.length<80){particles.push(spawn());accumulator--;}
   accumulator=Math.min(accumulator,1);
   particles=particles.filter(p=>{
    p.x+=Math.cos(p.angle)*p.speed*dt;p.y+=Math.sin(p.angle)*p.speed*dt;
    const distance=Math.hypot((p.x-width/2)/Math.max(1,width*.46),(p.y-height/2)/Math.max(1,height*.42));if(distance>=1)return false;
    ctx!.globalAlpha=Math.max(0,1-distance)*.85;const size=p.size*6;ctx!.drawImage(sprite,p.x-size/2,p.y-size/2,size,size);return true;
   });ctx!.globalAlpha=1;
  }
  function tick(time:number){
   frame=0;if(document.hidden||motion.matches||!width||!height)return;
   if(!last)last=time;
   const dt=(time-last)/1000;if(dt>=1/30){last=time;draw(Math.min(dt,.05));}
   frame=requestAnimationFrame(tick);
  }
  function sync(){
   cancelAnimationFrame(frame);frame=0;last=0;
   if(!document.hidden&&!motion.matches&&width&&height)frame=requestAnimationFrame(tick);
   else if(motion.matches){ctx!.clearRect(0,0,width,height);}
  }
  function resize(){
   const rect=host!.getBoundingClientRect();width=rect.width;height=rect.height;
   const scale=Math.min(window.devicePixelRatio||1,2);canvas!.width=Math.max(1,Math.round(width*scale));canvas!.height=Math.max(1,Math.round(height*scale));ctx!.setTransform(scale,0,0,scale,0,0);particles=[];accumulator=0;sync();
  }
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  document.addEventListener('visibilitychange',sync);motion.addEventListener?.('change',sync);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',sync);motion.removeEventListener?.('change',sync);particles=[];};
 },[]);
 return <canvas ref={ref} className="combat-embers" aria-hidden="true"/>;
}
