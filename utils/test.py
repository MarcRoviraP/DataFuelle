import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
import joblib
import os

# Asegurar que existe la carpeta de modelos
if not os.path.exists('models'):
    os.makedirs('models')

print("🚀 Cargando dataset...")
df = pd.read_parquet('data/gas_prices.parquet')

features = ['fecha', 'gasolinera_id', 'municipio_cp', 'price_diesel', 'price_95', 'price_98', 'day_of_week', 'month']
targets = ['target_diesel', 'target_95', 'target_98']

def entrenar_y_guardar(target_name):
    print(f"\n🎯 Entrenando cerebro para {target_name}...")
    
    # Limpiamos nulos por si acaso
    df_clean = df.dropna(subset=[target_name])
    X = df_clean[features]
    y = df_clean[target_name]
    
    # No hace falta split si vamos a producción, entrenamos con TODO para máxima precisión
    modelo = RandomForestRegressor(
        n_estimators=50, 
        max_depth=15, 
        n_jobs=-1, 
        random_state=42,
        verbose=0
    )
    
    modelo.fit(X, y)
    
    filename = f'models/model_{target_name.replace("target_", "")}.pkl'
    joblib.dump(modelo, filename)
    print(f"✅ Guardado: {filename}")

# Entrenamos los 3 cerebros
for t in targets:
    entrenar_y_guardar(t)

print("\n✨ ¡Todos los modelos están listos para ir a la web!")