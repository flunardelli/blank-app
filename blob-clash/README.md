# Blob Clash 3D

Jogo hyper-casual no estilo *Join Blob Clash 3D*, feito com three.js e JavaScript puro (ES modules, sem build).

**Jogue:** https://flunardelli.github.io/blank-app/

O three.js 0.169.0 está versionado em `vendor/three/` (licença MIT incluída), sem depender de CDN.
Todo push que altera `blob-clash/` roda os testes e republica no GitHub Pages (`.github/workflows/blob-clash-pages.yml`).

## Como jogar
- Segure e arraste (ou ← → / A D) para mover sua **multidão de bonequinhos de gelatina**.
- **Portões** +N / ×N aumentam a multidão, −N / ÷N diminuem. Os pares são dilemas de verdade: ×2 contra +15 depende de quantos você tem.
- **Muro numerado** (`-15 → ×3`): o muro come bonequinhos antes de multiplicar. Vale a pena? Faça a conta.
- **Obstáculos:** melancias e luvas de mola nas bordas, espinhos em zigue-zague, armadilha de largura total (pise no **botão verde**) e **ponte estreita** (fique no meio).
- **Multidões vermelhas:** os dois lados se anulam um a um.
- **Chefe (boxe com um dedo):** toque para socar, o 5º toque seguido é um **JUMP PUNCH**. Quando as luvas do chefe brilham, **pare de tocar** para bloquear, e toque logo depois para um **COUNTER** (3×).
  A vida que sobrar decide o multiplicador de moedas (x1.0–x5.0).
- **Chaves:** 3 chaves abrem o **quarto de baús** (9 baús, 1 por chave): moedas e **chapéus** para o campeão (troféus dos chefes). O botão 🎩 do menu troca o chapéu.
- **Upgrades:** Damage e Blobs. Os chefes são dimensionados para os upgrades que um jogador típico tem naquela fase.

### Progressão
Cada mecânica estreia sozinha, com uma dica, em uma fase: melancias (2), espinhos (3), armadilha (4), muro (6), portão com risco (7), ponte (8).
A dificuldade é em dente de serra: toda 5ª fase tem um chefe maior, e a seguinte é um respiro.

## Rodando
ES modules não funcionam via `file://`, então sirva a pasta por HTTP:

```bash
cd blob-clash
python3 -m http.server 8000   # ou: npm start
# abra http://localhost:8000
```

Testes (Node 18+): `npm test`

## Arquitetura

| Módulo | Responsabilidade | three.js? |
|---|---|---|
| `src/config.js` | Todos os números ajustáveis, paleta, desbloqueios | não |
| `src/rules.js` | Regras puras: portões, formação, colisões, ponte, boxe (bloqueio/counter), economia, baús | não |
| `src/level.js` | Gerador de fases por **blocos** (gate, gateRisk, wall, enemy, slider, spikes, trap, bridge) | não |
| `src/economy.js` | Curva de poder esperada (upgrades de um jogador típico por fase) | não |
| `src/bosses.js` | Elenco de chefes (visual + padrão de ataque) como dados | não |
| `src/game.js` | Máquina de estados `menu → running ⇄ skirmish → merge → boxing → bonus → complete / lost` | sim |
| `src/art/*` | Texturas em canvas e modelos procedurais (nenhum arquivo de imagem) | sim |
| `src/crowd.js`, `effects.js` | Multidão e efeitos com `InstancedMesh` (gotas, respingos) | sim |
| `src/audio.js` | Sons e música sintetizados com Web Audio, vibração | não |
| `src/hud.js`, `input.js`, `save.js`, `analytics.js` | UI em DOM, input, progresso salvo, eventos de analytics | não |

**Desempenho:** ~70 draw calls (objetos estáticos fundidos por material; moedas, gotas e respingos instanciados; sombras só nos personagens; DPR ≤ 1,5 em telas de toque).

**PWA:** `manifest.webmanifest` + `sw.js`, instalável e jogável offline quando servido por HTTPS.

**Analytics:** `track()` em `src/analytics.js` registra `level_start`, `level_complete`, `level_fail` (com a causa), `upgrade_buy` e `chest_open`. Basta ligar um backend em `send()`.

**Debug:** `?debug` expõe `window.__game` e loga os eventos.

### Testes
`npm test` (node --test) cobre as regras e o gerador:
- desbloqueio gradual das mecânicas;
- ausência de empates entre portões;
- muros que às vezes compensam e às vezes não;
- dente de serra;
- chefe vencível;
- curva de upgrades;
- bloqueio e counter;
- baús.

Dependências em `vendor/`: three.js 0.169.0 (MIT) e a fonte Fredoka (OFL).
