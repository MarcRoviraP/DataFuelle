import joblib
import pandas as pd
import requests
import datetime
import os

# Configuración (REST API directa)
SUPABASE_URL = 'https://msetjsrlioiysxmgybdg.supabase.co/rest/v1'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZXRqc3JsaW9peXN4bWd5YmRnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMzODQwNiwiZXhwIjoyMDkxOTE0NDA2fQ.V9t1wXP8fecHSPkMJS4YJz8JfLPlPGVsYQzkKZp_wjs'

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

# Cargar modelos
print("🧠 Cargando modelos IA...")
models = {
    'diesel': joblib.load('models/model_diesel.pkl'),
    '95': joblib.load('models/model_95.pkl'),
    '98': joblib.load('models/model_98.pkl')
}

def fetch_all(table, select="*", order=None, limit=None):
    results = []
    page_size = 1000
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/{table}?select={select}&limit={page_size}&offset={offset}"
        if order:
            url += f"&order={order}"
        
        res = requests.get(url, headers=HEADERS)
        res.raise_for_status()
        data = res.json()
        if not data:
            break
        results.extend(data)
        if len(data) < page_size or (limit and len(results) >= limit):
            break
        offset += page_size
    return pd.DataFrame(results[:limit] if limit else results)

def get_all_stations_with_prices():
    print("🏢 Obteniendo datos de todas las estaciones con precios...")
    df = fetch_all('stations', select='external_id,postal_code,last_price_95,last_price_98,last_price_diesel')
    
    # Renombrar para que coincida con la lógica de predicción
    df = df.rename(columns={
        'external_id': 'station_id',
        'last_price_95': 'price_95',
        'last_price_98': 'price_98',
        'last_price_diesel': 'price_diesel'
    })
    
    # Solo estaciones que tengan al menos UN precio
    total_antes = len(df)
    df = df.dropna(subset=['price_95', 'price_98', 'price_diesel'], how='all')
    print(f"✅ Se filtraron {total_antes - len(df)} estaciones sin ningún precio. Quedan {len(df)} para predecir.")
    return df

def run():
    # 1. Datos actuales directamente de la tabla stations
    df = get_all_stations_with_prices()
    
    # 2. Preparar features para HOY
    now = datetime.datetime.now()
    target_date = (now + datetime.timedelta(days=7)).date()
    
    print(f"🔮 Generando predicciones para el {target_date}...")
    
    # Sanitizar CP
    df['municipio_cp'] = df['postal_code'].apply(lambda x: int(str(x).split('-')[0]) if x else 0)
    
    df_features = pd.DataFrame({
        'fecha': int(now.timestamp()),
        'gasolinera_id': df['station_id'].astype(int),
        'municipio_cp': df['municipio_cp'].astype(int),
        'price_diesel': df['price_diesel'].astype(float),
        'price_95': df['price_95'].astype(float),
        'price_98': df['price_98'].astype(float),
        'day_of_week': now.weekday(),
        'month': now.month
    })

    # 3. Predecir
    df['pred_diesel'] = models['diesel'].predict(df_features)
    df['pred_95'] = models['95'].predict(df_features)
    df['pred_98'] = models['98'].predict(df_features)

    # 4. Guardar en Supabase (Batch)
    print("💾 Subiendo predicciones...")
    batch = []
    for _, row in df.iterrows():
        batch.append({
            'station_id': int(row['station_id']),
            'target_date': str(target_date),
            'predicted_diesel': float(row['pred_diesel']),
            'predicted_95': float(row['pred_95']),
            'predicted_98': float(row['pred_98'])
        })
        
        if len(batch) >= 500:
            requests.post(f"{SUPABASE_URL}/price_predictions", headers=HEADERS, json=batch).raise_for_status()
            batch = []
            
    if batch:
        requests.post(f"{SUPABASE_URL}/price_predictions", headers=HEADERS, json=batch).raise_for_status()

    print(f"✨ ¡Hecho! Predicciones para {len(df)} estaciones publicadas.")

if __name__ == "__main__":
    run()
