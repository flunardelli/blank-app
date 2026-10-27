# Blob Clash 3D

Jogo hyper-casual no estilo *Join Blob Clash 3D*, feito com three.js e JavaScript puro (ES modules, sem build).

**Jogue:** https://flunardelli.github.io/blank-app/

O three.js 0.169.0 está versionado em `vendor/three/` (licença MIT incluída), sem depender de CDN.
Todo push que altera `blob-clash/` roda os testes e republica no GitHub Pages (`.github/workflows/blob-clash-pages.yml`).

## Como jogar
- Segure e arraste (ou ← → / A D) para mover sua **multidão de bonequinhos de gelatina**. O número no balão azul é o tamanho dela.
- **Portões +N / ×N** aumentam a multidão; os vermelhos (−N / ÷N) diminuem. A metade que você atravessa vale.
  Um par nunca repete a operação (nada de "×2 | ×2"): quando os dois lados são bons, um é × e o outro é +.
- **Obstáculos:** fatias de melancia e **luvas de boxe em mola** que entram pelas bordas, e espinhos nas laterais.
- **Armadilha com botão:** espinhos na pista inteira. Pise no **botão verde** antes deles para recolhê-los, senão a multidão morre.
- **Serras** (fase 2+) deslizam num trilho de um lado ao outro da pista.
- **Machado pendular** (mundo 3+, a partir da fase 7): balança de uma borda à outra e só corta quando a lâmina está baixa; nas pontas do arco ela passa acima das cabeças.
- **Pilares com espinhos** (mundo 4+, a partir da fase 10): um ou dois pares nas bordas, espinhos em cima, que estreitam a pista; o meio sempre deixa a maior multidão passar.
- **Bloco empurrador** (mundo 4+): um bloco grande entra pela lateral e sai de novo, levando quem estiver na frente; a pista nunca fecha para a maior multidão (coberto por teste).
- **Pulo** (fase 2+): uma rampa amarela lança quem passa por ela por cima das serras logo atrás; quem desvia da rampa encara as serras.
- **Bombas** (fase 3+): duas fileiras, cada uma agrupada de um lado (alternando), com espaço para a maior multidão passar pelo outro. Encostou, explode e leva todo mundo no raio.
- **Bonecos cinza** (fase 2+) andam de um lado para o outro; cada um que esbarra leva um blob junto. A partir da fase 4 aparecem os **brutamontes** (levam 5).
- Cada fase tem um **obstáculo em destaque** (em ciclo: luvas/melancias, serras, bombas, pulo, armadilha, espinhos), então fases seguidas não se repetem.
- **Multidões vermelhas** bloqueiam a pista: os dois lados se anulam um a um.
- **Skins** (`src/skins.js`): o botão SKINS no menu abre a loja; skins se compram com moedas e vestem só o **líder da multidão** e o **campeão** da luta (o resto da multidão continua laranja). O catálogo é uma lista; os acessórios ficam em `src/art/skinModels.js`.
- **Fase do baú** (`src/chest.js`, `src/chestStage.js`, `src/art/chest.js`): a pista termina num baú 3D gigante. Os blobs pulam dentro um a um (o contador de moedas sobe a cada um), a tampa bate, a câmera gira do lado para a frente com zoom (~1,2 s) e a tampa abre com um tranco, soltando 360 moedas 3D giratórias (um só `InstancedMesh`) que caem e somem sem deixar nada no chão. Cada blob vale mais moedas a cada mundo; o multiplicador e as estrelas vêm do tamanho da multidão que chegou. Tudo em `CONFIG.chest`.
- **Moedas** na pista e **uma chave por fase**. Com 3 chaves, abre um **baú** de moedas.
- **Boss:** a multidão se funde num campeão de luvas, que abre a luta com um **soco voador**.
  **TAP TO FIGHT!**: cada toque é um jab; o 5º toque seguido vira **JUMP PUNCH** (2,5× de dano).
  A partir do mundo 2 os chefes ganham mecânicas (`mechanics` em `src/bosses.js`, estado puro em `bossBrainStep`):
  **golpe grande** avisado 0,8 s (o chefe brilha, aparece **ARRASTE!** com a seta): arrastar para o lado (ou ←/→) desvia
  e abre 1,5 s de contra-ataque com dano dobrado; **guarda alta**: jabs fazem 20% até o chefe baixar a guarda (o JUMP PUNCH
  atravessa); **fúria** abaixo de 50% de vida: 25% mais rápido e troca de golpe (`rage`). Mini chefes usam só uma delas.
  Multidão maior dá mais vida e soco mais forte; todo chefe derruba qualquer campeão em ~10 s, então é preciso tocar rápido.
