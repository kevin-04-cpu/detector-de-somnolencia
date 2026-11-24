# Frontend — Detector de somnolencia

App web móvil (PWA) en HTML + CSS + JS puro, sin build. Pensada para el celular con la cámara frontal.

## Qué hace
- Abre la cámara frontal a pantalla completa.
- Detecta el **rostro** y la **ubicación de los ojos** en vivo con
  [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
  (corre en el navegador, se carga desde CDN).
- Calcula el **EAR** (Eye Aspect Ratio) como indicador en vivo de apertura de ojos.
- Al capturar (o elegir una imagen de la galería), **recorta el rostro** y lo envía a la CNN.
- Se puede instalar en la pantalla de inicio del celular (manifest + service worker).

## Ejecutar en el computador
```
cd frontend
python -m http.server 5500
```
Abrir http://localhost:5500 (localhost permite usar la cámara).

## Probar en el celular
El navegador solo permite la cámara con **HTTPS** (o en localhost), así que abrir
`http://IP-del-PC:5500` desde el celular no sirve. Opciones:
- Publicar la carpeta `frontend/` en GitHub Pages (da HTTPS).
- Usar un túnel HTTPS como `cloudflared tunnel --url http://localhost:5500`.

## Conectar con el backend
Cambiar `API_URL` en `app.js`. Endpoint esperado:

`POST /predict` (multipart, campo `file` con el rostro recortado en JPG) →
`{ "label": "drowsy" | "non_drowsy", "confidence": 0.93 }`

El backend debe habilitar CORS.

Sin backend funciona en **modo demo**: el resultado sale de una regla simple con el EAR
(`EAR < 0.18` ⇒ somnoliento). Es solo para mostrar el flujo; **no es la CNN**.
