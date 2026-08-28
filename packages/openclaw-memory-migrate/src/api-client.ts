import type { MigrateConfig } from './config';
import { credentialValue } from './config';

export class MigrationApiClient {
  private readonly baseUrl: string;
  constructor(private readonly config: MigrateConfig) {
    this.baseUrl = config.wikiApiBaseUrl.replace(/\/+$/u, '');
  }
  async save(input: { idempotencyKey: string; content: string; title: string; origin: 'import'; role: 'evidence' }): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/records`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentialValue(this.config.credential)}`,
        'Content-Type': 'application/json',
        'x-next-wiki-memory-provider-version': '2',
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error('import_remote_write_failed');
    return response.json();
  }
}
