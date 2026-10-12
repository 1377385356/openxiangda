import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicCliHelpSurface } from '../lib/public-cli-help-surface.mjs';

const definitions = [
  { id: 'auth', operation: 'auth.status' },
  { id: 'check', operation: 'check' },
  { id: 'template', operation: 'template.list' },
];
const help = `VERSION
  openxiangda/2.63.1

USAGE
  $ openxiangda [COMMAND]

TOPICS
  template  List templates

COMMANDS
  auth   Read authorization
  check  Check application
`;

test('accepts only the declared template.list topic and exact public command set', () => {
  assert.deepEqual(assertPublicCliHelpSurface(help, definitions), {
    commands: ['auth', 'check', 'template'], topics: ['template'],
  });
});

test('rejects an undeclared topic, nested topic or public command', () => {
  for (const injected of [
    help.replace('  template  ', '  ninth  Injected topic\n  template  '),
    help.replace('  template  ', '  template:ninth  Nested topic\n  template  '),
    help + '  ninth  Injected command\n',
    help + '  template:ninth  Injected nested command\n',
  ]) assert.throws(() => assertPublicCliHelpSurface(injected, definitions));
});

test('rejects missing, repeated or incorrectly owned public entries', () => {
  for (const mutated of [
    help.replace('  template  List templates\n', ''),
    help.replace('  check  Check application\n', ''),
    help + '  auth  Duplicate command\n',
    help + '  template  Duplicate command/topic\n',
    help.replace('COMMANDS\n', 'TOPICS\n'),
  ]) assert.throws(() => assertPublicCliHelpSurface(mutated, definitions));
  assert.throws(() => assertPublicCliHelpSurface(help, definitions.map(command =>
    command.id === 'template' ? { ...command, operation: 'unrelated.operation' } : command)));
});

test('flat command definitions still reject a topic section', () => {
  const flat = definitions.filter(command => command.id !== 'template');
  assert.throws(() => assertPublicCliHelpSurface(help, flat));
  assert.doesNotThrow(() => assertPublicCliHelpSurface(help.replace('TOPICS\n  template  List templates\n\n', ''), flat));
});
