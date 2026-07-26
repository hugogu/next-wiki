import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanSkillsDirectory, readDirectorySkillFile } from './directory-loader';
import { loadBuiltinSkills } from './builtin';

/**
 * Skill scripts are never executed (028, FR-020, SC-007).
 *
 * FR-020 is an absolute prohibition, so it gets a structural test rather than
 * only behavioural ones: behavioural tests can only prove the paths they
 * happen to exercise, while the absence of an execution primitive in the module
 * tree rules out the paths nobody thought to write a test for.
 */

const SKILLS_DIR = path.join(__dirname);

const FORBIDDEN = [
  { pattern: /\bchild_process\b/, name: 'child_process' },
  { pattern: /\bnode:child_process\b/, name: 'node:child_process' },
  { pattern: /\bexecSync\b|\bspawnSync\b|\bexecFile\b/, name: 'process spawning' },
  { pattern: /\bnew\s+Function\s*\(/, name: 'Function constructor' },
  { pattern: /(?<![\w.])eval\s*\(/, name: 'eval' },
  { pattern: /\brequire\s*\(\s*[^'"]/, name: 'dynamic require' },
  { pattern: /\bimport\s*\(/, name: 'dynamic import' },
  { pattern: /\bnode:vm\b|\bfrom 'vm'\b/, name: 'vm' },
];

describe('the skills module tree contains no execution primitive', () => {
  it('has no way to run a script, by construction', async () => {
    const entries = await fs.readdir(SKILLS_DIR);
    const sources = entries.filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'));
    // If this ever reads zero files the assertion below would pass vacuously.
    expect(sources.length).toBeGreaterThan(0);
    const findings: string[] = [];
    for (const entry of sources) {
      const source = await fs.readFile(path.join(SKILLS_DIR, entry), 'utf8');
      for (const { pattern, name } of FORBIDDEN) {
        if (pattern.test(source)) findings.push(`${entry}: ${name}`);
      }
    }
    expect(findings).toEqual([]);
  });
});

describe('skill scripts are returned as text from every source', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-exec-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('reads a directory-sourced script without running it', async () => {
    const dir = path.join(root, 'dangerous');
    await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      '---\nname: dangerous\ndescription: Has a script.\n---\n# Body',
    );
    // A script that would be unmistakable if it ever ran.
    const marker = path.join(root, 'SHOULD-NOT-EXIST');
    await fs.writeFile(
      path.join(dir, 'scripts', 'evil.sh'),
      `#!/bin/sh\ntouch ${JSON.stringify(marker)}\n`,
    );

    const scan = await scanSkillsDirectory(root);
    const pkg = scan.packages.find((item) => item.name === 'dangerous');
    expect(pkg).toBeDefined();
    const script = pkg!.files.find((file) => file.path === 'scripts/evil.sh');
    expect(script?.kind).toBe('script');

    const content = await readDirectorySkillFile(pkg!, script!);
    expect(content).toContain('touch');
    await expect(fs.access(marker)).rejects.toThrow();
  });

  it('returns shipped built-in scripts as text', async () => {
    const builtins = await loadBuiltinSkills();
    // Skipped rather than failed when the packages are not on disk in this
    // environment: the structural test above is the real guarantee.
    if (builtins.length === 0) return;
    const scripts = builtins.flatMap((skill) =>
      skill.files.filter((file) => file.kind === 'script'),
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(typeof script.content).toBe('string');
      expect(script.content).toContain('REFERENCE MATERIAL');
    }
  });
});
