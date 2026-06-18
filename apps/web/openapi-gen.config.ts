import { defineConfig } from 'next-openapi-gen';

export default defineConfig({
  openapi: '3.1.0',
  info: {
    title: 'Next Wiki API',
    version: '1.0.0',
    description: 'OpenAPI specification for the Next Wiki REST API.',
  },
  servers: [
    {
      url: '/api',
      description: 'Current host',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API key',
      },
    },
  },
  schemaType: 'zod',
  schemaDir: './src',
  apiDir: './app/api',
  outputDir: './public',
  outputFile: 'openapi.json',
  docsUrl: 'api-docs',
  ui: 'none',
  includeOpenApiRoutes: false,
  diagnostics: {
    enabled: true,
  },
});
