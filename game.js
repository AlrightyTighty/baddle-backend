const Papa = require("papaparse");
const fs = require("fs");
const { Player } = require("./player");
const HINTSTATUS = require("./player").HINTSTATUS;

exports.Game = class Game {
  static activeRoomCodes = [];
  static activeGames = {};

  static makeRoomCode = () => {
    const chars = [];

    do {
      for (let i = 0; i < 5; i++) {
        chars[i] = Math.round(Math.random() * 25) + 65;
      }
    } while (Game.activeRoomCodes.includes(String.fromCharCode(chars)));
    return String.fromCharCode.apply(this, chars);
  };

  constructor() {
    this.started = false;
    this.players = [];
    this.word = "";
    this.wordOccurences = {};
    this.roundsPlayed = 0;
    this.code = Game.makeRoomCode();
    this.options = new exports.GameOptions();
    this.host = null;
    this.time = 0;
    this.timeout = null;
    Game.activeGames[this.code] = this;
    Game.activeRoomCodes.push(this.code);
  }

  guessDifference(guess) {
    let occurances = Object.assign({}, this.wordOccurences);
    console.log(occurances);
    const output = [];
    for (let i = 0; i < 5; i++) {
      if (guess[i] == this.word[i]) {
        output[i] = HINTSTATUS.SOLVED;
        occurances[guess[i]] -= 1;
      }
    }

    console.log(occurances);

    for (let i = 0; i < 5; i++) {
      if (guess[i] == this.word[i]) continue;
      if (occurances[guess[i]] != null && occurances[guess[i]] > 0) {
        output[i] = HINTSTATUS.KNOWN;
        occurances[guess[i]] -= 1;
      } else {
        output[i] = HINTSTATUS.UNUSED;
      }
    }
    return output;
  }

  getAllInfoPacket() {
    return {
      id: 7,
      players: this.players.map((player) => {
        return player.getPublicInfo();
      }),
      game: this.getPublicGameInfo(),
    };
  }

  getPublicGameInfo() {
    return { started: this.started, code: this.code, options: this.options, time: this.time, roundsPlayed: this.roundsPlayed };
  }

  fireClient(player, packet) {
    player.socket.send(packet);
  }

  fireClients(players, packet) {
    players.forEach((player) => {
      this.fireClient(player, packet);
    });
  }

  fireAllClients(packet) {
    this.fireClients(this.players, packet);
  }

  // only allowing 5-letter words atm.
  static getRandomWord() {
    const wordsFile = fs.readFileSync("./words.csv", "utf-8");

    const data = Papa.parse(wordsFile, {});
    return data.data[Math.round(Math.random() * data.data.length)];
  }

  // updates the started flag, sends all players a new round packet

  start() {
    this.started = true;
    this.startRound();
  }

  setWord() {
    this.word = Game.getRandomWord()[0];
    this.wordOccurences = {};
    for (const char of this.word) {
      if (this.wordOccurences[char]) this.wordOccurences[char] += 1;
      else this.wordOccurences[char] = 1;
    }
    console.log(this.word);
    console.log(this.wordOccurences);
    this.timeout = setTimeout(this.endRound.bind(this), this.options.roundLength * 1000);
  }

  endRound() {
    clearTimeout(this.timeout);
    this.timeout = null;
    this.fireAllClients(
      JSON.stringify({
        id: 9,
        message: "Round over! Setting up for next round...",
      })
    );
    setTimeout(this.startRound.bind(this), 3000);
  }

  playerFinishedRound(player, won) {
    player.canGuess = false;
    const message = won ? `${player.name} has guessed the word in ${player.hints.length} guesses!` : `${player.name} failed to guess the word in 6 guesses.`;

    this.fireAllClients(
      JSON.stringify({
        id: 9,
        message: message,
      })
    );

    for (const player of this.players) {
      if (player.canGuess) return;
    }

    this.endRound();
  }

  startRound() {
    this.players.forEach((player) => {
      player.clearRoundData();
    });

    this.roundsPlayed++;

    if (this.roundsPlayed > this.options.numRounds) {
      this.started = false;
      this.roundsPlayed = 0;
      this.players.forEach((player) => {
        player.score = 0;
      });
      this.fireAllClients(JSON.stringify({ id: 10 }));
      this.fireAllClients(JSON.stringify(this.getAllInfoPacket()));

      return;
    }

    this.players.forEach((player) => {
      player.canGuess = true;
    });

    this.setWord();

    this.fireAllClients(JSON.stringify({ id: 8 }));
  }

  removePlayer(player) {
    this.players = this.players.filter((p) => p != player);
    if (player.isHost && this.players.length > 0) {
      this.host = this.players[0];
      this.players[0].isHost = true;
    }
    delete Player.Players[player.uuid];

    this.fireAllClients(JSON.stringify(this.getAllInfoPacket()));

    if (this.players.length == 0) {
      this.closeRoom();
    }
  }

  closeRoom() {
    if (this.timeout) clearTimeout(this.timeout);

    delete Game.activeGames[this.code];
    Game.activeRoomCodes = Game.activeRoomCodes.filter((c) => c != this.code);
  }
};

exports.GameOptions = class GameOptions {
  constructor() {
    this.roundLength = 180;
    this.roomSize = 10;
    this.allowLateJoin = false;
    this.numRounds = 3;
  }
};
