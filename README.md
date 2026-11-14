# The Game of Krug

Jogo web de labirinto visto de cima. O jogador conduz a tampinha de refrigerante com a carinha do Krug até a **tigela de papá**.

**Jogar:** https://tavlueftenson.github.io/kruggame/

## Como jogar

- **Computador:** setas do teclado ou W A S D. Barra de espaço para o Krug. P ou Esc pausa.
- **Celular:** deslize o dedo na tela. Dá para virar várias vezes sem tirar o dedo da tela. Para parar, dê um toque rápido no labirinto. O direcional na tela vem desligado e pode ser ligado no menu de pausa ("Mostrar direcional"); a escolha fica salva no aparelho.
- A tampinha rola reto na direção escolhida até bater numa parede, passando direto pelos cruzamentos. Se você escolher outra direção um pouco antes do cruzamento, ela fica guardada por meio segundo (aparece uma setinha amarela na tampinha) e o Krug vira assim que puder. Se escolher um pouco depois de passar, até quase meia casa, ele volta e vira no cruzamento que acabou de passar. A direção oposta faz meia-volta na hora. Ao pedir para parar, ele para na próxima casa.

| Item | Efeito |
| --- | --- |
| Tigela de papá | Conclui a fase (+100 × número da fase). A partir da fase 15, ela treme, foge com um apito de escorregador e reaparece em outro lugar a cada 18 a 22 s (nunca quando o Krug está chegando) |
| Popoca | +10 pontos |
| Pão do queijo | +50 pontos e coragem por 7 segundos: o Krug espanta o má banho (+30) |
| Cobertinha | Protege o Krug de um toque do má banho (aparece a partir da fase 3, duas por fase a partir da 10; se já estiver com uma, vale +20) |
| Raio de sol | O Krug para 1,6 s para se aquecer e depois segue na mesma direção (ou na que você escolher enquanto ele cochila). Aparece a partir da fase 5 |
| Gato gordinho (azul) | A partir da fase 9 (dois a partir da fase 16). Se o Krug vê o gato no mesmo corredor reto, a até 4 casas e sem parede no meio, esquece de tudo: para e late por 2,5 s sem obedecer aos controles. Depois o gato foge ofendido para outro canto, e o Krug fica 4 s sem se distrair de novo. As casas vigiadas pelo gato ficam levemente avermelhadas |
| Ovo de chocolate branco | A partir da fase 18: o Krug come, ganha 40 pontos e dá um saltinho feliz |
| Ovo de chocolate preto | A partir da fase 18: chocolate preto faz mal a cachorro, o Krug perde uma patinha (sem voltar ao começo). Nunca bloqueia o caminho |
| Túnel | A partir da fase 12 (dois pares a partir da fase 19). Cada par liga dois becos sem saída distantes, com as bocas da mesma cor. O Krug entra rolando numa boca, passa 0,6 s invisível e protegido, e sai rolando pela outra. Banho e gato não passam. Dá para escolher a direção ou pedir para parar durante a travessia |
| Passarinho | A partir da fase 21, aparece a cada 18 a 28 s, ronda o Krug piando por cerca de 2 s (com uma sombra embaixo dele) e mergulha. Se o Krug estiver andando, é levado pelo ar e solto em outro ponto seguro do labirinto. Se estiver parado (ou dentro de um túnel), despista o passarinho, que vai embora |
| Apagão | Nas fases ímpares a partir da 25, a cada 20 a 30 s a luz apaga a partir de um ponto aleatório e a escuridão escorre pelos corredores, acompanhando as paredes, até cobrir cerca de 40% do labirinto; 9 s depois a luz volta pelo mesmo caminho. Toca um som de terror engraçado. A borda da escuridão é esfumada, só uma luzinha em volta do Krug continua acesa, e os olhos do gato brilham no escuro |
| Frio e roupinha | A partir da fase 30, às vezes esfria (primeira vez 10 a 18 s após o início, depois a cada 25 a 40 s, por 15 s): neva, as bordas da tela ficam geladas e o Krug, sem roupinha, treme e anda a 55% da velocidade. A roupinha (1 por fase) devolve a velocidade normal até o fim da fase; ao mudar de fase, o Krug perde a roupinha |
| Robô-aspirador | A partir da fase 35 (um; dois na 39; três na 43): redondo e vermelho, passeia devagar pelos corredores (0,8 casa por segundo), segue reto enquanto pode e às vezes para girando. Não tira patinha, mas o Krug não passa por ele: para e espera, e segue sozinho na mesma direção quando a passagem abre. O robô nunca entra na casa do Krug, na tigela, no começo da fase, em túnel ou em banho parado |
| Má banho | O Krug perde uma patinha e volta ao começo da fase |

### Atalho de teste

Para testar fases avançadas: **Shift + N** no teclado, ou 5 toques rápidos no número da fase no celular, pula 5 fases (funciona também na tela inicial, começando na fase 6).

### Estrelas

Cada fase vale até 3 estrelas: chegar à tigela, comer todas as popocas e comer todos os pães do queijo. Não há recompensa por velocidade. A plaquinha no canto da tela mostra quantas popocas e quantos pães já foram comidos. Todas as popocas e todos os pães podem ser alcançados sem passar por banho parado nem por ovo de chocolate preto. Cada estrela além da primeira vale +50 pontos.

### Cômodos

A cada 5 fases o Krug muda de cômodo: sala, quarto, cozinha e banheiro, e depois o ciclo recomeça. O banheiro tem mais má banho.

### Intervalo

A cada 5 fases completas, ao tocar em "Próxima fase", aparece uma animação do Krug grande correndo atrás da tigela de papá, com uma musiquinha original. Depois que o gato é apresentado (fase 9), ele também aparece no caminho e foge irritado quando o Krug se aproxima. Depois que o passarinho é apresentado (fase 21), ele também aparece, tenta levantar o Krug grande, não consegue e vai embora deixando uma peninha. Um toque, Enter ou a barra de espaço pulam a animação.

### Ritmo das novidades

Uma novidade a cada 3 fases, com uma fase de respiro entre elas: cobertinha (3), raio de sol (5), banho que anda (7), gato (9), túnel (12), tigela que foge (15), ovos de páscoa (18), passarinho (21), apagão (25, nas fases ímpares), frio com roupinha (30) e robô-aspirador (35). As versões em dobro vêm depois: duas cobertinhas a partir da 10, dois gatos a partir da 16 e dois pares de túneis a partir da 19. O labirinto e a quantidade de banhos crescem devagar, e o labirinto chega ao tamanho máximo por volta da fase 15. Na fase em que algo aparece pela primeira vez, um cartão de novidade explica o item antes de começar.

### Patinhas

O Krug tem 3 patinhas e recupera uma quando a pontuação passa de certas metas: 4 mil, 10 mil, 18 mil, 28 mil, 40 mil pontos, e assim por diante (cada intervalo fica 2 mil pontos maior que o anterior). Se ele já estiver com as 3, a meta passa para a seguinte sem dar nada. Na prática, isso dá uma patinha a cada 4 ou 5 fases. A tela de fim de fase mostra a próxima meta. A partir da fase 7, aparecem banhos que andam pelos corredores.

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
