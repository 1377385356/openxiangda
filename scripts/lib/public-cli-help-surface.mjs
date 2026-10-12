import assert from 'node:assert/strict';

function sectionRows(help, heading) {
  const headings = [...help.matchAll(new RegExp(`^${heading}$`, 'gm'))];
  assert(headings.length <= 1, `Duplicate ${heading} section`);
  if (!headings.length) return [];
  const rest = help.slice(headings[0].index + heading.length).replace(/^\r?\n/, '');
  const nextHeading = rest.search(/^[A-Z][A-Z ]*$/m);
  const section = nextHeading < 0 ? rest : rest.slice(0, nextHeading);
  return [...section.matchAll(/^  (\S+)\s{2,}/gm)].map(match => match[1]);
}

export function assertPublicCliHelpSurface(help, definitions) {
  const expectedCommands = definitions.map(command => command.id).sort();
  assert.equal(new Set(expectedCommands).size, expectedCommands.length, 'Duplicate public command definition');
  const expectedTopics = definitions
    .filter(command => command.id === 'template' && command.operation === 'template.list')
    .map(command => command.id);
  const topics = sectionRows(help, 'TOPICS');
  const commands = sectionRows(help, 'COMMANDS');
  assert.deepEqual(topics.sort(), expectedTopics.sort(), 'CLI topics must match the declared template.list owner');
  const actual = [...topics, ...commands].sort();
  assert.deepEqual(actual, expectedCommands, 'CLI help must expose exactly the declared public commands');
  return { commands: actual, topics };
}
