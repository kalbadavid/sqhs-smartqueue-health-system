import sqlite3

conn = sqlite3.connect('sqhs.db')
cur = conn.cursor()
cur.execute("UPDATE queue_entries SET position = -1 WHERE station='doctor' AND patient_id='MNK66E'")
cur.execute("UPDATE queue_entries SET position = 5 WHERE station='doctor' AND patient_id='9XKG2P'")
cur.execute("UPDATE queue_entries SET position = 4 WHERE station='doctor' AND patient_id='MNK66E'")
conn.commit()
conn.close()
print("Swapped bukola and path test")
