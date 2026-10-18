// Run after installing the official NeoForge client. No npm dependencies.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

function digest(bytes, algo) { return crypto.createHash(algo).update(bytes).digest('hex') }
function safePath(root, relative) {
    if(!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').includes('..')) throw new Error(`Invalid relative path: ${relative}`)
    return path.join(root, ...relative.split('/'))
}
function exportRuntime(mcRoot, output) {
    if(fs.existsSync(output)) throw new Error(`Output already exists: ${output}. Rename it before retrying.`)
    const profilePath = path.join(mcRoot, 'versions', 'neoforge-21.1.259', 'neoforge-21.1.259.json')
    const profileBytes = fs.readFileSync(profilePath)
    const profile = JSON.parse(profileBytes)
    if(profile.id !== 'neoforge-21.1.259' || profile.inheritsFrom !== '1.21.1') throw new Error('Wrong NeoForge profile')
    const entries = profile.libraries.map(lib => ({name: lib.name, ...lib.downloads.artifact, classpath: true}))
    entries.push(
        {name: 'net.neoforged:neoforge:21.1.259:client', path: 'net/neoforged/neoforge/21.1.259/neoforge-21.1.259-client.jar', classpath: false},
        {name: 'net.neoforged:neoforge:21.1.259:universal', path: 'net/neoforged/neoforge/21.1.259/neoforge-21.1.259-universal.jar', classpath: false},
        {name: 'net.minecraft:client:1.21.1-20240808.144430:srg', path: 'net/minecraft/client/1.21.1-20240808.144430/client-1.21.1-20240808.144430-srg.jar', classpath: false},
        {name: 'net.minecraft:client:1.21.1-20240808.144430:extra', path: 'net/minecraft/client/1.21.1-20240808.144430/client-1.21.1-20240808.144430-extra.jar', classpath: false}
    )
    // Validate every source before creating an output folder.
    for(const entry of entries) {
        const bytes = fs.readFileSync(safePath(path.join(mcRoot, 'libraries'), entry.path))
        if(!bytes.length || (entry.size != null && bytes.length !== entry.size) || (entry.sha1 && digest(bytes, 'sha1') !== entry.sha1)) throw new Error(`Missing/corrupt library: ${entry.path}. Reinstall NeoForge.`)
        entry.size = bytes.length
        entry.MD5 = digest(bytes, 'md5')
        entry.sha1 = digest(bytes, 'sha1')
    }
    fs.mkdirSync(output, {recursive: true})
    for(const entry of entries) {
        const target = safePath(path.join(output, 'libraries'), entry.path)
        fs.mkdirSync(path.dirname(target), {recursive: true})
        fs.copyFileSync(safePath(path.join(mcRoot, 'libraries'), entry.path), target)
    }
    fs.writeFileSync(path.join(output, 'neoforge-21.1.259.json'), profileBytes)
    fs.writeFileSync(path.join(output, 'index.json'), JSON.stringify({profile: profile.id, minecraft: profile.inheritsFrom, libraries: entries}, null, 2))
    return entries.length
}
if(require.main === module) {
    try {
        const mcRoot = process.argv[2] || path.join(process.env.APPDATA || '', '.minecraft')
        const output = path.resolve(process.argv[3] || 'swc-neoforge-runtime')
        console.log(`Exported ${exportRuntime(mcRoot, output)} libraries to ${output}`)
    } catch(error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = {exportRuntime, safePath}
