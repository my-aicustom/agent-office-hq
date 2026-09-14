import { PmoError } from '../core/errors.mjs';
export function sendJson(res,status,payload){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(payload,null,2));}
export async function readJson(req,{limit=1_000_000}={}){let size=0,raw='';for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('BODY_TOO_LARGE'),{status:413});raw+=chunk;}if(!raw)return {};try{return JSON.parse(raw);}catch{throw Object.assign(new Error('INVALID_JSON'),{status:400});}}
export function actorFromSession(session){return {type:'HUMAN',id:session?.user||'boss'};}
export function handleError(res,error){if(error instanceof PmoError)return sendJson(res,error.status,{status:'error',code:error.code,message:error.message,details:error.details});return sendJson(res,error.status||500,{status:'error',message:error.message||'INTERNAL_ERROR'});}
export function routeMatch(path,pattern){const m=path.match(pattern);return m?m.slice(1).map(decodeURIComponent):null;}
