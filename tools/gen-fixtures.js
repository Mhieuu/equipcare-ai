/**
 * PowerShell Test Fixture Generator
 *
 * Reads tools/dto-schema.json, produces tools/fixtures.ps1 with sample
 * JSON bodies for every endpoint that has a body DTO. This keeps test
 * scripts in sync with backend DTOs.
 *
 * Usage: node tools/gen-fixtures.js
 */
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, 'dto-schema.json');
const OUTPUT_PATH = path.join(__dirname, 'fixtures.ps1');

const REPO_ROOT = path.resolve(__dirname, '..');
const API_SRC = path.join(REPO_ROOT, 'apps', 'api', 'src', 'modules');

/**
 * Walk to find class bodies and use the extracted schema.
 * We use heuristics for placeholder values.
 */
function sampleValue(fieldName, schema) {
  if (!schema) return 'null';
  const name = fieldName.toLowerCase();
  // Enums
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return JSON.stringify(schema.enum[0]);
  }
  // Booleans
  if (schema.type === 'boolean') return 'true';
  // UUIDs — generate a deterministic placeholder
  if (schema.format === 'uuid') {
    return '"00000000-0000-4000-8000-000000000000"';
  }
  // Date
  if (schema.format === 'date') return '"2026-10-04T00:00:00.000Z"';
  // Email
  if (schema.format === 'email') return '"test@example.com"';
  // Number
  if (schema.type === 'number') {
    if (name.includes('amount') || name.includes('price') || name.includes('cost')) return '100';
    if (name.includes('quantity') || name.includes('qty')) return '1';
    if (name.includes('hours') || name.includes('hourlyrate')) return '1';
    return '1';
  }
  // Array
  if (schema.type === 'array') return '[]';
  // Object
  if (schema.type === 'object') return '{}';
  // String
  if (schema.type === 'string') {
    // Special-cased fields
    if (name.includes('password')) return '"TestPass123!@#"';
    if (name === 'loginname' || name === 'login') return '"demo.tech1"';
    if (name.includes('email')) return '"test@example.com"';
    if (name === 'code' || name.includes('code')) return '"TEST-CODE-001"';
    if (name === 'name' || name.includes('name')) return '"Test Name"';
    if (name === 'description' || name.includes('description')) return '"Test description"';
    if (name === 'reason' || name.includes('reason')) return '"Test reason"';
    if (name === 'note' || name.includes('note')) return '"Test note"';
    if (name.includes('actionplan')) return '"Test action plan"';
    if (name === 'body') return '"Test message body"';
    if (name === 'impactdescription' || name.includes('impact')) return '"Test impact description"';
    if (name === 'unit') return '"pcs"';
    if (name === 'rowversion' || name === 'row_version') return '""';
    if (name === 'sourceurl' || name === 'url') return '"https://example.com/test"';
    if (name.includes('text')) return '"Sample text"';
    if (name === 'kind' || name === 'type' || name === 'creationmode') {
      // Map common enum placeholders
      if (name === 'kind' || name === 'type') return '"REPAIR"';
      if (name === 'creationmode') return '"MANUAL"';
    }
    if (name === 'intervalunit') return '"DAY"';
    if (name === 'starton' || name === 'startdate') return '"2026-10-04"';
    if (name === 'schedulebasis') return '"CALENDAR"';
    if (name === 'suppliername') return '"Test Supplier"';
    if (name === 'rolecode' || name === 'role') return '"TECHNICIAN"';
    if (name === 'fullname') return '"Nguyễn Văn Test"';
    if (name === 'action') return '"SUBMITTED"';
    if (name === 'to') return '"IN_PROGRESS"';
    if (name === 'notetype') return '"PROGRESS"';
    if (name === 'pausereason') return '"WAITING_PART"';
    if (name === 'category') return '"PART"';
    if (name === 'direction') return '"DEBIT"';
    if (name === 'departmentid') return '"10000000-0000-4000-8000-000000000001"';
    if (name === 'locationid') return '"20000000-0000-4000-8000-000000000001"';
    if (name === 'assigneeid') return '"50000000-0000-4000-8000-000000000024"';
    if (name === 'assetid') return '"70000000-0000-4000-8000-000000000001"';
    if (name === 'incidentid') return '"00000000-0000-4000-8000-000000000000"';
    if (name === 'workorderid') return '"00000000-0000-4000-8000-000000000000"';
    if (name === 'partid') return '"00000000-0000-4000-8000-000000000000"';
    if (name === 'originalstocktxid') return '"00000000-0000-4000-8000-000000000000"';
    if (name === 'value') return '{}';
    if (name === 'key') return '"test.key"';
    return '"sample"';
  }
  return 'null';
}

function generateSampleBody(schemaObj) {
  if (!schemaObj || typeof schemaObj !== 'object') return '{}';
  const obj = {};
  const entries = Object.entries(schemaObj);
  // Prioritize required (non-optional) fields
  const required = entries.filter(([_, s]) => s && !s.optional);
  const optional = entries.filter(([_, s]) => s && s.optional);
  // Include all required, plus a few optionals that have sensible defaults
  for (const [field, fieldSchema] of [...required, ...optional.slice(0, 2)]) {
    obj[field] = JSON.parse(sampleValue(field, fieldSchema));
  }
  return JSON.stringify(obj, null, 2);
}

function main() {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const lines = [
    '# Auto-generated by tools/gen-fixtures.js — DO NOT EDIT',
    '# Source: tools/dto-schema.json (generated from NestJS DTOs)',
    '# Regenerate: node tools/gen-fixtures.js',
    '',
    '$base = \'http://localhost:3001\'',
    '',
    'function Get-SampleBody([string]$dtoName) {',
    '    switch ($dtoName) {',
  ];

  // Group endpoints by body DTO
  const byBodyDto = {};
  for (const ep of schema.endpoints) {
    if (ep.bodyDto) {
      if (!byBodyDto[ep.bodyDto]) byBodyDto[ep.bodyDto] = [];
      byBodyDto[ep.bodyDto].push(ep);
    }
  }

  // For each DTO, find its schema and generate sample
  for (const [dtoName, endpoints] of Object.entries(byBodyDto)) {
    // Find schema in any file
    let schemaObj = null;
    for (const file of Object.values(schema.schemas)) {
      if (file[dtoName]) {
        schemaObj = file[dtoName];
        break;
      }
    }
    const sample = generateSampleBody(schemaObj);
    const escaped = sample.replace(/'/g, "''");
    lines.push(`        '${dtoName}' { return '${escaped}' }`);
  }

  lines.push('        default { return \'{}\' }');
  lines.push('    }');
  lines.push('}');
  lines.push('');
  lines.push('# Endpoint index: method+path -> body DTO');
  lines.push('$endpoints = @{');
  for (const ep of schema.endpoints) {
    if (ep.bodyDto) {
      lines.push(`    '${ep.method} ${ep.path}' = '${ep.bodyDto}';`);
    }
  }
  lines.push('}');
  lines.push('');

  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'));
  console.error('Wrote ' + Object.keys(byBodyDto).length + ' body fixtures to ' + OUTPUT_PATH);
}

main();