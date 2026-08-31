# Truco Coop

4-player Argentine Truco (2 teams of 2) in the browser. Host a room, share the link, play to 30 points (un chico). No Flor.

Rules: https://www.envidoytruco.com/en/rules/truco-argentino

Demo: https://emasuriano.github.io/truco-coop/


## How to play (4 tabs)

npm install
npm run dev

Open http://localhost:3000, Create Room, paste the link into three more tabs. Host seat 0; joiners 1,2,3. Partners 0+2 vs 1+3. Click cards to play. Chant buttons enable only when legal.

## Trust model

THE HOST IS TRUSTED WITH FULL STATE.

The host shuffles and holds every hole card in host memory only. Private hands use a targeted Trystero hand send to each peer. Host seat 0 keeps a local myHand like everyone else.

Broadcast pub snapshots have no hole cards. Joiners never store other players hands (no hands array on joiners). Other seats show card-back counts only.

APP_ID is truco-coop in src/config.ts.

## Rules (v1)

No Flor. Target 30 (malas 0-14, buenas 15-30). Spanish 40-card deck. 3 cards each. Envido and Truco follow the official rules. Leave src/net.ts as-is. Lobby flow in src/main.ts stays.

## Scripts

## Deploy

https://emasuriano.github.io/truco-coop/
VITE_BASE=/truco-coop/ and preview /truco-coop/pr-preview/pr-N/

## License

MIT
