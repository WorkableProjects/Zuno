/**
 * What the game page shows under the big title: quick facts and how to play.
 * Written for players, not hosts' file formats.
 */
export interface GameInfo {
  players: string;
  mode: "Online" | "One screen" | "One screen or online";
  length: string;
  /** Sections shown when you scroll down. */
  rules: Array<{ heading: string; points: string[] }>;
  /** Caption under the in-game screenshot (public/screens/<gameType>.webp). */
  shot: string;
  /** More gameplay screenshots shown beside the Play button (paths under public/screens). */
  gallery?: Array<{ file: string; caption: string }>;
}

export const GAME_INFO: Record<string, GameInfo> = {
  gridiron: {
    shot: "Game Day: all 22 players on the field, the scoreboard bug, win probability and the play caller.",
    gallery: [
      { file: "gridiron-live.webp", caption: "Live snap with routes drawn, following the ball" },
      { file: "gridiron-all22.webp", caption: "All-22 camera with coverage shells" },
      { file: "gridiron-hub.webp", caption: "The hub: this week's matchup, the league and your inbox" },
      { file: "gridiron-draft.webp", caption: "Draft room with scouting ranges and combine numbers" },
    ],
    players: "1",
    mode: "One screen",
    length: "Career",
    rules: [
      { heading: "Your franchise", points: ["Pick one of 32 fictional teams and take over as GM and head coach.", "Set the depth chart, schemes and game plan. Manage the salary cap, sign free agents, make trades and run the draft."] },
      { heading: "Game day", points: ["Every snap plays out live in 2D with all 22 players. Call each play from the playbook, or let your coordinators call them.", "Use timeouts, challenges and 4th-down calls. Replay any play, change the camera or skip ahead."] },
      { heading: "Seasons", points: ["17 games, then a 14-team playoff and the Zuno Bowl.", "Each offseason: re-sign, scout the combine, free agency, the draft, camp and cutdown to 53."] },
      { heading: "Keep the job", points: ["The owner sets a goal every season. Meet it to keep your job and build a dynasty in the history books."] },
    ],
  },
  jeopardy: {
    shot: "The host screen: pick a clue from the board; team scores sit underneath.",
    players: "Teams",
    mode: "One screen",
    length: "20–45 min",
    rules: [
      { heading: "Setup", points: ["Load a game file or build one. It holds the categories, clues and answers.", "Name your teams, then run the board from one shared screen."] },
      { heading: "Playing", points: ["A team picks a category and a point value. The clue appears for everyone.", "The host judges answers and awards or takes away the points.", "An optional timer keeps each clue moving."] },
      { heading: "Winning", points: ["When the board is clear (and the final round, if the file has one, is played), the team with the most points wins."] },
    ],
  },
  headbands: {
    shot: "One screen: the asking player's card is shown to the group, with yes / no answers below.",
    players: "2+",
    mode: "One screen or online",
    length: "10–30 min",
    rules: [
      { heading: "The idea", points: ["Each player gets a secret identity that everyone else can see, but they can't.", "Online, everyone sees the others' identities on their own phone."] },
      { heading: "Your turn", points: ["Ask the group one yes-or-no question about your identity, or make a guess.", "Depending on the host's rules, a yes may let you keep asking, and guesses may be limited."] },
      { heading: "Winning", points: ["Work out who, or what, you are before everyone else does."] },
    ],
  },
  liar: {
    shot: "Voting: each player picks which of the storyteller's three statements is the lie.",
    players: "3+",
    mode: "One screen or online",
    length: "15–40 min",
    rules: [
      { heading: "Telling", points: ["The storyteller shares three statements: two truths and one lie.", "Each statement can come with a follow-up question for the group to dig into."] },
      { heading: "Investigating", points: ["Everyone questions the storyteller and discusses before the vote."] },
      { heading: "Voting", points: ["Everyone votes on which statement is the lie. With scoring on, a correct vote scores, and streaks can earn a bonus.", "Then the lie is revealed and the next storyteller takes over."] },
    ],
  },
  rpg: {
    shot: "A duel: both players pick rock, paper or scissors before the clock runs out.",
    players: "2–12",
    mode: "Online",
    length: "15–30 min",
    rules: [
      { heading: "Duels", points: ["Everyone starts with the same money. On your turn, challenge another player, with an optional wager you both put in.", "Duels are rock paper scissors, first to three round wins. Missing the clock loses the round."] },
      { heading: "Betting", points: ["Everyone else bets on who will win. Backers of the winner are paid double; the winner takes the whole pot."] },
      { heading: "Items", points: ["Between duels, buy items: Atomic Bomb, Nuke, Landmine, Interceptor, Shield, Pickpocket and Insurance. Tap the info button on any item to see exactly what it does."] },
      { heading: "Winning", points: ["Play until one player holds all the money, or the host ends the game. The richest player wins."] },
    ],
  },
  blackjack: {
    shot: "Your move: every hand at the table against the dealer, with Hit, Stand, Double and Split.",
    players: "1–7",
    mode: "Online",
    length: "10–30 min",
    rules: [
      { heading: "Betting", points: ["Everyone bets at the same time, at or above the minimum. Anyone who doesn't bet sits the round out."] },
      { heading: "Your hand", points: ["You get two cards face up. The dealer shows one card and hides the other.", "Hit to take a card, Stand to keep your hand, Double to double your bet and take exactly one card, or Split a pair into two hands.", "Go over 21 and you bust."] },
      { heading: "The dealer", points: ["The dealer turns over the hidden card and draws until reaching 17 or more."] },
      { heading: "Payouts", points: ["A win pays even money, Blackjack pays 3 to 2, a tie returns your bet, and a loss or bust loses it.", "Most chips after the last round wins."] },
    ],
  },
  drawit: {
    shot: "The drawer's view: the secret word on top, the canvas and tools, and guesses on the side.",
    players: "2–12",
    mode: "Online",
    length: "10–25 min",
    rules: [
      { heading: "Drawing", points: ["On your turn, privately pick one of three words and draw it. Everyone watches the drawing appear live.", "Use the brush, eraser, paint bucket, colours and sizes. Everyone sees which tool you're holding."] },
      { heading: "Guessing", points: ["Type guesses in the chat. Correct guesses stay hidden from everyone else.", "Letters are revealed as time runs low, and a guess one letter off gets a private \"close!\""] },
      { heading: "Scoring", points: ["Faster guesses score more. The drawer scores for every player who gets it.", "Everyone draws once per round. Highest score after the last round wins."] },
    ],
  },
  feud: {
    shot: "Hosting a round: the survey board, with guesses to match or strike.",
    players: "3–12",
    mode: "Online",
    length: "15–30 min",
    rules: [
      { heading: "Write a survey", points: ["Everyone writes a question and the answers they expect, each worth 1 to 100 points.", "Use / for alternatives, like \"car / auto\"."] },
      { heading: "Host your round", points: ["Each survey becomes a round, hosted by whoever wrote it. You see the full board and judge any answer the game can't match."] },
      { heading: "Answer", points: ["Players take turns giving one answer. Find one to score its points; miss and it's a strike.", "The round ends when the board is cleared or the strikes run out."] },
      { heading: "Winning", points: ["After every survey has been played, the highest score wins."] },
    ],
  },
};
