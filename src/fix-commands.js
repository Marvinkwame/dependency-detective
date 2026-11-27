const VERBS = {
  npm: { add: 'npm install', addDev: 'npm install -D', remove: 'npm uninstall' },
  pnpm: { add: 'pnpm add', addDev: 'pnpm add -D', remove: 'pnpm remove' },
  yarn: { add: 'yarn add', addDev: 'yarn add -D', remove: 'yarn remove' },
  bun: { add: 'bun add', addDev: 'bun add -d', remove: 'bun remove' },
};

/**
 * One command for the group's regular packages, then one command per major
 * upgrade so it can be run (or skipped) on its own. Commands carry no shell
 * comments, so they paste cleanly into cmd.exe as well as POSIX shells; the
 * report flags major upgrades separately.
 */
function groupCommands(verb, entries) {
  const sorted = [...entries].sort((a, b) => a.spec.localeCompare(b.spec));
  const regular = sorted.filter((e) => !e.major).map((e) => e.spec);
  const lines = regular.length > 0 ? [`${verb} ${regular.join(' ')}`] : [];
  for (const e of sorted.filter((e) => e.major)) lines.push(`${verb} ${e.spec}`);
  return lines;
}

/**
 * Ready-to-run commands, in order: missing (production), missing (dev),
 * unused, production vulnerabilities, dev vulnerabilities.
 */
export function buildFixCommands({ packageManager, missing, unused, vulnerabilities }) {
  const verbs = VERBS[packageManager] ?? VERBS.npm;
  const unusedNames = new Set(unused.map((u) => u.name));
  const missingNames = new Set(missing.map((m) => m.name));
  const fixFor = new Map(
    vulnerabilities.filter((v) => v.fixVersion).map((v) => [v.name, v])
  );

  const missingEntry = (m) => {
    const fix = fixFor.get(m.name);
    return fix
      ? { spec: `${m.name}@${fix.fixVersion}`, major: fix.majorUpgrade }
      : { spec: `${m.name}@^${m.installedVersion}`, major: false };
  };
  const vulnEntries = (scope) =>
    vulnerabilities
      .filter((v) => v.scope === scope && v.fixVersion)
      .filter((v) => !unusedNames.has(v.name) && !missingNames.has(v.name))
      .map((v) => ({ spec: `${v.name}@${v.fixVersion}`, major: v.majorUpgrade }));

  return [
    ...groupCommands(verbs.add, missing.filter((m) => m.scope === 'production').map(missingEntry)),
    ...groupCommands(verbs.addDev, missing.filter((m) => m.scope === 'development').map(missingEntry)),
    ...groupCommands(verbs.remove, unused.map((u) => ({ spec: u.name, major: false }))),
    ...groupCommands(verbs.add, vulnEntries('production')),
    ...groupCommands(verbs.addDev, vulnEntries('development')),
  ];
}
