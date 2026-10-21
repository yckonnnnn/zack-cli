#!/usr/bin/env node

import path from "node:path";
import os from "node:os";
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

const DEFAULT_API = "https://zackui.com";
const SKILLS = new Set(["zack-ui-pro", "zack-post-cards"]);

function parseArgs(argv) {
  const options = {
    command: argv.shift() || "help",
    skill: null,
    license: null,
    api: process.env.ZACK_API || DEFAULT_API,
    to: process.env.ZACK_SKILLS_DIR || null,
    json: false,
  };

  if (["install", "update"].includes(options.command)) {
    if (argv[0] && !argv[0].startsWith("-")) options.skill = argv.shift();
  }

  while (argv.length) {
    const arg = argv.shift();
    if (arg === "--json") options.json = true;
    else if (arg === "--license") options.license = argv.shift() || null;
    else if (arg === "--api") options.api = argv.shift() || null;
    else if (arg === "--to") options.to = argv.shift() || null;
    else if (arg === "--help" || arg === "-h") options.command = "help";
    else throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function print(options, payload, lines) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, ...payload })}\n`);
    return;
  }
  process.stdout.write(`${lines.filter(Boolean).join("\n")}\n`);
}

function fail(options, message, code = 1) {
  if (options?.json) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exit(code);
}

function defaultSkillsRoot() {
  if (process.env.CODEX_HOME) return path.join(process.env.CODEX_HOME, "skills");
  return path.join(os.homedir(), ".agents", "skills");
}

function safeRelative(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (!normalized || normalized.startsWith("/") || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe file path: ${filePath}`);
  }
  return normalized;
}

async function install(options) {
  if (!options.license) fail(options, "Missing --license. Use the link generated after purchase.", 2);
  if (!options.skill || !SKILLS.has(options.skill)) fail(options, `Unknown skill: ${options.skill || "(missing)"}`, 2);

  const api = String(options.api || DEFAULT_API).replace(/\/+$/, "");
  const response = await fetch(`${api}/api/skill/${encodeURIComponent(options.license)}?skill=${encodeURIComponent(options.skill)}`, {
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    fail(options, data?.error === "license_not_found" ? "This purchase link is not valid." : "Could not read the purchase.", 3);
  }
  if (data.skill !== options.skill || !Array.isArray(data.files) || !data.files.length) {
    fail(options, "The purchase response is incomplete.", 1);
  }

  const root = options.to ? path.resolve(options.to) : defaultSkillsRoot();
  const target = path.basename(root) === data.skill ? root : path.join(root, data.skill);
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true });

  const stage = await mkdtemp(path.join(parent, `.zack-stage-${Date.now()}-`));
  let movedExisting = false;
  const backup = path.join(parent, `.${data.skill}.backup-${Date.now()}`);

  try {
    for (const file of data.files) {
      const relative = safeRelative(file.path);
      const destination = path.join(stage, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      const content = file.encoding === "base64"
        ? Buffer.from(file.content || "", "base64")
        : Buffer.from(file.content || "", "utf8");
      await writeFile(destination, content, relative.endsWith(".sh") ? { mode: 0o755 } : undefined);
    }

    try {
      await rename(target, backup);
      movedExisting = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    try {
      await rename(stage, target);
    } catch (error) {
      if (movedExisting) await rename(backup, target);
      throw error;
    }

    if (movedExisting) await rm(backup, { recursive: true, force: true });

    print(options, {
      skill: data.skill,
      version: data.version,
      buyer: data.buyer,
      order: data.order,
      path: target,
      files: data.files.length,
    }, [
      `${data.skill} installed`,
      `Buyer: ${data.displayName || data.buyer} (${data.buyer})`,
      `Order: ${data.order}`,
      `Version: ${data.version}`,
      `Path: ${target}`,
      `Files: ${data.files.length}`,
      "",
      "Run the same command again to update.",
    ]);
  } catch (error) {
    await rm(stage, { recursive: true, force: true }).catch(() => {});
    if (movedExisting) await rename(backup, target).catch(() => {});
    throw error;
  }
}

function help() {
  process.stdout.write([
    "Zack UI installer",
    "",
    "Install:",
    "  npx --yes github:yckonnnnn/zack-cli install zack-ui-pro --license <code>",
    "  npx --yes github:yckonnnnn/zack-cli install zack-post-cards --license <code>",
    "",
    "Optional:",
    "  --to <skills-root>   Install into a specific skills directory",
    "  --api <url>          Override the Zack UI server",
    "  --json               Return machine-readable output",
    "",
    "No ZIP is created. Files are written directly into the agent skills folder.",
  ].join("\n") + "\n");
}

const options = parseArgs(process.argv.slice(2));
if (options.command === "help") help();
else if (["install", "update"].includes(options.command)) {
  install(options).catch((error) => fail(options, error.message || "Install failed."));
} else {
  fail(options, `Unknown command: ${options.command}`, 2);
}
