# Especificação Visual & Técnica — Redesign Stitch do Relay

Referência visual extraída diretamente do projeto Stitch (`https://stitch.google.com/projects/16311865060192275782`) e capturada em `G:\projetos\relay\stitch_reference.png`.

---

## 1. Identidade Visual Global
- **Background**: `#050811` (Deep Navy Dark)
- **Cards & Painéis**: `#080e1b` com borda `1px solid #131f33` e border-radius `12px`
- **Tipografia**: Geist Sans / -apple-system / Segoe UI para títulos e corpo; Geist Mono / Monospace para IDs, IPs, rotas e logs
- **Cores Semânticas**:
  - Ciano Brand: `#00f2fe`
  - Verde Esmeralda (Ativo / Saudável / ON): `#00e599`
  - Âmbar (Avisos / Cooldown): `#f59e0b`
  - Carmesim (Erros / Limite): `#f43f5e`
  - Azul Céu (Argon / Métricas / Links): `#38bdf8`
  - Roxo / Violeta (Pro / Maestro): `#a855f7`
  - Ouro (Ultra): `#eab308`

---

## 2. Tela de Terminais (`>_ Terminais 103`) — `WorkspacesPanel.tsx`

### A. Barra de KPIs & Telemetria da Frota (Topo)
Card horizontal ou grid com 4 blocos de telemetria:
1. **Saúde da Frota**:
   - `89 / 103 ativos` (`91.2% operacional`)
   - Barra de progresso verde (`#00e599`) com indicador visual.
2. **Throughput de Inferência**:
   - `1.420 req/min`
   - Latência média: `142ms`
3. **Largura de Banda / Dados**:
   - `48.2 MB/seg` transferidos
4. **Failover Watcher**:
   - Estado: `ARMADO` (pílula verde com ponto pulsante)
   - Tempo de Resposta: `< 250ms`

### B. Barra de Filtros e Busca da Tabela
- Campo de busca textual (filtro por nome do terminal, nó, IP ou conta)
- Pílulas de filtro de estado: `Todos (103)`, `Ativos (89)`, `Rate Limited (8)`, `Ociosos / Offline (6)`
- Seletor de visualização ou ordenação (por latência, uso de CPU, uptime)

### C. Tabela Técnica de Alta Densidade
Tabela com colunas estruturadas:
- **Terminal / Nó**: Nome do terminal (`ApexDev`, `term-node-us-east-01`), Workspace de origem (`Relay`, `Google Ultra`), e badge do tipo de agente (`Antigravity CLI`).
- **Status Semântico**:
  - `ACTIVE`: Pílula verde com ponto verde pulsante
  - `RATE_LIMITED`: Pílula âmbar/vermelha
  - `AUTH_ERROR`: Pílula carmesim
  - `IDLE`: Pílula cinza/azul
- **Conta Vinculada**: Nome da conta do pool associada (ex: `brainebrasil`, `ps4games`), com link para o ID truncado.
- **Modelos em Execução**: Chips coloridos dos modelos atribuídos (`3.8 Flash`, `Argon`, `2.5 Pro`, `Ultra 1.0`).
- **Métricas de Performance**: CPU (%), Memória/Threads, Latência média (`142ms`) e Uptime (`99.8%` ou `4h 12m`).
- **Ações**:
  - Botão `Trocar Conta` (Swap manual dropdown para qualquer conta saudável).
  - Botão de inspeção de logs recentes do terminal (`Ver Buffer`).

---

## 3. Tela de Logs em Tempo Real & Configuração — `LogsAndSettings.tsx`

Layout dividido em duas colunas funcionais:

### A. Coluna Esquerda: Configurações & Proteção do Maestro (45% largura)
1. **Proteção da Conta do Maestro (Preset)**:
   - Seletor Dropdown: Escolha da conta dedicada ao preset do Maestro (`preferences.json`).
   - Checkbox estilizado: `Impedir conta do Maestro de ser usada no pool de especialistas` (garante exclusão da conta das trocas de failover).
2. **Limites de Automação & Failover**:
   - Toggle: `Auto-Failover automático quando atingir piso ou erro 429`
   - Toggle: `Monitorar SOMENTE o workspace ativo na tela (ignora outros carregados)`
   - Toggle: `Iniciar junto com o Windows (minimizado na bandeja)`
   - Toggle: `Minimizar para a bandeja ao fechar a janela`
3. **Thresholds & Intervalos**:
   - Sliders ou campos numéricos:
     - Piso mínimo Janela 5h (`12%`)
     - Piso mínimo Janela Semanal (`5%`)
     - Intervalo de Polling dos Terminais (`25s`)
     - Intervalo de Polling de Quotas (`60s`)

### B. Coluna Direita: Live Stream de Eventos e Auditoria (55% largura)
Console de auditoria e logs em tempo real estilo IDE/Terminal dark:
- Barra superior do console com título `Live Stream de Eventos & Auditoria`, contador de eventos (`150`) e botão `Limpar Logs`.
- Filtros por nível: `Todos`, `Sucesso (Verde)`, `Info (Azul)`, `Avisos (Âmbar)`, `Erros (Carmesim)`.
- Linhas de log com:
  - Timestamp ISO / hora local (`[15:02:18]`) em cinza suave.
  - Badge de nível: `[SUCCESS]`, `[FAILOVER]`, `[WARN]`, `[ERROR]`, `[SWAP]`.
  - Mensagem explicativa rica destacando origem (`Terminal X`), transição (`Conta A → Conta B`) e status do handoff.
  - Rolagem automática para o evento mais recente.
