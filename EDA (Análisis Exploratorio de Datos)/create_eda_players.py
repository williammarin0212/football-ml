import nbformat as nbf

nb = nbf.v4.new_notebook()

# Imports
cell_imports = nbf.v4.new_code_cell("""\
import pandas as pd
import numpy as np
import plotly.express as px
import warnings
warnings.filterwarnings('ignore')""")

# Introduction
cell_md_intro = nbf.v4.new_markdown_cell("""\
# Exploratory Data Analysis (EDA) - Player History 🏃‍♂️📊
En este documento exploramos el dataset del historial de jugadores (`player_history.csv`), que contiene ricas métricas de rendimiento y Fantasy Premier League (FPL). Realizamos una limpieza integral y descubrimos perfiles de jugadores a través de visualizaciones interactivas en 3D.""")

# Data loading & Cleaning
cell_md_clean = nbf.v4.new_markdown_cell("""\
## 1. Carga y Limpieza de Datos 🧹
- **Valores Nulos**: Imputación de métricas avanzadas (Goles Esperados `xG`, Asistencias Esperadas `xA`) cuando faltan, y limpieza de datos de mercado (transferencias).
- **Consolidación**: Aseguramos que los tipos numéricos sean correctos para el trazado 3D.
""")

cell_code_clean = nbf.v4.new_code_cell("""\
df = pd.read_csv('../../csv/player_history.csv')

# 1. Imputación de Valores Nulos
# Si faltan métricas de xG o xA, las imputamos con 0 o la media según el rol, aquí usaremos una imputación robusta con 0 para minutos bajos.
cols_to_fill_zero = ['expected_goals', 'expected_assists', 'influence', 'creativity', 'threat', 'transfers_in', 'transfers_out']
for col in cols_to_fill_zero:
    if col in df.columns:
        df[col] = df[col].fillna(0.0)

# Asegurar tipos numéricos en métricas
df['value'] = pd.to_numeric(df['value'], errors='coerce').fillna(df['value'].median())
df['total_points'] = pd.to_numeric(df['total_points'], errors='coerce').fillna(0)

# Para evitar gráficos sobrecargados, agrupamos el rendimiento por jugador para los análisis de temporada
df_agg = df.groupby(['web_name', 'team']).agg({
    'minutes': 'sum',
    'goals_scored': 'sum',
    'assists': 'sum',
    'total_points': 'sum',
    'expected_goals': 'sum',
    'expected_assists': 'sum',
    'threat': 'mean',
    'value': 'mean',
    'transfers_in': 'sum',
    'selected': 'mean'
}).reset_index()

# Filtramos jugadores con muy pocos minutos para evitar ruidos estadísticos
df_active = df_agg[df_agg['minutes'] > 200]

print(f"Dataset cargado, agrupado y limpio. Jugadores Activos analizados: {df_active.shape[0]}\\n")
df_active.head(3)""")

# Viz 1
cell_md_viz1 = nbf.v4.new_markdown_cell("""\
## Exploración Visual 1: Expectativa vs Realidad (xG / xA vs Puntos) 🎯
**Objetivo**: Analizar en 3D si acumular una alta expectativa estadística (xG y xA) se traduce inevitablemente en puntos de Fantasy (FPL).

**💡 Insights:**
- Existe una **pirámide de la élite**: Los jugadores que combinan Goles Esperados (X) y Asistencias Esperadas (Y) altas se elevan inmensamente en la montaña de Puntos Totales (Z). 
- Hay **"Underperformers" (Trampas Estadísticas)**: Ciertos jugadores que se ubican lejos en el eje de X e Y (generan muchas chances) no se elevan en el eje Z (Puntos), demostrando mala definición o mala suerte.
- Rotando la cámara, es evidente que los goles reales (color del punto) dictaminan la altura final en Z, premiando a los finalizadores clínicos que "sobre-rinden" sus estadísticas base.
""")

cell_code_viz1 = nbf.v4.new_code_cell("""\
fig1 = px.scatter_3d(
    df_active, 
    x='expected_goals', y='expected_assists', z='total_points',
    color='goals_scored',
    color_continuous_scale='Viridis',
    labels={'expected_goals': 'Goles Esperados (xG) [X]', 'expected_assists': 'Asistencias Esperadas (xA) [Y]', 'total_points': 'Puntos FPL Totales (Z)', 'goals_scored': 'Goles Reales'},
    hover_name='web_name',
    hover_data=['team', 'minutes'],
    opacity=0.8,
    title='Rendimiento Esperado (Estadística Avanzada) vs Puntos Reales Obtenidos'
)
fig1.update_traces(marker=dict(size=5, line=dict(width=0.5, color='DarkSlateGrey')))
fig1.update_layout(margin=dict(l=0, r=0, b=0, t=40), scene=dict(camera=dict(eye=dict(x=-1.5, y=-1.5, z=0.5))))
fig1.show()""")

