import sys, json
sys.path.insert(0, "/tmp")
from n8nlib import *

DT = get_data_table_id()
CRED = get_credential_id()
BUCKET = "cdn-orivisdev"

# ================================================================
# UPLOAD - sube el archivo del usuario a S3, con cuota diaria
#
# El nodo DataTable 'get' devuelve 0 items si la tabla esta vacia y eso
# corta el flujo. Se usa 'upsert' con count=0 para obtener la fila actual
# (creandola si no existe) sin que el flujo se corte.
# ================================================================
AUTH_JS = """
const expected = $env.AUTOMATIONS_TOKEN;
const received = $node['Upload webhook'].json.headers?.authorization || '';
if (!expected || received !== `Bearer ${expected}`) throw new Error('Unauthorized');

const input = $json.body && typeof $json.body === 'object' ? $json.body : $json;

if (!input.imageBase64) throw new Error('Missing imageBase64');
if (!input.fileName) throw new Error('Missing fileName');

const PLAN_LIMITS = {
  free:  { uploads: 5 },
  pro:   { uploads: 50 },
  ultra: { uploads: 200 },
};
const plan = String(input.plan || 'free').toLowerCase();
const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

const date = new Date().toISOString().slice(0, 10);
const shop = String(input.shop || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');

const safeName = String(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
const unique = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const key = 'bAInners/' + shop + '/' + unique + '-' + safeName;

return [{
  json: {
    shop,
    date,
    kind: 'upload',
    limit: limits.uploads,
    key,
    imageBase64: input.imageBase64,
    mimeType: input.mimeType || 'image/png',
    bytes: Math.floor((input.imageBase64.length * 3) / 4),
  },
}];
"""

UPLOAD_ENFORCE_JS = """
// Comprueba la cuota con el valor actual de la fila
const row = $input.first().json || {};
const ctx = $('Authorize upload').first().json;
const used = Number(row.count) || 0;

if (used >= ctx.limit) {
  throw new Error(
    'Daily upload quota reached (' + ctx.limit + ' per day for this plan). ' +
    'The quota resets at ' + new Date(Date.now() + 86400000).toISOString() + '.'
  );
}
return [{ json: { ...ctx, used } }];
"""

UPLOAD_BIN_JS = """
const ctx = $input.first().json;
const buf = Buffer.from(ctx.imageBase64, 'base64');
return [{
  json: {
    ...ctx,
    fileName: ctx.key.split('/').pop(),
    key: ctx.key,
  },
  binary: {
    data: {
      data: buf.toString('base64'),
      mimeType: ctx.mimeType,
      fileName: ctx.key.split('/').pop(),
      fileExtension: (ctx.key.split('.').pop() || 'png'),
    },
  },
}];
"""

UPLOAD_RESULT_JS = """
const ctx = $('Prepare binary').first().json;
const key = ctx.key;
return [{
  json: {
    success: true,
    action: 'upload',
    imageUrl: 'https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com/' + key,
    cdnUrl: 'https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com/' + key,
    filename: key.split('/').pop(),
    key,
    sizeInMB: Number(ctx.bytes || 0) / (1024 * 1024),
    width: 0,
    height: 0,
    format: (key.split('.').pop() || 'png').toLowerCase(),
  },
}];
"""

UPLOAD_INCREMENT_JS = """
// Incrementa el contador de subidas del dia.
// El valor actual se toma del nodo 'Enforce quota', que ya leyo la fila.
const used = Number($('Enforce quota').first().json.used) || 0;
const ctx = $('Authorize upload').first().json;
return [{
  json: {
    shop: ctx.shop,
    date: ctx.date,
    kind: 'upload',
    count: used + 1,
  },
}];
"""

UPLOAD_ROW_JS = """
// Emite solo los campos que existen como columnas en la Data Table.
// El nodo DataTable usa autoMapInputData: cualquier campo extra
// (limit, key, imageBase64...) provocaria un error de validacion.
const ctx = $('Authorize upload').first().json;
return [{ json: { shop: ctx.shop, date: ctx.date, kind: ctx.kind } }];
"""

upload_nodes = [
    webhook("bainners-upload", "Upload webhook", "bainners-upload-webhook"),
    code(AUTH_JS, "Authorize upload", "bainners-upload-auth", [220, 0]),
    code(UPLOAD_ROW_JS, "Build row", "bainners-upload-row-build", [330, 0]),
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
        "id": "bainners-upload-row",
        "name": "Read upload usage",
        "type": "n8n-nodes-base.dataTable",
        "typeVersion": 1,
        "position": [440, 0],
    },
    code(UPLOAD_ENFORCE_JS, "Enforce quota", "bainners-upload-enforce", [660, 0]),
    code(UPLOAD_BIN_JS, "Prepare binary", "bainners-upload-binary", [880, 0]),
    s3_upload(BUCKET, "={{ $json.key }}", "Upload to Spaces", "bainners-upload-s3", [1100, 0], CRED),
    code(UPLOAD_RESULT_JS, "Build result", "bainners-upload-result", [1320, 0]),
    code(UPLOAD_INCREMENT_JS, "Increment upload count", "bainners-upload-increment", [1430, 0]),
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
        "id": "bainners-upload-save",
        "name": "Save upload count",
        "type": "n8n-nodes-base.dataTable",
        "typeVersion": 1,
        "position": [1540, 0],
    },
    respond(
        "={{ $('Build result').item.json }}",
        "Return upload",
        "bainners-upload-response",
        [1760, 0],
    ),
]

upload_conn = conn(
    ("Upload webhook", "Authorize upload"),
    ("Authorize upload", "Build row"),
    ("Build row", "Read upload usage"),
    ("Read upload usage", "Enforce quota"),
    ("Enforce quota", "Prepare binary"),
    ("Prepare binary", "Upload to Spaces"),
    ("Upload to Spaces", "Build result"),
    ("Build result", "Increment upload count"),
    ("Increment upload count", "Save upload count"),
    ("Save upload count", "Return upload"),
)

print("== Workflow: bAInners - Upload image ==")
upsert_workflow(
    "bainners-upload-wf",
    "bAInners - Upload image (Spaces)",
    upload_nodes,
    upload_conn,
    active=1,
    settings={"executionOrder": "v1"},
)
