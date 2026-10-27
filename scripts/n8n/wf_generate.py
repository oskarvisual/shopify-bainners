import sys, json
sys.path.insert(0, "/tmp")
from n8nlib import *

DT = get_data_table_id()
CRED = get_credential_id()
BUCKET = "cdn-orivisdev"

# ================================================================
# GENERATE - cuota + modelo por plan + creacion de tarea KIE
# ================================================================
GEN_AUTH_JS = """
const expected = $env.AUTOMATIONS_TOKEN;
const received = $node['Generate webhook'].json.headers?.authorization || '';
if (!expected || received !== `Bearer ${expected}`) throw new Error('Unauthorized');

const input = $json.body && typeof $json.body === 'object' ? $json.body : $json;

const PLAN_LIMITS = {
  free:  { generations: 1,  uploads: 5,   model: 'flux-2/pro-text-to-image' },
  pro:   { generations: 10, uploads: 50,  model: 'nano-banana-pro' },
  ultra: { generations: 20, uploads: 200, model: 'nano-banana-pro' },
};

const plan = String(input.plan || 'free').toLowerCase();
const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

// El modelo lo decide el plan, ignorando cualquier modelo del cliente.
const model = limits.model;

const prompt = input.prompt || (input.generate && input.generate.prompt) || '';
if (!prompt) throw new Error('prompt is required');

const referenceImages = []
  .concat(input.referenceImages || [])
  .flatMap(v => typeof v === 'string' ? v.split(',') : [])
  .map(v => v.trim())
  .filter(Boolean);

return [{
  json: {
    shop: String(input.shop || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_'),
    date: new Date().toISOString().slice(0, 10),
    kind: 'generation',
    limit: limits.generations,
    model,
    plan,
    prompt,
    aspect_ratio: input.aspect_ratio || '1:1',
    resolution: input.resolution || '1K',
    output_format: input.output_format || 'png',
    referenceImages,
  },
}];
"""

GEN_ENFORCE_JS = """
// Comprueba la cuota con el valor actual de la fila
const row = $input.first().json || {};
const ctx = $('Authorize generate').first().json;
const used = Number(row.count) || 0;

if (used >= ctx.limit) {
  throw new Error(
    'Daily AI generation quota reached (' + ctx.limit + ' per day for this plan). ' +
    'The quota resets at ' + new Date(Date.now() + 86400000).toISOString() + '.'
  );
}
return [{ json: { ...ctx, used } }];
"""

GEN_CREATE_BODY = """={{ JSON.stringify({
  model: $('Enforce quota').item.json.model,
  input: {
    prompt: $('Enforce quota').item.json.prompt,
    aspect_ratio: $('Enforce quota').item.json.aspect_ratio,
    resolution: $('Enforce quota').item.json.resolution,
    output_format: $('Enforce quota').item.json.output_format,
    image_input: $('Enforce quota').item.json.referenceImages,
  }
}) }}"""

GEN_TASK_JS = """
const body = $input.first().json || {};
if (body.code && body.code !== 200) {
  throw new Error(body.msg || 'KIE createTask failed');
}
const taskId = body?.data?.taskId;
if (!taskId) throw new Error('No taskId returned from KIE');
const ctx = $('Enforce quota').first().json;
return [{ json: { ...ctx, taskId, state: 'pending' } }];
"""

GEN_INCREMENT_JS = """
// Incrementa el contador de generaciones del dia.
// El valor actual se toma del nodo 'Enforce quota', que ya leyo la fila.
const used = Number($('Enforce quota').first().json.used) || 0;
const ctx = $('Authorize generate').first().json;
return [{
  json: {
    shop: ctx.shop,
    date: ctx.date,
    kind: 'generation',
    count: used + 1,
  },
}];
"""

GEN_ROW_JS = """
// Emite solo los campos que existen como columnas en la Data Table.
// El nodo DataTable usa autoMapInputData: cualquier campo extra
// (limit, model, prompt...) provocaria un error de validacion.
const ctx = $('Authorize generate').first().json;
return [{ json: { shop: ctx.shop, date: ctx.date, kind: ctx.kind } }];
"""

