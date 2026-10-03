/**
 * Sample TypeScript API client generator using the OpenAPI spec.
 *
 * Reads tools/openapi.json, produces a typed TypeScript client
 * that can be used in any Node.js or browser project.
 *
 * Usage:  node tools/gen-ts-client.js
 * Output: tools/api-client.ts
 */
const fs = require('fs');
const path = require('path');

const SPEC = path.join(__dirname, 'openapi.json');
const OUTPUT = path.join(__dirname, 'api-client.ts');

function pascalCase(s) {
  return s.replace(/[-_/]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (m) => m.toUpperCase())
    .replace(/[{}]/g, '');
}

function main() {
  const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
  const lines = [];
  lines.push('/**');
  lines.push(' * EquipCare AI TypeScript API client (auto-generated from OpenAPI spec).');
  lines.push(' * Regenerate: node tools/gen-ts-client.js');
  lines.push(' */');
  lines.push('');

  // Generate types from schemas
  lines.push('// ============== Type definitions ==============');
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    const tsName = name.endsWith('Dto') ? name : name;
    lines.push(`export interface ${tsName} {`);
    for (const [prop, pSchema] of Object.entries(schema.properties || {})) {
      let type = 'any';
      if (pSchema.$ref) type = pSchema.$ref.split('/').pop();
      else if (pSchema.enum) type = pSchema.enum.map((v) => `'${v}'`).join(' | ');
      else if (pSchema.type === 'string') type = 'string';
      else if (pSchema.type === 'number' || pSchema.type === 'integer') type = 'number';
      else if (pSchema.type === 'boolean') type = 'boolean';
      else if (pSchema.type === 'array') type = 'any[]';
      else if (pSchema.type === 'object') type = 'Record<string, any>';
      const optional = (schema.required || []).includes(prop) ? '' : '?';
      lines.push(`  ${prop}${optional}: ${type};`);
    }
    lines.push('}');
    lines.push('');
  }

  // Generate client
  lines.push('// ============== API Client ==============');
  lines.push('export interface ClientConfig {');
  lines.push('  baseUrl: string;');
  lines.push('  token?: string;');
  lines.push('}');
  lines.push('');
  lines.push('export class ApiClient {');
  lines.push('  constructor(private config: ClientConfig) {}');
  lines.push('');
  lines.push('  private async request<T>(method: string, path: string, body?: any, query?: Record<string, any>): Promise<T> {');
  lines.push('    let url = this.config.baseUrl + path;');
  lines.push('    if (query) {');
  lines.push('      const qs = Object.entries(query).filter(([_, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join(\'&\');');
  lines.push('      if (qs) url += \'?\' + qs;');
  lines.push('    }');
  lines.push('    const headers: Record<string, string> = { \'Content-Type\': \'application/json\' };');
  lines.push('    if (this.config.token) headers[\'Authorization\'] = `Bearer ${this.config.token}`;');
  lines.push('    const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });');
  lines.push('    if (!resp.ok) {');
  lines.push('      const err = await resp.text();');
  lines.push('      throw new Error(`${method} ${path} -> ${resp.status}: ${err}`);');
  lines.push('    }');
  lines.push('    const ct = resp.headers.get(\'content-type\') || \'\';');
  lines.push('    return ct.includes(\'json\') ? resp.json() : (resp.text() as any);');
  lines.push('  }');
  lines.push('');

  // Generate one method per path
  for (const [urlPath, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const opId = op.operationId || `${method}_${urlPath}`;
      const methodName = opId
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase();
      // Detect path params
      const pathParams = (op.parameters || [])
        .filter((p) => p.in === 'path')
        .map((p) => p.name);
      // Build signature
      const args = [];
      if (pathParams.length) {
        args.push(`pathParams: { ${pathParams.map((p) => `${p}: string`).join('; ')} }`);
      }
      if (op.requestBody) {
        const ref = op.requestBody.content['application/json'].schema.$ref;
        if (ref) args.push(`body: ${ref.split('/').pop()}`);
      }
      if ((op.parameters || []).some((p) => p.in === 'query')) {
        args.push('query?: Record<string, any>');
      }
      // Build URL with substitution
      let urlCall = `'${urlPath}'`;
      for (const p of pathParams) {
        urlCall = urlCall.replace(`{${p}}`, `\${pathParams.${p}}`);
      }
      urlCall = urlCall.replace(/'/g, '') + '';
      const returnType = 'any';
      lines.push(`  async ${methodName}(${args.join(', ')}): Promise<${returnType}> {`);
      lines.push(`    return this.request('${method.toUpperCase()}', \`${urlPath.replace(/\{(\w+)\}/g, '${pathParams.$1}')}\`, ${op.requestBody ? 'body' : 'undefined'}, ${op.parameters && op.parameters.some((p) => p.in === 'query') ? 'query' : 'undefined'});`);
      lines.push('  }');
      lines.push('');
    }
  }

  lines.push('}');
  lines.push('');

  fs.writeFileSync(OUTPUT, lines.join('\n'));
  console.error(`Generated TypeScript client: ${OUTPUT}`);
  console.error(`  - ${Object.keys(spec.components.schemas).length} types`);
  console.error(`  - ${Object.values(spec.paths).reduce((sum, methods) => sum + Object.keys(methods).length, 0)} methods`);
}

main();