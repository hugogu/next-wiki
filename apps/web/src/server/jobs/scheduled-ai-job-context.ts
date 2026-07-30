type CatalogueEntry = { name: string; description: string };
type ScheduledSpace = { name: string; slug: string };

export function expandScheduledJobContext(
  taskDescription: string,
  context: { tools: CatalogueEntry[]; skills: CatalogueEntry[]; spaces: ScheduledSpace[] },
) {
  const values = {
    tools:
      context.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n') ||
      '(no tools are enabled)',
    skills:
      context.skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n') ||
      '(no skills selected)',
    scope: [
      'Read access: all spaces that the execution owner may read.',
      'Writable spaces:',
      ...context.spaces.map(
        (space) => `- ${space.name} (${space.slug === 'default' ? 'wiki' : space.slug})`,
      ),
      context.spaces.length === 0
        ? 'No page writes are permitted for this Job'
        : 'Page writes must stay within these spaces',
    ].join('\n'),
  };
  return taskDescription.replace(
    /\{\{\s*(tools|skills|scope)\s*\}\}/gi,
    (_match, key: string) => values[key.toLowerCase() as keyof typeof values],
  );
}
