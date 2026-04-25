import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import matplotlib.patches as patches

# 1. Cargar datos de eventos
events_path = '../../csv/events.csv'
df_events = pd.read_csv(events_path)

# Filtrar solo los eventos que son tiros
df_shots = df_events[df_events['is_shot'] == 1].copy()

# Eliminar eventos sin coordenadas reales
df_shots = df_shots[~((df_shots['x'] == 0) & (df_shots['y'] == 0))]

# Meta rival: X = 100, Y = 50

# 1. Distancia al arco (Euclidiana)
df_shots['distancia_al_arco'] = np.sqrt((100 - df_shots['x'])**2 + (50 - df_shots['y'])**2)

# 2. Ángulo de tiro (atan2) 
df_shots['angulo_del_tiro'] = np.abs(np.arctan2(50 - df_shots['y'], 100 - df_shots['x']))

def draw_half_pitch(ax=None):
    if ax is None:
        ax = plt.gca()
    # Fondo verde para el campo
    ax.set_facecolor('#2e8b57')
    # Contorno del campo (solo mitad atacante 50-100)
    ax.plot([50, 100, 100, 50, 50], [0, 0, 100, 100, 0], color='white')
    # Línea central
    ax.plot([50, 50], [0, 100], color='white', zorder=1)
    # Círculo central (mitad)
    arc_central = patches.Arc((50, 50), height=18.3, width=18.3, angle=0, theta1=270, theta2=90, color='white', zorder=1)
    ax.add_patch(arc_central)
    # Área grande derecha
    ax.plot([100, 83, 83, 100], [21.1, 21.1, 78.9, 78.9], color='white', zorder=1)
    # Área pequeña derecha
    ax.plot([100, 94.2, 94.2, 100], [36.8, 36.8, 63.2, 63.2], color='white', zorder=1)
    # Punto de penal (X=88.5, Y=50)
    ax.plot(88.5, 50, 'ow', markersize=4, zorder=1)
    # Arco de área de penal derecha
    arc_der = patches.Arc((88.5, 50), height=18.3, width=18.3, angle=0, theta1=127, theta2=233, color='white', zorder=1)
    ax.add_patch(arc_der)
    # Portería derecha
    ax.plot([100, 100], [45, 55], color='white', linewidth=4, zorder=1)
    ax.axis('off')
    return ax

fig, ax = plt.subplots(figsize=(8, 10))
draw_half_pitch(ax)

sns.scatterplot(
    data=df_shots, 
    x='x', 
    y='y', 
    hue='is_goal', 
    palette={0: '#ADD8E6', 1: '#FF0000'}, 
    alpha=0.8,
    edgecolor='black',
    s=60,
    ax=ax,
    zorder=2
)

plt.title('Mapa de Distribución de Tiros (Mitad Atacante)', color='black', fontsize=16, pad=15)
plt.xlim(50, 100)
plt.ylim(0, 100)

handles, labels = ax.get_legend_handles_labels()
if handles:
    ax.legend(handles=handles, labels=['No Gol', 'Gol'], title='Resultado', bbox_to_anchor=(1.05, 1), loc='upper left')

plt.tight_layout()
plt.savefig('pitch_test.png')
print("Exito")
