import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error

# Linkear BigData con IA

df = pd.read_csv('datos.csv')

# Separa info (x) de predicción (y)
x = df.drop('precio_prox_semana', axis=1)
y = df['precio_prox_semana']

# Dividir los datos: 80% entrenamiento, 20% prueba
x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42)

# Cerebro de la IA: Funcion Regressor para predecir un numero continua
modelo = RandomForestRegressor(n_estimators=100, random_state=42)

# Entrenamiento IA
modelo.fit(x_train, y_train)

# Testeo 1: Prueba
predicciones = modelo.predict(x_test)
# Testeo 2: Evaluación de precisión en la predicción
error = mean_absolute_error(y_test, predicciones)
print(f'El modelo se equivoca en promedio por: {error} unidades de precio')

'''
PROPUESTAS
Aumentar el machine learning de y a:

    - Precio medio cada día de la semana
    - Marcas de gasolinera mas baratas
    - Zonas (comarcas) con el precio medio mas barato
'''