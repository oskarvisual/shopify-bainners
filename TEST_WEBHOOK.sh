#!/bin/bash

# Script para probar el webhook de automatización
# Asegúrate de que tu app esté corriendo (npm run dev)

BASE_URL="http://localhost:3000"

echo "🧪 Probando webhook de generación de imágenes con IA..."
echo ""

curl -X POST "${BASE_URL}/api/test-webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "generate",
    "prompt": "a ninja reading twitter and getting surprise because japan lost world war 2",
    "aspect_ratio": "1:1",
    "resolution": "1K",
    "output_format": "png"
  }' | jq

echo ""
echo "✅ Test completado. Revisa los logs de n8n para ver el payload recibido."
echo ""
echo "Para ver instrucciones:"
echo "  curl ${BASE_URL}/api/test-webhook | jq"
