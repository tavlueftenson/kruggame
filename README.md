# The Game of Krug

Jogo web de labirinto visto de cima. O jogador conduz a tampinha de refrigerante com a carinha do Krug até a **tigela de papá**.

**Jogar:** https://tavlueftenson.github.io/kruggame/

## Como jogar

- **Computador:** setas do teclado ou W A S D. P ou Esc pausa.
- **Celular:** deslize o dedo na tela ou use o direcional. Dá para virar várias vezes sem tirar o dedo da tela.
- A tampinha rola pelo corredor, faz as curvas sozinha e para no próximo cruzamento ou beco. Se você escolher uma direção antes do cruzamento, ela vira assim que puder.

| Item | Efeito |
| --- | --- |
| Tigela de papá | Conclui a fase (+100 × número da fase) |
| Popoca | +10 pontos |
| Pão do queijo | +50 pontos e coragem por 7 segundos: o Krug espanta o má banho (+30) |
| Má banho | O Krug perde uma patinha e volta ao começo da fase |

O Krug tem 3 patinhas. A cada 3 fases concluídas, ele recupera uma (até o máximo de 3). A partir da fase 3, aparecem banhos que andam pelos corredores.

As fases são geradas na hora e ficam maiores a cada nível. O gerador garante que sempre existe um caminho até a tigela (e até cada pão do queijo) sem passar por um banho parado. Quando o labirinto não cabe na tela, a câmera acompanha o Krug e uma seta na borda aponta para a tigela.

## Estrutura

- `index.html`: página e telas (início, fase concluída, fim de jogo, pausa)
- `style.css`: visual
- `game.js`: gerador de labirinto, regras, desenho no canvas, sons e controles
- `assets/`: carinhas do Krug recortadas das fotos, fotos das telas e ícones
- `assets/sons/`: latidos de verdade do Krug, recortados de uma gravação

## Sons

Os latidos são do próprio Krug. Ele late no começo de cada fase, late duas vezes ao chegar à tigela de papá, dá um latido mais agudo quando leva um susto do má banho e um latido mais grave quando, corajoso, espanta o banho. Na tela inicial, tocar na tampinha faz o Krug latir. Os demais efeitos são sintetizados com Web Audio.

Não há etapa de build nem dependências: basta servir a pasta como site estático.

```sh
python3 -m http.server 8000
# abra http://localhost:8000
```

O recorde e a preferência de som ficam salvos no navegador (localStorage).
