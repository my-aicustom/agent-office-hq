import { sendJson,handleError,routeMatch } from './helpers.mjs';
export async function handleDashboardRoutes(req,res,{path,url,platform}){try{
 if(path==='/api/pmo/dashboard'&&req.method==='GET'){sendJson(res,200,{status:'success',dashboard:platform.dashboard.snapshot(),kpis:platform.kpis.calculate()});return true;}
 if(path==='/api/pmo/search'&&req.method==='GET'){const results=platform.search.search(url.searchParams.get('q')||'',{limit:url.searchParams.get('limit')||50});sendJson(res,200,{status:'success',count:results.length,results});return true;}
 let m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/report$/);if(m&&req.method==='GET'){const report=platform.reports.project(m[0]);if(!report)return sendJson(res,404,{status:'error',message:'PROJECT_NOT_FOUND'}),true;sendJson(res,200,{status:'success',report});return true;}
 if(path==='/api/pmo/integrations/health'&&req.method==='GET'){const wa=await platform.whatsapp.health();sendJson(res,200,{status:'success',integrations:{whatsapp:wa,n8n:{configured:Boolean(platform.n8n.webhookBase)}}});return true;}
 return false;}catch(error){handleError(res,error);return true;}}
