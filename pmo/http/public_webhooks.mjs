import { sendJson,readJson } from './helpers.mjs';
export async function handlePmoPublic(req,res,{path,platform}){
 if(path!=='/webhooks/pmo/whatsapp' || req.method!=='POST')return false;
 if(!platform.whatsapp.verifyWebhook(req.headers)) {sendJson(res,401,{status:'error',message:'INVALID_WEBHOOK_SECRET'});return true;}
 let payload;try{payload=await readJson(req);}catch(e){sendJson(res,e.status||400,{status:'error',message:e.message});return true;}
 const incoming=platform.whatsapp.normalizeInbound(payload);if(!incoming.phone){sendJson(res,422,{status:'error',message:'PHONE_NOT_FOUND'});return true;}
 const ledger=platform.webhooks.begin({provider:'WHATSAPP',externalId:incoming.externalId||null,eventType:'MESSAGE',payload});if(ledger.duplicate){sendJson(res,200,{status:'duplicate',eventId:ledger.event.id});return true;}
 try{const msg=platform.messages.record({direction:'INBOUND',channel:'WHATSAPP',phone:incoming.phone,externalId:incoming.externalId||null,text:incoming.text,payload,occurredAt:new Date(Number(incoming.timestamp)||Date.now()).toISOString()});const inbox=platform.inbox.ingestMessage(msg,{name:incoming.name});platform.webhooks.done(ledger.event.id);sendJson(res,202,{status:'accepted',messageId:msg.id,inboxId:inbox.id,projectId:msg.project_id||null,requiresTriage:!msg.project_id});}catch(error){platform.webhooks.fail(ledger.event.id,error);sendJson(res,500,{status:'error',message:error.message});}
 return true;
}
