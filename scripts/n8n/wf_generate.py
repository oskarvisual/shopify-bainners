import sys, json, base64
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

# Nodo Code con la validacion de parametros KIE (base64 para evitar
# problemas de escapado al generar el fichero).
VALIDATE_JS = base64.b64decode(
    "Ci8vIFJlc3RyaWNjaW9uZXMgcG9yIG1vZGVsbyBkZSBLSUUgKHZlcmlmaWNhZGFzIGNvbnRyYSBsYSBBUEkgZWwgMjAyNi0xMC0yOSkuCmNvbnN0IE1PREVMX0FTUEVDVF9SQVRJT1MgPSB7CiAgJ2ZsdXgtMi9wcm8tdGV4dC10by1pbWFnZSc6IFsnMToxJywgJzI6MycsICczOjInLCAnMzo0JywgJzQ6MycsICc5OjE2JywgJzE2OjknXSwKICAnbmFuby1iYW5hbmEtcHJvJzogWwogICAgJzE6MScsICcyOjMnLCAnMzoyJywgJzM6NCcsICc0OjMnLCAnNDo1JywgJzU6NCcsICc5OjE2JywgJzE2OjknLCAnMjE6OScsICdhdXRvJywKICBdLAogICdnb29nbGUvbmFuby1iYW5hbmEnOiBbCiAgICAnMToxJywgJzI6MycsICczOjInLCAnMzo0JywgJzQ6MycsICc0OjUnLCAnNTo0JywgJzk6MTYnLCAnMTY6OScsICcyMTo5JywgJ2F1dG8nLAogIF0sCn07Cgpjb25zdCBNT0RFTF9SRVNPTFVUSU9OUyA9IHsKICAnZmx1eC0yL3Byby10ZXh0LXRvLWltYWdlJzogWycxSycsICcySyddLAogICduYW5vLWJhbmFuYS1wcm8nOiBbJzFLJywgJzJLJ10sCiAgJ2dvb2dsZS9uYW5vLWJhbmFuYSc6IFsnMUsnLCAnMksnXSwKfTsKCi8vIEVxdWl2YWxlbnRlIG1hcyBjZXJjYW5vIGN1YW5kbyBlbCByYXRpbyBwZWRpZG8gbm8gbG8gYWNlcHRhIGVsIG1vZGVsby4KY29uc3QgRkFMTEJBQ0sgPSB7CiAgJzQ6NSc6ICczOjQnLAogICc1OjQnOiAnNDozJywKICAnMjE6OSc6ICcxNjo5JywKICBhdXRvOiAnMToxJywKfTsKCmNvbnN0IFBMQU5fTU9ERUwgPSB7CiAgZnJlZTogJ2ZsdXgtMi9wcm8tdGV4dC10by1pbWFnZScsCiAgcHJvOiAnbmFuby1iYW5hbmEtcHJvJywKICB1bHRyYTogJ25hbm8tYmFuYW5hLXBybycsCn07Cgpjb25zdCBERUZBVUxUX01PREVMID0gJ2ZsdXgtMi9wcm8tdGV4dC10by1pbWFnZSc7CmNvbnN0IERFRkFVTFRfUkFUSU9TID0gTU9ERUxfQVNQRUNUX1JBVElPU1tERUZBVUxUX01PREVMXTsKY29uc3QgREVGQVVMVF9SRVNPTFVUSU9OUyA9IFsnMUsnLCAnMksnXTsKCi8vIC0tLSByZXNvbHZlciBlbCBtb2RlbG8gYSBwYXJ0aXIgZGVsIHBsYW4gLS0tCmNvbnN0IGlucHV0ID0gJGlucHV0LmZpcnN0KCkuanNvbiB8fCB7fTsKY29uc3QgcGxhbiA9IFN0cmluZyhpbnB1dC5wbGFuIHx8ICdmcmVlJykudG9Mb3dlckNhc2UoKTsKY29uc3QgbW9kZWwgPSBQTEFOX01PREVMW3BsYW5dIHx8IERFRkFVTFRfTU9ERUw7Cgpjb25zdCBhbGxvd2VkUmF0aW9zID0gTU9ERUxfQVNQRUNUX1JBVElPU1ttb2RlbF0gfHwgREVGQVVMVF9SQVRJT1M7CmNvbnN0IGFsbG93ZWRSZXNvbHV0aW9ucyA9IE1PREVMX1JFU09MVVRJT05TW21vZGVsXSB8fCBERUZBVUxUX1JFU09MVVRJT05TOwoKLy8gLS0tIGFzcGVjdCByYXRpbyAtLS0KY29uc3QgcmVxdWVzdGVkUmF0aW8gPSBTdHJpbmcoaW5wdXQuYXNwZWN0X3JhdGlvIHx8IGlucHV0LmFzcGVjdFJhdGlvIHx8ICcxOjEnKS50cmltKCk7CmxldCByYXRpbyA9IHJlcXVlc3RlZFJhdGlvOwpsZXQgcmF0aW9UcmFuc2xhdGVkID0gZmFsc2U7CgppZiAoIWFsbG93ZWRSYXRpb3MuaW5jbHVkZXMocmF0aW8pKSB7CiAgY29uc3QgZmFsbGJhY2sgPSBGQUxMQkFDS1tyYXRpb107CiAgcmF0aW8gPSAoZmFsbGJhY2sgJiYgYWxsb3dlZFJhdGlvcy5pbmNsdWRlcyhmYWxsYmFjaykpID8gZmFsbGJhY2sgOiBhbGxvd2VkUmF0aW9zWzBdOwogIHJhdGlvVHJhbnNsYXRlZCA9IHRydWU7Cn0KCi8vIC0tLSByZXNvbHVjaW9uIC0tLQpjb25zdCByZXF1ZXN0ZWRSZXNvbHV0aW9uID0gU3RyaW5nKGlucHV0LnJlc29sdXRpb24gfHwgJzFLJykudHJpbSgpOwpsZXQgcmVzb2x1dGlvbiA9IHJlcXVlc3RlZFJlc29sdXRpb247CmxldCByZXNvbHV0aW9uVHJhbnNsYXRlZCA9IGZhbHNlOwoKaWYgKCFhbGxvd2VkUmVzb2x1dGlvbnMuaW5jbHVkZXMocmVzb2x1dGlvbikpIHsKICByZXNvbHV0aW9uID0gYWxsb3dlZFJlc29sdXRpb25zWzBdOwogIHJlc29sdXRpb25UcmFuc2xhdGVkID0gdHJ1ZTsKfQoKaWYgKHJhdGlvVHJhbnNsYXRlZCB8fCByZXNvbHV0aW9uVHJhbnNsYXRlZCkgewogIGNvbnNvbGUubG9nKAogICAgJ1tiYWlubmVyc10gbjhuIGFqdXN0byBsb3MgcGFyYW1ldHJvcyBwYXJhIGVsIG1vZGVsbyAnICsgbW9kZWwgKyAnOiAnICsKICAgICdhc3BlY3RfcmF0aW8gJyArIHJlcXVlc3RlZFJhdGlvICsgJyAtPiAnICsgcmF0aW8gKyAnLCByZXNvbHV0aW9uICcgKwogICAgcmVxdWVzdGVkUmVzb2x1dGlvbiArICcgLT4gJyArIHJlc29sdXRpb24KICApOwp9CgovLyAtLS0gcHJvbXB0IHkgcmVmZXJlbmNpYXMgKHZpZW5lbiBkZWwgcGF5bG9hZCBvcmlnaW5hbCkgLS0tCmNvbnN0IHByb21wdCA9IGlucHV0LnByb21wdCB8fCAoaW5wdXQuZ2VuZXJhdGUgJiYgaW5wdXQuZ2VuZXJhdGUucHJvbXB0KSB8fCAnJzsKaWYgKCFwcm9tcHQpIHsKICB0aHJvdyBuZXcgRXJyb3IoJ3Byb21wdCBpcyByZXF1aXJlZCcpOwp9Cgpjb25zdCByZWZlcmVuY2VJbWFnZXMgPSBbXQogIC5jb25jYXQoaW5wdXQucmVmZXJlbmNlSW1hZ2VzIHx8IFtdKQogIC5mbGF0TWFwKCh2KSA9PiAodHlwZW9mIHYgPT09ICdzdHJpbmcnID8gdi5zcGxpdCgnLCcpIDogW10pKQogIC5tYXAoKHYpID0+IFN0cmluZyh2KS50cmltKCkpCiAgLmZpbHRlcihCb29sZWFuKTsKCnJldHVybiBbewogIGpzb246IHsKICAgIC4uLmlucHV0LAogICAgbW9kZWwsCiAgICBhc3BlY3RfcmF0aW86IHJhdGlvLAogICAgYXNwZWN0UmF0aW86IHJhdGlvLAogICAgcmVzb2x1dGlvbiwKICAgIG91dHB1dF9mb3JtYXQ6IGlucHV0Lm91dHB1dF9mb3JtYXQgfHwgJ3BuZycsCiAgICBwcm9tcHQsCiAgICByZWZlcmVuY2VJbWFnZXMsCiAgICByYXRpb1RyYW5zbGF0ZWQsCiAgICByZXNvbHV0aW9uVHJhbnNsYXRlZCwKICB9LAp9XTsK"
).decode('utf-8')

# Body del request a KIE: usa los valores ya validados por el nodo Code.
CREATE_BODY = """={{ JSON.stringify({
  model: $('Validate KIE params').item.json.model,
  input: {
    prompt: $('Validate KIE params').item.json.prompt,
    aspect_ratio: $('Validate KIE params').item.json.aspect_ratio,
    resolution: $('Validate KIE params').item.json.resolution,
    output_format: $('Validate KIE params').item.json.output_format,
    image_input: $('Validate KIE params').item.json.referenceImages,
  }
}) }}"""

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
    code(VALIDATE_JS, "Validate KIE params", "bainners-generate-validate", [790, 0]),
    http_request(
        "https://api.kie.ai/api/v1/jobs/createTask",
        "Create KIE task", "bainners-generate-kie", [880, 0],
        method="POST",
        body=CREATE_BODY,
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
    ("Enforce quota", "Validate KIE params"),
    ("Validate KIE params", "Create KIE task"),
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
