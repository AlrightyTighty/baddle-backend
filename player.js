const uuidv4 = require("uuid").v4;

const HINTSTATUS = {
  UNKNOWN: 0,
  UNUSED: 1,
  KNOWN: 2,
  SOLVED: 4,
};

exports.HINTSTATUS = HINTSTATUS;

exports.Player = class Player {
  static Players = {};

  constructor(name, socket, game, isHost, icon) {
    this.name = name;
    this.socket = socket;
    this.guesses = [];
    this.bestGuessScore = 0;
    this.score = 0;
    this.bestGuessHint = [HINTSTATUS.UNKNOWN, HINTSTATUS.UNKNOWN, HINTSTATUS.UNKNOWN, HINTSTATUS.UNKNOWN, HINTSTATUS.UNKNOWN];
    this.game = game;
    this.isHost = isHost;
    this.uuid = uuidv4();
    this.hints = [];
    this.canGuess = false;
    this.icon = icon;
    Player.Players[this.uuid] = this;
  }

  clearRoundData() {
    this.guesses = [];
    this.bestGuessScore = 0;
    this.bestGuessHint = [HINTSTATUS.UNKNOWN, HINTSTATUS.UNKNOWN, HINTSTATUS.UNKNOWN, HINTSTATUS.UNKNOWN, HINTSTATUS.UNKNOWN];
    this.hints = [];
  }

  scoreHints(hint) {
    let score = 0;
    hint.forEach((element) => {
      score += Math.floor(element / 2);
    });
    if (score > this.bestGuessScore) {
      this.bestGuessScore = score;
      this.bestGuessHint = hint;
    }
    return score;
  }

  makeGuess(guess) {
    let newHint = this.game.guessDifference(guess);
    this.hints.push(newHint);
    let newScore = this.scoreHints(newHint);
    this.score += newScore;
    let correct = JSON.stringify(newHint) == JSON.stringify([4, 4, 4, 4, 4]);
    if (correct) {
      this.score += 10 * (6 - this.hints.length);
      this.game.playerFinishedRound(this, true);
    } else if (this.hints.length == 6) {
      this.game.playerFinishedRound(this, false);
    }

    this.game.fireAllClients(
      JSON.stringify({
        id: 5,
        uuid: this.uuid,
        player: this.getPublicInfo(),
      })
    );
    this.game.fireClient(
      this,
      JSON.stringify({
        id: 6,
        hints: this.hints,
        canGuess: this.canGuess,
      })
    );
    this.game.fireClient(
      this,
      JSON.stringify({
        id: 1,
        guess: guess,
        hints: newHint,
        correct: correct,
      })
    );
  }

  getPublicInfo() {
    return { name: this.name, bestGuessHint: this.bestGuessHint, isHost: this.isHost, uuid: this.uuid, score: this.score, icon: this.icon };
  }
};
