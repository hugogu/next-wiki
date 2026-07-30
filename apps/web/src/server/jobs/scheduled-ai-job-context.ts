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
      'Allowed spaces:',
      ...context.spaces.map(
        (space) => `- ${space.name} (${space.slug === 'default' ? 'wiki' : space.slug})`,
      ),
      context.spaces.length > 1
        ? 'When calling search_wiki or list_pages, set the space parameter to one of these space names'
        : 'Search and listing are automatically limited to this space',
    ].join('\n'),
  };
  return taskDescription.replace(
    /\{\{\s*(tools|skills|scope)\s*\}\}/gi,
    (_match, key: string) => values[key.toLowerCase() as keyof typeof values],
  );
}
