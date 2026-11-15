import fs from 'node:fs';
import path from 'node:path';

const SKILLS = '.claude/skills';
const TRIGGER = /types `\/([a-z0-9:-]+)`/g;

const failures = [];
for (const entry of fs.readdirSync(SKILLS, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(SKILLS, entry.name, 'SKILL.md');
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const name = /^name:\s*(\S+)/m.exec(text)?.[1] ?? entry.name;
  text.split('\n').forEach((line, index) => {
    for (const [, command] of line.matchAll(TRIGGER)) {
      if (command !== name) failures.push(`${file}:${index + 1} claims \`/${command}\`, but the skill is named \`${name}\`.`);
    }
  });
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  console.error(
    'A skill may claim only its own slash command. A claim on another name captures that command, '
      + 'including a Claude Code built-in such as `/doctor`. Rename the trigger to `/<skill name>`.',
  );
  process.exit(1);
}
console.log('Skill triggers name their own skill.');
