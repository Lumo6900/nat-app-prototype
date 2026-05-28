# Nat App prototype notes

## Flusso rituale confermato

1. Mazzo iniziale da 37 carte.
2. Prima mischiata.
3. Taglio del mazzo.
4. Prima disposizione di 10 carte in ordine sequenziale 1→10.
5. Battesimo delle 10 carte con segno grafico o nome sul retro.
6. Le 10 carte battezzate rientrano nel mazzo.
7. Seconda mischiata molto accurata.
8. Dopo la seconda mischiata non si taglia.
9. Si guarda il retro delle carte partendo dall’alto del mazzo.
10. Quando appare una carta con segno/nome, viene disposta nella prossima posizione 1→10.
11. Alla fine l’utente gira le 10 carte nell’ordine che preferisce.

## Disposizione

- 10 carte verticali con proporzione 9:13.
- Schema: 2 + 3 + 3 + 1 + 1.
- Posizioni speciali per importanza: 4 e 9.
- Posizioni alte: 1, 2, 3, 4, 5.
- Posizioni basse: 6, 7, 8, 9, 10.

## Diritti

Per ora il prototipo usa solo carte placeholder. Non usare immagini/testi originali finché non sono chiariti i diritti con Edizioni Mediterranee e Scapini.

## Lettura carta

Dopo la seconda disposizione, l’utente gira le carte nell’ordine che preferisce.

UX desiderata:

1. Prima si mostra bene la carta, grande e centrale.
2. Solo dopo un cenno/conferma dell’utente si mostra il testo.
3. Alla stessa conferma il testo viene letto con una voce bella, calda e chiara.

Nel prototipo: tap sulla carta → modal con carta grande; pulsante “Mostra e leggi testo” → testo placeholder + Web Speech API se disponibile.