- **30 fases em 10 mundos de 3** (`src/worlds.js`): a fase 1 de cada mundo termina num **mini chefe** (um chefe do elenco
  em 0,8×, na cor do mundo, só com jabs), a 2 no **chefão** do mundo e a 3 num **baú de moedas** (sem luta).
  Cada mundo tem um obstáculo em destaque. A pressão (tamanho da pista, multidões inimigas, vida dos chefes) sobe dentro do
  mundo e dá um respiro quando o próximo começa; de 6 a 12 segmentos por fase.
- **Chefes** (`src/bosses.js`), cada um com visual e golpe próprios; qual aparece em cada fase vem do mundo:

  | Chefe | Visual | Golpe |
  |---|---|---|
  | ROOKIE | capacete de futebol americano | jab simples |
  | SPARTAN | elmo grego com crista | golpe pesado, preparação longa |
  | KING BLOB | coroa, corpo largo | soco duplo |
  | VIKING | chifres | pula e esmaga o ringue (onda de poeira) |
  | PUNK | moicano | sequência de 3 socos |

  Golpes diferentes, mesmo dano médio por segundo (coberto por teste); adicionar um chefe é adicionar uma linha.
- **Animação dos golpes** (`src/moves.js`): cada golpe é uma coreografia em keyframes (preparação, impacto,
  recuperação), tocada sobre bonecos articulados (`src/art/boxer.js`: ombro, cotovelo, pernas, cabeça).
  O dano cai no quadro em que o soco encosta, golpes fortes têm *hit stop* e a câmera dá um tranco.
  O motor de keyframes (`src/anim.js`) não depende do three.js e tem testes próprios.
- A vida que sobrar decide até onde o Boss voa na pista **x1.0 … x5.0**, que multiplica as moedas.
- Moedas compram upgrades no menu: **Damage** (força do soco) e **Blobs** (tamanho inicial).

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
| `src/bosses.js` | Elenco de chefes (visual + padrão de ataque) como dados | não |
| `src/rng.js` | PRNG com seed (fases reproduzíveis) | não |
| `src/rules.js` | Regras puras: portões, formação da multidão, colisões, briga, Boss, bônus, upgrades | não |
| `src/level.js` | Gera a fase como **dados** (portões, obstáculos, moedas, inimigos, Boss) | não |
| `src/art/textures.js` | Texturas desenhadas em canvas (água, listras, texto com contorno, respingos) | sim |
| `src/art/models.js` | Modelos procedurais: bonequinho de gelatina, Boss, melancia, espinhos, ringue, escada de bônus | sim |
| `src/art/hazards.js` | Serra com trilho, machado pendular, rampa de pulo, bomba | sim |
| `src/crowd.js` | Multidão como um único `InstancedMesh` | sim |
| `src/levelView.js` | Converte os dados da fase em objetos 3D | sim |
| `src/game.js` | Máquina de estados `menu → running ⇄ skirmish → merge → boxing → bonus → complete / lost` | sim |
| `src/effects.js`, `hud.js`, `input.js`, `save.js`, `world.js` | Efeitos, UI em DOM, input, progresso salvo, cenário | sim |

Não há nenhum arquivo de imagem: toda a arte é gerada por código.

A vida do Boss vem da **maior multidão possível** na fase (escolhendo sempre o melhor portão e
descontando os inimigos), multiplicada por uma dificuldade que sobe de 40% a 90% com o nível.
Um teste garante que, com a melhor multidão, a luta pede no máximo 6 toques/s (e ≤ 3 na fase 1).

Dependências versionadas em `vendor/`: three.js 0.169.0 (MIT) e a fonte Fredoka (OFL).
