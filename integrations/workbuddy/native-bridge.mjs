export const RENDERER_BRIDGE = String.raw`(async function(){
  if(globalThis.__rondoNativeBridgeV1?.revision===9) return true;
  globalThis.__rondoNativeBridgeV1?.close?.();
  const mc=new MessageChannel(), pending=new Map(), markers=new Map(), outgoing=new Map(), progress=new Map(), inputs=new Map(), workspaces=new Map(), configuredModels=new Map(), historySeen=new Map();
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
      // WorkBuddy 5.9.2/5.9.3 emits control events outside update.sessionUpdate.
      // Its session:get projection can hide pending inputs after stale history marks a turn terminal.
      const controls=inputs.get(sid);
      const inputId=data.requestId||data.toolCallId||data.elicitationId;
      if(controls&&['permissionRequest','questionRequest','elicitationRequest'].includes(data.type)&&typeof inputId==='string'&&data.request){
        controls.set(inputId,{type:data.type,requestId:inputId,request:data.request});
      }
      if(controls&&['permissionResolved','questionResolved','elicitationResolved'].includes(data.type))controls.delete(inputId);
      if(update.sessionUpdate==='user_message_chunk'){
        const meta=(data._meta||{})['codebuddy.ai']||{};
        for(const key of ['requestId','userMessageId','messageRequestId'])marker(sid,meta[key]);
        const content=Array.isArray(update.content)?update.content:[update.content];
        for(const item of content){if(item?.type==='text'&&typeof item.text==='string'){const match=item.text.match(/\[CODEX_QUEUE_WAKE (wake-run-[a-f0-9-]{36})\]/);if(match)marker(sid,match[1]);}}
      }
      const queue=progress.get(sid);
      if(queue&&['agent_message_chunk','tool_call','tool_call_update'].includes(update.sessionUpdate)){
        const content=Array.isArray(update.content)?update.content:[update.content];
        const text=content.map(x=>x?.type==='text'?x.text:x?.content?.type==='text'?x.content.text:'').filter(Boolean).join('\n').slice(-8000);
        const last=queue.at(-1);
        if(update.sessionUpdate==='agent_message_chunk'&&last?.sessionUpdate==='agent_message_chunk')last.text=(last.text+text).slice(-6000);
        else queue.push({sessionUpdate:update.sessionUpdate,toolCallId:update.toolCallId,title:update.title,kind:update.kind,status:update.status,text});
        if(queue.length>100)queue.splice(0,queue.length-100);
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
    const conversation=await globalThis.__wbInvoke('wb:conversations:get',{},sid);
    if(!conversation||conversation.errorCode||conversation.info?.id!==sid)throw Error('Native worker conversation was not found');
    const workspace=session?.cwd||conversation.info?.space?.cwd||workspaces.get(sid);
    if(!workspace)throw Error('Native worker workspace was not found');
    const waiting=inputs.get(sid)?.size||session?.pendingInputKind||(session?.pendingPermissions?.length)||(session?.pendingQuestions?.length)||(session?.pendingElicitations?.length)||conversation.info.state==='pending';
    if(waiting)return {state:'waiting_input',workspace,reason:'WorkBuddy requires native permission or input'};
    if(outgoing.has(sid)||active.some(s=>(s.sessionId||s.id)===sid||s.cwd===workspace)||session?.isProcessing||session?.stopRequested||session?.hasActiveTeamMembers||session?.hasActiveToolCalls||['working','planning'].includes(conversation.info.state))return {state:'busy',workspace,reason:'Native WorkBuddy session is active'};
    if(session?.status&&!['completed','failed','cancelled','idle','stopped','pending','terminated'].includes(String(session.status).toLowerCase()))return {state:'busy',workspace,reason:'Native state is not confirmed idle: '+String(session.status)};
    return {state:'idle',workspace};
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
    const actualModel=configuredModels.get(sid);
    if(model&&actualModel!==model){outgoing.delete(sid);return {accepted:false,error:'WorkBuddy model selection was not confirmed'};}
    // Use the same conversation admission as WorkBuddy's UI, so it owns the request.
    Promise.resolve().then(()=>globalThis.__wbInvoke('wb:conversations:sendPrompt',{},sid,[{type:'text',text:prompt}],{clientRequestId:wakeId,emitUserMessage:true,_meta:{'codebuddy.ai/conversationRequestId':wakeId}})).then(result=>{if(result?.errorCode||result?.__wbError)operation.error=String(result.message||result.errorCode);outgoing.delete(sid);},error=>{operation.error=error.message;outgoing.delete(sid);});
    const deadline=Date.now()+8000;
    while(Date.now()<deadline){
      if(markers.get(sid)?.has(wakeId))return {accepted:true,receipt:wakeId,model:actualModel};
      const history=await globalThis.__wbInvoke('wb:conversations:requests',{},sid,null);
      if((history?.items||[]).some(x=>[x.id,x.requestId,x.clientRequestId,x.conversationRequestId].includes(wakeId)))return {accepted:true,receipt:wakeId,model:actualModel};
      if(operation.error)throw Error(operation.error);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error('Native submission receipt is uncertain; do not automatically replay');
  };
  const createWorker=async(workspace,sessionId,title,model)=>{
    if(typeof globalThis.__wbInvoke!=='function')throw Error('WorkBuddy conversation interface is unavailable');
    if(model&&!(await listModels()).models.some(m=>m.id===model))throw Error('Model is not available in WorkBuddy; prompt was not sent');
    progress.set(sessionId,[]);
    inputs.set(sessionId,new Map());
    const created=await globalThis.__wbInvoke('wb:conversations:create',{}, {conversationId:sessionId,cwd:workspace,transport:'local',title,...model?{model}:{}});
    const info=created?.info, normalized=x=>String(x||'').replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
    if(info?.id!==sessionId||normalized(info?.space?.cwd)!==normalized(workspace))throw Error('Native conversation creation returned a different identity or workspace; do not replay');
    const actual=created?.configManager?.model||info?.model;
    if(model&&actual!==model)throw Error('WorkBuddy did not confirm the selected model; prompt was not sent');
    workspaces.set(sessionId,workspace);configuredModels.set(sessionId,actual);
    return {sessionId,workspace};
  };
  const permissionRequest=async sid=>{
    const native=await globalThis.__wbInvoke('wb:conversations:getPendingInfo',{},sid);
    for(const [id,entry] of inputs.get(sid)||[])if(entry.sdk&&id!==native?.id)inputs.get(sid).delete(id);
    if(native?.id&&['tool','sandbox','plan'].includes(native.category)&&Array.isArray(native.options)&&native.options.length){
      const tool=native.toolCall||{};
      inputs.get(sid)?.set(native.id,{type:'permissionRequest',requestId:native.id,sdk:true,request:{toolCall:{title:native.title||native.description||tool.title||'WorkBuddy 请求确认',rawInput:tool.rawInput||native.rawInput||{}},options:native.options}});
    }
    const input=Array.from(inputs.get(sid)?.values()||[]).find(x=>x.type==='permissionRequest');
    if(!input)return null;
    const tool=input.request.toolCall||{};
    const options=(input.request.options||[]).filter(x=>typeof x?.optionId==='string'&&typeof x?.kind==='string').map(x=>({optionId:x.optionId,kind:x.kind,name:x.name||x.optionId}));
    return {requestId:input.requestId,params:{reason:tool.title||'WorkBuddy 等待权限确认',command:typeof tool.rawInput?.command==='string'?tool.rawInput.command:JSON.stringify(tool.rawInput||{}),options}};
  };
  const answerPermission=async(sid,requestId,optionId)=>{
    const input=inputs.get(sid)?.get(requestId);
    if(!input||!input.request.options?.some(x=>x.optionId===optionId))throw Error('Permission request expired or option is invalid');
    const accepted=input.sdk?await globalThis.__wbInvoke('wb:conversations:resolvePending',{},sid,requestId,{optionId}):await rpc('session:resolvePermission',[sid,requestId,optionId]);
    if(accepted===false||accepted?.errorCode||accepted?.__wbError||(!input.sdk&&accepted!==true))throw Error('Native permission response was not accepted; refresh the session');
    inputs.get(sid).delete(requestId);
    return true;
  };
  const cancelWorker=async sid=>{
    const result=await globalThis.__wbInvoke('wb:conversations:cancel',{},sid);
    if(result?.errorCode||result?.__wbError)throw Error('Native conversation cancellation was not accepted');
    inputs.get(sid)?.clear();
  };
  const projectHistory=async sid=>{
    const queue=progress.get(sid);if(!queue)return;
    const result=await globalThis.__wbInvoke('wb:conversations:requests',{},sid,null),items=result?.items;
    if(!Array.isArray(items))throw Error('Incompatible WorkBuddy conversation history');
    if(items.length>1)throw Error('Multiple requests in a dedicated worker conversation; inspect before continuing');
    const seen=historySeen.get(sid)||new Map();historySeen.set(sid,seen);
    for(const item of items)for(const [index,block] of (item.assistantMessage?.content||[]).entries()){
      const key=String(block.toolCallId||block.messageId||(item.id+':'+index));
      if(block.type==='text'&&typeof block.text==='string'){
        const previous=seen.get(key)||'';const delta=block.text.startsWith(previous)?block.text.slice(previous.length):block.text;
        if(delta)queue.push({sessionUpdate:'agent_message_chunk',text:delta.slice(-8000)});
        seen.set(key,block.text);
      }else if(block.type==='tool'){
        const text=typeof block.rawOutput==='string'?block.rawOutput:JSON.stringify(block.rawOutput||'');
        const signature=JSON.stringify([block.status,block.title,text]);
        if(seen.get(key)!==signature)queue.push({sessionUpdate:'tool_call_update',toolCallId:key,title:block.title||block.toolName||'WorkBuddy 工具',status:block.status,text:text.slice(-8000)});
        seen.set(key,signature);
      }
    }
    if(queue.length>100)queue.splice(0,queue.length-100);
  };
  const drainEvents=sid=>{const queue=progress.get(sid);if(!queue)return [];return queue.splice(0);};
  globalThis.__rondoNativeBridgeV1={revision:9,rpc,inspect,findWake,wakeIdle,createWorker,listModels,setModel,drainEvents,projectHistory,permissionRequest,answerPermission,cancelWorker,close:()=>mc.port1.close()};
  return true;
})()`;
