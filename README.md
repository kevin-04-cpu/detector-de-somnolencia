<div align="center">

<img src="docs/assets/logo.svg" width="72" alt="Logo" />

# Detector de somnolencia

Clasificación binaria de somnolencia en conductores mediante redes neuronales convolucionales a partir de imágenes faciales.

![Estado](https://img.shields.io/badge/estado-prototipo-orange?style=flat-square)
![App](https://img.shields.io/badge/app-web%20m%C3%B3vil%20(PWA)-black?style=flat-square)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Face%20Landmarker-0097A7?style=flat-square)

<img src="docs/assets/demo.gif" width="300" alt="Demo: detección de rostro y ojos en vivo y resultado" />

</div>

## Qué hace

Usa la **cámara frontal** del celular para detectar el **rostro** y la **ubicación de los ojos** en tiempo real. Al capturar, recorta el rostro y una **CNN** lo clasifica como **Somnoliento** o **Alerta**.

## Cómo funciona

```mermaid
flowchart LR
    A[Cámara frontal] --> B[MediaPipe<br/>rostro + ojos]
    B -. solo en pantalla .-> C[EAR<br/>verde / rojo]
    B --> D[Recorte del rostro]
    D --> E[CNN]
    E --> F[Alerta / Somnoliento]
```

La foto **siempre** pasa por la CNN, que es la que decide. El EAR (qué tan abiertos están los ojos) solo se muestra en pantalla como indicador en vivo.

→ Detalle en [docs/arquitectura.md](docs/arquitectura.md)

## Avance

| Parte | Estado |
|---|---|
| App móvil con cámara frontal | ✅ Listo |
| Detección de rostro y ojos en vivo | ✅ Listo |
| Dataset de entrenamiento | 🚧 Pendiente · [docs/dataset.md](docs/dataset.md) |
| Entrenamiento de la CNN | 🚧 Pendiente · [docs/resultados.md](docs/resultados.md) |
| Backend con el modelo | 🚧 Pendiente |

> [!NOTE]
> Mientras no exista la CNN, la app funciona en **modo demo**: el resultado sale de una regla simple con el EAR, no del modelo.

## Ejecutar

```bash
cd frontend
python -m http.server 5500
```

Abrir <http://localhost:5500> y permitir la cámara. Para probar en el celular ver [frontend/README.md](frontend/README.md).

## Estructura

```
├── frontend/   App web móvil (HTML + CSS + JS, MediaPipe)
└── docs/       Arquitectura, dataset y resultados
```

## Equipo

- David Orlando Hernández Murillo
- Kevin Jesús Parada Castillo
- Ronald Santiago Tineo Niño

<sub>Universidad de Pamplona · Sistemas Inteligentes · Proyecto de curso</sub>
