# Migracao do Intersect Engine para Navegador

## Estado atual

O repositório oficial do Intersect Engine foi baixado em:

`vendor/Intersect-Engine`

Os submodulos tambem foram inicializados.

## Decisao principal

Nao existe uma conversao automatica segura que copie o Intersect exatamente como esta e faca tudo rodar no navegador.

O Intersect atual e uma engine desktop baseada em .NET, MonoGame, cliente nativo, editor nativo e servidor proprio. Para navegador, a abordagem correta e criar uma versao web equivalente, preservando sistemas, dados, comportamento e fluxo de criacao, mas substituindo as partes incompatíveis com web.

## Licenca

O Intersect usa licencas diferentes por projeto:

- cliente, core e network: MIT em varios projetos;
- servidor, editor e utilitarios: GPLv3 em varios projetos;
- dependencias de terceiros: licencas proprias.

Qualquer codigo copiado diretamente deve manter avisos de licenca e cumprir os termos do projeto original.

Se o Fantasy Engine distribuir servidor/editor modificados baseados em codigo GPLv3, as obrigacoes da GPLv3 devem ser respeitadas.

Para reduzir risco juridico e tecnico, a estrategia preferida e:

1. manter o Intersect original em `vendor/Intersect-Engine` como referencia;
2. portar conceitos e formatos de forma documentada;
3. copiar codigo MIT apenas quando fizer sentido e mantendo licenca;
4. evitar copiar codigo GPLv3 para partes proprietarias sem aceitar as obrigacoes;
5. criar implementacao web propria para renderizacao, editor e comunicacao de navegador.

## O que deve ser preservado

A versao web deve buscar equivalencia com o Intersect nos seguintes sistemas:

- mapas 2D por tiles;
- layers;
- passabilidade;
- atributos de tile;
- entidades;
- movimento;
- animacoes;
- paperdoll/equipamentos;
- itens;
- inventario;
- banco;
- shops;
- NPCs;
- resources;
- projectiles;
- spells;
- classes;
- quests;
- events;
- switches;
- variables;
- chat;
- party;
- guild;
- administracao;
- editor visual.

## O que nao deve ser copiado literalmente para o navegador

As seguintes areas precisam ser reimplementadas ou adaptadas:

- renderizacao MonoGame para Canvas/WebGL;
- input desktop para input web;
- sistema de janelas/editor desktop para editor web;
- rede nativa/LiteNetLib para WebSocket ou WebTransport;
- acesso local a arquivos para armazenamento por API/servidor;
- recursos que dependem de sistema operacional;
- qualquer logica sensivel que atualmente possa estar acoplada ao cliente.

## Arquitetura alvo

Estrutura recomendada do Fantasy Engine:

```text
apps/
  web-client/
  web-editor/
  game-server/
  api-server/
packages/
  protocol/
  game-rules/
  map-format/
  assets-pipeline/
  database/
tools/
  intersect-importer/
vendor/
  Intersect-Engine/
```

## Stack recomendada

Cliente web:

- TypeScript;
- PixiJS para renderizacao 2D acelerada por WebGL;
- Vite;
- UI com React, se o editor e interface complexa precisarem.

Servidor:

- .NET 8 ou Node.js/TypeScript;
- WebSocket para tempo real;
- servidor autoritativo;
- tick rate controlado;
- validacao de protocolo.

Banco:

- PostgreSQL como banco principal;
- Redis para cache, sessoes, rate limit, presenca online e pub/sub;
- migrations versionadas;
- transacoes para inventario, trade e economia.

## Seguranca obrigatoria

O cliente web nunca deve ser confiavel.

O servidor deve validar:

- posicao;
- velocidade;
- colisao;
- cooldown;
- dano;
- cura;
- inventario;
- trade;
- gold;
- recompensas;
- quest progress;
- permissao de comandos;
- distancia de interacao;
- estado atual da entidade.

Mensagens do cliente devem representar intencoes, nao resultados finais.

## Plano tecnico por fases

### Fase 1: base web minima

- criar monorepo;
- criar cliente web com PixiJS;
- renderizar tilemap simples;
- criar servidor WebSocket minimo;
- sincronizar personagem no mapa;
- validar movimento no servidor.

### Fase 2: formato de mapa e importador

- estudar formato de mapas do Intersect;
- criar formato proprio do Fantasy Engine;
- criar importador progressivo;
- preservar layers, passabilidade e atributos.

### Fase 3: entidades e combate

- NPCs;
- players;
- resources;
- projectiles;
- spells;
- cooldowns;
- combate autoritativo.

### Fase 4: persistencia massiva

- PostgreSQL;
- contas;
- personagens;
- inventario;
- itens unicos;
- logs de auditoria;
- Redis para presenca e rate limit.

Status inicial implementado:

- pacote `@fantasy-engine/database`;
- migration PostgreSQL para `player_characters`;
- persistencia de posicao, direcao, vida e inventario por identidade persistente do navegador;
- fallback em memoria apenas para desenvolvimento quando `DATABASE_URL` nao estiver configurado.

### Fase 5: editor web

- editor de mapa;
- editor de itens;
- editor de NPCs;
- editor de spells;
- editor de quests;
- editor de eventos;
- permissao e auditoria administrativa.

### Fase 6: compatibilidade maior

- importar mais dados do Intersect;
- validar comportamento equivalente;
- criar testes comparativos;
- documentar diferencas inevitaveis.

## Regra de implementacao

A primeira entrega executavel deve ser um prototipo web pequeno, seguro e funcional:

- navegador abre o cliente;
- servidor autoritativo roda separado;
- player aparece em um mapa de tiles;
- movimento e validado pelo servidor;
- dados essenciais ficam preparados para PostgreSQL.

Depois disso, os sistemas do Intersect devem ser portados um por um, com testes e validacao de seguranca.
