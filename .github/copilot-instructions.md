# Regras do Projeto Fantasy Engine

## Objetivo principal

O Fantasy Engine sera uma engine de navegador para MMORPG massivo, inspirada no Intersect Engine, com prioridade maxima em seguranca, escalabilidade e controle autoritativo no servidor.

A meta e reproduzir a experiencia, os sistemas e o fluxo de criacao do Intersect de forma completa para navegador, incluindo cliente, servidor, editor, mapas, eventos, combate, inventario, NPCs, quests, spells, shops, banco, administracao e ferramentas de operacao.

O codigo-fonte oficial do Intersect Engine esta baixado localmente em `vendor/Intersect-Engine` e deve ser tratado como referencia/vendor upstream.

As decisoes de migracao para navegador devem seguir `docs/intersect-web-migration.md`.

## Regra legal e de licenca

Antes de copiar codigo, assets, formatos internos ou arquivos do Intersect, verificar a licenca oficial do projeto e cumprir todos os requisitos dela.

O Intersect possui licencas divididas por projeto. Em geral, partes como cliente/core/network aparecem sob MIT, enquanto servidor/editor/utilitarios aparecem sob GPLv3. Confirmar sempre no `LICENSE.md` do modulo especifico antes de reutilizar codigo.

Se a licenca permitir uso direto, manter atribuicoes, avisos, termos de distribuicao e compatibilidade de licenca.

Se houver duvida de licenca, nao copiar codigo literalmente. Reimplementar os sistemas com base em comportamento observado, documentacao publica, formatos exportados e especificacao propria do Fantasy Engine.

Nao adicionar assets proprietarios ou conteudo de terceiros sem permissao clara.

## Principio de seguranca

O cliente de navegador nunca e confiavel.

Toda regra sensivel deve ser validada no servidor:

- movimento, posicao, velocidade e colisao;
- dano, cura, buffs, debuffs e cooldowns;
- XP, level, atributos e skill points;
- inventario, equipamentos, gold, banco e trade;
- drops, loot, crafting e recompensas;
- quests, flags, eventos e dialogos;
- teleportes, instancias, mapas e troca de zona;
- chat, comandos, guildas, party e social;
- compras, vendas, shops, marketplace e qualquer economia.

O navegador deve enviar intencoes, nao resultados. Exemplo: enviar "quero mover para cima" ou "quero usar spell X no alvo Y", nunca "minha nova posicao e esta" ou "causei 500 de dano" sem validacao autoritativa.

## Arquitetura obrigatoria

Usar arquitetura server-authoritative.

Separar o projeto em camadas claras:

- client-web: renderizacao, input, audio, UI, predicao visual e interpolacao;
- server-game: simulacao autoritativa, regras de jogo, validacao e tempo real;
- server-api: login, conta, personagens, admin, pagamentos e servicos HTTP;
- editor-web: editor de mapas, itens, NPCs, spells, quests, eventos e balanceamento;
- shared: tipos, schemas, validadores e contratos de protocolo;
- tools: importadores, migracoes, verificadores, scripts e utilitarios.

Nunca misturar regra autoritativa apenas no cliente.

## Comunicacao em tempo real

Usar WebSocket ou WebTransport para jogo em tempo real.

Mensagens de rede devem ter schema validado no servidor.

Toda mensagem recebida do cliente deve passar por:

- validacao de tipo e tamanho;
- limite de frequencia;
- permissao do estado atual do personagem;
- validacao de mapa, distancia, cooldown e requisitos;
- protecao contra replay, spam e payload malformado.

Preferir protocolo binario ou JSON com schemas durante a fase inicial. Para escala, considerar MessagePack, Protobuf ou FlatBuffers.

## Banco de dados

Usar PostgreSQL como banco principal por confiabilidade, consistencia, indices fortes, transacoes, JSONB quando necessario e maturidade para sistemas massivos.

Usar Redis para cache, sessoes, rate limit, filas leves, pub/sub e presenca online quando fizer sentido.

Nao usar SQLite como banco principal de producao para o MMORPG massivo.

Modelar dados criticos com integridade forte:

- contas;
- personagens;
- inventarios;
- itens unicos;
- moedas;
- transacoes;
- trades;
- guildas;
- quests;
- casas;
- marketplace;
- logs de auditoria.

Toda movimentacao economica importante deve ser transacional e auditavel.

Usar migrations versionadas desde o inicio.

Preparar o banco para crescimento:

- indices revisados por consulta real;
- paginacao correta;
- historico e logs separados de dados quentes;
- particionamento para tabelas grandes quando necessario;
- conexoes via pool;
- backups testados;
- estrategia de restore;
- metricas de query lenta.

