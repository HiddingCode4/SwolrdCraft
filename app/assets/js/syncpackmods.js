const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Called after Helios has verified and downloaded the current distribution.
module.exports = function syncPackMods(gameDir, modules) {
    const expected = new Map()
    function visit(items) {
        for(const m of items || []) {
            const a = m.artifact
            if(m.type === 'File' && a && typeof a.path === 'string') {
                const rel = a.path.replace(/\\/g, '/')
                if(rel.startsWith('mods/') && rel.toLowerCase().endsWith('.jar')) {
                    if(rel.split('/').some(x => x === '..' || x === '.' || !x)) throw new Error('Invalid mod path: ' + rel)
                    expected.set(rel, a.MD5)
                }
            }
            visit(m.subModules)
        }
    }
    visit(modules)
    if(!expected.size) throw new Error('Pack contains no managed mods; synchronization cancelled.')
    // Validate every expected jar before moving any obsolete jar.
    for(const [rel, md5] of expected) {
        const file = path.join(gameDir, rel)
        if(!md5 || crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex') !== md5.toLowerCase()) {
            throw new Error('Mod missing or corrupt: ' + rel + '. Relaunch to repair files.')
        }
    }
    const backup = path.join(gameDir, 'removed-mods', crypto.randomUUID())
    function scan(dir) {
        if(!fs.existsSync(dir)) return
        for(const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            if(entry.isSymbolicLink()) throw new Error('Symbolic link in mods directory: ' + entry.name)
            const file = path.join(dir, entry.name)
            if(entry.isDirectory()) scan(file)
            else if(entry.isFile() && entry.name.toLowerCase().endsWith('.jar')) {
                const rel = path.relative(gameDir, file).split(path.sep).join('/')
                if(!expected.has(rel)) {
                    const dest = path.join(backup, path.relative(path.join(gameDir, 'mods'), file))
                    fs.mkdirSync(path.dirname(dest), {recursive: true})
                    fs.renameSync(file, dest)
                    console.info('[Pack sync] Removed from active mods:', rel)
                }
            }
        }
    }
    scan(path.join(gameDir, 'mods'))
}
