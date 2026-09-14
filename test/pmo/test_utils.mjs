import { PmoPlatform } from '../../pmo/platform.mjs';
export function makePlatform(){return new PmoPlatform({dbPath:':memory:',fetchFn:async()=>new Response('{}',{status:200,headers:{'content-type':'application/json'}})});}
export function makeProject(p,extra={}){return p.projects.create({title:'Kitchen Set BSD',clientName:'Ibu Eno',clientPhone:'081377248730',contractValue:53000000,...extra});}
