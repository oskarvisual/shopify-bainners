import sys, json
sys.path.insert(0, "/tmp")
from n8nlib import *

DT = get_data_table_id()
CRED = get_credential_id()
BUCKET = "cdn-orivisdev"

# ================================================================
# 4. POLL - trae la imagen de KIE, la sube a S3 y devuelve la URL del CDN
# ================================================================
POLL_AUTH_JS = """
const expected = $env.AUTOMATIONS_TOKEN;
const received = $node['Status webhook'].json.headers?.authorization || '';
if (!expected || received !== `Bearer ${expected}`) throw new Error('Unauthorized');

const input = $json.body && typeof $json.body === 'object' ? $json.body : $json;
const taskId = input.taskId || '';
if (!taskId) throw new Error('Missing taskId');

const shop = String(input.shop || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
return [{ json: { shop, taskId } }];
"""

POLL_STATUS_JS = """
// Consulta el estado de la tarea en KIE y normaliza la respuesta.
const d = $json.data || {};
const ctx = $('Authorize poll').first().json;

let result = {};
try { result = JSON.parse(d.resultJson || '{}'); } catch (e) {}

const resultUrls = Array.isArray(result.resultUrls) ? result.resultUrls : [];
const rawUrl = resultUrls[0] || '';
const rawState = String(d.state || 'waiting').toLowerCase();

// Estados terminales de error
const FAILED_STATES = ['fail', 'failed', 'error', 'cancelled', 'canceled', 'rejected'];
const isFailed = FAILED_STATES.includes(rawState);

// La imagen solo existe si KIE la genero. Un taskId sin resultUrls todavia
// esta en proceso: la app debe seguir haciendo poll.
const hasImage = rawState === 'success' && Boolean(rawUrl);

const state = hasImage ? 'success' : (isFailed ? 'failed' : 'waiting');

return [{
  json: {
    ...ctx,
    state,
    rawState,
    success: hasImage,
    failed: isFailed,
    message: d.failMsg || '',
    rawUrl,
    filename: rawUrl ? rawUrl.split('/').pop().split('?')[0] : '',
  },
}];
"""

POLL_KEY_JS = """
// Construye la key del objeto en S3.
// Si todavia no hay imagen no se genera key: el flujo termina antes.
const ctx = $('Resolve status').first().json;

if (!ctx.success) {
  return [{ json: { ...ctx, key: '' } }];
}

const safeName = (ctx.filename || 'image.png').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
const key = 'bAInners/' + ctx.shop + '/' + ctx.taskId + '-' + safeName;
return [{ json: { ...ctx, key } }];
"""

POLL_RESULT_JS = """
// Construye la respuesta segun el estado de la tarea.
const ctx = $('Build key').first().json;

// KIE todavia esta generando: la app debe seguir haciendo poll.
if (!ctx.success) {
  return [{
    json: {
      success: false,
      action: 'poll',
      state: ctx.state || 'waiting',
      rawState: ctx.rawState || '',
      imageUrl: '',
      message: ctx.message || '',
    },
  }];
}

const key = ctx.key;
const cdn = 'https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com/' + key;
return [{
  json: {
    success: true,
    action: 'upload',
    state: 'success',
    imageUrl: cdn,
    cdnUrl: cdn,
    filename: key.split('/').pop(),
    key,
    sizeInMB: 0,
    width: 0,
    height: 0,
    format: 'png',
    taskId: ctx.taskId,
  },
}];
"""

poll_nodes = [
    webhook("1f6132c4-2d6c-4154-9bb3-bbd6cfa14586", "Status webhook", "bainners-status-webhook"),
    code(POLL_AUTH_JS, "Authorize poll", "bainners-status-auth", [220, 0]),
    http_request(
        "={{ 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + $json.taskId }}",
        "Get KIE task", "bainners-status-kie", [440, 0],
        method="GET",
        headers=[{"name": "Authorization", "value": "={{ 'Bearer ' + $env.KIE_API_KEY }}"}],
    ),
    code(POLL_STATUS_JS, "Resolve status", "bainners-status-resolve", [660, 0]),
    code(POLL_KEY_JS, "Build key", "bainners-status-key", [880, 0]),
    {
        "parameters": {
            "method": "GET",
            "url": "={{ $('Resolve status').item.json.rawUrl }}",
            "options": {
                "timeout": 60000,
                "response": {"response": {"responseFormat": "file", "outputPropertyName": "data"}},
            },
        },
        "id": "bainners-status-download",
        "name": "Download image",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1100, 0],
        # Si la descarga falla, continua para poder responder con el error.
        "onError": "continueRegularOutput",
        "alwaysOutputData": True,
    },
    s3_upload(BUCKET, "={{ $('Build key').item.json.key }}", "Upload to Spaces", "bainners-status-s3", [1320, 0], CRED,
              on_error="continueRegularOutput"),
    code(POLL_RESULT_JS, "Build result", "bainners-status-result", [1540, 0]),
    respond(
        "={{ $('Build result').item.json }}",
        "Return status",
        "bainners-status-response",
        [1760, 0],
    ),
]

poll_conn = conn(
    ("Status webhook", "Authorize poll"),
    ("Authorize poll", "Get KIE task"),
    ("Get KIE task", "Resolve status"),
    ("Resolve status", "Build key"),
    ("Build key", "Download image"),
    ("Download image", "Upload to Spaces"),
    ("Upload to Spaces", "Build result"),
    ("Build result", "Return status"),
)

print("== Workflow: bAInners - Poll image status ==")
upsert_workflow(
    "OkGMmwqGZ1Y4FQce",
    "bAInners - Poll image status (KIE + Spaces)",
    poll_nodes,
    poll_conn,
    active=1,
    settings={"executionOrder": "v1"},
)
