# Radar de Mercado: Bolsa + Polymarket

Painel em tempo real com duas áreas **separadas**:

- **Bolsa** (`/bolsa`): ações da B3 e dos EUA, índices, dólar e cripto.
- **Polymarket** (`/polymarket`): mercados de previsão mais negociados.

A Bolsa abre no **Terminal** (`/bolsa/terminal`): tabela de cotações ordenável (último, variação, tendência,
volume, RSI, score) ao lado de um gráfico de candles com médias 9/21/200, Bollinger, volume e RSI em painel próprio.
Abaixo ficam o mapa de calor do dia, o sinal do ativo selecionado, as maiores altas e baixas e o "Explicar com IA".
Use ↑ ↓ na tabela para trocar o gráfico.

O Polymarket também tem um **Terminal** (`/polymarket/terminal`): tabela de mercados com probabilidade, variação
em pontos, tendência, volume, liquidez e score; gráfico da probabilidade; livro de ofertas; mapa de calor;
faixa de categorias com volume.

### Para iniciantes (`/comecar`)

Feita para quem não entende de mercado: 3 perguntas definem o perfil (conservador, moderado, arrojado). A página mostra:

- os ativos mais fortes agora que cabem no perfil, em linguagem simples;
- o que evitar no momento;
- as apostas do Polymarket explicadas em reais.

Palavras sublinhadas mostram o significado ao passar o mouse.

O **simulador** (`/api/simulador`, cálculo em `src/lib/simulador.ts`) testa a regra "fico X dias e saio se cair Y%" em cada dia dos últimos 5 anos. Ele mostra:

- quantas vezes deu lucro e o resultado típico;
- os 10% piores e os 10% melhores casos;
- quantas vezes o stop disparou e quantas vezes o preço já abriu abaixo do stop;
- uma tabela com todas as combinações de prazo × stop.

### Conta (`/conta`)

Menu no canto inferior da barra lateral, com:

- perfil;
- valor, prazo e stop padrão, e travas para a futura automação;
- conexões: chave do Claude salva direto no `.env.local` pela tela (só aceita pedidos do próprio computador), corretora e Polymarket;
- idioma;
- notificações;
- uso e backup dos dados;
- ajuda, com perguntas frequentes e glossário;
- "saiba mais".

### Destaque ao passar o mouse

Nos gráficos, mapas de calor, tabelas e legendas, o item sob o mouse ganha foco e os outros escurecem. Na Análise, a tabela e o gráfico risco × retorno estão ligados. No Terminal, passar o mouse num indicador (MM9, MM21…) destaca a linha dele.

### Análise de mercado (`/analise`)

Estatística do passado, separada em duas abas:

- **Bolsa** (5 anos de histórico diário de cada ativo): retornos de 1, 3, 6 e 12 meses, retorno ao ano,
  volatilidade, retorno ÷ risco, pior queda, beta, distância da máxima; comparação por mercado (B3, EUA,
  Índices, Cripto); gráfico risco × retorno; **backtest** do retorno nos 20 pregões seguintes a cada sinal
  de tendência e de RSI; sazonalidade por mês; matriz de correlação.
- **Polymarket** (600 mercados resolvidos nos últimos 45 dias): **calibração**, que compara o preço 24h antes
  do fim com a frequência real de acerto, com margem de erro de 95%; retorno médio por faixa de preço (favoritos
  × azarões); precisão e retorno por categoria; estrutura dos mercados abertos (volume, liquidez, spread).

Os cálculos ficam em `src/lib/stats.ts` (testados). Retornos não descontam taxas, impostos nem spread.

Cada área tem:

- **Ranking ao vivo** com duas colunas: 🟢 **Em destaque** (sinais positivos) e 🔴 **Em alerta** (queda forte ou risco), mais os neutros.
- **Score de 0 a 100** com a composição aberta (quanto cada critério somou e por quê).
- **Página de detalhe** com gráfico (candles ou probabilidade), indicadores e livro de ofertas (Polymarket).
- **Favoritos ★**, filtros, histórico de mudanças e avisos no navegador.
- **Configurações** próprias: pesos de cada critério e limites de alerta. A Bolsa também permite escolher quais ativos acompanhar.

