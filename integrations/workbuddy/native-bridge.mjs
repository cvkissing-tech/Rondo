export const RENDERER_BRIDGE = String.raw`(async function(){
  if(globalThis.__rondoNativeBridgeV1?.revision===3) return true;
  globalThis.__rondoNativeBridgeV1?.close?.();
  const mc=new MessageChannel(), pending=new Map(), markers=new Map(), outgoing=new Map();
  let sequence=0, openResolve, closed=false;
  const opened=new Promise(resolve=>openResolve=resolve);
  const marker=(sid,id)=>{if(typeof id==='string'&&/^wake-run-[a-f0-9-]{36}$/.test(id)){if(!markers.has(sid))markers.set(sid,new Set());markers.get(sid).add(id);}};
  mc.port1.onmessage=event=>{
    const frame=event.data;
    if(frame.kind==='open'){openResolve();return;}
    if(frame.kind==='close'){closed=true;for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('Native desktop transport closed'));}pending.clear();return;}
    if(frame.kind!=='message')return;
    let message=frame.json;try{message??=JSON.parse(frame.text);}catch{return;}
    if(message.type==='event'&&typeof message.channel==='string'&&message.channel.startsWith('session:event:')){
      const data=message.result||{},update=data.update||{},sid=data.sessionId||message.channel.slice(14);
      if(update.sessionUpdate==='user_message_chunk'){
        const meta=(data._meta||{})['codebuddy.ai']||{};
        for(const key of ['requestId','userMessageId','messageRequestId'])marker(sid,meta[key]);
        const content=Array.isArray(update.content)?update.content:[update.content];
        for(const item of content){if(item?.type==='text'&&typeof item.text==='string'){const match=item.text.match(/\[CODEX_QUEUE_WAKE (wake-run-[a-f0-9-]{36})\]/);if(match)marker(sid,match[1]);}}
      }
      return;
    }
    const q=pending.get(message.id);if(!q)return;pending.delete(message.id);clearTimeout(q.timer);
    if(message.type==='error')q.reject(Error(typeof message.error?.message==='string'?message.error.message:'Native RPC failed'));
    else q.resolve(message.result);
  };
  mc.port1.start();
  window.postMessage({type:'workbuddy:open-local-daemon-transport-port',target:{transportType:'local'}},'*',[mc.port2]);
  let openTimer;try{await Promise.race([opened,new Promise((_,reject)=>openTimer=setTimeout(()=>reject(Error('Native port open timed out')),10000))]);}finally{clearTimeout(openTimer);}
  const rpc=(channel,args,timeout=15000)=>new Promise((resolve,reject)=>{
    if(closed){reject(Error('Native desktop transport closed'));return;}
    const id='rondo-native-'+(++sequence);
    const timer=timeout?setTimeout(()=>{pending.delete(id);reject(Error('Native RPC timed out: '+channel));},timeout):undefined;
    pending.set(id,{resolve,reject,timer});mc.port1.postMessage({kind:'message',json:{id,type:'request',channel,args}});
  });
  const inspect=async sid=>{
    const active=await rpc('daemon:getActiveSessions',[]);
    if(!Array.isArray(active))throw Error('Incompatible native activity response');
    const session=await rpc('session:get',[sid]);
    if(!session||!session.cwd)throw Error('Native worker session was not found');
    const waiting=session.pendingInputKind||(session.pendingPermissions?.length)||(session.pendingQuestions?.length)||(session.pendingElicitations?.length);
    if(waiting)return {state:'waiting_input',workspace:session.cwd,reason:'WorkBuddy requires native permission or input'};
    if(outgoing.has(sid)||active.some(s=>(s.sessionId||s.id)===sid||s.cwd===session.cwd)||session.isProcessing||session.stopRequested||session.hasActiveTeamMembers||session.hasActiveToolCalls)return {state:'busy',workspace:session.cwd,reason:'Native WorkBuddy session is active'};
    if(!['completed','failed','cancelled','idle','stopped','pending'].includes(String(session.status).toLowerCase()))return {state:'busy',workspace:session.cwd,reason:'Native state is not confirmed idle: '+String(session.status)};
    return {state:'idle',workspace:session.cwd};
  };
  const findWake=async(sid,wakeId)=>{
    if(markers.get(sid)?.has(wakeId))return true;
    const session=await rpc('session:get',[sid]);
    await rpc('session:load',[sid,{cwd:session?.cwd,forceRendererHistoryReplay:true}]);
    return markers.get(sid)?.has(wakeId)===true;
  };
  const listModels=async sid=>{
    const product=await rpc('config:getProductConfiguration',[true],30000);
    if(product?.remoteProductConfigurationStatus==='pending')throw Error('WorkBuddy model configuration is still loading; retry the query');
    if(!Array.isArray(product?.models))throw Error('Incompatible native model list');
    const allowed=Array.isArray(product.availableModels)?new Set(product.availableModels):null;
    const models=product.models.filter(m=>m&&typeof m.id==='string'&&m.id.trim()&&(!allowed?.size||allowed.has(m.id)||allowed.has(m.id.replace(/^custom-local:/,'')))).map(m=>({id:m.id,name:m.name||m.id}));
    const session=sid?await rpc('session:get',[sid]):undefined;
    return {models,currentModel:session?.model||session?.config?.model,...sid?{sessionId:sid}:{}};
  };
  const applyModel=async(sid,model)=>{
    const available=await listModels(sid);
    if(!available.models.some(m=>m.id===model))throw Error('Model is not available in WorkBuddy: '+model);
    if(available.currentModel!==model){
      const result=await rpc('session:updateConfig',[sid,{model}],45000);
      if(result?.error||result?.errorCode||result?.success===false)throw Error('Native model configuration was rejected');
    }
    const session=await rpc('session:get',[sid]);
    const actual=session?.model||session?.config?.model;
    if(actual!==model)throw Error('Native model change was not confirmed; inspect the session before retrying');
    return {sessionId:sid,model:actual};
  };
  const setModel=async(sid,model)=>{
    const state=await inspect(sid);
    if(state.state!=='idle'||outgoing.has(sid))throw Error('Wait for the native WorkBuddy session to finish before changing its model');
    outgoing.set(sid,{configuration:true});
    try{return await applyModel(sid,model);}finally{outgoing.delete(sid);}
  };
  const wakeIdle=async(sid,wakeId,prompt,model)=>{
    if(markers.get(sid)?.has(wakeId))return {accepted:true,receipt:wakeId};
    const state=await inspect(sid);
    if(state.state!=='idle'||outgoing.has(sid))return {accepted:false};
    // Lock before sending. Native sendMessage has no independent busy rejection.
    const operation={wakeId,error:undefined};outgoing.set(sid,operation);
    try{if(model)await applyModel(sid,model);}catch(error){outgoing.delete(sid);return {accepted:false,error:error.message};}
    const meta={'codebuddy.ai':{requestId:wakeId,userMessageId:wakeId,messageRequestId:wakeId,emitSyntheticUserPromptLive:true}};
    rpc('session:sendMessage',[sid,[{type:'text',text:prompt}],meta],0).then(()=>outgoing.delete(sid),error=>{operation.error=error.message;outgoing.delete(sid);});
    const deadline=Date.now()+8000;
    while(Date.now()<deadline){
      if(markers.get(sid)?.has(wakeId))return {accepted:true,receipt:wakeId};
      if(operation.error)throw Error(operation.error);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error('Native submission receipt is uncertain; do not automatically replay');
  };
  const createWorker=async(workspace,sessionId,title)=>{
    const initialized=await rpc('workspace:initialize',[{cwd:workspace}]);
    if(!initialized?.success)throw Error(initialized?.error||'Native workspace initialization failed');
    const created=await rpc('session:create',[{cwd:workspace,sessionId,isPlayground:false}],45000);
    if(created?.sessionId!==sessionId||created?.cwd!==workspace)throw Error('Native session creation returned a different identity or workspace; do not replay');
    if(title)await rpc('session:rename',[sessionId,title]);
    return {sessionId:created.sessionId,workspace:created.cwd};
  };
  globalThis.__rondoNativeBridgeV1={revision:3,rpc,inspect,findWake,wakeIdle,createWorker,listModels,setModel,close:()=>mc.port1.close()};
  return true;
})()`;
