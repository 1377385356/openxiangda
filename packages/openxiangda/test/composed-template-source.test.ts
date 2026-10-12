import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
test('materialized visitor, public/mobile and CRUD source compile using only public entries',()=>{
 const root=resolve(import.meta.dirname,'../../..');
 execFileSync(process.execPath,[resolve(root,'scripts/verify-composed-templates.mjs'),root],{cwd:root,timeout:60_000,stdio:'pipe'});
});
