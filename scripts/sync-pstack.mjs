import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const clone = process.argv[2]
if (!clone) throw new Error('Usage: node scripts/sync-pstack.mjs <path to a pstack-claude clone>')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendor = join(root, '.claude/vendor/open-pstack')
const source = join(vendor, 'upstream')
const git = (...args) => execFileSync('git', ['-C', clone, ...args], { encoding: 'utf8' }).trim()
const commit = git('rev-parse', 'HEAD')
const tracked = git('ls-files', '-z').split('\0').filter(Boolean).sort()

rmSync(source, { recursive: true, force: true })
const files = {}
for (const path of tracked) {
  const from = join(clone, path)
  if (lstatSync(from).isSymbolicLink()) throw new Error(`Upstream symlink not supported: ${path}`)
  const to = join(source, path)
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  const executable = Boolean(statSync(from).mode & 0o111)
  chmodSync(to, executable ? 0o755 : 0o644)
  files[path] = { sha256: createHash('sha256').update(readFileSync(to)).digest('hex'), executable }
}
const version = readFileSync(join(source, 'VERSION'), 'utf8').trim()
const repository = git('remote', 'get-url', 'origin').replace(/\.git$/, '')
writeFileSync(join(vendor, 'upstream-lock.json'), JSON.stringify({ repository, commit, version, files }, null, 2) + '\n')

const plugin = join(source, 'plugins/pstack')
const pointsIntoVendor = path => lstatSync(path).isSymbolicLink() && resolve(dirname(path), readlinkSync(path)).startsWith(source)
const relink = (dir, targets) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (pointsIntoVendor(path)) rmSync(path)
  }
  for (const target of targets) {
    const path = join(dir, target.name)
    if (lstatSync(path, { throwIfNoEntry: false })) continue
    symlinkSync(relative(dir, target.path), path)
  }
}
const skills = join(root, '.claude/skills')
relink(skills, readdirSync(join(plugin, 'skills')).map(name => ({ name, path: join(plugin, 'skills', name) })))
relink(join(root, '.claude/agents'), ['agents'].flatMap(group =>
  readdirSync(join(plugin, group)).map(name => ({ name, path: join(plugin, group, name) }))))

const review = join(skills, 'thermo-nuclear-code-quality-review/SKILL.md')
writeFileSync(review, readFileSync(join(plugin, 'skills/thermo-nuclear-code-quality-review/SKILL.md'), 'utf8').replace(/^---\n/, '---\ndisable-model-invocation: true\n'))

console.log(`Synced pstack ${version} @ ${commit}: ${tracked.length} files`)
