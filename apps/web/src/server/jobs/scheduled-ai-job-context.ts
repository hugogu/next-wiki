type CatalogueEntry = { name: string; description: string };

export function expandScheduledJobContext(
  taskDescription: string,
  context: { tools: CatalogueEntry[]; skills: CatalogueEntry[]; spaceIds: string[] },
) {
  const values = {
    tools: context.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n') || '(no tools are enabled)',
    skills: context.skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n') || '(no skills selected)',
    scope: `Allowed spaces: ${context.spaceIds.join(', ')}`,
  };
  return taskDescription.replace(/\{\{\s*(tools|skills|scope)\s*\}\}/gi, (_match, key: string) => values[key.toLowerCase() as keyof typeof values]);
}
