import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export function verifyIntegrity(bytes, integrity) {
  const match=/^(sha512|sha256|sha1)-([A-Za-z0-9+/=]+)$/.exec(integrity||'');
  if(!match || createHash(match[1]).update(bytes).digest('base64')!==match[2]) throw Error('REGISTRY_MIGRATION_INTEGRITY_MISMATCH');
}
export function migrationPlan(metadata) {
  const selected=new Map();
  const add=(name,version)=>{
    const key=`${name}@${version}`;if(selected.has(key))return;
    const m=metadata[name]?.versions?.[version];if(!m)throw Error(`MIGRATION_SOURCE_MISSING ${key}`);
    selected.set(key,m);
    for(const [dep,v] of Object.entries(m.dependencies||{})) if(metadata[dep])add(dep,v);
  };
  for(const [name,m] of Object.entries(metadata)){const v=m['dist-tags']?.['stable-v2']||m['dist-tags']?.latest;if(!/^2\.\d+\.\d+$/.test(v))throw Error('MIGRATION_STABLE_VERSION_REQUIRED');add(name,v);}
  return [...selected.values()].sort((a,b)=>(a.name==='openxiangda')-(b.name==='openxiangda')||a.name.localeCompare(b.name)||a.version.localeCompare(b.version,undefined,{numeric:true}));
}
async function response(url,options={}){
 const r=await fetch(url,{...options,signal:AbortSignal.timeout(90000)});
 if(r.status===404)return null;
 if(!r.ok)throw Error(`MIGRATION_HTTP_${r.status} ${new URL(url).pathname}`);
 return r;
}
async function read(url,json=true){
 for(let i=0;;i++)try{const r=await response(url);return r?(json?await r.json():Buffer.from(await r.arrayBuffer())):null;}catch(e){if(i===2)throw e;await new Promise(r=>setTimeout(r,1000*(i+1)));}
}
async function main(){
 const dir=resolve(process.argv[2]||'');if(!process.argv[2])throw Error('Usage: node scripts/migrate-registry.mjs <snapshot-directory> [--apply]');
 const names=['openxiangda-contracts','openxiangda-devkit-core','openxiangda-skill-kit','openxiangda-cli','openxiangda-mcp','openxiangda-nest','openxiangda'];
 const metadata=Object.fromEntries(names.map(n=>[n,JSON.parse(readFileSync(join(dir,n+'-metadata.json'),'utf8'))]));
 const plan=migrationPlan(metadata),target='https://npm.syedu.tech';
 const frozen=plan.map(m=>({name:m.name,version:m.version,integrity:m.dist.integrity,url:m.dist.tarball}));
 const planFile=join(dir,'migration-plan.json');
 if(existsSync(planFile)&&JSON.stringify(JSON.parse(readFileSync(planFile)))!==JSON.stringify(frozen))throw Error('MIGRATION_PLAN_CHANGED');
 writeFileSync(planFile,JSON.stringify(frozen,null,2)+'\n');
 console.log(`Frozen ${plan.length} versions for ${target}`);
 if(!process.argv.includes('--apply'))return;
 const token=process.env.OPENXIANGDA_MIGRATION_TOKEN;if(!token)throw Error('MIGRATION_TOKEN_REQUIRED');
 const receiptFile=join(dir,'migration-receipt.json'),receipt=existsSync(receiptFile)?JSON.parse(readFileSync(receiptFile)):{target,verified:{},tags:{}};
 const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
 if(!receipt.priorTags){receipt.priorTags={};for(const name of names)receipt.priorTags[name]=await read(`${target}/-/package/${name}/dist-tags`)||{};writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');}
 mkdirSync(join(dir,'tarballs'),{recursive:true});
 for(let i=0;i<plan.length;i+=3){
  const batch=await Promise.all(plan.slice(i,i+3).map(async m=>{
   const key=`${m.name}@${m.version}`;
   if(receipt.verified[key]===m.dist.integrity)return {m,skip:true};
   const f=join(dir,'tarballs',key+'.tgz');let bytes=existsSync(f)?readFileSync(f):await read(m.dist.tarball,false);
   if(!bytes)throw Error(`MIGRATION_TARBALL_MISSING ${key}`);verifyIntegrity(bytes,m.dist.integrity);if(!existsSync(f))writeFileSync(f,bytes);return {m,bytes};
  }));
  for(const {m,bytes,skip}of batch){if(skip)continue;
   const key=`${m.name}@${m.version}`,uri=`${target}/${m.name}/${m.version}`;
   let existing=await read(uri);
   if(existing && existing.dist?.integrity!==m.dist.integrity)throw Error(`MIGRATION_CONFLICT ${key}`);
   if(!existing){
    const filename=`${m.name}-${m.version}.tgz`,manifest=structuredClone(m);
    for(const key of ['_npmUser','_npmOperationalInternal','_hasShrinkwrap','maintainers'])delete manifest[key];
    manifest.dist={integrity:m.dist.integrity,shasum:createHash('sha1').update(bytes).digest('hex'),tarball:`${target}/${m.name}/-/${filename}`};
    const body=JSON.stringify({_id:m.name,name:m.name,'dist-tags':{'migration-staging':m.version},versions:{[m.version]:manifest},_attachments:{[filename]:{content_type:'application/octet-stream',data:bytes.toString('base64'),length:bytes.length}}});
    try{await response(`${target}/${m.name}`,{method:'PUT',headers,body});}catch(e){existing=await read(uri);if(existing?.dist?.integrity!==m.dist.integrity)throw e;}
   }
   const back=await read(uri);if(back?.dist?.integrity!==m.dist.integrity)throw Error(`MIGRATION_READBACK_FAILED ${key}`);
   if(!back.dist.tarball.startsWith(target+'/'))throw Error(`MIGRATION_EXTERNAL_TARBALL ${key}`);
   verifyIntegrity(await read(back.dist.tarball,false),m.dist.integrity);
   receipt.verified[key]=m.dist.integrity;writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');
  }
  console.log(`Verified ${Object.keys(receipt.verified).length}/${plan.length}`);
 }
 for(const name of names)for(const tag of ['stable-v2','latest']){
  const version=metadata[name]['dist-tags'][tag];if(!receipt.verified[`${name}@${version}`])throw Error('MIGRATION_TAG_UNVERIFIED');
  const tags=await read(`${target}/-/package/${name}/dist-tags`);
  if(tags?.[tag]!==undefined && tags[tag]!==version && tags[tag]!==receipt.priorTags[name]?.[tag])throw Error(`MIGRATION_TAG_CONFLICT ${name}:${tag}`);
  if(tags?.[tag] && /^2\.\d+\.\d+$/.test(tags[tag]) && tags[tag].localeCompare(version,undefined,{numeric:true})>0)throw Error(`MIGRATION_TAG_DOWNGRADE ${name}:${tag}`);
  if(tags?.[tag]!==version)await response(`${target}/-/package/${name}/dist-tags/${tag}`,{method:'PUT',headers,body:JSON.stringify(version)});
  const back=await read(`${target}/-/package/${name}/dist-tags`);if(back[tag]!==version)throw Error('MIGRATION_TAG_READBACK_FAILED');
  receipt.tags[`${name}:${tag}`]=version;writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');
 }
 console.log('Migration complete; original bytes and stable channels verified.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
