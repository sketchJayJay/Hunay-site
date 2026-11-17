export type RefreshController={refresh:(fresh?:boolean)=>Promise<void>;dispose:()=>void};

// Background checks share an in-flight read. A refresh after a save invalidates
// that read and waits for a new snapshot, so an older response cannot win.
export function createRefreshCoordinator<T>(options:{read:()=>Promise<T>;apply:(value:T)=>void;onError:(error:unknown)=>void;onBusy?:(busy:boolean)=>void}):RefreshController{
 let busy=false,pending=false,disposed=false,version=0;
 const waiters:Array<()=>void>=[];
 async function drain(){
  busy=true;options.onBusy?.(true);
  try{
   while(pending&&!disposed){
    pending=false;const ticket=version;
    try{const value=await options.read();if(!disposed&&ticket===version)options.apply(value);}
    catch(error){if(!disposed&&ticket===version)options.onError(error);}
   }
  }finally{
   busy=false;if(!disposed)options.onBusy?.(false);
   waiters.splice(0).forEach(resolve=>resolve());
  }
 }
 return {
  refresh(fresh=false){
   if(disposed)return Promise.resolve();
   return new Promise<void>(resolve=>{
    waiters.push(resolve);
    if(!busy||fresh){pending=true;version++;}
    if(!busy)void drain();
   });
  },
  dispose(){disposed=true;pending=false;waiters.splice(0).forEach(resolve=>resolve());}
 };
}

export function watchVisibleRefresh(refresh:()=>void,canRefresh:()=>boolean,win:Pick<Window,'addEventListener'|'removeEventListener'|'setInterval'|'clearInterval'>=window,doc:Pick<Document,'addEventListener'|'removeEventListener'|'visibilityState'>=document){
 const update=()=>{if(doc.visibilityState==='visible'&&canRefresh())refresh();};
 win.addEventListener('focus',update);doc.addEventListener('visibilitychange',update);
 const timer=win.setInterval(update,10000);
 return ()=>{win.removeEventListener('focus',update);doc.removeEventListener('visibilitychange',update);win.clearInterval(timer);};
}
