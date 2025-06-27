const http = require("http");
const url = require("url");

const { WebSocketServer } = require("ws");
const { Player } = require("./player.js");
const { Game } = require("./game.js");

const server = http.createServer();
const wsServer = new WebSocketServer({ server });

const PORT = 3001;

// message formats:

/*
// sent by a client upon making a guess
guess_packet {
    id: 0
    guess: string;    
}

// sent by the server to a client in response to a guess. contains information about the previous guess. if guess was correct, correct will be true,
hint_packet {
  id: 1
  guess: string
  hints: []
  correct: boolean
}

// sent by the client (host) to the server to update settings. upon updating, a copy of the packet is sent to all clients.
options_packet {
  id: 2
  options: GameOptions
}

// sent by the client (host) to start the game.
start_packet {
  id: 3
 -- nothing
}

// sent by a client to the player. the server will fill in the UUID field depending on who sent the message and resend the packet to all other clients.
chat_packet {
  id: 4
  uuid: string
  message: string
}

// sent by the server to all clients when a player changes their state.
// different information will be sent depending on which clients are receiving the packet.
// for example, only the player in question will be able to see their past guesses.

player_update_packet {
  id: 5;
  uuid: string
  player: Player
}

// private player update packet, sent to a specific player when their private data, usually regarding their state, changes.


private_player_update_packet {
  id: 6;
  player: Player
}

// sent by the server to a player that has just joined. contains all information about the players, including the one that just joined.
all_info_packet {
  id: 7;
  players: Player[];
  game: Game
}

// sent by the server to the clients at the start of a new round
// client will wipe all round-based info from the player upon receiving this packet

new_round_packet {
  id: 8
}

*/

const handleMessage = (bytes, uuid) => {
  const player = Player.Players[uuid];
  const game = player.game;
  const message = JSON.parse(bytes.toString());
  // starting game
  if (message.id == 3 && game.host == player && !game.started) {
    game.start();
  } else if (message.id == 0) {
    player.makeGuess(message.guess);
  } else if (message.id == 4) {
    message.uuid = uuid;
    game.fireAllClients(JSON.stringify(message));
  } else if (message.id == 2 && game.host == player) {
    console.log("updated settings");
    game.options = message.options;
    game.fireAllClients(JSON.stringify(message));
  }
};

const handleClose = (uuid) => {
  const player = Player.Players[uuid];
  const game = player.game;
  game.removePlayer(player);
};

wsServer.on("connection", (connection, request) => {
  let { name, roomCode, makeRoom, selectedIcon } = url.parse(request.url, true).query;
  if (roomCode) roomCode = roomCode.toUpperCase();
  if (!name) {
    connection.close(1002, "You must enter a name.");
    return;
  }
  name = name.substring(0, 6);
  if (makeRoom == "true") {
    const newGame = new Game();
    const newPlayer = new Player(name, connection, newGame, true, selectedIcon);
    newGame.players.push(newPlayer);
    newGame.host = newPlayer;
    connection.on("message", (message) => handleMessage(message, newPlayer.uuid));
    connection.on("close", () => handleClose(newPlayer.uuid));
    newGame.fireAllClients(JSON.stringify(newGame.getAllInfoPacket()));
  } else if (roomCode) {
    if (Game.activeGames[roomCode]) {
      const game = Game.activeGames[roomCode];
      if ((!game.started || game.options.allowLateJoin) && game.players.length < game.options.roomSize) {
        const newPlayer = new Player(name, connection, game, false, selectedIcon);
        game.players.push(newPlayer);
        connection.on("message", (message) => handleMessage(message, newPlayer.uuid));
        connection.on("close", () => handleClose(newPlayer.uuid));
        game.fireAllClients(JSON.stringify(game.getAllInfoPacket()));
      } else {
        connection.close(1002, "This lobby isn't currently accepting players.");
      }
    } else {
      connection.close(1002, "There is no room with that code.");
      return;
    }
  } else {
    connection.close(1002, "If you aren't hosting, you must provide a room code to join.");
    return;
  }

  console.log(Game.activeGames);
  console.log(Game.activeRoomCodes);
});

server.listen(PORT, () => {
  console.log(`WS Running on port ${PORT}`);
});
