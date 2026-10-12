import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkflowReminders } from '../src/native-compiler/workflow-reminders.js';
const rule={afterSeconds:60,everySeconds:120,max:3,to:['handlers']};
test('approval, handling and applicant correction can remind; automatic nodes cannot',()=>{
 for(const kind of ['approval','handle','correction']) assert.deepEqual(validateWorkflowReminders({nodes:{a:{kind,reminders:rule}}}),[]);
 for(const kind of ['action','condition','cc','end']) assert.ok(validateWorkflowReminders({nodes:{a:{kind,reminders:rule}}}).length);
});
test('reminder timing, repeat count and recipient rule are closed and bounded',()=>{
 for(const patch of [{afterSeconds:0},{everySeconds:0},{max:11},{max:1.5},{afterSeconds:2592001},{to:['handlers','initiator']},{to:['initiator']},{action:'approve'}, {everySeconds:'60'}]) assert.ok(validateWorkflowReminders({nodes:{a:{kind:'approval',reminders:{...rule,...patch}}}}).length);
});
