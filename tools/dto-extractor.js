/**
 * OpenAPI Spec Extractor for NestJS DTOs
 *
 * Walk through all DTO files, parse class-validator decorators, output
 * a JSON Schema + sample payload for each DTO. Used to:
 *  - Generate typed API clients
 *  - Generate test fixtures (PowerShell sample bodies)
 *  - Keep tests in sync with backend DTOs
 *
 * Usage: node tools/dto-extractor.js > tools/dto-schema.json
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const API_DTO_DIR = path.join(REPO_ROOT, 'apps', 'api', 'src', 'modules');

const SCHEMAS = {};
const ENDPOINTS = {};

/**
 * Parse decorators from a class field.
 * Decorator lines look like:
 *   @IsString()
 *   @MaxLength(200)
 *   @IsOptional()
 *   @IsIn(Object.values(SomeEnum))
 *   @IsUUID()
 *   @IsNumber()
 *   @Min(0)
 *   fieldName!: string;
 *   fieldName?: string;
 */
function parseClassBody(classBody) {
  const fields = {};
  // Match field block: decorators + field declaration
  // Decorators are above the field. We collect consecutive @decorators.
  const lines = classBody.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    // Skip non-decorator lines
    if (!line.startsWith('@')) {
      i++;
      continue;
    }
    // Collect decorator block
    const decorators = [];
    while (i < lines.length && lines[i].trim().startsWith('@')) {
      decorators.push(lines[i].trim());
      i++;
    }
    // Next line(s) should be field declaration
    while (i < lines.length) {
      const fieldLine = lines[i].trim();
      if (!fieldLine || fieldLine.startsWith('//') || fieldLine.startsWith('*')) {
        i++;
        continue;
      }
      // Field declaration: "name!: string;" or "name?: string;"
      const fieldMatch = fieldLine.match(/^(\w+)(\!|\?)?\s*:\s*(.+?);?\s*$/);
      if (fieldMatch) {
        const [, name, optional, type] = fieldMatch;
        if (!['get', 'set', 'constructor'].includes(name)) {
          fields[name] = buildFieldSchema(decorators, type, !!optional);
        }
        i++;
        break;
      }
      i++;
    }
  }
  return fields;
}

function buildFieldSchema(decorators, type, isOptional) {
  const schema = {};
  // Default to type
  if (type.includes('string')) schema.type = 'string';
  else if (type.includes('number') || type.includes('integer')) schema.type = 'number';
  else if (type.includes('boolean')) schema.type = 'boolean';
  else if (type.includes('Date') || type.includes('date')) schema.type = 'string';
  else if (type.includes('[]') || type.includes('Array')) schema.type = 'array';
  else if (type.includes('unknown')) schema.type = 'object';
  else schema.type = 'string';

  for (const d of decorators) {
    if (d.startsWith('@IsOptional')) {
      isOptional = true;
    } else if (d.startsWith('@IsUUID')) {
      schema.format = 'uuid';
    } else if (d.startsWith('@IsEmail')) {
      schema.format = 'email';
    } else if (d.startsWith('@IsDateString')) {
      schema.format = 'date';
    } else if (d.startsWith('@MaxLength(')) {
      const m = d.match(/MaxLength\((\d+)\)/);
      if (m) schema.maxLength = parseInt(m[1]);
    } else if (d.startsWith('@MinLength(')) {
      const m = d.match(/MinLength\((\d+)\)/);
      if (m) schema.minLength = parseInt(m[1]);
    } else if (d.startsWith('@Min(')) {
      const m = d.match(/Min\(([\d.]+)\)/);
      if (m) schema.minimum = parseFloat(m[1]);
    } else if (d.startsWith('@Max(')) {
      const m = d.match(/Max\(([\d.]+)\)/);
      if (m) schema.maximum = parseFloat(m[1]);
    } else if (d.startsWith('@IsIn(')) {
      // Try to extract enum values
      const m = d.match(/IsIn\(([^)]+)\)/);
      if (m && m[1].includes('Object.values')) {
        // Use placeholder — values are extracted from shared enums
        schema.enum = '__EXTRACT_FROM_SHARED__';
      } else if (m) {
        const vals = m[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
        schema.enum = vals;
      }
    }
  }
  if (isOptional) schema.optional = true;
  return schema;
}

/**
 * Walk a DTO file and extract all exported classes.
 */
function extractFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const out = {};
  // Match: export class ClassName { ... }
  const classRegex = /export\s+class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1];
    const body = match[2];
    // Skip if body is just a getter/setter
    if (body.includes('get ') || body.includes('set ')) continue;
    out[className] = parseClassBody(body);
  }
  return out;
}

/**
 * Walk API module tree
 */
function walkModules() {
  const result = {};
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          walk(full);
        }
      } else if (entry.name.endsWith('.dto.ts')) {
        const relative = path.relative(API_DTO_DIR, full);
        const data = extractFromFile(full);
        result[relative] = data;
      }
    }
  }
  walk(API_DTO_DIR);
  return result;
}

/**
 * Walk controller files to extract endpoint info (path, method, body type).
 */
function extractEndpoints() {
  const result = [];
  const controllerDir = path.join(API_DTO_DIR);
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'dto') {
          walk(full);
        }
      } else if (entry.name.endsWith('.controller.ts')) {
        const content = fs.readFileSync(full, 'utf8');
        const moduleName = path.basename(path.dirname(full));
        // Find @Controller prefix
        const ctrlMatch = content.match(/@Controller\(['"]?([^'")]+)['"]?\)/);
        const ctrlPrefix = ctrlMatch ? ctrlMatch[1] : '';
        // Find @Get/@Post/@Patch/@Put/@Delete with optional path
        const routeRegex = /@(Get|Post|Patch|Put|Delete)\((['"]?)([^'")]*)\2\)/g;
        let m;
        while ((m = routeRegex.exec(content)) !== null) {
          const method = m[1].toUpperCase();
          const subPath = m[3] || '';
          let fullPath = '/' + ctrlPrefix;
          if (subPath) fullPath += (fullPath.endsWith('/') ? '' : '/') + subPath;
          // Try to find body type from next line (Dto type annotation)
          const afterIdx = m.index + m[0].length;
          const window = content.substring(afterIdx, afterIdx + 300);
          const dtoMatch = window.match(/:\s*(\w+Dto)\b/);
          const bodyDto = dtoMatch ? dtoMatch[1] : null;
          // Find return type
          const returnMatch = content.match(/Promise<(\w+Dto)>/);
          const returnDto = returnMatch ? returnMatch[1] : null;
          result.push({
            module: moduleName,
            method,
            path: fullPath,
            bodyDto,
            returnDto,
          });
        }
      }
    }
  }
  walk(controllerDir);
  return result;
}

function main() {
  const dtos = walkModules();
  const endpoints = extractEndpoints();
  const output = {
    generatedAt: new Date().toISOString(),
    apiVersion: '0.1.0',
    endpoints: endpoints,
    schemas: dtos,
  };
  // Write to file as UTF-8 without BOM
  const outPath = process.argv[2] || 'tools/dto-schema.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.error('Wrote ' + endpoints.length + ' endpoints, ' + Object.keys(dtos).length + ' schema files to ' + outPath);
}

main();