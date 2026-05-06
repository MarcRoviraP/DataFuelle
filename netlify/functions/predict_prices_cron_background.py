import os
import json
import requests
import joblib
import pandas as pd
import datetime
import tempfile

def download_blob(site_id, token, store_name, key, dest_path):
    """Descarga un archivo desde Netlify Blobs usando la API REST."""
    url = f"https://api.netlify.com/api/v1/sites/{site_id}/blobs/{store_name}/{key}"
    headers = {"Authorization": f"Bearer {token}"}
    
    print(f"📡 Descargando {key} desde Blobs...")
    res = requests.get(url, headers=headers)
    res.raise_for_status()
    
    with open(dest_path, 'wb') as f:
        f.write(res.content)
    print(f"✅ Descargado: {dest_path}")

def handler(event, context):
    print("🔮 [Cron] Iniciando predicción semanal de precios...")
    
    # 1. Credenciales de Supabase
    SUPABASE_URL = os.environ.get('SUPABASE_URL')
    # Soporta tanto el nombre nuevo como el viejo
    SUPABASE_KEY = os.environ.get('SUPABASE_SECRET_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    
    # 2. Credenciales de Netlify Blobs
    NETLIFY_SITE_ID = os.environ.get('NETLIFY_SITE_ID', '8ea89376-2b9a-4ea3-bb3e-91cce2d25dbd')
    NETLIFY_TOKEN = os.environ.get('NETLIFY_AUTH_TOKEN')
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Error: Faltan variables de entorno de Supabase (URL o SECRET_KEY)")
        return {"statusCode": 500}

    # 3. Descargar modelos a /tmp/
    tmp_dir = tempfile.gettempdir()
    model_paths = {
        'diesel': os.path.join(tmp_dir, 'model_diesel.pkl'),
        '95': os.path.join(tmp_dir, 'model_95.pkl'),
        '98': os.path.join(tmp_dir, 'model_98.pkl')
    }
    
    try:
        if NETLIFY_TOKEN:
            for name, path in model_paths.items():
                download_blob(NETLIFY_SITE_ID, NETLIFY_TOKEN, 'ia-models', f'model_{name}.pkl', path)
        else:
            print("⚠️ NETLIFY_AUTH_TOKEN no encontrado. Intentando usar modelos locales...")
            for name, path in model_paths.items():
                local_path = f"./.netlify/blobs/deploy/ia-models/model_{name}.pkl"
                if os.path.exists(local_path):
                    model_paths[name] = local_path
                else:
                    raise Exception(f"No se encontró el modelo {name}")

        # 4. Cargar modelos
        models = {k: joblib.load(v) for k, v in model_paths.items()}
        print("🧠 Modelos cargados correctamente")

        # 5. Lógica de predicción
        headers_sb = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }

        print("🏢 Obteniendo estaciones...")
        res = requests.get(f"{SUPABASE_URL}/rest/v1/stations?select=external_id,postal_code,last_price_95,last_price_98,last_price_diesel", headers=headers_sb)
        res.raise_for_status()
        df = pd.DataFrame(res.json())
        
        now = datetime.datetime.now()
        target_date = (now + datetime.timedelta(days=7)).date()
        
        df['municipio_cp'] = df['postal_code'].apply(lambda x: int(str(x).split('-')[0]) if x else 0)
        
        df_features = pd.DataFrame({
            'fecha': int(now.timestamp()),
            'gasolinera_id': df['external_id'].astype(int),
            'municipio_cp': df['municipio_cp'].astype(int),
            'price_diesel': df['last_price_diesel'].fillna(0).astype(float),
            'price_95': df['last_price_95'].fillna(0).astype(float),
            'price_98': df['last_price_98'].fillna(0).astype(float),
            'day_of_week': now.weekday(),
            'month': now.month
        })

        df['pred_diesel'] = models['diesel'].predict(df_features)
        df['pred_95'] = models['95'].predict(df_features)
        df['pred_98'] = models['98'].predict(df_features)

        # 6. Subir a Supabase
        print("💾 Guardando predicciones...")
        predictions = []
        for _, row in df.iterrows():
            predictions.append({
                'station_id': int(row['external_id']),
                'target_date': str(target_date),
                'predicted_diesel': float(row['pred_diesel']),
                'predicted_95': float(row['pred_95']),
                'predicted_98': float(row['pred_98'])
            })
        
        requests.post(f"{SUPABASE_URL}/rest/v1/price_predictions", headers=headers_sb, json=predictions).raise_for_status()
        
        print(f"✨ ¡Hecho! Predicciones para {len(df)} estaciones publicadas.")
        return {"statusCode": 200, "body": "Success"}

    except Exception as e:
        print(f"❌ Error crítico: {str(e)}")
        return {"statusCode": 500, "body": str(e)}
