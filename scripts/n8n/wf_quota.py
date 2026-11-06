import sys, json
sys.path.insert(0, "/tmp")
from n8nlib import *

DT = get_data_table_id()
CRED = get_credential_id()

# ================================================================
# QUOTA - consulta el uso del dia (solo lectura)
#
# El nodo DataTable 'get' devuelve 0 items cuando la tabla esta vacia,
# lo que corta el flujo. Por eso el workflow hace un 'upsert' con
# count=0 sobre la fila (shop, kind, date): si no existe la crea, y si
# existe la deja igual. El upsert siempre devuelve una fila, asi que
# el flujo nunca se corta.
# ================================================================
QUOTA_JS = """
const expected = $env.AUTOMATIONS_TOKEN;
const received = $node['Quota webhook'].json.headers?.authorization || '';
if (!expected || received !== `Bearer ${expected}`) throw new Error('Unauthorized');

const input = $json.body && typeof $json.body === 'object' ? $json.body : $input.first().json;

const PLAN_LIMITS = {
  free:  { generations: 1,  uploads: 5,   model: 'flux-2/pro-text-to-image' },
  pro:   { generations: 10, uploads: 50,  model: 'nano-banana-pro' },
  ultra: { generations: 20, uploads: 200, model: 'nano-banana-pro' },
};

const plan = String(input.plan || 'free').toLowerCase();
const kind = input.kind === 'upload' ? 'upload' : 'generation';
const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

const date = input.date || new Date().toISOString().slice(0, 10);
const shop = String(input.shop || '');

return [{
  json: {
    shop,
    kind,
    date,
    limit: kind === 'upload' ? limits.uploads : limits.generations,
    model: limits.model,
  },
}];
"""

QUOTA_RESULT_JS = """
// El upsert devuelve la fila actual (o la crea con count=0).
const row = $input.first().json || {};
const ctx = $('Resolve quota context').first().json;
const used = Number(row.count) || 0;

return [{
  json: {
    shop: ctx.shop,
    kind: ctx.kind,
    date: ctx.date,
    limit: ctx.limit,
    model: ctx.model,
    used,
    remaining: Math.max(0, ctx.limit - used),
  },
}];
"""

QUOTA_RESPOND_EXPR = "={{ ({ used: $json.used, limit: $json.limit, remaining: $json.remaining, allowed: $json.used < $json.limit, date: $json.date, model: $json.model }) }}"

QUOTA_ROW_JS = """
// Emite solo los campos que existen como columnas en la Data Table.
// El nodo DataTable usa autoMapInputData, asi que no puede haber campos extra.
const ctx = $('Resolve quota context').first().json;
return [{ json: { shop: ctx.shop, date: ctx.date, kind: ctx.kind } }];
"""

quota_nodes = [
    webhook("bainners-quota", "Quota webhook", "bainners-quota-webhook"),
    code(QUOTA_JS, "Resolve quota context", "bainners-quota-context", [220, 0]),
    code(QUOTA_ROW_JS, "Build row", "bainners-quota-row-build", [330, 0]),
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
        "id": "bainners-quota-row",
        "name": "Read usage row",
        "type": "n8n-nodes-base.dataTable",
        "typeVersion": 1,
        "position": [440, 0],
    },
    code(QUOTA_RESULT_JS, "Build usage", "bainners-quota-result", [660, 0]),
    respond(QUOTA_RESPOND_EXPR, "Return usage", "bainners-quota-response", [880, 0]),
]

quota_conn = conn(
    ("Quota webhook", "Resolve quota context"),
    ("Resolve quota context", "Build row"),
    ("Build row", "Read usage row"),
    ("Read usage row", "Build usage"),
    ("Build usage", "Return usage"),
)

print("== Workflow: bAInners - Quota ==")
upsert_workflow(
    "bainners-quota-wf",
    "bAInners - Quota (Data Table)",
    quota_nodes,
    quota_conn,
    active=1,
    settings={"executionOrder": "v1"},
)
