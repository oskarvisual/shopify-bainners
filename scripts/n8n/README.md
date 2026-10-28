# n8n workflow builders

Estos scripts generan los workflows de n8n de bAInners y los escriben
directamente en la base de datos SQLite de n8n.

Son la fuente de verdad de la configuración de los workflows: el editor de
n8n no es un buen lugar para mantenerlos porque el versionado de n8n 2.x
(`workflow_history` + `activeVersionId` + `workflow_publish_history`) hace
difícil versionar cambios en el JSON.

## Workflows

| Script | Workflow | Webhook |
|---|---|---|
| `wf_quota.py` | bAInners - Quota (Data Table) | `bainners-quota` |
| `wf_upload.py` | bAInners - Upload image (Spaces) | `bainners-upload` |
| `wf_generate.py` | bAInners - Generate image (KIE + Quota) | `98bdf7c9-...` |
| `wf_poll.py` | bAInners - Poll image status (KIE + Spaces) | `1f6132c4-...` |
| `wf_delete_optimize.py` | bAInners - Delete image (Spaces) | `9db583f1-...` |
| | bAInners - Optimize image (Spaces) | `bainners-optimize` |

## Uso

```bash
export N8N_SSH_HOST=root@147.182.184.234
export N8N_SSH_KEY=~/.ssh/id_rsa

python3 scripts/n8n/run_remote.py scripts/n8n/wf_quota.py
```

Después hay que reiniciar n8n para que recargue los workflows:

```bash
ssh "$N8N_SSH_HOST" 'docker restart n8n-n8n-1'
```

## Notas importantes de n8n 2.x

Estas son las trampas que hacen que un workflow escrito a mano no funcione.
`n8nlib.py` las tiene todas resueltas:

1. **Data Tables son tablas SQLite físicas.** Además de la tabla
   `data_table` hay que crear `data_table_user_<uuid>` con el schema:
   `id INTEGER PRIMARY KEY AUTOINCREMENT`, las columnas del usuario, y
   `createdAt`/`updatedAt` como columnas de sistema.

2. **Un workflow activo necesita una "active version".** Requiere fila en
   `workflow_history`, el puntero `activeVersionId` en `workflow_entity`, y
   una entrada en `workflow_publish_history` con `event='activated'`
   (no `'publish'`).

3. **Los workflows nuevos necesitan `shared_workflow`** con rol
   `workflow:owner` apuntando al project, o la activación falla con
   `Could not find any entity of type "SharedWorkflow"`.

4. **El campo del valor de un filtro es `keyValue`**, no `value`. Con
   `value` el filtro queda vacío y cada escritura inserta una fila nueva.

5. **`responseBody` del nodo Respond es una expresión** que debe devolver
   un objeto JSON, no código JS:
   `={{ ({ taskId: $('Extract taskId').item.json.taskId }) }}`.

6. **El resourceMapper en modo `defineBelow` no evalúa expresiones.**
   Usar `mappingMode: "autoMapInputData"` con un nodo Code intermedio que
   emita únicamente los campos que son columnas de la Data Table (cualquier
   campo extra produce `unknown column name`).

7. **El nodo DataTable `get` devuelve 0 items si la tabla está vacía** y eso
   corta el flujo. Usar `upsert` con `matchingColumns` en su lugar.

8. **El nodo S3 tiene dos variantes:**
   - `n8n-nodes-base.s3` → "Sends data to any S3-compatible service",
     **solo typeVersion 1**
   - `n8n-nodes-base.awsS3` → "Sends data to AWS S3", typeVersion 1 o 2

   Usar `typeVersion: 2` con el type `s3` hace que el frontend muestre
   *"Unrecognized node type"*, aunque el workflow funcione por el backend.

9. **El orden de arranque importa.** n8n activa los workflows durante el
   arranque; si las filas de `shared_workflow` no existen todavía, la
   activación falla. Crear las filas y reiniciar de nuevo.

10. **Los nodos Code que lanzan errores cortan el workflow en silencio.**
    Si el nodo falla, el `respondToWebhook` nunca responde y el cliente
    recibe un body vacío con HTTP 200. Marcar el nodo con
    `onError: "continueRegularOutput"` + `alwaysOutputData: true` y
    comprobar `$('Nodo').item.error` en el siguiente nodo para poder
    responder con un error claro.

## ACL público en los uploads

El bucket `cdn-orivisdev` **no tiene bucket policy**, así que los objetos
nuevos heredan el ACL privado por defecto y devuelven 403 en el storefront.

Por eso el nodo S3 de upload debe enviar `additionalFields.acl`, que n8n
traduce al header `x-amz-acl`:

```python
"additionalFields": {"acl": "publicRead"}
```

Los objetos que ya estaban subidos con el flujo anterior tienen el ACL
`public-read` explícito. Para poner al día los que quedaron privados hay
que listar el bucket y hacer `PUT <key>?acl` con el header
`x-amz-acl: public-read` en los que no tengan el grupo `AllUsers`.

## Data Table `bainners_usage`

Es la fuente de verdad de los contadores diarios de IA.

| Columna | Tipo | Contenido |
|---|---|---|
| `shop` | string | dominio del shop |
| `date` | string | día UTC `YYYY-MM-DD` |
| `kind` | string | `generation` o `upload` |
| `count` | number | usos consumidos en el día |

Clave única lógica: `(shop, date, kind)`.

## Estados del workflow Poll

La generación con IA es asíncrona: KIE devuelve un `taskId` y hay que
consultar el estado hasta que termine. El workflow distingue tres casos en
el nodo "Resolve status":

| Estado de KIE | `rawUrl` | Respuesta del workflow |
|---|---|---|
| `success` | con URL | `{"success":true,"state":"success","imageUrl":"<CDN url>"}` |
| `waiting` / en proceso | vacía | `{"success":false,"state":"waiting","imageUrl":""}` |
| `fail` / `error` / `cancelled` | vacía | `{"success":false,"state":"failed","message":"..."}` |

**Es importante no intentar descargar la imagen cuando `rawUrl` está
vacía**: el nodo HTTP falla con `Invalid URL: . URL must start with "http"`
y el workflow entero termina en error, en vez de responder que la tarea
sigue en curso.

La app (que hace poll cada 10 segundos) ya sabe manejar ese estado: si la
respuesta no trae `imageUrl` devuelve `{success: true, state: "waiting"}` y
el frontend sigue consultando. Antes del fix, el HTTP 500 de n8n se
traducía en `success: false` + `error`, y el modal cerraba mostrando un
error en lugar de esperar a que la imagen estuviera lista.

Por eso los nodos "Download image" y "Upload to Spaces" llevan
`onError: continueRegularOutput`: un fallo puntual de red no debe cortar el
flujo.
