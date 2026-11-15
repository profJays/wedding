export const PUZZLE_GRID_SIZE = 3;
export const PUZZLE_TILE_COUNT = 9;
export const SOLVED_PUZZLE_TILES: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export function countInversions(tiles: readonly number[]): number {
  let inversions = 0;
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (tiles[i] > tiles[j]) {
        inversions++;
      }
    }
  }
  return inversions;
}

export function isEvenPermutation(tiles: readonly number[]): boolean {
  return countInversions(tiles) % 2 === 0;
}

export function countCorrectPieces(tiles: readonly number[]): number {
  let correct = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === i) {
      correct++;
    }
  }
  return correct;
}

export function isPuzzleSolved(tiles: readonly number[]): boolean {
  if (tiles.length !== PUZZLE_TILE_COUNT) return false;
  return countCorrectPieces(tiles) === PUZZLE_TILE_COUNT;
}

export function swapTiles(
  tiles: readonly number[],
  indexA: number,
  indexB: number
): number[] {
  if (
    indexA === indexB ||
    indexA < 0 ||
    indexB < 0 ||
    indexA >= tiles.length ||
    indexB >= tiles.length
  ) {
    return [...tiles];
  }
  const next = [...tiles];
  const temp = next[indexA];
  next[indexA] = next[indexB];
  next[indexB] = temp;
  return next;
}

/**
 * Generates a genuinely non-trivial, mathematically verified even-parity 3x3 shuffle
 * with at most `maxInitialCorrect` pieces starting in their solved home position.
 */
export function createSolvableShuffle(maxInitialCorrect = 2): number[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const arr = [...SOLVED_PUZZLE_TILES];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }

    // Ensure even permutation parity by swapping two adjacent indices if odd
    if (!isEvenPermutation(arr)) {
      const tmp = arr[0];
      arr[0] = arr[1];
      arr[1] = tmp;
    }

    const correct = countCorrectPieces(arr);
    if (!isPuzzleSolved(arr) && correct <= maxInitialCorrect && isEvenPermutation(arr)) {
      return arr;
    }
  }

  // Deterministic guaranteed-even fallback derangement (0 correct pieces, inversions = 10 -> even)
  return [2, 0, 1, 5, 3, 4, 8, 6, 7];
}
