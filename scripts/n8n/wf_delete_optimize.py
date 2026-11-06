import sys, json
sys.path.insert(0, "/tmp")
from n8nlib import *

DT = get_data_table_id()
CRED = get_credential_id()
BUCKET = "cdn-orivisdev"

# ================================================================
# 5. DELETE - actualizar la URL hardcodeada al endpoint CDN
# ================================================================
DEL_AUTH_JS = """
const expected = $env.AUTOMATIONS_TOKEN;
const received = $node['Delete webhook'].json.headers?.authorization || '';
if (!expected || received !== `Bearer ${expected}`) throw new Error('Unauthorized');

const input = $json.body && typeof $json.body === 'object' ? $json.body : $json;
const raw = input.fileKey || input.key || input.path || input.imageKey || '';
const key = String(raw).replace(/^\\/+/, '').replace(/^https?:\\/\\/[^/]+\\//, '');
if (!key) throw new Error('Missing file key');
return [{ json: { key, requestId: input.requestId || '', action: 'delete' } }];
"""

DEL_RESULT_JS = """
const key = $node['Authorize and normalize'].json.key;
return [{
  json: {
    success: true,
    action: 'delete',
    key,
    imageUrl: 'https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com/' + key,
  },
}];
"""

del_nodes = [
    webhook("9db583f1-9150-43db-a6d9-7bd2a6560628", "Delete webhook", "bainners-delete-webhook"),
    code(DEL_AUTH_JS, "Authorize and normalize", "bainners-delete-auth", [220, 0]),
    code(DEL_RESULT_JS, "Build delete response", "bainners-delete-result", [440, 0]),
    respond(
        "={{ $('Build delete response').item.json }}",
        "Return delete response",
        "bainners-delete-response",
        [660, 0],
    ),
    s3_delete(BUCKET, "={{ $json.key }}", "Delete a file", "bainners-delete-s3", [880, 0], CRED),
]

del_conn = conn(
    ("Delete webhook", "Authorize and normalize"),
    ("Authorize and normalize", "Build delete response"),
    ("Build delete response", "Return delete response"),
    ("Authorize and normalize", "Delete a file"),
)

print("== Workflow: bAInners - Delete image ==")
upsert_workflow(
    "SuSfjTPjnDjEuzPM",
    "bAInners - Delete image (Spaces)",
    del_nodes,
    del_conn,
    active=1,
    settings={"executionOrder": "v1"},
)

# ================================================================
# 6. OPTIMIZE - optimiza una imagen remota y la sube a S3
# ================================================================
OPT_AUTH_JS = """
const expected = $env.AUTOMATIONS_TOKEN;
const received = $node['Optimize webhook'].json.headers?.authorization || '';
if (!expected || received !== `Bearer ${expected}`) throw new Error('Unauthorized');

const input = $json.body && typeof $json.body === 'object' ? $json.body : $json;
const imageUrl = input.imageUrl || '';
if (!imageUrl) throw new Error('Missing imageUrl');

const shop = String(input.shop || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
const key = 'bAInners/' + shop + '/' + Date.now().toString(36) + '-optimized-' +
  (imageUrl.split('/').pop() || 'image.png').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);

return [{ json: { shop, imageUrl, key, targetFormat: input.targetFormat || 'webp' } }];
"""

OPT_RESULT_JS = """
const ctx = $('Authorize optimize').first().json;
const cdn = 'https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com/' + ctx.key;
return [{
  json: {
    success: true,
    action: 'optimize',
    imageUrl: cdn,
    cdnUrl: cdn,
    filename: ctx.key.split('/').pop(),
    key: ctx.key,
    sizeInMB: 0,
    width: 0,
    height: 0,
    format: ctx.targetFormat,
  },
}];
"""

opt_nodes = [
    webhook("bainners-optimize", "Optimize webhook", "bainners-optimize-webhook"),
    code(OPT_AUTH_JS, "Authorize optimize", "bainners-optimize-auth", [220, 0]),
    http_download(
        "={{ $json.imageUrl }}",
        "Download source", "bainners-optimize-download", [440, 0],
    ),
    s3_upload(BUCKET, "={{ $json.key }}", "Upload optimized", "bainners-optimize-s3", [660, 0], CRED),
    code(OPT_RESULT_JS, "Build optimize result", "bainners-optimize-result", [880, 0]),
    respond(
        "={{ $('Build optimize result').item.json }}",
        "Return optimize",
        "bainners-optimize-response",
        [1100, 0],
    ),
]

opt_conn = conn(
    ("Optimize webhook", "Authorize optimize"),
    ("Authorize optimize", "Download source"),
    ("Download source", "Upload optimized"),
    ("Upload optimized", "Build optimize result"),
    ("Build optimize result", "Return optimize"),
)

print()
print("== Workflow: bAInners - Optimize image ==")
upsert_workflow(
    "bainners-optimize-wf",
    "bAInners - Optimize image (Spaces)",
    opt_nodes,
    opt_conn,
    active=1,
    settings={"executionOrder": "v1"},
)
