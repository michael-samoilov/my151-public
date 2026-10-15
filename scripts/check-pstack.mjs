import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendor = join(root, '.claude/vendor/open-pstack')
const source = join(vendor, 'upstream')
const lock = JSON.parse(readFileSync(join(vendor, 'upstream-lock.json'), 'utf8'))
const files = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true })
  .filter(entry => entry.name !== 'node_modules')
  .flatMap(entry => entry.isDirectory()
    ? files(join(dir, entry.name), prefix + entry.name + '/')
    : [prefix + entry.name]).sort()

assert.deepEqual(files(source), Object.keys(lock.files).sort(), 'Upstream file inventory drift')
for (const [path, expected] of Object.entries(lock.files)) {
  const target = join(source, path)
  assert.equal(createHash('sha256').update(readFileSync(target)).digest('hex'), expected.sha256, `Upstream content drift: ${path}`)
  assert.equal(Boolean(lstatSync(target).mode & 0o111), expected.executable, `Upstream executable drift: ${path}`)
}
const plugin = join(source, 'plugins/pstack')
for (const skill of readdirSync(join(plugin, 'skills'))) {
  const local = join(root, '.claude/skills', skill)
  const upstream = join(plugin, 'skills', skill)
  if (skill === 'thermo-nuclear-code-quality-review') {
    assert.equal(readFileSync(join(local, 'SKILL.md'), 'utf8'), readFileSync(join(upstream, 'SKILL.md'), 'utf8').replace(/^---\n/, '---\ndisable-model-invocation: true\n'))
  } else {
    assert.equal(realpathSync(local), upstream, `Skill discovery drift: ${skill}`)
  }
}
for (const group of ['agents', 'effort-agents']) {
  for (const name of readdirSync(join(plugin, group))) {
    assert.equal(realpathSync(join(root, '.claude/agents', name)), join(plugin, group, name))
  }
}
assert.equal(realpathSync(join(root, '.agents/skills')), join(root, '.claude/skills'))
assert.equal(readdirSync(join(root, '.claude/agents')).filter(name => /^pstack-(fable|opus)-/.test(name)).length, 0, 'Obsolete model agents remain')
const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'))
const commands = settings.hooks.SessionStart.flatMap(entry => entry.hooks.map(hook => hook.command))
assert(commands.some(command => command.includes('google-style action-first-replies work-report')), 'Project style hook missing')
assert(commands.some(command => command === '$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh'), 'Project environment hook missing')
assert(commands.some(command => command.includes('pstack-session-start.sh')), 'Pstack routing hook missing')
assert(existsSync(join(root, '.claude/skills/verify-my151/harness/verify.ts')), 'Project verification skill missing')
assert.equal(readFileSync(join(source, 'VERSION'), 'utf8').trim(), lock.version)
console.log(`pstack ${lock.version} @ ${lock.commit}: ${Object.keys(lock.files).length} upstream files, all skills, agents, and project integrations verified`)