gen_nodes = [
    webhook("98bdf7c9-0b3f-4258-af4d-022386ca2a50", "Generate webhook", "bainners-generate-webhook"),
    code(GEN_AUTH_JS, "Authorize generate", "bainners-generate-auth", [220, 0]),
    code(GEN_ROW_JS, "Build row", "bainners-generate-row-build", [330, 0]),
    {
        "parameters": {
            "resource": "row",
            "operation": "upsert",
            "dataTableId": {"__rl": True, "mode": "id", "value": DT},
            "matchType": "allConditions",
            "filters": {
                "conditions": [
                    {"keyName": "shop", "condition": "eq",
                     "keyValue": "={{ $json.shop }}"},
                    {"keyName": "kind", "condition": "eq",
                     "keyValue": "={{ $json.kind }}"},
                    {"keyName": "date", "condition": "eq",
                     "keyValue": "={{ $json.date }}"},
                ],
            },
            "columns": {
                "mappingMode": "autoMapInputData",
                "value": {},
                "matchingColumns": ["shop", "date", "kind"],
            },
            "options": {},
        },
        "id": "bainners-generate-row",
        "name": "Read generation usage",
        "type": "n8n-nodes-base.dataTable",
        "typeVersion": 1,
        "position": [440, 0],
    },
    code(GEN_ENFORCE_JS, "Enforce quota", "bainners-generate-enforce", [660, 0]),
    http_request(
        "https://api.kie.ai/api/v1/jobs/createTask",
        "Create KIE task", "bainners-generate-kie", [880, 0],
        method="POST",
        body=GEN_CREATE_BODY,
        headers=[
            {"name": "Authorization", "value": "={{ 'Bearer ' + $env.KIE_API_KEY }}"},
            {"name": "Content-Type", "value": "application/json"},
        ],
    ),
    code(GEN_TASK_JS, "Extract taskId", "bainners-generate-task", [1100, 0]),
    code(GEN_INCREMENT_JS, "Increment generation count", "bainners-generate-increment", [1210, 0]),
    {
        "parameters": {
            "resource": "row",
            "operation": "upsert",
            "dataTableId": {"__rl": True, "mode": "id", "value": DT},
            "matchType": "allConditions",
            "filters": {
                "conditions": [
                    {"keyName": "shop", "condition": "eq",
                     "keyValue": "={{ $json.shop }}"},
                    {"keyName": "kind", "condition": "eq",
                     "keyValue": "={{ $json.kind }}"},
                    {"keyName": "date", "condition": "eq",
                     "keyValue": "={{ $json.date }}"},
                ],
            },
            "columns": {
                "mappingMode": "autoMapInputData",
                "value": {},
                "matchingColumns": ["shop", "date", "kind"],
            },
            "options": {},
        },
        "id": "bainners-generate-save",
        "name": "Save generation count",
        "type": "n8n-nodes-base.dataTable",
        "typeVersion": 1,
        "position": [1320, 0],
    },
    respond(
        "={{ ({ taskId: $('Extract taskId').item.json.taskId, state: 'pending' }) }}",
        "Return task",
        "bainners-generate-response",
        [1540, 0],
    ),
]

gen_conn = conn(
    ("Generate webhook", "Authorize generate"),
    ("Authorize generate", "Build row"),
    ("Build row", "Read generation usage"),
    ("Read generation usage", "Enforce quota"),
    ("Enforce quota", "Create KIE task"),
    ("Create KIE task", "Extract taskId"),
    ("Extract taskId", "Increment generation count"),
    ("Increment generation count", "Save generation count"),
    ("Save generation count", "Return task"),
)

print("== Workflow: bAInners - Generate image ==")
upsert_workflow(
    "OjgDZjTr4skHOEDK",
    "bAInners - Generate image (KIE + Quota)",
    gen_nodes,
    gen_conn,
    active=1,
    settings={"executionOrder": "v1"},
)
