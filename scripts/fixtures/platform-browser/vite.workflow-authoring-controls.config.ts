import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { peopleConfigurations } from './platform-e2e/workflow-people-source-data';

const root = resolve(import.meta.dirname, '../../..');
const sdk = createRequire(resolve(root, 'packages/openxiangda/package.json'));

function peopleSourceFixture(): Plugin {
  let mode='success';
  const requests: unknown[]=[];
  return {name:'synthetic-people-authoring-http',configureServer(server) {
    server.middlewares.use(async(req,res,next)=>{
      const path=new URL(req.url||'/', 'http://127.0.0.1').pathname;
      const base='/service/openxiangda-api/v2/applications/people-authoring-fixture/admin';
      if(path!=='/__people-source-fixture__/control'&&!path.startsWith(base))return next();
      const send=(data:unknown,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
      try {
        if(path==='/__people-source-fixture__/control') {
          if(req.method==='POST') {let input='';for await(const chunk of req)input+=chunk;const value=JSON.parse(input);if(!['success','unknown','conflict'].includes(value.mode))return send({error:'invalid mode'},400);mode=value.mode;requests.length=0;}
          return send({mode,requests});
        }
        if(req.method==='POST'&&path===`${base}/workflows/review/node-configurations/review`) {
          let input='';for await(const chunk of req){input+=chunk;if(input.length>65536)return send({code:413},413);}
          requests.push(JSON.parse(input));
          if(requests.length===1&&mode==='unknown')return send({code:'UNAVAILABLE',message:'本地HTTP夹具：结果未知'},503);
          if(requests.length===1&&mode==='conflict')return send({code:'WORKFLOW_V2_NODE_CONFIGURATION_REVISION_CONFLICT',message:'本地HTTP夹具：修订冲突'},409);
          return send({code:200,data:{schemaVersion:'openxiangda.workflow-node-configuration-receipt/v2',revision:mode==='conflict'?3:1}});
        }
        if(req.method==='GET'&&path===`${base}/workflows/review/node-configurations`) {
          const current=structuredClone(peopleConfigurations);current.nodes[0].configuration.revision=2;current.nodes[0].effective.title='他人修改的标题';
          return send({code:200,data:current});
        }
        if(req.method==='GET'&&path===`${base}/context`)return send({code:200,data:{headRevision:2}});
        return send({code:'FIXTURE_ROUTE_NOT_IMPLEMENTED',message:'仅提供本地测试接口'},404);
      }catch{return send({code:'FIXTURE_INPUT_INVALID'},400);}
    });
  }};
}

export default {
  plugins:[peopleSourceFixture()],
  root: import.meta.dirname,
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 33335, strictPort: true, fs: { allow: [root] } },
  resolve: {
    alias: {
      react: dirname(sdk.resolve('react/package.json')),
      'react-dom': dirname(sdk.resolve('react-dom/package.json')),
      antd: dirname(sdk.resolve('antd/package.json')),
    },
    dedupe: ['react', 'react-dom', 'antd'],
  },
  optimizeDeps: { entries: ['workflow-authoring-controls.e2e.html'] },
};
