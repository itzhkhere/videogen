import {load,html,options,output} from './common.mjs';
const a=load();const first=new a.ExperimentalDenoRenderer(html,options);const second=new a.ExperimentalDenoRenderer(html,options);output({bothConstructed:a.lifecycleStats()});first.close();second.close();