## Escala massiva

Projetar para multiplos servidores de jogo.

Separar responsabilidades:

- gateway de conexao;
- servidor de mapa/zona;
- servicos de conta/personagem;
- chat;
- party/guild;
- marketplace/economia;
- filas e processamento assíncrono;
- observabilidade.

Cada mapa ou grupo de mapas deve poder ser distribuido entre processos ou maquinas no futuro.

Evitar estado global em memoria que impeça horizontal scaling.

Usar filas/event bus quando precisar desacoplar servicos. Considerar Redis Streams, RabbitMQ, NATS ou Kafka conforme a escala real.

## Anti-cheat e antifraude

Implementar defesa em camadas:

- rate limit por IP, conta, personagem e acao;
- validacao de velocidade e distancia;
- deteccao de teleport indevido;
- validacao de cooldown no servidor;
- protecao contra duplicacao de item;
- locks transacionais em trades e inventario;
- logs de acoes sensiveis;
- sistema de alertas para economia anormal;
- comandos administrativos auditados;
- permissoes por cargo;
- banimentos e suspensoes com historico.

Nunca expor segredos no cliente web.

Nunca confiar em token sem validacao no servidor.

Usar HTTPS/WSS obrigatoriamente em producao.

## Editor e administracao

O editor web deve ter autenticacao forte e permissoes granulares.

Acoes administrativas devem gerar logs de auditoria.

Alteracoes de conteudo devem poder ser versionadas, revisadas e publicadas com seguranca.

Nao permitir que o editor execute scripts arbitrarios no servidor sem sandbox e permissoes explicitas.

## Compatibilidade com Intersect

Priorizar sistemas equivalentes aos do Intersect:

- tilemaps;
- layers;
- passabilidade;
- atributos de tile;
- eventos;
- switches e variables;
- NPCs;
- resources;
- itens;
- spells;
- classes;
- crafting;
- shops;
- quests;
- projectiles;
- animations;
- paperdoll/equipment;
- bancos;
- guildas;
- party;
- chat;
- admin tools.

Quando possivel, criar importadores para dados de projetos Intersect, respeitando licenca e formato dos arquivos.

Se o formato original for complexo, criar um formato proprio documentado e escrever conversores progressivos.

## Renderizacao no navegador

Preferir PixiJS ou Phaser para cliente 2D de tiles, sprites, animacoes e camadas.

Usar Canvas/WebGL com carregamento progressivo de assets.

O cliente deve suportar:

- mapas grandes com chunks;
- culling de sprites e tiles fora da tela;
- interpolacao de movimento;
- predicao visual sem autoridade;
- UI responsiva;
- controles de teclado, mouse e touch quando aplicavel;
- reconexao limpa;
- tratamento de latencia.

## Qualidade de codigo

Manter o codigo modular, testavel e documentado onde houver regra critica.

Apos alteracoes significativas no projeto, fazer um commit Git com uma mensagem clara explicando o que foi alterado, desde que o repositório esteja configurado e os testes/validacoes relevantes tenham passado.

Criar testes para:

- validacao de protocolo;
- regras de combate;
- inventario e trade;
- economia;
- permissao admin;
- migracoes de banco;
- serializacao de mapas;
- anti-cheat basico.

Toda regra economica ou de seguranca deve ter teste automatizado quando possivel.

## Observabilidade e operacao

Desde cedo, incluir:

- logs estruturados;
- metricas de conexoes online;
- latencia de tick;
- uso de CPU/memoria;
- erros por rota/mensagem;
- queries lentas;
- metricas de economia;
- auditoria de admin;
- rastreio de excecoes.

O jogo deve ser operavel em producao, nao apenas rodar localmente.

## Prioridade de implementacao

Ordem recomendada:

1. base do monorepo;
2. contratos compartilhados;
3. servidor WebSocket autoritativo minimo;
4. cliente web renderizando mapa e personagem;
5. login e personagens com PostgreSQL;
6. movimento validado;
7. chat;
8. editor de mapa inicial;
9. inventario e itens;
10. NPCs e combate;
11. quests e eventos;
12. ferramentas admin;
13. importadores do Intersect;
14. hardening de seguranca e escala.

## Regra final

Sempre que houver conflito entre facilidade e seguranca, escolher seguranca.

Sempre que houver conflito entre copiar literalmente e respeitar licenca, respeitar licenca.

Sempre que houver conflito entre cliente bonito e servidor confiavel, priorizar servidor confiavel.
