import { sendJson,readJson,handleError,routeMatch } from './helpers.mjs';
export async function handleCommercialRoutes(req,res,{path,platform}){try{let m;
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/surveys$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',survey:platform.surveys.schedule(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/surveys\/([^/]+)\/complete$/);if(m&&req.method==='POST'){sendJson(res,200,{status:'success',survey:platform.surveys.complete(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/estimates$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',estimate:platform.estimates.create(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/estimates\/([^/]+)\/items$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',item:platform.estimates.addItem(m[0],await readJson(req)),estimate:platform.estimates.get(m[0])});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/quotes$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',quote:platform.quotes.create(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/quotes\/([^/]+)\/items$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',item:platform.quotes.addItem(m[0],await readJson(req)),quote:platform.quotes.get(m[0])});return true;}
 m=routeMatch(path,/^\/api\/pmo\/quotes\/([^/]+)\/send$/);if(m&&req.method==='POST'){sendJson(res,200,{status:'success',quote:platform.quotes.markSent(m[0])});return true;}
 m=routeMatch(path,/^\/api\/pmo\/quotes\/([^/]+)\/approve$/);if(m&&req.method==='POST'){sendJson(res,200,{status:'success',quote:platform.quotes.approve(m[0])});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/change-orders$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',changeOrder:platform.changeOrders.create(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/change-orders\/([^/]+)\/approve$/);if(m&&req.method==='POST'){sendJson(res,200,{status:'success',changeOrder:platform.changeOrders.approve(m[0],await readJson(req))});return true;}
 return false;}catch(error){handleError(res,error);return true;}}
