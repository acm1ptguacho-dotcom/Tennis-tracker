# Tennis Direction Tracker (Web v2)

## Novedades vs v1
1) Botón **Finalizar partido**
2) Se guardan **todos los puntos** (secuencias completas) y se revisan en **Historial**
3) Botón **Historial** durante el partido para revisar puntos anteriores y volver a trackear
4) Grilla 3x3 ajustada a **singles** (sin pasillos de dobles) para esta imagen
5) El **saque** se marca sólo en el **cuadro cruzado correcto** (lógica SD/SV)
6) En saque: botones **Falta** y **Doble falta**
7) En rally: finalizar punto con **Error no forzado / Error forzado / Winner** para A o B

## Ejecutar (recomendado: servidor local)
- Con Python:
  - `python -m http.server 8000`
- Con Node:
  - `npx serve`

Luego abre: http://localhost:8000

> PWA/offline (service worker) sólo funciona en https o localhost.

## Uso rápido
- Empieza el punto en fase **SAQUE**:
  - Toca el **cuadro de saque cruzado** habilitado (solo uno activo).
  - Si el 1º saque es falta: pulsa **FALTA** (y luego toca el 2º saque).
  - Si es doble falta: pulsa **DOBLE FALTA** (el punto se asigna al restador).
- Tras el saque en juego, pasas a fase **RALLY**:
  - Toca zonas 3x3 en el lado correcto.
  - Para terminar el punto usa los botones de resultado (UNF/FOR/WIN).

## Ajuste fino de overlays (si cambias imagen)
En `style.css` (variables):
- `--inset-x` (singles)
- `--top-inset-top`, `--top-height` (baseline→net)
- `--serve-top-top`, `--serve-band-height`, `--serve-bottom-top` (service boxes)
