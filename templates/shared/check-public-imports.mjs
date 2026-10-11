import ts from 'typescript';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root,'package.json'));
const problems=[];
function check(specifier,file){
 if(!/^openxiangda(?:-|\/|$)/.test(specifier))return;
 if(specifier.startsWith('openxiangda-')){problems.push(file+': use the openxiangda public entry: '+specifier);return;}
 const parts=specifier.split('/');const name=parts.shift();const entry=parts.length?'./'+parts.join('/') : '.';
 let pkg;
 try{pkg=require(name+'/package.json');}catch{problems.push(file+': package metadata unavailable: '+specifier);return;}
 if(!Object.hasOwn(pkg.exports||{},entry))problems.push(file+': unsupported private import: '+specifier);
}
async function visit(directory){for(const item of await readdir(directory,{withFileTypes:true})){
 const path=resolve(directory,item.name);if(item.isDirectory()){await visit(path);continue;}if(!/\.[cm]?[jt]sx?$/.test(item.name))continue;
 const source=ts.createSourceFile(path,await readFile(path,'utf8'),ts.ScriptTarget.Latest,true,path.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const walk=node=>{if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))check(node.moduleSpecifier.text,path);if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))check(node.arguments[0].text,path);ts.forEachChild(node,walk);};walk(source);
}}
await visit(resolve(root,'src'));
if(problems.length)throw new Error('TEMPLATE_PRIVATE_IMPORT_FORBIDDEN:\n'+problems.join('\n'));
console.log('Application source uses public OpenXiangda exports.');