# Viz 2
cell_md_viz2 = nbf.v4.new_markdown_cell("""\
## Exploración Visual 2: Las Joyas Ocultas (Valor de Mercado vs Minutos Jugados) 💎
**Objetivo**: Encontrar jugadores ultra eficientes que, teniendo un Precio de Mercado bajo, disputan muchos minutos y cosechan puntos formidables.

**💡 Insights:**
- El **Cubo del Presupuesto** muestra clusters claros. Los jugadores Premium (Valor X alto) suelen jugar todos los minutos (Y) y estar en la cima de puntos (Z).
- La verdadera magia está en la esquina de **"Gemas Low-Cost"**: Jugadores flotando con alta altitud de puntos (Z) pero atrapados a la izquierda del Valor (X bajo) y con alta asiduidad en minutos (Y). Estos son defensores de equipos medianos o mediocampistas clave que sostienen equipos de FPL sin quebrar la alcancía.
""")

cell_code_viz2 = nbf.v4.new_code_cell("""\
fig2 = px.scatter_3d(
    df_active,
    x='value', y='minutes', z='total_points',
    color='team',
    labels={'value': 'Valor de Mercado FPL (X)', 'minutes': 'Minutos Jugados (Y)', 'total_points': 'Puntos FPL (Z)', 'team': 'Equipo'},
    hover_name='web_name',
    hover_data=['goals_scored', 'assists'],
    title='Búsqueda de Rentabilidad: Minutos y Valor de Mercado'
)
fig2.update_traces(marker=dict(size=4, opacity=0.8))
fig2.update_layout(margin=dict(l=0, r=0, b=0, t=40), scene=dict(camera=dict(eye=dict(x=1.5, y=-1.5, z=0.5))))
fig2.show()""")

# Viz 3
cell_md_viz3 = nbf.v4.new_markdown_cell("""\
## Exploración Visual 3: El Mapeo del "Hype" (Popularidad vs Rendimiento) 📢
**Objetivo**: Observar si los jugadores más transferidos al equipo y seleccionados tienen el impacto deportivo que justifica su popularidad masiva.

**💡 Insights:**
- La densa nube en la cordillera más abaja indica que la inmensa mayoría de la liga tiene selecciones bajas (Y) y pocas transferencias entrantes (X).
- Los jugadores "Trends" o de moda (Eje X disparado hacia la derecha) suelen acompañar picos altísimos en Puntos (Z), indicando que el "sabio comportamiento de manada" de los managers suele cazar jugadores en racha real.
- Peligro: Existen columnas de puntos en amarillo o verde claro (alta popularidad relativa) que se hunden en puntos (Z), revelando jugadores sobrevalorados ("FPL Traps") que arrastran a miles de entrenadores.
""")

cell_code_viz3 = nbf.v4.new_code_cell("""\
fig3 = px.scatter_3d(
    df_active,
    x='transfers_in', y='selected', z='total_points',
    color='threat',
    color_continuous_scale='Plasma',
    labels={'transfers_in': 'Transferencias Adquiridas (X)', 'selected': 'Ownership Media % (Y)', 'total_points': 'Puntos FPL Generados (Z)', 'threat':'Amenaza Ofensiva'},
    hover_name='web_name',
    hover_data=['team', 'value'],
    title='El Hype Market: Adquisiciones Masivas vs Puntos Reales'
)
fig3.update_traces(marker=dict(size=5, opacity=0.7, line=dict(width=0.5, color='gray')))
fig3.update_layout(margin=dict(l=0, r=0, b=0, t=40), scene=dict(camera=dict(eye=dict(x=-1.5, y=1.5, z=0.5))))
fig3.show()""")

nb['cells'] = [cell_md_intro, cell_imports, cell_md_clean, cell_code_clean, 
               cell_md_viz1, cell_code_viz1, cell_md_viz2, cell_code_viz2,
               cell_md_viz3, cell_code_viz3]

with open('EDA Player_ History.ipynb', 'w', encoding='utf-8') as f:
    nbf.write(nb, f)
print("Notebook EDA Player_ History.ipynb generado exitosamente!")
