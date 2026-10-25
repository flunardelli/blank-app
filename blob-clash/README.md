# Blob Clash 3D

Jogo hyper-casual no estilo *Join Blob Clash 3D*, feito com three.js e JavaScript puro (ES modules, sem build).

**Jogue:** https://flunardelli.github.io/blank-app/

O three.js 0.169.0 está versionado em `vendor/three/` (licença MIT incluída), sem depender de CDN.
Todo push que altera `blob-clash/` roda os testes e republica no GitHub Pages (`.github/workflows/blob-clash-pages.yml`).

## Como jogar
- Segure e arraste (ou ← → / A D) para mover sua **multidão de bonequinhos de gelatina**. O número no balão azul é o tamanho dela.
- **Portões +N / ×N** aumentam a multidão; os vermelhos (−N / ÷N) diminuem. A metade que você atravessa vale.
- **Fatias de melancia** entram e saem pelas bordas; **espinhos** ficam nas laterais. Quem encosta, morre.
- **Multidões vermelhas** bloqueiam a pista: os dois lados se anulam um a um.
- No **ringue**, a multidão ataca o **Boss** de luvas de boxe. Cada bonequinho tira `Damage` de vida.
- Os sobreviventes decidem até onde o Boss nocauteado voa na pista **x1.0 … x5.0**, que multiplica as moedas.
- Moedas compram upgrades no menu: **Damage** (dano por bonequinho) e **Blobs** (tamanho inicial).

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
| `src/config.js` | Todos os números ajustáveis e a paleta de cores | não |
| `src/rng.js` | PRNG com seed (fases reproduzíveis) | não |
| `src/rules.js` | Regras puras: portões, formação da multidão, colisões, briga, Boss, bônus, upgrades | não |
| `src/level.js` | Gera a fase como **dados** (portões, obstáculos, moedas, inimigos, Boss) | não |
| `src/art/textures.js` | Texturas desenhadas em canvas (água, listras, texto com contorno, respingos) | sim |
| `src/art/models.js` | Modelos procedurais: bonequinho de gelatina, Boss, melancia, espinhos, ringue, escada de bônus | sim |
| `src/crowd.js` | Multidão como um único `InstancedMesh` | sim |
| `src/levelView.js` | Converte os dados da fase em objetos 3D | sim |
| `src/game.js` | Máquina de estados `menu → running ⇄ skirmish → boss → bonus → complete / lost` | sim |
| `src/effects.js`, `hud.js`, `input.js`, `save.js`, `world.js` | Efeitos, UI em DOM, input, progresso salvo, cenário | sim |

Não há nenhum arquivo de imagem: toda a arte é gerada por código.

A vida do Boss vem da **maior multidão possível** na fase (escolhendo sempre o melhor portão e
descontando os inimigos), multiplicada por uma dificuldade que sobe de 40% a 90% com o nível.
Assim toda fase é vencível por construção, e isso é coberto por teste.

Dependências versionadas em `vendor/`: three.js 0.169.0 (MIT) e a fonte Fredoka (OFL).
