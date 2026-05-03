# Fantasy Engine

Fantasy Engine e uma engine web para MMORPG 2D massivo, inspirada no Intersect Engine e projetada com servidor autoritativo desde o inicio.

O Intersect original esta em `vendor/Intersect-Engine` como referencia upstream. A implementacao web fica nos apps e packages deste monorepo.

## Primeira execucao

Instale as dependencias:

```bash
npm install
```

Rode o servidor de jogo:

```bash
npm run dev:server
```

Em outro terminal, rode o cliente web:

```bash
npm run dev:client
```

O cliente abre em `http://localhost:5173` e conecta no servidor WebSocket em `ws://localhost:8787`.

## Banco de dados

O servidor usa PostgreSQL quando `DATABASE_URL` esta configurado. Sem essa variavel, ele usa um repositório em memoria apenas para desenvolvimento local.

Migration inicial:

```bash
packages/database/migrations/001_initial_characters.sql
```

Exemplo de ambiente:

```bash
cp .env.example .env
```

## Controles atuais

- `WASD` ou setas: movimento validado pelo servidor.
- `Espaco`: ataque na entidade que estiver na direcao do personagem.
- `E`: pegar item proximo validado pelo servidor.
- `R`: coletar recurso proximo validado pelo servidor.
- `1`: conjurar a primeira spell equipada.

## Sistemas implementados no prototipo

- Movimento autoritativo.
- NPCs com vida e respawn.
- Combate com cooldown validado no servidor.
- Drops e coleta com validacao de alcance.
- Resources coletaveis com vida, cooldown, inventario e respawn autoritativos.
- Inventario persistente por personagem.
- Crafting autoritativo com receitas, consumo de ingredientes e criacao de itens no servidor.
- Equipment/paperdoll inicial com arma equipada persistente e bonus de dano calculado no servidor.
- Banco de itens persistente com deposito e saque validados pelo servidor.
- XP, level e gold persistentes.
- Atributos autoritativos com pontos por level up e bonus de combate validados no servidor.
- Shop com compras validadas pelo servidor.
- Uso de pocao com cura e consumo validados pelo servidor.
- Contra-ataque basico de NPCs e retorno ao ponto inicial ao cair.
- Quests autoritativas com progresso por NPC derrotado e recompensa persistente.
- Spells autoritativas com alcance, dano e cooldown validados no servidor.

## Regra de ouro

O cliente envia intencoes. O servidor decide o resultado.