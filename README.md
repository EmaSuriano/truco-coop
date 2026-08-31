# Truco Coop

Argentine Truco in the browser. Host a room, pick 2 players (1v1) or 4 players (2v2) and 15 or 30 points, share the link. Defaults: 1v1 to 15. No Flor.

Rules: https://www.envidoytruco.com/en/rules/truco-argentino

Demo: https://emasuriano.github.io/truco-coop/

Looks like fileteado porteño: TRUCO lockup, burgundy felt, Spanish-deck faces and backs.
Quiet table loop plus deal, play, chant, and win sounds once you sit down.


## How to play

npm install
npm run dev

Open http://localhost:3000. Host chooses table size (2 or 4, default 2) and chico (15 or 30, default 15) then Create Room, and pastes the link into the other tabs. Extra peers do not sit.

2-player: two teams of one, no partner. Deal 3, counterclockwise, mano is still the dealer's right. Envido/truco same; only one player per team answers chants.

4-player: host seat 0; joiners 1,2,3. Partners 0+2 vs 1+3.

Click cards to play. Chant buttons enable only when legal. HUD shows 1/2 or 2/4 while waiting.

## Trust model

THE HOST IS TRUSTED WITH FULL STATE.

The host shuffles and holds every hole card in host memory only. Private hands use a targeted Trystero hand send to each peer. Host seat 0 keeps a local myHand like everyone else.

Broadcast pub snapshots have no hole cards. Joiners never store other players hands (no hands array on joiners). Other seats show card-back counts only.

APP_ID is truco-coop in src/config.ts. Leave src/net.ts as-is. Lobby flow in src/App.tsx stays. Game rules live in src/game.ts; React subscribes.

## Rules (v1)

No Flor. Host chooses table size (2 or 4) and chico (15 or 30). Default is 15. At 30, malas 0-14 and buenas 15-30. At 15 there are no buenas; falta envido is points remaining to 15. Spanish 40-card deck. 3 cards each. Envido and Truco follow the official rules.

## Scripts

## Deploy

https://emasuriano.github.io/truco-coop/
VITE_BASE=/truco-coop/ and preview /truco-coop/pr-preview/pr-N/

## License

MIT