> Sinais baseados em critérios técnicos. Não é recomendação de investimento.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```powershell
npm install
npm run dev
```

Abra http://localhost:3000.

Outros comandos:

```powershell
npm test           # testes dos indicadores e do score
npm run typecheck  # checagem de tipos
npm run build      # versão de produção
```

## De onde vêm os dados

| Área | Fonte | Atualização na tela |
|---|---|---|
| Polymarket | Gamma API + CLOB API (públicas, sem chave) | ranking a cada 15s, detalhe a cada 5s |
| Bolsa | Yahoo Finance (sem chave) | ranking a cada 30s; B3 com atraso de até 15 min |

**Bloqueio de DNS:** algumas operadoras no Brasil recusam os endereços do Polymarket no DNS delas.
O servidor do app resolve esses endereços pelos DNS públicos `1.1.1.1` e `8.8.8.8`, só para ler dados públicos.
Dá para trocar em `.env` (veja `.env.example`). O navegador nunca acessa o Polymarket direto.

## Como o score funciona

**Bolsa** (`src/lib/score/bolsa.ts`): tendência (preço vs médias 9/21/200), momento (RSI + MACD),
volume (vs média de 20 dias), volatilidade (Bollinger %B, ATR) e variação do dia.
Vai para **alerta** se cair mais que o limite no dia, se tiver RSI < 30 com MACD negativo, se perder a média de 200 caindo,
se cair com volume 2x acima do normal, ou se o score ficar muito baixo.

**Polymarket** (`src/lib/score/polymarket.ts`): momento da probabilidade (24h e 7d), volume (e se está acima da média),
liquidez, spread e tempo até encerrar. Vai para **alerta** se a probabilidade despencar em 24h ou 1h, se a liquidez
for baixa demais ou o spread largo. Mercados quase decididos (abaixo de 3% ou acima de 97%) não entram em destaque.

## Estrutura

```
src/
  app/
    bolsa/              área Bolsa (ranking, ativo/[symbol], config)
    polymarket/         área Polymarket (ranking, mercado/[id], config)
    api/bolsa/…         rotas do servidor (Yahoo)
    api/polymarket/…    rotas do servidor (Gamma/CLOB)
  lib/
    bolsa/              tipos, lista de ativos, busca de dados
    polymarket/         tipos, busca de dados
    score/              cálculo do score (puro, testado)
    indicators.ts       RSI, MACD, médias, Bollinger, ATR
    server/             cache e rede (DNS público)
    client/             hooks de atualização, favoritos, configurações, avisos
  components/           UI compartilhada (ranking, gráficos, livro de ofertas)
tests/                  testes (vitest)
```

Configurações, favoritos e histórico ficam salvos no navegador (localStorage).

## Explicar com IA

Nas páginas de detalhe (ativo ou mercado), o botão **Explicar** manda os dados atuais e o score para o Claude
(`claude-opus-5-5`), que responde em português: cenário, a favor, contra, riscos, o que observar e confiança na leitura.
A resposta aparece enquanto é escrita. O modelo não dá ordens de compra ou venda.

Para ativar:

1. Crie uma chave em https://console.anthropic.com. É cobrado por uso: cada análise custa poucos centavos de dólar.
2. Cole a chave em **Conta → Conexões e chaves**. O app grava `ANTHROPIC_API_KEY` no `.env.local` e passa a usá-la na hora, sem precisar reiniciar.

O pedido usa o fallback do lado do servidor (`fallbacks: "default"`): se o modelo recusar por algum filtro de segurança,
a API tenta de novo num modelo alternativo automaticamente. O texto enviado está em `src/lib/ai/prompt.ts`.

## Próximos passos possíveis

- Aba "Cruzamento": eventos do Polymarket ↔ ativos da bolsa.
- Histórico de sinais em banco de dados para medir a taxa de acerto de cada critério.
