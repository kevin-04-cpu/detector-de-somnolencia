# Frontend DrowsyDetect

HTML + CSS + JS puro (sin dependencias, sin build).

## Ejecutar
```
cd frontend
python -m http.server 5500
```
Abrir http://localhost:5500 (localhost permite usar la cámara).

## Conectar con el backend
Cambiar `API_URL` en `app.js`. Endpoint esperado:

`POST /predict` (multipart, campo `file`) → `{ "label": "drowsy" | "non_drowsy", "confidence": 0.93 }`

Sin backend, funciona en **modo demo** con resultados simulados. El backend debe habilitar CORS.
