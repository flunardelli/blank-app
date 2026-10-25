# Blob Clash 3D

Jogo hyper-casual no estilo *Join Blob Clash 3D*, feito com three.js e JavaScript puro (ES modules, sem build).

## Como jogar
- Seu blob corre sozinho pela pista; arraste (mouse/touch) ou use ← → / A D para desviar.
- **Portões coloridos** definem sua cor (metade esquerda / direita).
- Blobs da **sua cor** somam massa; de outra cor subtraem.
- **Paredes e serras** tiram 30% da massa (mínimo 3).
- No fim, o **clash** com o chefe: os dois perdem massa na mesma taxa; quem for maior sobrevive.

## Rodando
ES modules não funcionam via `file://`, então sirva a pasta por HTTP:

```bash
cd blob-clash
python3 -m http.server 8000   # ou: npm start
# abra http://localhost:8000
```

Testes (Node 18+): `npm test`

## Arquitetura

| Módulo | Responsabilidade | Depende de three.js? |
|---|---|---|
| `src/config.js` | Todos os números ajustáveis | não |
| `src/rng.js` | PRNG com seed (fases reproduzíveis) | não |
| `src/rules.js` | Regras puras: massa↔raio, colisões, clash | não |
| `src/level.js` | Gera a fase como **dados** (portões, pickups, obstáculos, chefe) | não |
| `src/levelView.js` | Converte os dados da fase em meshes | sim |
| `src/blob.js` | Mesh do blob (geometria/material compartilhados, wobble) | sim |
| `src/game.js` | Máquina de estados `ready → running → clash → won/lost` | sim |
| `src/effects.js`, `hud.js`, `input.js`, `world.js` | Partículas, UI em DOM, input, cena | sim |

A massa do chefe é calculada a partir da **massa máxima atingível** na fase
(`bestMass`, soma do melhor pickup por linha na melhor cor de cada segmento),
multiplicada por uma dificuldade que cresce por nível (50% → 85%). Assim toda fase é
vencível por construção, e isso é coberto por teste.
