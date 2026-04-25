import pandas as pd

df_shots = pd.read_csv('../../csv/shots_with_qualifiers.csv')
q = df_shots['qualifiers']
df_shots['is_big_chance'] = q.str.contains('BigChance', na=False).astype(int)
df_shots['is_header'] = q.str.contains('Head', na=False).astype(int)
df_shots['is_right_foot'] = q.str.contains('RightFoot', na=False).astype(int)
df_shots['is_left_foot'] = q.str.contains('LeftFoot', na=False).astype(int)

def body_part(row):
    if row['is_header'] == 1: return 'Cabeza'
    if row['is_right_foot'] == 1: return 'Pierna Derecha'
    if row['is_left_foot'] == 1: return 'Pierna Izquierda'
    return 'Otro'

df_shots['body_part'] = df_shots.apply(body_part, axis=1)

print("\\nBIG CHANCE:")
print(df_shots.groupby('is_big_chance')['is_goal'].mean().round(3) * 100)
print("\\nBODY PART:")
print(df_shots.groupby('body_part')['is_goal'].mean().round(3) * 100)
