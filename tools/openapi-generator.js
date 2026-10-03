/**
 * OpenAPI 3.0 Spec Generator
 *
 * Walks NestJS controllers + DTOs and produces a complete OpenAPI 3.0 spec.
 * Includes:
 *  - All controller routes (path, method, parameters, body, responses)
 *  - All DTO classes (as JSON Schema components)
 *  - JWT bearer authentication
 *
 * Output: tools/openapi.json (compatible with orval, openapi-typescript-codegen, etc.)
 *
 * Usage: node tools/openapi-generator.js
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const API_SRC = path.join(REPO_ROOT, 'apps', 'api', 'src', 'modules');
const SHARED = path.join(REPO_ROOT, 'packages', 'shared', 'src');
const OUTPUT = path.join(__dirname, 'openapi.json');

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'EquipCare AI API',
    version: '0.1.0',
    description: 'Generated OpenAPI spec from NestJS DTOs and controllers',
  },
  servers: [{ url: 'http://localhost:3001' }],
  components: {
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {},
    parameters: {},
  },
  security: [{ bearer: [] }],
  paths: {},
};

// ========== Schema extraction (from dto-extractor) ==========
function parseClassBody(classBody) {
  const fields = {};
  const lines = classBody.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line.startsWith('@')) { i++; continue; }
    const decorators = [];
    while (i < lines.length && lines[i].trim().startsWith('@')) {
      decorators.push(lines[i].trim());
      i++;
    }
    while (i < lines.length) {
      const fieldLine = lines[i].trim();
      if (!fieldLine || fieldLine.startsWith('//') || fieldLine.startsWith('*')) { i++; continue; }
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
  if (type.includes('number') || type.includes('integer')) schema.type = 'number';
  else if (type.includes('boolean')) schema.type = 'boolean';
  else if (type.includes('[]') || type.includes('Array')) schema.type = 'array';
  else if (type.includes('unknown') || type.includes('object')) schema.type = 'object';
  else schema.type = 'string';

  for (const d of decorators) {
    if (d.startsWith('@IsOptional')) isOptional = true;
    else if (d.startsWith('@IsUUID')) schema.format = 'uuid';
    else if (d.startsWith('@IsEmail')) schema.format = 'email';
    else if (d.startsWith('@IsDateString')) schema.format = 'date-time';
    else if (d.startsWith('@MaxLength(')) {
      const m = d.match(/MaxLength\((\d+)\)/);
      if (m) schema.maxLength = parseInt(m[1]);
    } else if (d.startsWith('@MinLength(')) {
      const m = d.match(/MinLength\((\d+)\)/);
      if (m) schema.minLength = parseInt(m[1]);
    } else if (d.startsWith('@Min(')) {
      const m = d.match(/Min\(([\d.]+)\)/);
      if (m) schema.minimum = parseFloat(m[1]);
    } else if (d.startsWith('@IsIn(')) {
      const m = d.match(/IsIn\(([^)]+)\)/);
      if (m) {
        // Try to extract enum values from Object.values(EnumName)
        const enumMatch = m[1].match(/Object\.values\((\w+)\)/);
        if (enumMatch) {
          schema.$ref = `#/components/schemas/${enumMatch[1]}`;
        } else {
          const vals = m[1].split(',').map((s) => s.trim().replace(/['"]/g, ''));
          schema.enum = vals;
        }
      }
    }
  }
  if (!isOptional && !type.match(/\?$/)) schema.requiredField = true;
  return schema;
}

function extractSchemas() {
  const schemas = {};
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(full);
      } else if (entry.name.endsWith('.dto.ts')) {
        const content = fs.readFileSync(full, 'utf8');
        const classRegex = /export\s+class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
        let m;
        while ((m = classRegex.exec(content)) !== null) {
          const className = m[1];
          const body = m[2];
          if (body.includes('get ') || body.includes('set ')) continue;
          const fields = parseClassBody(body);
          // Convert to OpenAPI schema
          const props = {};
          const required = [];
          for (const [name, s] of Object.entries(fields)) {
            const { requiredField, ...propSchema } = s;
            props[name] = propSchema;
            if (requiredField) required.push(name);
          }
          schemas[className] = { type: 'object', properties: props };
          if (required.length) schemas[className].required = required;
        }
      }
    }
  }
  walk(API_SRC);
  return schemas;
}

// ========== Enum extraction (with hardcoded common values) ==========
const KNOWN_ENUMS = {
  WorkOrderType: ['CORRECTIVE', 'PREVENTIVE', 'PREDICTIVE', 'REPAIR', 'INSPECTION'],
  WorkOrderStatus: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'AWAITING_PART', 'COMPLETED', 'CANCELLED', 'CLOSED'],
  WorkOrderCreationMode: ['MANUAL', 'FROM_INCIDENT', 'FROM_MAINTENANCE', 'AI_AUTO'],
  WorkOrderNoteType: ['PROGRESS', 'PAUSE_START', 'PAUSE_END', 'INFO', 'COMPLETION'],
  PauseReason: ['WAITING_PART', 'WAITING_APPROVAL', 'WAITING_INFO', 'EXTERNAL_VENDOR', 'OTHER'],
  IncidentPriority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  IncidentStatus: ['NEW', 'IN_PROGRESS', 'AWAITING_INFO', 'RESOLVED', 'CLOSED', 'CANCELLED'],
  IncidentMessageType: ['REPORTER', 'STAFF', 'SYSTEM'],
  AssetManualState: ['NORMAL', 'MAINTENANCE', 'BROKEN', 'SUSPENDED', 'RETIRED'],
  ApprovalStatus: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'INFO_REQUESTED'],
  ApprovalEventType: ['DRAFT_CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INFO_REQUESTED', 'CANCELLED'],
  CostCategory: ['LABOR', 'PART', 'OUTSIDE_SERVICE', 'OTHER'],
  CostDirection: ['DEBIT', 'CREDIT'],
  MaintenanceIntervalUnit: ['DAY', 'WEEK', 'MONTH', 'HOUR', 'KM'],
  MaintenanceScheduleBasis: ['CALENDAR', 'USAGE', 'MIXED'],
  MaintenanceOccurrenceStatus: ['SCHEDULED', 'DUE', 'OVERDUE', 'SKIPPED', 'WORK_ORDER_CREATED', 'COMPLETED'],
  NotificationType: ['INVENTORY_LOW_STOCK', 'APPROVAL_SUBMITTED', 'APPROVAL_DECIDED', 'WORK_ORDER_OVERDUE', 'WORK_ORDER_ASSIGNED', 'MAINTENANCE_DUE', 'SYSTEM'],
  AiRequestStatus: ['QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED'],
  AiCategory: ['MECHANICAL', 'ELECTRICAL', 'PNEUMATIC', 'HYDRAULIC', 'SOFTWARE', 'OTHER'],
};

function extractEnums() {
  const enums = {};
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        const content = fs.readFileSync(full, 'utf8');
        // Match: export enum Name { ... } or export const Name = { ... }
        const enumRegex = /(?:export\s+)?(?:const\s+)?(?:enum\s+)?(\w+)\s*(?::\s*typeof\s+\w+\s*)?=\s*\{([\s\S]*?)\}/g;
        let m;
        while ((m = enumRegex.exec(content)) !== null) {
          const name = m[1];
          const body = m[2];
          if (name === 'ApiProperty' || name === 'IsString' || name === 'Type' || name === 'default') continue;
          // Skip if it looks like a method/decorator
          if (name.startsWith('Is') || name.startsWith('@')) continue;
          const values = [];
          // String values
          const valueRegex = /(\w+)\s*:\s*['"]([^'"]+)['"]/g;
          let v;
          while ((v = valueRegex.exec(body)) !== null) {
            values.push(v[2]);
          }
          if (values.length > 0) {
            enums[name] = { type: 'string', enum: values };
          }
        }
      }
    }
  }
  walk(API_SRC);
  // Merge in known enums
  for (const [name, vals] of Object.entries(KNOWN_ENUMS)) {
    if (!enums[name]) {
      enums[name] = { type: 'string', enum: vals };
    }
  }
  return enums;
}

// ========== Controller extraction ==========
function extractControllers() {
  const paths = {};
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'dto' && entry.name !== 'node_modules' && entry.name !== 'dist') walk(full);
      } else if (entry.name.endsWith('.controller.ts')) {
        const content = fs.readFileSync(full, 'utf8');
        const ctrlMatch = content.match(/@Controller\(['"]?([^'")]+)['"]?\)/);
        if (!ctrlMatch) continue;
        const ctrlPrefix = ctrlMatch[1];
        // Find methods
        const methodRegex = /@(Get|Post|Patch|Put|Delete)\((['"]?)([^'")]*)\2\)\s*([\s\S]*?)(?=\s*@(?:Get|Post|Patch|Put|Delete|Post\()|$)/g;
        let m;
        while ((m = methodRegex.exec(content)) !== null) {
          const method = m[1].toUpperCase();
          const subPath = m[3] || '';
          const methodBlock = m[4];
          let fullPath = '/' + ctrlPrefix;
          if (subPath) fullPath += (fullPath.endsWith('/') ? '' : '/') + subPath;

          // Extract body DTO from method block
          const dtoMatch = methodBlock.match(/@Body\(\)\s*[^:]*:\s*(\w+Dto)/);
          const bodyDto = dtoMatch ? dtoMatch[1] : null;
          // Query DTO
          const queryMatch = methodBlock.match(/@Query\(\)\s*[^:]*:\s*(\w+Dto)/);
          const queryDto = queryMatch ? queryMatch[1] : null;
          // Path params from URL
          const pathParams = [];
          const paramRegex = /:(\w+)/g;
          let p;
          while ((p = paramRegex.exec(fullPath)) !== null) {
            pathParams.push(p[1]);
          }
          // Check for HttpCode
          const httpCodeMatch = methodBlock.match(/@HttpCode\((\d+)\)/);
          const responseCode = httpCodeMatch ? parseInt(httpCodeMatch[1]) : (method === 'POST' ? 201 : 200);

          // Add to paths
          if (!paths[fullPath]) paths[fullPath] = {};
          const op = {
            summary: `${method} ${fullPath}`,
            operationId: `${method.toLowerCase()}_${fullPath.replace(/[/:{}]/g, '_')}`,
            parameters: [],
            responses: {
              [responseCode]: { description: 'Success' },
              '400': { description: 'Bad Request' },
              '401': { description: 'Unauthorized' },
              '403': { description: 'Forbidden' },
              '404': { description: 'Not Found' },
              '409': { description: 'Conflict' },
              '422': { description: 'Unprocessable Entity' },
            },
          };
          if (pathParams.length) {
            for (const pp of pathParams) {
              op.parameters.push({ name: pp, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
            }
          }
          if (queryDto) {
            op.parameters.push({ name: '', in: 'query', style: 'form', explode: true, schema: { $ref: `#/components/schemas/${queryDto}` } });
          }
          if (bodyDto && ['POST', 'PATCH', 'PUT'].includes(method)) {
            op.requestBody = {
              required: true,
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${bodyDto}` } } },
            };
          }
          paths[fullPath][method.toLowerCase()] = op;
        }
      }
    }
  }
  walk(API_SRC);
  return paths;
}

function main() {
  const dtos = extractSchemas();
  const enums = extractEnums();
  const paths = extractControllers();

  spec.components.schemas = { ...dtos, ...enums };
  spec.paths = paths;

  fs.writeFileSync(OUTPUT, JSON.stringify(spec, null, 2));
  console.error(`Generated OpenAPI spec:`);
  console.error(`  - ${Object.keys(paths).length} paths`);
  console.error(`  - ${Object.keys(dtos).length} DTO schemas`);
  console.error(`  - ${Object.keys(enums).length} enum schemas`);
  console.error(`  - Output: ${OUTPUT}`);
}

main();