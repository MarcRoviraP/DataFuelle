#!/bin/bash
# Cargar variables de entorno del archivo .env si existe
if [ -f .env ]; then
  echo "🔑 Cargando variables desde .env..."
  export $(grep -v '^#' .env | xargs)
else
  echo "⚠️ .env no encontrado. Asegúrate de tener las variables configuradas."
fi

# Ejecutar el script con el Python del entorno virtual
echo "🚀 Iniciando predicción de precios..."
.venv/bin/python scripts/predict_prices.py
