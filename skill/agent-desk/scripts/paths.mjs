// Where the desk keeps things in a repository. The skill itself (its steps, scripts and templates)
// sits in each tool's skills folder; commands and prompts name the .agents/skills copy, which every
// tool can read as a plain file. Each project keeps its own files in a folder of its own, so several
// projects share a branch and a finished one is never in the next one's way. Imports nothing.
export const SKILL_NAME = "agent-desk";
export const SKILL_HOME = `.agents/skills/${SKILL_NAME}`;
export const REPO_SKILL_HOMES = [".agents/skills", ".claude/skills"];
export const USER_SKILL_HOMES = [".claude/skills", ".agents/skills", ".gemini/config/skills"];
export const DESK_CMD = `node ${SKILL_HOME}/scripts/desk.mjs`;
export const DESK_ROOT = "agents/desk";
export const projectDir = (project) => `${DESK_ROOT}/${project}`;
export const configPath = (project) => `${projectDir(project)}/desk.json`;
export const boardPath = (project) => `${projectDir(project)}/board.md`;
export const assignmentsDir = (project) => `${projectDir(project)}/assignments`;
export const queueDir = (project) => `${projectDir(project)}/queue`;
export const statusDir = (project) => `${projectDir(project)}/status`;
export const progressPath = (project) => `${projectDir(project)}/progress.json`;
