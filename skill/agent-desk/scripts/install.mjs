#!/usr/bin/env node
// Makes the agent desk skill available, and nothing else: it copies this skill's own folder to where
// a tool looks for skills. It names no project, writes no desk and reads no network; the copy it makes
// is the folder it runs from, whole.
//
//   node <skill>/scripts/install.mjs --target <repository>   into that repository's .agents/skills/ (Codex,
//                                                             Antigravity) and .claude/skills/ (Claude Code):
//                                                             what a cloud session needs, as nothing on its
//                                                             machine lasts
//   node <skill>/scripts/install.mjs --for-me [--home <dir>] into ~/.claude/skills, ~/.agents/skills and
//                                                             ~/.gemini/config/skills, for the apps on a computer
//   node <skill>/scripts/install.mjs --pack [--out <file>]   one zip of the folder (agent-desk.zip), to upload
//                                                             where a tool takes skills that way
//   node <skill>/scripts/install.mjs --check --target <repository>   lists every file that differs; changes nothing
//
// A project is set up afterwards, by the skill's setup (desk.mjs setup --project <name>).
// Exit 0: done. 1: --check found a difference. 2: it couldn't run (said why).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { SKILL_NAME, SKILL_HOME, REPO_SKILL_HOMES, USER_SKILL_HOMES } from "./paths.mjs";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Every file of the skill, relative to its folder, in order.
const files = (dir = SKILL, base = "") => readdirSync(join(dir, base), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)
  .flatMap((e) => e.isDirectory() ? files(dir, join(base, e.name)) : [join(base, e.name)]);

function args(argv) {
  const o = { target: "", check: false, forMe: false, pack: false, out: "", home: homedir() };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--target") o.target = resolve(argv[++i] || ".");
    else if (v === "--check") o.check = true;
    else if (v === "--for-me") o.forMe = true;
    else if (v === "--pack") o.pack = true;
    else if (v === "--out") o.out = resolve(argv[++i] || "");
    else if (v === "--home") o.home = resolve(argv[++i] || ".");
    else if (v === "--project" || v === "--title" || v === "--repo" || v === "--work-branch") throw new Error(`${v} isn't the installer's: install only makes the skill available. A project is named at setup (node ${SKILL_HOME}/scripts/desk.mjs setup --project <name>)`);
    else throw new Error(`unknown option ${v}`);
  }
  return o;
}

// The folder copied whole into each home, and any file there the skill no longer has taken away.
function copyInto(root, homes) {
  const mine = files();
  for (const home of homes) {
    const dest = join(root, home, SKILL_NAME);
    if (resolve(dest) === SKILL) continue;
    for (const f of mine) { mkdirSync(dirname(join(dest, f)), { recursive: true }); writeFileSync(join(dest, f), readFileSync(join(SKILL, f))); }
    for (const f of files(dest)) if (!mine.includes(f)) rmSync(join(dest, f));
  }
  return mine.length;
}

function check(dir) {
  const mine = files();
  const drift = [];
  for (const home of REPO_SKILL_HOMES) {
    const dest = join(dir, home, SKILL_NAME);
    if (!existsSync(dest)) { drift.push(`${home}/${SKILL_NAME}/ (missing)`); continue; }
    for (const f of mine) if (!existsSync(join(dest, f)) || !readFileSync(join(dest, f)).equals(readFileSync(join(SKILL, f)))) drift.push(`${home}/${SKILL_NAME}/${f}`);
    for (const f of files(dest)) if (!mine.includes(f)) drift.push(`${home}/${SKILL_NAME}/${f} (not the skill's)`);
  }
  if (!drift.length) { console.log("Every file of the skill matches this copy."); return 0; }
  console.log(`These differ from this copy of the skill (install again to update them):\n  ${drift.join("\n  ")}`);
  return 1;
}

// A zip of the folder, made here: stored paths start agent-desk/, each file deflated.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name), body = deflateRawSync(data), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x0800, 8); head.writeUInt16LE(8, 10); head.writeUInt16LE(0, 12); head.writeUInt16LE(0x21, 14);
    head.writeUInt32LE(crc, 16); head.writeUInt32LE(body.length, 20); head.writeUInt32LE(data.length, 24); head.writeUInt16LE(nameBuf.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, body); central.push(head, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

function main(argv) {
  const o = args(argv);
  if (o.pack) {
    const out = o.out || resolve(`${SKILL_NAME}.zip`);
    writeFileSync(out, zip(files().map((f) => [`${SKILL_NAME}/${f.split("\\").join("/")}`, readFileSync(join(SKILL, f))])));
    console.log(`The skill is packed in ${out}: upload it where a tool takes a skill as a zip, or unzip it into a skills folder.`);
    return 0;
  }
  if (o.forMe) {
    const n = copyInto(o.home, USER_SKILL_HOMES);
    console.log(`The agent desk skill (${n} files) is in ${USER_SKILL_HOMES.map((b) => join(o.home, b, SKILL_NAME)).join(", ")}.`);
    console.log("Every project on this computer now has /agent-desk ($agent-desk in Codex). A cloud session reads skills from the repository, so a repository worked on in the cloud needs it too: /agent-desk install into that repository.");
    return 0;
  }
  if (!o.target) { console.error("install: say where: --target <repository>, --for-me, or --pack"); return 2; }
  if (o.check) return check(o.target);
  const n = copyInto(o.target, REPO_SKILL_HOMES);
  const version = readFileSync(join(SKILL, "VERSION"), "utf8").trim();
  console.log(`The agent desk skill ${version} (${n} files) is in ${REPO_SKILL_HOMES.map((h) => `${h}/${SKILL_NAME}/`).join(" and ")} of ${o.target}.`);
  for (const home of REPO_SKILL_HOMES) {
    const r = spawnSync("git", ["check-ignore", "-q", `${home}/${SKILL_NAME}/SKILL.md`], { cwd: o.target });
    if (r.status === 0) console.log(`Warning: .gitignore leaves ${home}/ out, so a tool cloning this repository won't find the skill. Add the line  !${home}/  after the rule that ignores it.`);
  }
  console.log("Next: commit and push those two folders to the branch you work on (never the default branch directly, if the repository's rules say so). Nothing of any project was written: /agent-desk setup does that, and asks the project's name.");
  return 0;
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (err) { console.error("install:", err.message); process.exitCode = 2; }
