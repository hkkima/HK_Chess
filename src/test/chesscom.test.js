import { describe, it, expect } from 'vitest';
import { parseGameId, gameOutcome, packGame, parsePgnMoves } from '../services/chesscom.js';

describe('parseGameId', () => {
  it('live 게임 URL에서 ID 추출', () => {
    expect(parseGameId('https://www.chess.com/game/live/169586417316')).toBe('169586417316');
  });
  it('쿼리스트링/슬래시가 붙어도 추출', () => {
    expect(parseGameId('https://www.chess.com/game/live/12345?username=foo')).toBe('12345');
    expect(parseGameId('https://www.chess.com/game/live/12345/')).toBe('12345');
  });
  it('daily 게임 URL', () => {
    expect(parseGameId('https://www.chess.com/game/daily/98765')).toBe('98765');
  });
  it('구형 live/game/ID 형태', () => {
    expect(parseGameId('https://www.chess.com/live/game/55555')).toBe('55555');
  });
  it('게임 URL이 아니면 null', () => {
    expect(parseGameId('https://www.chess.com/member/hikaru')).toBeNull();
    expect(parseGameId('')).toBeNull();
    expect(parseGameId(null)).toBeNull();
  });
});

describe('gameOutcome', () => {
  it('백이 win 이면 white', () => {
    expect(gameOutcome({ white: { result: 'win' }, black: { result: 'resigned' } })).toBe('white');
  });
  it('흑이 win 이면 black', () => {
    expect(gameOutcome({ white: { result: 'checkmated' }, black: { result: 'win' } })).toBe('black');
  });
  it('양쪽 무승부 코드면 draw', () => {
    expect(gameOutcome({ white: { result: 'agreed' }, black: { result: 'agreed' } })).toBe('draw');
    expect(gameOutcome({ white: { result: 'stalemate' }, black: { result: 'stalemate' } })).toBe('draw');
    expect(gameOutcome({ white: { result: 'insufficient' }, black: { result: 'timevsinsufficient' } })).toBe('draw');
  });
});

describe('parsePgnMoves', () => {
  it('헤더·시계주석·결과·수번호를 걷어내고 SAN 수순만 남긴다', () => {
    const pgn = [
      '[Event "Live Chess"]',
      '[Site "Chess.com"]',
      '[White "a"]',
      '[Black "b"]',
      '[Result "1-0"]',
      '',
      '1. e4 {[%clk 0:02:59.9]} 1... e5 {[%clk 0:02:58]} 2. Nf3 Nc6 3. Bb5 a6 1-0',
    ].join('\n');
    expect(parsePgnMoves(pgn)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  });

  it('빈 입력이면 빈 배열', () => {
    expect(parsePgnMoves('')).toEqual([]);
    expect(parsePgnMoves(null)).toEqual([]);
  });
});

describe('packGame', () => {
  it('유저네임을 소문자로 정규화하고 승자를 판정한다', () => {
    const game = {
      url: 'https://www.chess.com/game/live/169586417316',
      white: { username: '0gZPanda', result: 'resigned' },
      black: { username: 'Hikaru', result: 'win' },
      time_class: 'blitz',
      time_control: '180',
      end_time: 1780381508,
    };
    const packed = packGame(game);
    expect(packed.gameId).toBe('169586417316');
    expect(packed.whiteUsername).toBe('0gzpanda');
    expect(packed.blackUsername).toBe('hikaru');
    expect(packed.winner).toBe('black');
    expect(packed.timeClass).toBe('blitz');
  });
});
