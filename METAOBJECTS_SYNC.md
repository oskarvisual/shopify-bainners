# Sincronización de Metaobjects para Banners

## ¿Qué son los Metaobjects?

Los metaobjects son objetos personalizados en Shopify que permiten a los merchants seleccionar banners desde el Theme Editor. Sin metaobjects, no pueden usar el bloque "Bainners Banner" en su theme.

## Cuándo se Sincronizan los Metaobjects

Los metaobjects se sincronizan **automáticamente** en estos momentos:

### 1. Al Cambiar el Status de un Banner (`/app/banners/{id}/edit`)
- **Solo cuando CAMBIAS el status** del banner (no en cada guardado)
- Si cambias el status a `"active"` → Se resincronizan todos los metaobjects
- Si cambias el status a `"draft"` o `"archived"` → Se resincronizan todos los metaobjects
- Si solo cambias título, colores, layout, etc. **SIN cambiar status** → No se sincronizan metaobjects

### 2. Al Eliminar un Banner
- Cuando eliminas un banner (desde el listado o desde la página de edición)
- Se ejecuta una resincronización completa para limpiar el metaobject huérfano
- Esto asegura que banners eliminados no aparezcan en el Theme Editor

## Estructura del Metaobject

Cada metaobject tiene 4 campos:

1. **banner_id** (required): El ID único del banner en la base de datos
2. **title** (required): El título del banner (se usa como Display Name)
3. **status**: El status actual del banner
4. **thumbnail**: URL de la primera imagen del banner (para preview en el Theme Editor)

## Definición del Metaobject

- **Type**: `bainners_banner`
- **Display Name Key**: `title`
- **Storefront Access**: `PUBLIC_READ`

## Comportamiento

### Estrategia de Sincronización:

**IMPORTANTE:** Cada vez que se sincronizan metaobjects, se hace una **resincronización completa**:

1. **Se eliminan TODOS los metaobjects existentes**
2. **Se recrean solo los de banners activos**

Esta estrategia es más simple y confiable que intentar actualizar metaobjects individuales.

### Cuando se ACTIVA un banner:
```
1. Usuario cambia status de "draft"/"archived" a "active" y guarda
2. El sistema detecta que el status cambió
3. Se ejecuta syncAllBannerMetaobjects()
4. Se eliminan TODOS los metaobjects
5. Se recrean los metaobjects de TODOS los banners activos
6. El banner ahora aparece en el Theme Editor
```

### Cuando se DESACTIVA un banner:
```
1. Usuario cambia status de "active" a "draft"/"archived" y guarda
2. El sistema detecta que el status cambió
3. Se ejecuta syncAllBannerMetaobjects()
4. Se eliminan TODOS los metaobjects
5. Se recrean los metaobjects de TODOS los banners activos (sin incluir este)
6. El banner desaparece del Theme Editor
```

### Cuando se edita un banner SIN cambiar status:
```
1. Usuario cambia título, colores, layout, etc. y guarda
2. El sistema detecta que el status NO cambió
3. NO se ejecuta sincronización
4. Los metaobjects permanecen sin cambios
5. Más eficiente - no se hacen llamadas innecesarias a Shopify API
```

### Cuando se CREA un banner nuevo:
```
1. Banners nuevos se crean con status "draft"
2. NO se crea metaobject inmediatamente
3. Cuando el usuario cambia el status a "active" y guarda, se resincronizan todos
4. El nuevo banner aparece en el Theme Editor
```

### Cuando se ELIMINA un banner:
```
1. Usuario elimina un banner (activo o no)
2. El banner se elimina de la base de datos
3. Se ejecuta syncAllBannerMetaobjects()
4. Se eliminan TODOS los metaobjects
5. Se recrean los metaobjects de TODOS los banners activos (sin incluir el eliminado)
6. El banner eliminado desaparece del Theme Editor
```

## Troubleshooting

### Los banners no aparecen en el Theme Editor

1. **Verifica el status del banner**
   - Solo banners con status `"active"` tienen metaobjects
   - Ve a `/app/banners` y confirma que los banners estén en "Active"

2. **Fuerza la resincronización**
   - Edita cualquier banner activo
   - Cambia su status temporalmente (de `active` a `draft`)
   - Guarda los cambios
   - Vuelve a cambiar el status a `active`
   - Guarda nuevamente
   - Esto forzará una resincronización completa de todos los banners activos

3. **Verifica en Shopify Admin**
   - Ve a: `Settings → Custom data → Metaobjects → Bainners Banner`
   - Deberías ver una entrada por cada banner activo

4. **Revisa los logs del servidor**
   - Los errores de sincronización se logean con el prefijo `[syncAllBannerMetaobjects]`
   - Busca mensajes de error en la consola del servidor

### Metaobjects duplicados o inconsistentes

Si los metaobjects están duplicados o inconsistentes:

1. **No elimines manualmente los metaobjects** desde Shopify Admin
2. Edita cualquier banner
3. Cambia su status (active → draft → active)
4. Esto ejecutará una resincronización completa que limpiará duplicados

## Notas Importantes

- ❌ **NO elimines la definición** "Bainners Banner" en Shopify Admin
- ❌ **NO edites manualmente** los metaobjects en Shopify Admin
- ✅ **SÍ confía** en la sincronización automática
- ✅ **SÍ usa el truco** de cambiar status (active→draft→active) si algo parece desincronizado
- ℹ️ **Optimización**: La sincronización solo ocurre cuando cambias el status de un banner, manteniendo el dashboard rápido

## Limitaciones

- **Thumbnails en Theme Editor**: Los thumbnails NO se muestran como imágenes en el selector del Theme Editor porque las imágenes están en DigitalOcean Spaces (externo). Shopify solo muestra previews para archivos en Shopify Files.
- **Sincronización solo en cambio de status**: Los metaobjects SOLO se sincronizan cuando cambias el status del banner. Si editas otros campos (título, colores, layout) sin cambiar el status, los metaobjects no se actualizan hasta el próximo cambio de status o hasta que recargas el dashboard.
