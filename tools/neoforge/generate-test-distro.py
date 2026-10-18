"""Build a separate Helios test distribution from the installed runtime and live pack.
Does not overwrite distribution.json or delete any files. No external packages.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from urllib.parse import quote


def artifact(file, url, relative=None):
    data = file.read_bytes()
    result = {"size": len(data), "MD5": hashlib.md5(data).hexdigest(), "url": url}
    if relative is not None:
        result["path"] = relative
    return result


def generate(root, base):
    runtime = root / "neoforge-runtime"
    old = json.loads((root / "distribution.json").read_text())
    index = json.loads((runtime / "index.json").read_text())
    profile_file = runtime / "neoforge-21.1.259.json"
    profile = json.loads(profile_file.read_text())
    if index["profile"] != "neoforge-21.1.259" or profile["inheritsFrom"] != "1.21.1":
        raise ValueError("Wrong NeoForge runtime")
    source = root / "servers/swc-pack-1.20.1/files"
    if not (source / "mods").is_dir() or not list((source / "mods").glob("*.jar")):
        raise ValueError("No mod jars found in the new pack")
    server = copy.deepcopy(next(s for s in old["servers"] if s["id"] in ("swc-pack-1.20.1", "swc-pack-1.21.1-neoforge-test")))
    server.update(id="swc-pack-1.21.1-neoforge-test", name="SWORLDCRAFT - TEST NeoForge", minecraftVersion="1.21.1", version="0.0.4-test", mainServer=True, autoconnect=False,
                  javaOptions={"supported": "21.x", "suggestedMajor": 21})
    server["name"] = "SWORLDCRAFT - Simple With Friends"
    server["icon"] = base + "/icons/swf_512.png"
    modules = []
    for lib in index["libraries"]:
        rel = lib["path"]
        parts = Path(rel)
        if parts.is_absolute() or ".." in parts.parts:
            raise ValueError("Unsafe library path")
        file = runtime / "libraries" / parts
        a = artifact(file, base + "/neoforge-runtime/libraries/" + quote(rel, safe="/"), rel)
        if a["MD5"] != lib["MD5"]:
            raise ValueError(f"Corrupt runtime transfer: {rel}")
        modules.append({"id": lib["name"], "name": lib["name"], "type": "Library", "classpath": lib["classpath"], "artifact": a})
    # ForgeHosted is Helios' existing hosted-loader container. The manifest identifies NeoForge.
    parent = next(m for m in modules if m["id"] == "cpw.mods:bootstraplauncher:2.0.2")
    modules.remove(parent)
    parent["type"] = "ForgeHosted"
    parent["name"] = "NeoForge 21.1.259 (hosted runtime)"
    parent["subModules"] = [{"id": profile["id"], "name": "NeoForge version manifest", "type": "VersionManifest", "artifact": artifact(profile_file, base + "/neoforge-runtime/" + profile_file.name)}] + modules
    files = []
    for folder in ("mods", "config", "defaultconfigs", "resourcepacks", "shaderpacks", "kubejs", "scripts", "defaultoptions", "openloader", "paxi", "customnpcs", "data"):
        for file in sorted((source / folder).rglob("*")):
            if not file.is_file():
                continue
            if file.is_symlink():
                raise ValueError(f"Symlink in pack: {file}")
            rel = file.relative_to(source).as_posix()
            files.append({"id": "swc-file:" + hashlib.sha256(rel.encode()).hexdigest(), "name": rel, "type": "File", "artifact": artifact(file, base + "/servers/swc-pack-1.20.1/files/" + quote(rel, safe="/"), rel)})
    # Fresh instance id prevents mixing old Fabric mods with the new NeoForge mods.
    server["modules"] = [parent] + files
    old["servers"] = [server]
    if "<FILL IN" in json.dumps(old.get("discord", {})):
        old.pop("discord", None)
    output = root / "distribution-neoforge-test.json"
    output.write_text(json.dumps(old, indent=2) + "\n")
    return output, len(files)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/var/www/distribution"))
    parser.add_argument("--base-url", default="https://distribution.sworldcraft.com")
    args = parser.parse_args()
    output, count = generate(args.root, args.base_url.rstrip("/"))
    print(f"Generated {output}: {count} pack files. Production distribution.json unchanged.")
